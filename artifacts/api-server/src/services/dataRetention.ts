/**
 * Auto-purge old data.
 * Deletes messages and system_logs older than RETENTION_DAYS (default 3).
 * Runs on startup, then every hour.
 */

import { db, messagesTable, systemLogsTable, contactsTable } from "@workspace/db";
import { lt, sql } from "drizzle-orm";
import { logger as rootLogger } from "../lib/logger";

const logger = rootLogger.child({ service: "data-retention" });

export const RETENTION_DAYS = Number(process.env.DATA_RETENTION_DAYS ?? 3);
const RUN_INTERVAL_MS = 60 * 60 * 1000; // every hour

export async function purgeOldData(days: number = RETENTION_DAYS): Promise<{
  messages: number;
  logs: number;
}> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const msgRes = await db
    .delete(messagesTable)
    .where(lt(messagesTable.timestamp, cutoff));

  const logRes = await db
    .delete(systemLogsTable)
    .where(lt(systemLogsTable.timestamp, cutoff));

  const messages = Number((msgRes as any).rowCount ?? 0);
  const logs = Number((logRes as any).rowCount ?? 0);

  // Re-sync messageCount on contacts so the dashboard counters stay accurate
  if (messages > 0) {
    await db.execute(sql`
      UPDATE contacts SET message_count = COALESCE((
        SELECT COUNT(*) FROM messages WHERE messages.contact_id = contacts.id
      ), 0)
    `);
  }

  if (messages > 0 || logs > 0) {
    logger.info({ days, messages, logs }, "Old data purged");
  }
  return { messages, logs };
}

export function startDataRetentionJob(): void {
  // Run shortly after boot, then on a schedule
  setTimeout(() => {
    purgeOldData().catch((err) =>
      logger.error({ err }, "Initial data purge failed"),
    );
  }, 30_000);

  setInterval(() => {
    purgeOldData().catch((err) =>
      logger.error({ err }, "Scheduled data purge failed"),
    );
  }, RUN_INTERVAL_MS);

  logger.info({ retentionDays: RETENTION_DAYS, intervalMs: RUN_INTERVAL_MS }, "Data retention job scheduled");
}
