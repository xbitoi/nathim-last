import { logger } from "../lib/logger";
import { db, contactsTable, messagesTable, settingsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { generateAIReply, generateAdminReply, getAllSettings } from "./ai";
import { backupSession, restoreSessionIfMissing, clearSessionBackup } from "./whatsappSession";
import { logEvent } from "./logs";
import fs from "fs";
import path from "path";

type WAStatus = "disconnected" | "connecting" | "qr_ready" | "pairing_ready" | "connected";

interface WAState {
  status: WAStatus;
  qr: string | null;
  pairingCode: string | null;
  phone: string | null;
  name: string | null;
  client: any | null;
}

const state: WAState = {
  status: "disconnected",
  qr: null,
  pairingCode: null,
  phone: null,
  name: null,
  client: null,
};

const SESSION_DIR = process.env.WHATSAPP_SESSION_DIR ?? path.join(process.cwd(), ".whatsapp-session");

// In-memory set of phones that authenticated as admin in this session
const adminSessions = new Set<string>();

/** Called by the reset endpoint to wipe in-memory admin sessions */
export function clearAdminSessions() {
  adminSessions.clear();
}

// ─── State machine for "contact / forward message to admin" multi-turn flow ──
interface ForwardState {
  step: "ask_name" | "ask_msg";
  mode: "contact" | "forward"; // contact = notify only, forward = send specific message
  name?: string;
}
const pendingForwards = new Map<string, ForwardState>();

// ─── Settings cache (5 second TTL) — avoids DB round-trip on every message ──
const _settingsCache = new Map<string, { value: string | null; exp: number }>();

async function getSetting(key: string): Promise<string | null> {
  const cached = _settingsCache.get(key);
  if (cached && Date.now() < cached.exp) return cached.value;
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  const value = rows[0]?.value ?? null;
  _settingsCache.set(key, { value, exp: Date.now() + 5_000 });
  return value;
}

async function upsertSetting(key: string, value: string) {
  await db
    .insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
  _settingsCache.delete(key); // invalidate cache immediately
}

async function upsertContact(phone: string, name?: string) {
  const existing = await db.select().from(contactsTable).where(eq(contactsTable.phone, phone));
  if (existing.length > 0) {
    await db
      .update(contactsTable)
      .set({ lastSeen: new Date(), messageCount: sql`${contactsTable.messageCount} + 1`, ...(name ? { name } : {}) })
      .where(eq(contactsTable.phone, phone));
    return existing[0];
  } else {
    const [contact] = await db
      .insert(contactsTable)
      .values({ phone, name: name ?? null, messageCount: 1 })
      .returning();
    return contact;
  }
}

async function saveMessage(contactId: number, content: string, direction: "inbound" | "outbound", aiModel?: string) {
  await db.insert(messagesTable).values({ contactId, content, direction, aiModel: aiModel ?? null });
}

// ── Send demo video — always as MP4 file, never as link ──────────────────────
async function sendDemoVideo(sock: any, jid: string, videoUrl: string): Promise<void> {
  const CAPTION = "🎥 فيديو توضيحي — Yazaki AI Table Reader";

  // Build URL list: only try local replacement for internal/self-hosted URLs
  const selfHosts = ["localhost", "127.0.0.1", process.env.REPL_SLUG, "replit.app", "hf.space"].filter(Boolean);
  const isInternalUrl = selfHosts.some(h => videoUrl.includes(h!));
  const localUrl = isInternalUrl
    ? videoUrl.replace(/^https?:\/\/[^/]+/, `http://localhost:${process.env.PORT ?? 8080}`)
    : null;

  const urlsToTry = localUrl ? [localUrl, videoUrl] : [videoUrl];

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") ?? "";
      const buf = Buffer.from(await res.arrayBuffer());
      // Reject if clearly not a video (HTML page, tiny file, etc.)
      if (buf.length < 1000) continue;
      if (contentType.includes("text/html")) continue;
      await sock.sendMessage(jid, { video: buf, mimetype: "video/mp4", caption: CAPTION });
      logger.info({ url, bytes: buf.length }, "Demo video sent as buffer");
      return;
    } catch { /* try next */ }
  }

  // Fallback: let Baileys/WhatsApp servers download it directly from the URL
  logger.warn({ videoUrl }, "Buffer fetch failed — Baileys will download directly");
  await sock.sendMessage(jid, { video: { url: videoUrl }, mimetype: "video/mp4", caption: CAPTION });
}

async function getRecentMessages(contactId: number, limit = 10) {
  // Fetch last N messages in chronological order (DESC fetch, then reverse)
  const rows = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.contactId, contactId))
    .orderBy(desc(messagesTable.timestamp))
    .limit(limit);
  return rows.reverse();
}

// ─── Startup catch-up: reply to unanswered messages after reconnect ───────────
async function catchUpUnanswered(sock: any) {
  try {
    // Only consider messages from the last 6 hours
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);

    // Get all active (non-blocked) contacts
    const contacts = await db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.isBlocked, false));

    for (const contact of contacts) {
      // Get the last message from this contact
      const [lastMsg] = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.contactId, contact.id))
        .orderBy(desc(messagesTable.timestamp))
        .limit(1);

      // Skip if no messages, or last message was already from us (outbound)
      if (!lastMsg) continue;
      if (lastMsg.direction === "outbound") continue;

      // Skip if older than 6 hours
      if (new Date(lastMsg.timestamp) < cutoff) continue;

      // This contact has an unanswered inbound message — reply via AI
      const jid = `${contact.phone}@s.whatsapp.net`;
      logger.info({ phone: contact.phone, lastMsg: lastMsg.content }, "Catch-up: replying to unanswered message");

      try {
        const history = await getRecentMessages(contact.id, 2);
        const conversationHistory = history.map((m) => ({
          role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
          content: m.content,
        }));

        await sock.sendPresenceUpdate("composing", jid);
        const { reply } = await generateAIReply(lastMsg.content, conversationHistory, history.length > 0, contact.messageCount);
        await sock.sendPresenceUpdate("paused", jid);

        await sock.sendMessage(jid, { text: reply });
        await saveMessage(contact.id, reply, "outbound");
        logger.info({ phone: contact.phone }, "Catch-up reply sent");
      } catch (err) {
        logger.error({ err, phone: contact.phone }, "Catch-up reply failed for contact");
      }

      // Wait 3 seconds between contacts to avoid WhatsApp rate limits
      await new Promise((r) => setTimeout(r, 3000));
    }
  } catch (err) {
    logger.error({ err }, "catchUpUnanswered failed");
  }
}

// Send system alert to admin only
// Try multiple JID formats until one succeeds
async function sendToAdminJid(text: string): Promise<boolean> {
  if (state.status !== "connected" || !state.client) return false;

  // Build candidate JIDs — adminPhone first, ownerPhone as fallback
  const adminRaw = (await getSetting("adminPhone"))?.replace(/@.+$/, "").replace(/[^0-9]/g, "") ?? "";
  const ownerRaw = (await getSetting("ownerPhone"))?.replace(/@.+$/, "").replace(/[^0-9]/g, "") ?? "";

  // Normalize Moroccan number: 0XXXXXXXXX → 212XXXXXXXXX
  const normalize = (n: string) => (n.startsWith("0") && n.length === 10) ? `212${n.slice(1)}` : n;

  const candidates: string[] = [];
  for (const raw of [adminRaw, ownerRaw]) {
    if (!raw) continue;
    const n = normalize(raw);
    candidates.push(`${n}@s.whatsapp.net`, `${n}@lid`);
  }

  // Deduplicate
  const unique = [...new Set(candidates)];
  logger.info({ candidates: unique }, "Trying admin JID candidates");

  for (const jid of unique) {
    try {
      await state.client.sendMessage(jid, { text });
      logger.info({ jid }, "Admin message sent ✅");
      return true;
    } catch (err: any) {
      logger.warn({ jid, err: err?.message }, "JID failed, trying next");
    }
  }
  logger.error({ tried: unique }, "All admin JIDs failed");
  return false;
}

export async function sendAdminAlert(message: string) {
  if (state.status !== "connected" || !state.client) return;
  await sendToAdminJid(`⚠️ *تنبيه النظام*\n${message}`);
}

export async function sendAdminMessage(text: string) {
  if (state.status !== "connected" || !state.client) return;
  await sendToAdminJid(text);
}

// Build a human-readable label for a contact in admin notifications
// Real phone numbers get a wa.me link; WhatsApp LIDs are labeled clearly
// Returns { label, replyCmd } — replyCmd is the second message the admin can copy-paste
function buildContactLabel(
  name: string,
  phone: string,
  pushName: string | undefined,
  isLid: boolean,
): { label: string; replyCmd: string } {
  const displayName = name || pushName || "زائر";
  if (isLid) {
    return {
      label: `${displayName}\n📲 جهاز واتساب مرتبط (لا يوجد رقم هاتف مباشر)`,
      replyCmd: `ردّ ${phone}`,
    };
  }
  const intlPhone = phone.startsWith("0") && phone.length === 10 ? `212${phone.slice(1)}` : phone;
  return {
    label: `${displayName}\n📱 الرقم: +${intlPhone}\n🔗 واتساب: https://wa.me/${intlPhone}`,
    replyCmd: `ردّ ${intlPhone}`,
  };
}

// Check if phone is recognized admin (DB or in-memory session)
async function isAdminPhone(phone: string): Promise<boolean> {
  const savedAdminPhone = await getSetting("adminPhone");
  // Normalize: strip any @suffix (e.g. @lid, @s.whatsapp.net) before comparing
  const normalised = (savedAdminPhone ?? "").replace(/@.+$/, "");
  return phone === normalised || adminSessions.has(phone);
}

// Remove invisible Unicode chars WhatsApp injects into Arabic messages
// (RTL/LTR marks, zero-width spaces, BOM, directional embeddings, etc.)
function cleanText(raw: string): string {
  return raw
    .replace(/[\u200b\u200c\u200d\u200e\u200f\u202a-\u202e\u2060\ufeff]/g, "")
    .trim();
}

// Returns true if the message matches a known admin command keyword/pattern
function isAdminCommand(text: string): boolean {
  const t = cleanText(text);
  const lower = t.toLowerCase().replace(/\s+/g, " ");

  const exactCommands = [
    "خروج", "logout", "exit",
    "مساعدة", "help", "أوامر",
    "وقف", "صيانة", "maintenance", "off",
    "تشغيل", "start", "online", "on",
    "جهات الاتصال", "contacts", "الأرقام", "الارقام",
    "سجل الرسائل", "messages", "الرسائل",
    "إحصائيات", "stats", "احصائيات",
    "حالة", "الحالة", "status",
    "شخصية", "الشخصية", "عرض الشخصية",
    "حذف الشخصية", "مسح الشخصية", "إزالة الشخصية",
  ];
  if (exactCommands.includes(lower)) return true;

  // Pattern commands
  if (/^رسالة صيانة\s+.+/is.test(t)) return true;
  if (/^(?:رسائل|messages?)\s+\+?[\d]+/i.test(t)) return true;
  if (/^حظر\s+\+?[\d]+/.test(t)) return true;
  if (/^(?:إلغاء حظر|الغاء حظر)\s+\+?[\d]+/.test(t)) return true;
  if (/^(?:تعيين شخصية|شخصية نور|تغيير شخصية|برومبت)\s+.+/is.test(t)) return true;
  if (/^رد[ّ]?\s+\S+\s+[\s\S]+/i.test(t)) return true;
  if (/^(?:ارسل|أرسل|ابعث|إرسال)\s+\+?[\d\S]+\s+[\s\S]+/i.test(t)) return true;

  return false;
}

// Handle admin commands — always returns a reply string
async function handleAdminCommand(text: string, phone: string): Promise<string> {
  const t = text.trim();
  const lower = t.toLowerCase().replace(/\s+/g, " ");

  // Logout from admin mode (removes from in-memory only, DB stays)
  if (lower === "خروج" || lower === "logout" || lower === "exit") {
    adminSessions.delete(phone);
    const savedAdminPhone = (await getSetting("adminPhone") ?? "").replace(/@.+$/, "");
    if (phone === savedAdminPhone) {
      return "ℹ️ رقمك محفوظ كأدمن رئيسي — لن يُحذف من النظام. فقط الجلسة الحالية أُغلقت.\n\nأرسل *أنا كيرا* للعودة.";
    }
    return "🔓 تم إلغاء وضع المشرف. أنت الآن مستخدم عادي.";
  }

  // Help menu
  if (lower === "مساعدة" || lower === "help" || lower === "أوامر") {
    return `📋 *أوامر المشرف:*

🖥️ *حالة* — تقرير كامل عن النظام
📊 *إحصائيات* — أرقام سريعة عن النشاط

🔛 *تشغيل* — تشغيل البوت
⛔ *وقف* — وضع الصيانة
✏️ *رسالة صيانة [نص]* — تغيير رسالة الصيانة

🤖 *شخصية* — عرض الشخصية الحالية لناظم
✍️ *تعيين شخصية [النص]* — تغيير أو إضافة شخصية جديدة
🗑️ *حذف الشخصية* — حذف الشخصية والعودة للافتراضية

🧑‍🤝‍🧑 *جهات الاتصال* — قائمة جميع الأرقام
📨 *سجل الرسائل* — آخر 20 رسالة في النظام
🔍 *رسائل [رقم]* — محادثة رقم معين
🚫 *حظر [رقم]* — حظر رقم
✅ *إلغاء حظر [رقم]* — رفع الحظر عن رقم

💬 *ردّ [رقم أو معرف] [رسالة]* — أرسل رسالة نصية مباشرة لأي شخص
   مثال: ردّ 127728753836083 مرحبا، سأتواصل معك قريباً

🤖 *ارسل [رقم] [تعليمات]* — ناظم يصيغ رسالة تقديمية بأسلوبه ويرسلها
   مثال: ارسل 212XXXXXXXXX أرسل له دعوة لتجربة التطبيق

🚪 *خروج* — إغلاق الجلسة الحالية`;
  }

  // --- Maintenance mode ON ---
  if (lower === "وقف" || lower === "صيانة" || lower === "maintenance" || lower === "off") {
    await upsertSetting("maintenanceMode", "true");
    const msg = await getSetting("maintenanceMessage") ?? "⚙️ النظام في وضع الصيانة. سيعود قريباً.";
    return `⛔ *وضع الصيانة مفعّل*\n\nجميع الرسائل الواردة ستتلقى:\n"${msg}"\n\nأرسل *تشغيل* للعودة للعمل.`;
  }

  // --- Maintenance mode OFF ---
  if (lower === "تشغيل" || lower === "start" || lower === "online" || lower === "on") {
    await upsertSetting("maintenanceMode", "false");
    return "✅ *البوت نشط الآن*\n\nالرد التلقائي على الرسائل مفعّل.";
  }

  // --- Change maintenance message ---
  const maintMsgMatch = t.match(/^رسالة صيانة\s+(.+)/is);
  if (maintMsgMatch) {
    const newMsg = maintMsgMatch[1].trim();
    await upsertSetting("maintenanceMessage", newMsg);
    return `✏️ تم تحديث رسالة الصيانة:\n"${newMsg}"`;
  }

  // --- Contacts list ---
  if (lower === "جهات الاتصال" || lower === "contacts" || lower === "الأرقام" || lower === "الارقام") {
    const contacts = await db
      .select()
      .from(contactsTable)
      .orderBy(desc(contactsTable.lastSeen))
      .limit(30);

    if (contacts.length === 0) return "📭 لا توجد جهات اتصال حتى الآن.";

    const lines = contacts.map((c, i) => {
      const blocked = c.isBlocked ? " 🚫" : "";
      const name = c.name ? ` (${c.name})` : "";
      return `${i + 1}. +${c.phone}${name} — ${c.messageCount} رسالة${blocked}`;
    });

    return `📋 *جهات الاتصال (${contacts.length}):*\n\n${lines.join("\n")}`;
  }

  // --- Last 20 messages system-wide ---
  if (lower === "سجل الرسائل" || lower === "messages" || lower === "الرسائل") {
    const msgs = await db
      .select({ content: messagesTable.content, direction: messagesTable.direction, timestamp: messagesTable.timestamp, phone: contactsTable.phone, name: contactsTable.name })
      .from(messagesTable)
      .leftJoin(contactsTable, eq(messagesTable.contactId, contactsTable.id))
      .orderBy(desc(messagesTable.timestamp))
      .limit(20);

    if (msgs.length === 0) return "📭 لا توجد رسائل حتى الآن.";

    const lines = msgs.reverse().map((m) => {
      const dir = m.direction === "inbound" ? "⬅️" : "➡️";
      const who = m.name || `+${m.phone}`;
      const time = new Date(m.timestamp).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
      const preview = m.content.slice(0, 60) + (m.content.length > 60 ? "…" : "");
      return `${dir} *${who}* [${time}]\n   ${preview}`;
    });

    return `📨 *آخر ${msgs.length} رسائل:*\n\n${lines.join("\n\n")}`;
  }

  // --- Statistics ---
  if (lower === "إحصائيات" || lower === "stats" || lower === "احصائيات") {
    const [totalContacts] = await db.select({ count: sql<number>`count(*)` }).from(contactsTable);
    const [totalMessages] = await db.select({ count: sql<number>`count(*)` }).from(messagesTable);
    const [blocked] = await db.select({ count: sql<number>`count(*)` }).from(contactsTable).where(eq(contactsTable.isBlocked, true));
    const [inbound] = await db.select({ count: sql<number>`count(*)` }).from(messagesTable).where(eq(messagesTable.direction, "inbound"));
    const [outbound] = await db.select({ count: sql<number>`count(*)` }).from(messagesTable).where(eq(messagesTable.direction, "outbound"));

    const aiModel = (await getSetting("aiModel")) ?? "—";
    const geminiModel = (await getSetting("geminiModel")) ?? "—";
    const groqModel = (await getSetting("groqModel")) ?? "—";
    const activeModel = aiModel === "gemini" ? `Gemini / ${geminiModel}` : `Groq / ${groqModel}`;
    const maintenance = (await getSetting("maintenanceMode")) === "true";

    return `📊 *إحصائيات النظام:*

👥 جهات الاتصال: ${totalContacts.count}
🚫 محظورون: ${blocked.count}
📨 إجمالي الرسائل: ${totalMessages.count}
⬅️ مستقبلة: ${inbound.count}
➡️ مرسلة: ${outbound.count}
🤖 الموديل النشط: ${activeModel}
📡 حالة واتساب: ${state.status === "connected" ? `✅ متصل (+${state.phone})` : "❌ غير متصل"}
🔧 وضع الصيانة: ${maintenance ? "⛔ مفعّل" : "✅ معطّل"}`;
  }

  // --- Full system status report ---
  if (lower === "حالة" || lower === "الحالة" || lower === "status") {
    const now = new Date();
    const timeStr = now.toLocaleString("ar-MA", { timeZone: "Africa/Casablanca", hour12: false });

    // Contacts
    const [totalContacts] = await db.select({ count: sql<number>`count(*)` }).from(contactsTable);
    const [blocked] = await db.select({ count: sql<number>`count(*)` }).from(contactsTable).where(eq(contactsTable.isBlocked, true));
    const activeCount = Number(totalContacts.count) - Number(blocked.count);

    // Messages
    const [totalMessages] = await db.select({ count: sql<number>`count(*)` }).from(messagesTable);
    const [inbound] = await db.select({ count: sql<number>`count(*)` }).from(messagesTable).where(eq(messagesTable.direction, "inbound"));
    const [outbound] = await db.select({ count: sql<number>`count(*)` }).from(messagesTable).where(eq(messagesTable.direction, "outbound"));

    // Today messages
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const [todayMsgs] = await db.select({ count: sql<number>`count(*)` }).from(messagesTable)
      .where(sql`${messagesTable.timestamp} >= ${todayStart}`);

    // Last message
    const lastMsgRows = await db.select({ timestamp: messagesTable.timestamp, phone: contactsTable.phone })
      .from(messagesTable)
      .leftJoin(contactsTable, eq(messagesTable.contactId, contactsTable.id))
      .orderBy(desc(messagesTable.timestamp))
      .limit(1);
    const lastMsgTime = lastMsgRows[0]
      ? new Date(lastMsgRows[0].timestamp).toLocaleString("ar-MA", { timeZone: "Africa/Casablanca", hour12: false })
      : "لا توجد رسائل";
    const lastMsgPhone = lastMsgRows[0]?.phone ? `+${lastMsgRows[0].phone}` : "—";

    // AI settings
    const aiModel = (await getSetting("aiModel")) ?? "gemini";
    const geminiApiKey  = await getSetting("geminiApiKey");
    const geminiApiKey2 = await getSetting("geminiApiKey2");
    const geminiApiKey3 = await getSetting("geminiApiKey3");
    const geminiApiKey4 = await getSetting("geminiApiKey4");
    const geminiApiKey5 = await getSetting("geminiApiKey5");
    const geminiApiKey6 = await getSetting("geminiApiKey6");
    const groqApiKey = await getSetting("groqApiKey");
    const geminiModel = (await getSetting("geminiModel")) ?? "لم يُحدد";
    const groqModel = (await getSetting("groqModel")) ?? "لم يُحدد";
    const agentPersonality = await getSetting("agentPersonality");
    const autoReply = (await getSetting("autoReply")) ?? "true";

    // Project
    const projectName = (await getSetting("projectName")) ?? "Yazaki AI";
    const ownerName = await getSetting("ownerName");
    const ownerPhone = await getSetting("ownerPhone");
    const maintenance = (await getSetting("maintenanceMode")) === "true";
    const maintenanceMsg = await getSetting("maintenanceMessage");
    const savedAdminPhone = await getSetting("adminPhone");

    const geminiKeyCount = [geminiApiKey, geminiApiKey2, geminiApiKey3, geminiApiKey4, geminiApiKey5, geminiApiKey6]
      .filter(k => k && k.trim()).length;
    const geminiStatus = geminiKeyCount > 0
      ? `✅ ${geminiKeyCount}/6 مفاتيح مضبوطة — موديل: ${geminiModel}${aiModel === "gemini" ? " ◀ نشط" : ""}`
      : `❌ لا يوجد مفتاح مضبوط`;
    const groqStatus = groqApiKey
      ? `✅ مضبوط — موديل: ${groqModel}${aiModel === "groq" ? " ◀ نشط" : ""}`
      : `❌ مفتاح غير مضبوط`;

    return `🖥️ *تقرير حالة النظام الكامل*
🕐 ${timeStr}

━━━━━━━━━━━━━━━━━━
📱 *واتساب*
━━━━━━━━━━━━━━━━━━
• الحالة: ${state.status === "connected" ? `✅ متصل` : "❌ غير متصل"}
• الرقم المتصل: ${state.phone ? `+${state.phone}` : "—"}
• الأدمن المحفوظ: ${savedAdminPhone ? `+${savedAdminPhone}` : "لم يُضبط"}

━━━━━━━━━━━━━━━━━━
🤖 *الذكاء الاصطناعي*
━━━━━━━━━━━━━━━━━━
• المزود النشط: ${aiModel === "gemini" ? "🔵 Google Gemini" : "🟠 Groq"}
• Gemini: ${geminiStatus}
• Groq: ${groqStatus}
• الرد التلقائي: ${autoReply === "true" ? "✅ مفعّل" : "⛔ معطّل"}
• شخصية مخصصة: ${agentPersonality ? "✅ موجودة" : "⬜ لا توجد"}

━━━━━━━━━━━━━━━━━━
👥 *جهات الاتصال*
━━━━━━━━━━━━━━━━━━
• الإجمالي: ${totalContacts.count}
• نشطون: ${activeCount}
• محظورون: ${blocked.count}

━━━━━━━━━━━━━━━━━━
💬 *الرسائل*
━━━━━━━━━━━━━━━━━━
• الإجمالي: ${totalMessages.count}
• مستقبلة: ${inbound.count} | مرسلة: ${outbound.count}
• اليوم: ${todayMsgs.count} رسالة
• آخر نشاط: ${lastMsgTime}
• آخر رقم: ${lastMsgPhone}

━━━━━━━━━━━━━━━━━━
⚙️ *الإعدادات*
━━━━━━━━━━━━━━━━━━
• التطبيق: ${projectName}
• صاحب التطبيق: ${ownerName ?? "لم يُضبط"}
• رقم صاحب التطبيق: ${ownerPhone ? `+${ownerPhone}` : "لم يُضبط"}
• وضع الصيانة: ${maintenance ? `⛔ مفعّل\n• رسالة الصيانة: "${(maintenanceMsg ?? "").slice(0, 60)}"` : "✅ معطّل"}`;
  }

  // --- Messages for specific contact ---
  const msgsMatch = t.match(/^(?:رسائل|messages?)\s+(\+?[\d]+)/i);
  if (msgsMatch) {
    const numRaw = msgsMatch[1].replace(/^\+/, "");
    const contact = await db.select().from(contactsTable).where(eq(contactsTable.phone, numRaw));
    if (!contact[0]) return `❌ الرقم +${numRaw} غير موجود في قاعدة البيانات.`;

    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.contactId, contact[0].id))
      .orderBy(desc(messagesTable.timestamp))
      .limit(15);

    if (msgs.length === 0) return `📭 لا توجد رسائل مع +${numRaw}.`;

    const name = contact[0].name ? ` (${contact[0].name})` : "";
    const lines = msgs.reverse().map((m) => {
      const dir = m.direction === "inbound" ? "⬅️" : "➡️";
      const time = new Date(m.timestamp).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
      return `${dir} [${time}] ${m.content.slice(0, 80)}`;
    });

    return `📋 *رسائل +${numRaw}${name}:*\n\n${lines.join("\n")}`;
  }

  // --- Block contact ---
  const blockMatch = t.match(/^حظر\s+(\+?[\d]+)/);
  if (blockMatch) {
    const numRaw = blockMatch[1].replace(/^\+/, "");
    const contact = await db.select().from(contactsTable).where(eq(contactsTable.phone, numRaw));
    if (!contact[0]) return `❌ الرقم +${numRaw} غير موجود.`;
    await db.update(contactsTable).set({ isBlocked: true }).where(eq(contactsTable.phone, numRaw));
    return `🚫 تم حظر +${numRaw} بنجاح.`;
  }

  // --- Unblock contact ---
  const unblockMatch = t.match(/^(?:إلغاء حظر|الغاء حظر)\s+(\+?[\d]+)/);
  if (unblockMatch) {
    const numRaw = unblockMatch[1].replace(/^\+/, "");
    await db.update(contactsTable).set({ isBlocked: false }).where(eq(contactsTable.phone, numRaw));
    return `✅ تم إلغاء حظر +${numRaw} بنجاح.`;
  }

  // --- View personality ---
  if (["شخصية", "الشخصية", "عرض الشخصية"].includes(lower)) {
    const personality = await getSetting("agentPersonality");
    if (!personality || personality.trim() === "") {
      return `🤖 *شخصية ناظم*\n\nلا توجد شخصية مخصصة حالياً.\n\nلتعيين شخصية أرسل:\n*تعيين شخصية [النص]*`;
    }
    return `🤖 *شخصية ناظم الحالية:*\n\n${personality}\n\n──────────────\nلتغييرها: *تعيين شخصية [النص الجديد]*\nللحذف: *حذف الشخصية*`;
  }

  // --- Set / update personality ---
  const setPersonalityMatch = t.match(/^(?:تعيين شخصية|شخصية نور|تغيير شخصية|برومبت)\s+([\s\S]+)/i);
  if (setPersonalityMatch) {
    const newPersonality = setPersonalityMatch[1].trim();
    await upsertSetting("agentPersonality", newPersonality);
    const preview = newPersonality.length > 120 ? newPersonality.slice(0, 120) + "..." : newPersonality;
    return `✅ *تم تحديث شخصية ناظم*\n\n📝 ${preview}\n\n──────────────\nناظم سيستخدم هذه الشخصية في ردوده القادمة فوراً.`;
  }

  // --- Delete personality ---
  if (["حذف الشخصية", "مسح الشخصية", "إزالة الشخصية"].includes(lower)) {
    await upsertSetting("agentPersonality", "");
    return `🗑️ *تم حذف الشخصية المخصصة*\n\nسيردّ ناظم الآن بشخصيته الافتراضية.`;
  }

  // --- Reply to a specific contact (by phone or LID) ---
  const replyMatch = t.match(/^رد[ّ]?\s+(\S+)\s+([\s\S]+)/i);
  if (replyMatch) {
    const targetRaw = replyMatch[1].replace(/^\+/, "").trim();
    const msgToSend = replyMatch[2].trim();
    if (!msgToSend) return `❌ الرسالة فارغة — أرسل: *ردّ [رقم/معرف] [نص الرسالة]*`;

    if (!state.client || state.status !== "connected") {
      return `❌ واتساب غير متصل حالياً.`;
    }

    // Try @s.whatsapp.net first, then @lid
    let sent = false;
    for (const suffix of ["@s.whatsapp.net", "@lid"]) {
      try {
        await state.client.sendMessage(`${targetRaw}${suffix}`, { text: msgToSend });
        sent = true;
        logger.info({ targetRaw, suffix }, "Admin reply sent to contact");

        // Save to DB if contact exists
        const contacts = await db.select().from(contactsTable).where(eq(contactsTable.phone, targetRaw));
        if (contacts[0]) {
          await db.insert(messagesTable).values({
            contactId: contacts[0].id,
            content: msgToSend,
            direction: "outbound",
            model: "admin/manual",
          });
        }
        break;
      } catch { /* try next suffix */ }
    }

    return sent
      ? `✅ تم إرسال رسالتك إلى *${targetRaw}* بنجاح.`
      : `❌ فشل الإرسال — تأكد من صحة المعرف وحاول مجدداً.`;
  }

  // --- Outbound AI message (ارسل [رقم] [تعليمات]) ---
  const outboundMatch = t.match(/^(?:ارسل|أرسل|ابعث|إرسال)\s+(\+?[\d\S]+?)\s+([\s\S]+)/i);
  if (outboundMatch) {
    const targetRaw = outboundMatch[1].replace(/^\+/, "").trim();
    const instructions = outboundMatch[2].trim();

    if (!state.client || state.status !== "connected") {
      return `❌ واتساب غير متصل حالياً.`;
    }

    // Generate an outbound presenter message using AI
    const aiPrompt = `[طلب الإدارة — رسالة صادرة]: اكتب رسالة تقديمية لشخص لم يتواصل معنا من قبل. يجب أن تكون بأسلوب ناظم كمقدم تطبيق "Yazaki AI Table Reader". التعليمات: ${instructions}`;
    const { reply: generatedMsg } = await generateAIReply(aiPrompt, [], false, 0);

    let sent = false;
    for (const suffix of ["@s.whatsapp.net", "@lid"]) {
      try {
        await state.client.sendMessage(`${targetRaw}${suffix}`, { text: generatedMsg });
        sent = true;
        logger.info({ targetRaw, suffix }, "Outbound AI message sent");

        // Save to DB if contact exists
        const contacts = await db.select().from(contactsTable).where(eq(contactsTable.phone, targetRaw));
        if (contacts[0]) {
          await db.insert(messagesTable).values({
            contactId: contacts[0].id,
            content: generatedMsg,
            direction: "outbound",
            model: "admin/outbound",
          });
        }
        break;
      } catch { /* try next suffix */ }
    }

    if (!sent) return `❌ فشل الإرسال — تأكد من صحة الرقم وحاول مجدداً.`;
    const preview = generatedMsg.length > 120 ? generatedMsg.slice(0, 120) + "…" : generatedMsg;
    return `✅ *تم إرسال الرسالة إلى +${targetRaw}:*\n\n${preview}`;
  }

  return `❓ أمر غير معروف. أرسل *مساعدة* لعرض قائمة الأوامر المتاحة.`;
}

// ─── Reconnect state ─────────────────────────────────────────────────────────
let reconnectAttempts = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let disconnectedAt: number | null = null; // timestamp of last disconnect

// Logout storm detection — if kicked 3 times in 90s, stop auto-reconnecting
let logoutTimestamps: number[] = [];
const LOGOUT_STORM_LIMIT = 3;
const LOGOUT_STORM_WINDOW_MS = 90_000;

function clearHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

function startHeartbeat(sock: any) {
  clearHeartbeat();
  // Send a WhatsApp presence keepalive every 4 minutes to keep the session alive.
  // Baileys already fires connection.update → "close" when the socket truly drops,
  // so we do NOT duplicate reconnect logic here — just keep the session warm.
  heartbeatTimer = setInterval(async () => {
    if (state.status !== "connected") return;
    try {
      await sock.sendPresenceUpdate("available");
    } catch (_) {
      // If the send fails, Baileys' own connection.update will handle the reconnect.
      // We only log — no manual reconnect to avoid double-reconnect storms.
      logger.warn("Heartbeat keepalive failed — waiting for Baileys connection.update");
    }
  }, 4 * 60_000); // every 4 minutes
}

function scheduleReconnect() {
  reconnectAttempts++;
  // Exponential backoff: 3s, 6s, 12s, 24s … capped at 60s
  const delay = Math.min(3000 * Math.pow(2, reconnectAttempts - 1), 60_000);
  logger.info({ attempt: reconnectAttempts, delayMs: delay }, "Scheduling WhatsApp reconnect");
  setTimeout(connectWhatsApp, delay);
}

export async function connectWhatsApp(pairingPhone?: string) {
  // Allow re-entry if requesting pairing code while in QR mode — kill existing socket first
  if (pairingPhone && (state.status === "connecting" || state.status === "qr_ready")) {
    if (state.client) {
      state.client.end(undefined);
      state.client = null;
    }
    state.status = "disconnected";
    state.qr = null;
    state.pairingCode = null;
    if (fs.existsSync(SESSION_DIR)) {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    }
  }

  if (state.status === "connected" || state.status === "connecting") return;

  state.status = "connecting";
  state.qr = null;
  // Do NOT clear pairingCode here — it stays until the user reads it or connects
  // It gets cleared only in connection "open" (line below) or on a new phone pairing request

  try {
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = await import("@whiskeysockets/baileys");
    const { Boom } = await import("@hapi/boom");

    // Restore session from DB backup if local files are missing
    await restoreSessionIfMissing(SESSION_DIR);

    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    const { state: authState, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: authState,
      printQRInTerminal: false,
      logger: { level: "silent", trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, child: () => ({ level: "silent", trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, child: () => ({}) as any }) } as any,
    });

    state.client = sock;

    sock.ev.on("creds.update", async () => {
      saveCreds();
      await backupSession(SESSION_DIR);
    });

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if (pairingPhone) {
          // QR event = WS ready — call requestPairingCode NOW (Baileys requirement)
          try {
            const rawCode = await sock.requestPairingCode(pairingPhone);
            const formattedCode = rawCode.match(/.{1,4}/g)?.join("-") ?? rawCode;
            state.pairingCode = formattedCode;
            state.status = "pairing_ready";
            logger.info({ phone: pairingPhone, code: formattedCode }, "Pairing code generated");
          } catch (err) {
            logger.error({ err }, "Failed to request pairing code");
            state.status = "disconnected";
            state.client = null;
          }
        } else {
          const qrcode = await import("qrcode");
          const qrDataUrl = await qrcode.toDataURL(qr);
          state.qr = qrDataUrl;
          state.status = "qr_ready";
          logger.info("QR code generated");
        }
      }

      if (connection === "open") {
        const offlineMs = disconnectedAt ? Date.now() - disconnectedAt : 0;
        state.status = "connected";
        state.qr = null;
        state.pairingCode = null;
        reconnectAttempts = 0;
        disconnectedAt = null;
        const user = sock.user;
        state.phone = user?.id?.split(":")[0] ?? null;
        state.name = user?.name ?? null;
        logger.info({ phone: state.phone, offlineMs }, "WhatsApp connected");
        logEvent("success", "whatsapp", "wa_connected", `اتصل واتساب — ${state.phone ?? ""}`, { phone: state.phone, name: state.name, offlineMs });
        startHeartbeat(sock);
        // Only run catch-up if we were offline for more than 60 seconds (real gap, not quick reconnect)
        if (offlineMs > 60_000) {
          setTimeout(() => catchUpUnanswered(sock), 5000);
        }
      }

      if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const wasLoggedOut = reason === DisconnectReason.loggedOut;
        const wasReplaced  = reason === DisconnectReason.connectionReplaced; // 440 — another session took over
        if (!disconnectedAt) disconnectedAt = Date.now(); // record first disconnect time
        state.status = "disconnected";
        state.phone = null;
        state.name = null;
        state.client = null;
        clearHeartbeat();
        logger.info({ reason, wasLoggedOut }, "WhatsApp disconnected");

        if (wasReplaced) {
          // reason=440: another WhatsApp session (e.g. dev environment) took over.
          // Reconnecting immediately creates an infinite kick loop — we must back off.
          reconnectAttempts = 0;
          const now = Date.now();
          logoutTimestamps = logoutTimestamps.filter(t => now - t < LOGOUT_STORM_WINDOW_MS);
          logoutTimestamps.push(now);

          if (logoutTimestamps.length >= LOGOUT_STORM_LIMIT) {
            // Kicked 3+ times → pause 10 minutes
            logoutTimestamps = [];
            logger.warn(
              "Connection replaced storm detected (440 ×3) — another session keeps taking over. Pausing reconnect for 10 minutes."
            );
            state.qr = null;
            state.pairingCode = null;
            state.pairingPending = false;
            logEvent("error", "whatsapp", "wa_replaced_storm", "جلسة أخرى استولت على الاتصال 3 مرات — إيقاف مؤقت 10 دقائق", { reason: 440 });
            setTimeout(connectWhatsApp, 10 * 60 * 1000);
          } else {
            // First or second kick — wait 30 seconds before trying again
            logger.warn({ attempt: logoutTimestamps.length }, "Connection replaced (440) — waiting 30s before reconnect");
            logEvent("warn", "whatsapp", "wa_replaced", "جلسة أخرى استولت على الاتصال — إعادة محاولة بعد 30 ثانية", { reason: 440, attempt: logoutTimestamps.length });
            setTimeout(connectWhatsApp, 30_000);
          }
        } else if (wasLoggedOut) {
          // Clear old session
          if (fs.existsSync(SESSION_DIR)) {
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
          }
          clearSessionBackup().catch(() => {});
          reconnectAttempts = 0;

          // Logout storm detection: if kicked repeatedly in a short window,
          // this means another device/environment is connected with the same number.
          // Stop auto-reconnecting to avoid the infinite kick loop.
          const now = Date.now();
          logoutTimestamps = logoutTimestamps.filter(t => now - t < LOGOUT_STORM_WINDOW_MS);
          logoutTimestamps.push(now);

          if (logoutTimestamps.length >= LOGOUT_STORM_LIMIT) {
            logoutTimestamps = [];
            logger.warn(
              "Logout storm detected — another session is likely active elsewhere. Pausing auto-reconnect for 5 minutes."
            );
            state.qr = null;
            state.pairingCode = null;
            state.pairingPending = false;
            logEvent("error", "whatsapp", "wa_logout_storm", "تسجيل خروج متكرر — إيقاف مؤقت 5 دقائق", { reason });
            // Wait 5 minutes before allowing reconnect
            setTimeout(connectWhatsApp, 5 * 60 * 1000);
          } else {
            logEvent("warn", "whatsapp", "wa_logged_out", "تم تسجيل الخروج من واتساب", { reason });
            setTimeout(connectWhatsApp, 1500);
          }
        } else {
          // Network/server issue — reconnect with exponential backoff
          logEvent("warn", "whatsapp", "wa_disconnected", `انقطع الاتصال (${reason ?? "unknown"}) — إعادة المحاولة`, { reason });
          scheduleReconnect();
        }
      }
    });

    // ─── Process one message for one contact ──────────────────────────────────
    const processOneMessage = async (msg: any) => {
      if (!msg.message || msg.key.fromMe) return;

      // For "append" (offline/reconnect messages), only process messages from the last 10 minutes
      if (msg._appendType) {
        const msgTimestamp = (msg.messageTimestamp as number) * 1000;
        if (Date.now() - msgTimestamp > 10 * 60 * 1000) return;
      }

      const jid = msg.key.remoteJid;
      if (!jid || jid.includes("@g.us") || jid.includes("@broadcast")) return;

      const isLidJid = jid.endsWith("@lid");
      const phone = jid.replace("@s.whatsapp.net", "").replace("@lid", "");
      const pushName = msg.pushName ?? undefined;
      const rawText =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        "";

      if (!rawText) return;

      const text = cleanText(rawText);
      if (!text) return;

      // ── Show typing indicator immediately — before any DB work ──
      sock.sendPresenceUpdate("composing", jid).catch(() => {});

      // ── Pre-fetch all settings + recent history in parallel to minimise DB latency ──
      const [contact, adminPhone, maintenanceModeStr, autoReplySetting, _earlyHistory] = await Promise.all([
        upsertContact(phone, pushName),
        getSetting("adminPhone"),
        getSetting("maintenanceMode"),
        getSetting("autoReply"),
        // Start fetching conversation history early — reused later for AI reply
        (async () => {
          try {
            // We don't have contact.id yet, so we look it up by phone
            const rows = await db.select().from(contactsTable).where(eq(contactsTable.phone, phone)).limit(1);
            if (!rows.length) return null;
            return await getRecentMessages(rows[0].id, 6);
          } catch { return null; }
        })(),
      ]);

      // Normalize stored admin phone (strip @lid / @s.whatsapp.net if present)
      const savedAdminPhone = (adminPhone ?? "").replace(/@.+$/, "");
      const isAdmin = phone === savedAdminPhone || adminSessions.has(phone);

      // ─── Admin password check ─────────────────────────────────────
      const normalizedText = text.toLowerCase().replace(/\s+/g, " ");
      const isKiraPassword =
        normalizedText === "أنا كيرا" ||
        normalizedText === "انا كيرا" ||
        normalizedText === "كيرا" ||
        normalizedText === "kira" ||
        normalizedText === "ana kira";

      if (isKiraPassword) {
        // Only grant admin if: no admin registered yet, OR this is the registered admin re-authenticating
        if (savedAdminPhone && savedAdminPhone !== phone) {
          // Different number trying to authenticate — silently fall through to AI
        } else {
          // First-time registration OR the legitimate admin re-authenticating after restart
          await upsertSetting("adminPhone", phone);
          adminSessions.add(phone);
          await saveMessage(contact.id, text, "inbound");
          const isReturning = isAdmin;
          const greeting = isReturning
            ? `🔐 *أهلاً مجدداً، صاحبي!*\n\nناظم في الخدمة — كلّمني بشكل طبيعي وسأفهمك.\nأرسل *مساعدة* لعرض قائمة الأوامر الكاملة.`
            : `🔐 *وضع المشرف مفعّل — ناظم في خدمتك*

رقمك *+${phone}* محفوظ كمشرف رئيسي. من الآن ناظم يستجيب لك بشكل مختلف تماماً عن باقي الأرقام.

━━━━━━━━━━━━━━━━━
📋 *أوامر النظام:*
• *حالة* — تقرير كامل عن النظام
• *إحصائيات* — أرقام النشاط
• *جهات الاتصال* — من تواصل مع ناظم
• *سجل الرسائل* — آخر 20 رسالة
• *وقف / تشغيل* — تفعيل/إيقاف الصيانة
• *حظر [رقم] / إلغاء حظر [رقم]*
• *ردّ [رقم] [رسالة]* — رسالة نصية مباشرة لأي شخص
• *ارسل [رقم] [تعليمات]* — ناظم يصيغ ويرسل رسالة بأسلوبه
• *مساعدة* — القائمة الكاملة

━━━━━━━━━━━━━━━━━
🧠 *تحكم ذكي بالكلام الطبيعي:*
كلّمني بشكل عادي وسأفهم وأطبّق:
↪ "وقّف الردود" / "شغّل الردود"
↪ "غيّر موديل الذكاء الاصطناعي إلى Groq"
↪ "لا تقدّم نفسك في كل رسالة"
↪ "كن أكثر رسمية مع الزوار"
↪ "أضف لشخصيتك أنك تتحدث دائماً بالفرنسية"
↪ أي تعليمات أخرى — سأفهمها وأطبّقها

━━━━━━━━━━━━━━━━━
ناظم جاهز — تكلّم معي كما تشاء 🤝`;
          await sock.sendMessage(jid, { text: greeting });
          await saveMessage(contact.id, greeting, "outbound", "system");
          return;
        }
      }

      // ─── Admin: execute command OR fall through to AI ────────────
      if (isAdmin && isAdminCommand(text)) {
        await saveMessage(contact.id, text, "inbound");
        const adminReply = await handleAdminCommand(text, phone);
        await sock.sendMessage(jid, { text: adminReply });
        await saveMessage(contact.id, adminReply, "outbound", "system/admin");
        return;
      }

      // ─── Blocked contacts ─────────────────────────────────────────
      if (contact.isBlocked) return;

      logger.info({ phone, text: text.slice(0, 50) }, "Inbound message");

      // ─── Maintenance mode (admin bypasses it to keep chatting) ────
      if (maintenanceModeStr === "true" && !isAdmin) {
        await saveMessage(contact.id, text, "inbound");
        const maintenanceMsg =
          (await getSetting("maintenanceMessage")) ??
          "⚙️ النظام في وضع الصيانة حالياً. سيعود قريباً — We'll be back soon.";
        await sock.sendMessage(jid, { text: maintenanceMsg });
        await saveMessage(contact.id, maintenanceMsg, "outbound", "system/maintenance");
        return;
      }

      // ─── Auto-reply via AI (admin + regular users) ────────────────
      if (autoReplySetting !== "false" || isAdmin) {

        // ── Contact/Forward-to-admin state machine (multi-turn) ──────
        const fwdState = pendingForwards.get(phone);
        if (fwdState) {
          try {
            await saveMessage(contact.id, text, "inbound");
            const userName = text.trim();

            if (fwdState.step === "ask_name") {
              fwdState.name = userName;

                // Both modes now ask for message after name
              fwdState.step = "ask_msg";
              const askMsg = `بارك الله فيك *${userName}* 🤝\nاكتب رسالتك أو ما تريد إيصاله لصاحب التطبيق وسأحيله إليه فوراً 📩`;
              await sock.sendMessage(jid, { text: askMsg });
              await saveMessage(contact.id, askMsg, "outbound", "system/contact");
              return;
            }

            if (fwdState.step === "ask_msg") {
              const msgContent = text.trim();
              const { label: senderLabel, replyCmd } = buildContactLabel(fwdState.name ?? "", contact.phone, pushName, isLidJid);

              const convoHistory = await getRecentMessages(contact.id, 6);
              const contextLines = convoHistory
                .filter(m => m.content.trim() !== msgContent && m.content.trim() !== (fwdState.name ?? "").trim())
                .slice(-4)
                .map(m => `${m.direction === "inbound" ? "👤" : "🤖"} ${m.content.slice(0, 100)}${m.content.length > 100 ? "…" : ""}`)
                .join("\n");
              const contextSection = contextLines
                ? `\n\n📝 *سياق المحادثة:*\n${contextLines}`
                : "";

              const isContactMode = fwdState.mode === "contact";
              const adminMsg =
                `${isContactMode ? "📞" : "📩"} *${isContactMode ? "طلب تواصل عبر ناظم" : "رسالة من زائر عبر ناظم"}*\n\n` +
                `👤 *الاسم:* ${fwdState.name ?? "غير محدد"}\n` +
                `📱 *الرقم:* +${contact.phone}\n\n` +
                `💬 *الرسالة:*\n"${msgContent}"` +
                contextSection;

              logger.info({ from: contact.phone, name: fwdState.name }, "Attempting to forward visitor message to admin");
              const sent = await sendToAdminJid(adminMsg);
              if (sent) await sendToAdminJid(replyCmd);
              logger.info({ sent }, "Admin forward result");

              pendingForwards.delete(phone);

              const fOwnerPhone = await getSetting("ownerPhone");
              const fOwnerEmail = await getSetting("ownerEmail");
              const fDetails: string[] = [];
              if (fOwnerPhone) fDetails.push(`📱 واتساب: ${fOwnerPhone}`);
              if (fOwnerEmail) fDetails.push(`📧 إيميل: ${fOwnerEmail}`);
              const fDetailsLine = fDetails.length > 0
                ? `\n\nيمكنك أيضاً التواصل مباشرةً:\n${fDetails.join("\n")}`
                : "";

              const confirmMsg = sent
                ? `✅ وصلت رسالتك لصاحب التطبيق — سيتواصل معك قريباً إن شاء الله 🙏${fDetailsLine}`
                : `⚠️ حدث خطأ في الإرسال.${fDetailsLine || "\nجرّب مجدداً."}`;

              logger.info({ jid, confirmMsg: confirmMsg.slice(0, 60) }, "Sending forward confirmation to visitor");
              await sock.sendMessage(jid, { text: confirmMsg });
              logger.info("Visitor forward confirmation sent ✅");
              await saveMessage(contact.id, confirmMsg, "outbound", "system/forward");
              return;
            }
          } catch (fwdErr: any) {
            logger.error({ err: fwdErr, phone, jid }, "Error in contact/forward state machine ❌");
            pendingForwards.delete(phone);
            try {
              await sock.sendMessage(jid, { text: "⚠️ حدث خطأ غير متوقع. يمكنك المحاولة مجدداً." });
            } catch {}
            return;
          }
        }
        // ─────────────────────────────────────────────────────────────

        // ── Direct keyword detection — trigger state machine without AI ──
        const normalText = text.replace(/\s+/g, " ").trim();
        const isContactRequest = new RegExp(
          // Arabic: wants to contact owner
          "تواصل.{0,8}(صاحب|مالك|مشروع)" +
          "|(?:أريد|اريد|ابغى|أبغى|بغيت|نبغي|بدي|أبي|ابي).{0,12}(?:تواصل|أتواصل|اتواصل|أتكلم|اتكلم)" +
          "|(?:تواصلوا|اتصلوا|تواصلي|اتصلي).{0,8}(?:معي|بي|فيّ)" +
          "|(ربطني|ربطي|وصّلني|وصلني).{0,10}(?:صاحب|مالك)" +
          "|(صاحب|مالك).{0,6}مشروع.{0,15}(?:رقم|تواصل|اتصل|واتساب|contact)" +
          // English
          "|contact.{0,12}owner|reach.{0,12}owner|talk.{0,8}owner|connect.{0,8}owner",
          "i"
        ).test(normalText);
        const isForwardRequest = /أرسل.{0,6}رسالة|ارسل.{0,6}رسالة|قول.{0,5}له|بلّغه|ابلغه|بلغه|أبلغه|send.{0,6}message|tell.{0,6}him/i.test(normalText);

        if (!pendingForwards.has(phone) && (isContactRequest || isForwardRequest)) {
          const mode = isForwardRequest ? "forward" : "contact";
          logger.info({ phone, mode, text }, "Direct keyword triggered contact flow");
          await saveMessage(contact.id, text, "inbound");
          pendingForwards.set(phone, { step: "ask_name", mode });
          const promptMsg = `يسعدني مساعدتك! 🤝\nما اسمك حتى أُعرّفك لصاحب التطبيق؟ 👤`;
          await sock.sendMessage(jid, { text: promptMsg });
          await saveMessage(contact.id, promptMsg, "outbound", "system/contact");
          return;
        }
        // ─────────────────────────────────────────────────────────────

        // Use history fetched early in parallel (fallback to a fresh query if not available)
        const previousMsgs = _earlyHistory ?? await getRecentMessages(contact.id, 6);

        let history = previousMsgs.map((m) => ({
          role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
          content: m.content,
        }));
        while (history.length > 0 && history[0].role !== "user") {
          history = history.slice(1);
        }
        history = history.slice(-2);

        // A returning user has prior messages in the DB before this current message
        const isReturningUser = previousMsgs.length > 0;

        await saveMessage(contact.id, text, "inbound");

        try {
          let reply: string;
          let model: string;

          if (isAdmin) {
            // ── Admin: conversational AI with natural language settings control ──
            const adminResult = await generateAdminReply(text, history);
            reply = adminResult.reply;
            model = adminResult.model;

            // Apply any [SET key=value] actions returned by admin AI
            const ALLOWED_ADMIN_KEYS = new Set([
              "aiModel", "geminiModel", "groqModel",
              "maintenanceMode", "maintenanceMessage",
              "ownerName", "ownerPhone", "ownerEmail",
              "projectName", "projectLink",
              "autoReply", "agentPersonality",
            ]);
            const appliedKeys: string[] = [];
            for (const [key, value] of Object.entries(adminResult.actions)) {
              if (!ALLOWED_ADMIN_KEYS.has(key)) continue;
              const isClear = value === "__CLEAR__";
              const finalValue = isClear ? "" : value;
              await upsertSetting(key, finalValue);
              appliedKeys.push(isClear ? `${key}=✓ ممسوح` : `${key}=${value}`);
              logger.info({ key, value: isClear ? "(cleared)" : value }, "Admin AI applied setting change");
            }
            if (appliedKeys.length > 0) {
              reply += `\n\n✅ *تم تطبيق:* ${appliedKeys.map(k => `\`${k}\``).join(", ")}`;
            }
          } else {
            // ── Regular user: business AI agent ──
            const result = await generateAIReply(text, history, isReturningUser, contact.messageCount);
            reply = result.reply;
            model = result.model;

            // ── Guard: if AI wrote the video URL directly in text, inject the tag instead ──
            {
              const allS2 = await getAllSettings();
              const dvu = (allS2["demoVideoUrl"] ?? "").trim();
              if (dvu && reply.includes(dvu) && !reply.includes("[SEND_DEMO_VIDEO]")) {
                reply = reply.replace(dvu, "").trim();
                reply += "\n\n[SEND_DEMO_VIDEO]";
                logger.info("Video URL found in reply text — converted to [SEND_DEMO_VIDEO] tag");
              }
            }

            // ── Static fallback: intercept video requests manually ──
            if (model === "static/fallback") {
              const videoKeywords = /فيديو|video|شرح|demo|ابعث|ارسل|send|شاهد|watch/i;
              if (videoKeywords.test(text)) {
                const allS = await getAllSettings();
                const videoUrl = (allS["demoVideoUrl"] ?? "").trim();
                if (videoUrl) {
                  await sock.sendPresenceUpdate("paused", jid);
                  await sock.sendMessage(jid, { text: reply });
                  await saveMessage(contact.id, reply, "outbound", model);
                  await new Promise(r => setTimeout(r, 600));
                  await sendDemoVideo(sock, jid, videoUrl);
                  await saveMessage(contact.id, `[video: ${videoUrl}]`, "outbound", model);
                  return;
                }
              }
            }

            // ── Intercept flow tags — start multi-turn state machine ────
            if (reply.includes("[CONTACT_OWNER_START]")) {
              reply = reply.replace(/\[CONTACT_OWNER_START\]/g, "").trim();
              pendingForwards.set(phone, { step: "ask_name", mode: "contact" });
              reply += `\n\nما اسمك حتى أُعرّفك لصاحب التطبيق؟ 👤`;
            } else if (reply.includes("[FORWARD_ADMIN_START]")) {
              reply = reply.replace(/\[FORWARD_ADMIN_START\]/g, "").trim();
              pendingForwards.set(phone, { step: "ask_name", mode: "forward" });
              reply += `\n\nما اسمك حتى أُعرّفك لصاحب التطبيق؟ 👤`;
            }

            // ── Intercept video tag — send demo video if available ──
            if (reply.includes("[SEND_DEMO_VIDEO]")) {
              reply = reply.replace(/\[SEND_DEMO_VIDEO\]/g, "").trim();
              const allS = await getAllSettings();
              const videoUrl = (allS["demoVideoUrl"] ?? "").trim();
              if (videoUrl) {
                await sock.sendPresenceUpdate("paused", jid);
                if (reply) {
                  await sock.sendMessage(jid, { text: reply });
                  await saveMessage(contact.id, reply, "outbound", model);
                }
                // Small delay then send the video as MP4 file
                await new Promise(r => setTimeout(r, 800));
                await sendDemoVideo(sock, jid, videoUrl);
                await saveMessage(contact.id, `[video: ${videoUrl}]`, "outbound", model);
                return; // already sent — skip default sendMessage below
              }
            }
          }

          await sock.sendPresenceUpdate("paused", jid);
          await sock.sendMessage(jid, { text: reply });
          await saveMessage(contact.id, reply, "outbound", model);
        } catch (err: any) {
          logger.error({ err }, "AI reply failed");
          try { await sock.sendPresenceUpdate("paused", jid); } catch {}

          const adminRawPhone = (await getSetting("adminPhone"))?.replace(/@.*/, "").replace(/[^0-9]/g, "");
          if (adminRawPhone) {
            const now = new Date().toLocaleString("ar-MA", { timeZone: "Africa/Casablanca", hour12: false });
            const errMsg = err?.message ?? "خطأ غير معروف";
            const errStack = err?.stack ? `\n📋 Stack:\n${String(err.stack).slice(0, 400)}` : "";
            const aiUsed = (await getSetting("aiModel")) ?? "gemini";
            const alertText =
              `🚨 *خطأ في الذكاء الاصطناعي*\n\n` +
              `🕐 الوقت: ${now}\n` +
              `📱 المرسل: +${phone}\n` +
              `💬 الرسالة: ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}\n` +
              `🤖 النموذج: ${aiUsed}\n` +
              `❌ الخطأ: ${errMsg}` +
              errStack;
            await sendAdminAlert(alertText);
          }
        }

        await db
          .update(contactsTable)
          .set({ lastSeen: new Date() })
          .where(eq(contactsTable.id, contact.id));
      } else {
        await saveMessage(contact.id, text, "inbound");
      }
    };

    sock.ev.on("messages.upsert", async ({ messages, type }: any) => {
      // Accept "notify" (live messages) and "append" (messages received during reconnect)
      if (type !== "notify" && type !== "append") return;

      // ── Group messages by JID so each contact is processed in parallel ──
      // Messages from the SAME contact are processed sequentially (preserve order).
      // Messages from DIFFERENT contacts run concurrently.
      const byJid = new Map<string, any[]>();
      for (const msg of messages) {
        const jid = msg.key?.remoteJid;
        if (!jid) continue;
        if (type === "append") (msg as any)._appendType = true;
        const bucket = byJid.get(jid) ?? [];
        bucket.push(msg);
        byJid.set(jid, bucket);
      }

      // Fire one async chain per JID — all chains run in parallel
      await Promise.allSettled(
        Array.from(byJid.values()).map(async (msgs) => {
          for (const msg of msgs) {
            try {
              await processOneMessage(msg);
            } catch (err) {
              logger.error({ err }, "Unhandled error in processOneMessage");
            }
          }
        })
      );
    });
  } catch (err) {
    logger.error({ err }, "Failed to connect WhatsApp");
    state.status = "disconnected";
    state.client = null;
  }
}

export async function disconnectWhatsApp() {
  if (state.client) {
    await state.client.logout().catch(() => {});
    state.client = null;
  }
  state.status = "disconnected";
  state.qr = null;
  state.pairingCode = null;
  state.phone = null;
  state.name = null;
  if (fs.existsSync(SESSION_DIR)) {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  }
  await clearSessionBackup().catch(() => {});
}

export async function clearWhatsAppQr() {
  if (state.client) {
    state.client.end(undefined);
    state.client = null;
  }
  state.status = "disconnected";
  state.qr = null;
  state.pairingCode = null;
  if (fs.existsSync(SESSION_DIR)) {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  }
  await clearSessionBackup().catch(() => {});
  setTimeout(connectWhatsApp, 500);
}


export async function sendWhatsAppMessage(phone: string, content: string) {
  if (state.status !== "connected" || !state.client) {
    throw new Error("WhatsApp not connected");
  }
  const jid = phone.includes("@s.whatsapp.net") ? phone : `${phone}@s.whatsapp.net`;
  await state.client.sendMessage(jid, { text: content });

  const contact = await upsertContact(phone);
  await saveMessage(contact.id, content, "outbound");
}

export function getWhatsAppStatus() {
  return {
    connected: state.status === "connected",
    phone: state.phone,
    name: state.name,
    status: state.status,
    pairingCode: state.pairingCode,
  };
}

export function getWhatsAppQr() {
  return {
    qr: state.qr,
    status: state.status,
  };
}
