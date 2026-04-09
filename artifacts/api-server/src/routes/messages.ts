import { Router } from "express";
import { db, contactsTable, messagesTable } from "@workspace/db";
import { eq, desc, count, sql } from "drizzle-orm";
import { SendMessageBody, BroadcastMessageBody, GetMessagesQueryParams } from "@workspace/api-zod";
import { sendWhatsAppMessage } from "../services/whatsapp";

const router = Router();

router.get("/", async (req, res) => {
  const query = GetMessagesQueryParams.safeParse(req.query);
  const contactId = query.success ? query.data.contactId : undefined;
  const direction = query.success ? query.data.direction : undefined;
  const page = query.success ? (query.data.page ?? 1) : 1;
  const limit = query.success ? (query.data.limit ?? 50) : 50;
  const offset = (page - 1) * limit;

  const messages = await db
    .select({
      id: messagesTable.id,
      contactId: messagesTable.contactId,
      content: messagesTable.content,
      direction: messagesTable.direction,
      aiModel: messagesTable.aiModel,
      timestamp: messagesTable.timestamp,
      contactPhone: contactsTable.phone,
      contactName: contactsTable.name,
    })
    .from(messagesTable)
    .innerJoin(contactsTable, eq(messagesTable.contactId, contactsTable.id))
    .orderBy(desc(messagesTable.timestamp))
    .limit(limit)
    .offset(offset);

  const [{ value: totalCount }] = await db.select({ value: count() }).from(messagesTable);

  res.json({
    messages: messages.map((m) => ({
      ...m,
      contactName: m.contactName ?? null,
      timestamp: m.timestamp.toISOString(),
    })),
    total: Number(totalCount),
    page,
    totalPages: Math.ceil(Number(totalCount) / limit),
  });
});

router.post("/send", async (req, res) => {
  const body = SendMessageBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid input" });

  await sendWhatsAppMessage(body.data.phone, body.data.content);
  res.json({ success: true, message: "Message sent" });
});

router.post("/broadcast", async (req, res) => {
  const body = BroadcastMessageBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid input" });

  const contacts = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.isBlocked, false));

  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    try {
      await sendWhatsAppMessage(contact.phone, body.data.content);
      sent++;
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      failed++;
    }
  }

  res.json({ success: true, sent, failed });
});

// DELETE /messages — clear all messages or messages for a specific contact
router.delete("/", async (req, res) => {
  const contactId = req.query.contactId ? Number(req.query.contactId) : undefined;

  let deleted: number;
  if (contactId) {
    const result = await db.delete(messagesTable).where(eq(messagesTable.contactId, contactId));
    deleted = Number((result as any).rowCount ?? 0);
    // Reset message count for the contact
    await db.update(contactsTable).set({ messageCount: 0 }).where(eq(contactsTable.id, contactId));
  } else {
    const [{ value }] = await db.select({ value: count() }).from(messagesTable);
    deleted = Number(value);
    await db.delete(messagesTable);
    // Reset all message counts
    await db.update(contactsTable).set({ messageCount: 0 });
  }

  res.json({ success: true, deleted, message: `تم حذف ${deleted} رسالة.` });
});

export default router;
