import { Router } from "express";
import { db, contactsTable, messagesTable } from "@workspace/db";
import { eq, gte, count, sql } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const [totalContacts] = await db.select({ value: count() }).from(contactsTable);
  const [totalMessages] = await db.select({ value: count() }).from(messagesTable);
  const [messagesSent] = await db
    .select({ value: count() })
    .from(messagesTable)
    .where(eq(messagesTable.direction, "outbound"));
  const [messagesReceived] = await db
    .select({ value: count() })
    .from(messagesTable)
    .where(eq(messagesTable.direction, "inbound"));
  const [blockedContacts] = await db
    .select({ value: count() })
    .from(contactsTable)
    .where(eq(contactsTable.isBlocked, true));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [todayMessages] = await db
    .select({ value: count() })
    .from(messagesTable)
    .where(gte(messagesTable.timestamp, today));

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const [activeContacts] = await db
    .select({ value: count() })
    .from(contactsTable)
    .where(gte(contactsTable.lastSeen, sevenDaysAgo));

  res.json({
    totalContacts: Number(totalContacts.value),
    totalMessages: Number(totalMessages.value),
    messagesSent: Number(messagesSent.value),
    messagesReceived: Number(messagesReceived.value),
    blockedContacts: Number(blockedContacts.value),
    todayMessages: Number(todayMessages.value),
    activeContacts: Number(activeContacts.value),
  });
});

router.get("/activity", async (req, res) => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);

    const [inbound] = await db
      .select({ value: count() })
      .from(messagesTable)
      .where(
        sql`${messagesTable.timestamp} >= ${d} AND ${messagesTable.timestamp} <= ${end} AND ${messagesTable.direction} = 'inbound'`
      );
    const [outbound] = await db
      .select({ value: count() })
      .from(messagesTable)
      .where(
        sql`${messagesTable.timestamp} >= ${d} AND ${messagesTable.timestamp} <= ${end} AND ${messagesTable.direction} = 'outbound'`
      );

    days.push({
      date: d.toISOString().split("T")[0],
      inbound: Number(inbound.value),
      outbound: Number(outbound.value),
    });
  }
  res.json(days);
});

export default router;
