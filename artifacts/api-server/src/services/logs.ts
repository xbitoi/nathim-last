import { db } from "@workspace/db";
import { systemLogsTable } from "@workspace/db/schema";
import { desc, eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

export type LogLevel    = "info" | "warn" | "error" | "success";
export type LogCategory = "whatsapp" | "ai" | "system";

export async function logEvent(
  level:    LogLevel,
  category: LogCategory,
  event:    string,
  message:  string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(systemLogsTable).values({
      level,
      category,
      event,
      message,
      details: details ? JSON.stringify(details) : null,
    });
  } catch (err) {
    // Never crash the main flow because of a log write failure
    logger.warn({ err }, "Failed to write system log");
  }
}

export async function getSystemLogs(opts: {
  limit?:    number;
  offset?:   number;
  category?: string;
  level?:    string;
}) {
  const { limit = 100, offset = 0, category, level } = opts;

  const conditions = [];
  if (category) conditions.push(eq(systemLogsTable.category, category));
  if (level)    conditions.push(eq(systemLogsTable.level, level));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, [{ count }]] = await Promise.all([
    db
      .select()
      .from(systemLogsTable)
      .where(where)
      .orderBy(desc(systemLogsTable.timestamp))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(systemLogsTable)
      .where(where),
  ]);

  return { logs, total: count };
}

export async function clearSystemLogs() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(systemLogsTable);

  await db.delete(systemLogsTable);
  return { deleted: count };
}
