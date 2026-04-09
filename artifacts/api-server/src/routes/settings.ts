import { Router } from "express";
import { db, settingsTable, messagesTable, contactsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { invalidateSettingsCache } from "../services/ai";
import { clearAdminSessions, sendAdminMessage } from "../services/whatsapp";

const SENSITIVE_KEYS = new Set([
  "geminiApiKey", "geminiApiKey2", "geminiApiKey3",
  "geminiApiKey4", "geminiApiKey5", "geminiApiKey6",
  "groqApiKey",
]);

const KEY_LABELS: Record<string, string> = {
  ownerName: "اسم صاحب التطبيق",
  ownerEmail: "البريد الإلكتروني",
  ownerPhone: "رقم الهاتف",
  projectName: "اسم التطبيق",
  projectDescription: "وصف التطبيق",
  projectLink: "رابط التطبيق",
  demoVideoUrl: "فيديو شرح التطبيق",
  geminiApiKey:  "مفتاح Gemini API 1",
  geminiApiKey2: "مفتاح Gemini API 2",
  geminiApiKey3: "مفتاح Gemini API 3",
  geminiApiKey4: "مفتاح Gemini API 4",
  geminiApiKey5: "مفتاح Gemini API 5",
  geminiApiKey6: "مفتاح Gemini API 6",
  geminiModel: "موديل Gemini",
  groqApiKey: "مفتاح Groq API",
  groqModel: "موديل Groq",
  aiModel: "مزود الذكاء الاصطناعي",
  agentPersonality: "شخصية ناظم",
  autoReply: "الرد التلقائي",
  maintenanceMode: "وضع الصيانة",
  maintenanceMessage: "رسالة الصيانة",
};

const router = Router();

async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(settingsTable);
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

function buildSettingsObject(raw: Record<string, string>) {
  return {
    ownerName: raw.ownerName ?? "",
    ownerEmail: raw.ownerEmail ?? "",
    ownerPhone: raw.ownerPhone ?? "",
    adminPhone: raw.adminPhone ?? "",
    projectName: raw.projectName ?? "Yazaki AI",
    projectDescription: raw.projectDescription ?? "تطبيق ذكاء اصطناعي يحوّل صور جداول الأسلاك الكهربائية إلى بيانات رقمية منظمة — يدعم العربية والإنجليزية والفرنسية",
    projectLink: raw.projectLink ?? "",
    demoVideoUrl: raw.demoVideoUrl ?? "",
    geminiApiKey:  raw.geminiApiKey  ?? "",
    geminiApiKey2: raw.geminiApiKey2 ?? "",
    geminiApiKey3: raw.geminiApiKey3 ?? "",
    geminiApiKey4: raw.geminiApiKey4 ?? "",
    geminiApiKey5: raw.geminiApiKey5 ?? "",
    geminiApiKey6: raw.geminiApiKey6 ?? "",
    geminiModel: raw.geminiModel ?? "",
    groqApiKey: raw.groqApiKey ?? "",
    groqModel: raw.groqModel ?? "",
    aiModel: (raw.aiModel as "gemini" | "groq") ?? "gemini",
    agentPersonality: raw.agentPersonality ?? "",
    autoReply: raw.autoReply !== "false",
    maintenanceMode: raw.maintenanceMode === "true",
    maintenanceMessage: raw.maintenanceMessage ?? "⚙️ النظام في وضع الصيانة حالياً. سيعود قريباً — We'll be back soon.",
  };
}

router.get("/", async (req, res) => {
  const raw = await getAllSettings();
  res.json(buildSettingsObject(raw));
});

router.post("/", async (req, res) => {
  const body = UpdateSettingsBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid input" });

  const data = body.data;

  // Snapshot current settings BEFORE saving (for diff notification)
  const oldSettings = await getAllSettings();

  const updates: Array<{ key: string; value: string }> = [
    { key: "ownerName", value: data.ownerName ?? "" },
    { key: "ownerEmail", value: data.ownerEmail ?? "" },
    { key: "ownerPhone", value: data.ownerPhone ?? "" },
    { key: "projectName", value: data.projectName ?? "" },
    { key: "projectDescription", value: data.projectDescription ?? "" },
    { key: "projectLink", value: data.projectLink ?? "" },
    { key: "demoVideoUrl", value: data.demoVideoUrl ?? "" },
    { key: "geminiApiKey",  value: data.geminiApiKey  ?? "" },
    { key: "geminiApiKey2", value: data.geminiApiKey2 ?? "" },
    { key: "geminiApiKey3", value: data.geminiApiKey3 ?? "" },
    { key: "geminiApiKey4", value: data.geminiApiKey4 ?? "" },
    { key: "geminiApiKey5", value: data.geminiApiKey5 ?? "" },
    { key: "geminiApiKey6", value: data.geminiApiKey6 ?? "" },
    { key: "geminiModel", value: data.geminiModel ?? "" },
    { key: "groqApiKey", value: data.groqApiKey ?? "" },
    { key: "groqModel", value: data.groqModel ?? "" },
    { key: "aiModel", value: data.aiModel ?? "gemini" },
    { key: "agentPersonality", value: data.agentPersonality ?? "" },
    { key: "autoReply", value: String(data.autoReply ?? true) },
    { key: "maintenanceMode", value: String(data.maintenanceMode ?? false) },
    { key: "maintenanceMessage", value: data.maintenanceMessage ?? "⚙️ النظام في وضع الصيانة حالياً. سيعود قريباً — We'll be back soon." },
  ];

  // adminPhone: only overwrite if a non-empty value is explicitly provided
  if (data.adminPhone && data.adminPhone.trim() !== "") {
    updates.push({ key: "adminPhone", value: data.adminPhone.trim() });
  }

  for (const { key, value } of updates) {
    await db
      .insert(settingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
  }

  // Invalidate the AI settings cache so next message uses fresh values
  invalidateSettingsCache();

  // Build diff and notify admin via WhatsApp
  const changedLines: string[] = [];
  for (const { key, value } of updates) {
    const oldVal = oldSettings[key] ?? "";
    if (oldVal === value) continue;
    const label = KEY_LABELS[key] ?? key;
    if (SENSITIVE_KEYS.has(key)) {
      changedLines.push(`• ${label}: ✅ تم التحديث`);
    } else if (key === "agentPersonality") {
      changedLines.push(
        value.trim() === ""
          ? `• ${label}: 🗑️ تم المسح`
          : `• ${label}: ✏️ تم التعديل`
      );
    } else {
      const display = value.length > 60 ? value.slice(0, 57) + "…" : value;
      changedLines.push(`• ${label}: ${display || "_(فارغ)_"}`);
    }
  }

  if (changedLines.length > 0) {
    const notif =
      `🛠️ *تم تحديث إعدادات ناظم من لوحة التحكم*\n\n` +
      changedLines.join("\n");
    sendAdminMessage(notif).catch(() => {});
  }

  const raw = await getAllSettings();
  res.json(buildSettingsObject(raw));
});

// --- Gemini model fetching — live list from Google API ---
// Friendly display names for known models
const GEMINI_NAMES: Record<string, { name: string; description: string }> = {
  "gemini-3.1-pro-preview":   { name: "Gemini 3.1 Pro Preview",   description: "الأحدث والأقوى" },
  "gemini-3-pro-preview":     { name: "Gemini 3 Pro Preview",      description: "Pro جيل 3" },
  "gemini-3-flash-preview":   { name: "Gemini 3 Flash Preview",    description: "Flash جيل 3 — سريع" },
  "gemini-2.5-pro":           { name: "Gemini 2.5 Pro",            description: "Pro متوازن وقوي" },
  "gemini-2.5-flash":         { name: "Gemini 2.5 Flash",          description: "Flash سريع ومستقر" },
  "gemini-2.0-flash":         { name: "Gemini 2.0 Flash",          description: "Flash 2.0 — رصيد عالٍ" },
  "gemini-2.0-flash-lite":    { name: "Gemini 2.0 Flash Lite",     description: "الأخف — رصيد مجاني أعلى" },
  "gemini-2.0-flash-001":     { name: "Gemini 2.0 Flash 001",      description: "Flash 2.0 نسخة مستقرة" },
  "gemini-flash-latest":      { name: "Gemini Flash Latest",        description: "آخر إصدار Flash" },
};

// Priority order for sorting
const GEMINI_PRIORITY = [
  "gemini-3.1-pro-preview", "gemini-3-pro-preview", "gemini-3-flash-preview",
  "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite", "gemini-flash-latest",
];

router.get("/models/gemini", async (req, res) => {
  const key = req.query.key as string;
  if (!key) return res.status(400).json({ error: "Missing key" });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=100`
    );
    if (!response.ok) return res.status(400).json({ error: "Invalid API key or quota exceeded" });

    const data = await response.json() as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> };
    const allModels = (data.models ?? [])
      .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
      .map(m => m.name.replace("models/", ""))
      .filter(id => id.startsWith("gemini") && !id.includes("tts") && !id.includes("image") && !id.includes("computer-use") && !id.includes("robotics") && !id.includes("customtools"));

    // Sort: known priority models first, then alphabetically
    allModels.sort((a, b) => {
      const pa = GEMINI_PRIORITY.indexOf(a);
      const pb = GEMINI_PRIORITY.indexOf(b);
      if (pa !== -1 && pb !== -1) return pa - pb;
      if (pa !== -1) return -1;
      if (pb !== -1) return 1;
      return a.localeCompare(b);
    });

    const models = allModels.map(id => ({
      id,
      name: GEMINI_NAMES[id]?.name ?? id,
      description: GEMINI_NAMES[id]?.description ?? "",
    }));

    return res.json({ models });
  } catch {
    return res.status(500).json({ error: "Failed to reach Gemini API" });
  }
});

// --- Groq model fetching — fixed list of 2 supported models ---
const GROQ_SUPPORTED = [
  { id: "llama-3.3-70b-versatile",                   name: "Llama 3.3 70B Versatile",     description: "الأموثق — رصيد يومي كبير" },
  { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout 17B",            description: "الأحدث — رصيد جيد" },
];

router.get("/models/groq", async (req, res) => {
  const key = req.query.key as string;
  if (!key) return res.status(400).json({ error: "Missing key" });

  // Validate key
  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!response.ok) return res.status(400).json({ error: "Invalid API key" });
  } catch {
    return res.status(500).json({ error: "Failed to reach Groq API" });
  }

  return res.json({ models: GROQ_SUPPORTED });
});

// ─── Full system reset ────────────────────────────────────────────────────────
router.post("/reset", async (_req, res) => {
  try {
    // Order: messages first (FK → contacts), then contacts, then settings
    await db.delete(messagesTable);
    await db.delete(contactsTable);
    await db.delete(settingsTable);

    // Clear in-memory admin session cache
    clearAdminSessions();

    // Bust the AI settings cache so next call reads fresh (empty) DB
    invalidateSettingsCache();

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Reset failed", detail: String(err) });
  }
});

export default router;
