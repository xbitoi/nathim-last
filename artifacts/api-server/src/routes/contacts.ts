import { Router } from "express";
import { db, contactsTable, messagesTable } from "@workspace/db";
import { eq, ilike, desc, sql, count, ne } from "drizzle-orm";
import { ToggleBlockContactBody, GetContactsQueryParams, GetContactParams, ToggleBlockContactParams } from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res) => {
  const query = GetContactsQueryParams.safeParse(req.query);
  const search = query.success ? query.data.search : undefined;
  const page = query.success ? (query.data.page ?? 1) : 1;
  const limit = query.success ? (query.data.limit ?? 20) : 20;
  const offset = (page - 1) * limit;

  const baseQuery = db.select().from(contactsTable);
  const whereClause = search ? eq(sql`TRUE`, sql`TRUE`) : undefined;

  let contacts;
  let totalCount;

  if (search) {
    contacts = await db
      .select()
      .from(contactsTable)
      .where(ilike(contactsTable.phone, `%${search}%`))
      .orderBy(desc(contactsTable.lastSeen))
      .limit(limit)
      .offset(offset);
    const [{ value }] = await db
      .select({ value: count() })
      .from(contactsTable)
      .where(ilike(contactsTable.phone, `%${search}%`));
    totalCount = Number(value);
  } else {
    contacts = await db
      .select()
      .from(contactsTable)
      .orderBy(desc(contactsTable.lastSeen))
      .limit(limit)
      .offset(offset);
    const [{ value }] = await db.select({ value: count() }).from(contactsTable);
    totalCount = Number(value);
  }

  const lastMessages = await Promise.all(
    contacts.map(async (c) => {
      const msgs = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.contactId, c.id))
        .orderBy(desc(messagesTable.timestamp))
        .limit(1);
      return { id: c.id, lastMessage: msgs[0]?.content ?? null };
    })
  );

  const result = contacts.map((c) => ({
    ...c,
    firstSeen: c.firstSeen.toISOString(),
    lastSeen: c.lastSeen.toISOString(),
    lastMessage: lastMessages.find((lm) => lm.id === c.id)?.lastMessage ?? null,
  }));

  res.json({
    contacts: result,
    total: totalCount,
    page,
    totalPages: Math.ceil(totalCount / limit),
  });
});

router.get("/:id", async (req, res) => {
  const params = GetContactParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const contact = await db.select().from(contactsTable).where(eq(contactsTable.id, params.data.id));
  if (!contact[0]) return res.status(404).json({ error: "Not found" });

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.contactId, params.data.id))
    .orderBy(messagesTable.timestamp)
    .limit(100);

  res.json({
    contact: {
      ...contact[0],
      firstSeen: contact[0].firstSeen.toISOString(),
      lastSeen: contact[0].lastSeen.toISOString(),
      lastMessage: messages[messages.length - 1]?.content ?? null,
    },
    messages: messages.map((m) => ({
      ...m,
      contactPhone: contact[0].phone,
      contactName: contact[0].name ?? null,
      timestamp: m.timestamp.toISOString(),
    })),
  });
});

router.post("/:id/block", async (req, res) => {
  const params = ToggleBlockContactParams.safeParse({ id: Number(req.params.id) });
  const body = ToggleBlockContactBody.safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ error: "Invalid input" });

  await db
    .update(contactsTable)
    .set({ isBlocked: body.data.blocked })
    .where(eq(contactsTable.id, params.data.id));

  res.json({ success: true, message: body.data.blocked ? "Contact blocked" : "Contact unblocked" });
});

// DELETE /contacts/clear — delete all contacts and their messages
router.delete("/clear", async (req, res) => {
  const [{ value }] = await db.select({ value: count() }).from(contactsTable);
  const deleted = Number(value);
  // Messages are cascade-deleted with contacts via FK, or delete explicitly
  await db.delete(messagesTable);
  await db.delete(contactsTable);
  res.json({ success: true, deleted, message: `تم حذف ${deleted} جهة اتصال وجميع رسائلها.` });
});

export default router;
