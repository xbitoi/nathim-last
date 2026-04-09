/**
 * WhatsApp Session Persistence
 * Backs up the Baileys session directory to the DB (settings table) on every
 * creds.update event. On startup, restores the session from DB if the local
 * directory is missing or empty so the bot reconnects automatically after a
 * container wipe.
 */

import fs from "fs";
import path from "path";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger as rootLogger } from "../lib/logger";

const logger = rootLogger.child({ service: "wa-session" });
const BACKUP_KEY = "wa_session_backup";

export async function backupSession(sessionDir: string): Promise<void> {
  try {
    if (!fs.existsSync(sessionDir)) return;
    const files = fs.readdirSync(sessionDir);
    if (files.length === 0) return;

    const data: Record<string, string> = {};
    for (const file of files) {
      const full = path.join(sessionDir, file);
      if (fs.statSync(full).isFile()) {
        data[file] = fs.readFileSync(full, "utf8");
      }
    }

    const json = JSON.stringify(data);
    await db
      .insert(settingsTable)
      .values({ key: BACKUP_KEY, value: json })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: json } });

    logger.debug({ files: files.length }, "Session backed up to DB");
  } catch (err) {
    logger.error({ err }, "Failed to backup session to DB");
  }
}

export async function restoreSessionIfMissing(sessionDir: string): Promise<boolean> {
  try {
    const hasLocal =
      fs.existsSync(sessionDir) &&
      fs.readdirSync(sessionDir).some((f) => f === "creds.json");

    if (hasLocal) return false;

    const rows = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, BACKUP_KEY))
      .limit(1);

    if (rows.length === 0 || !rows[0].value) return false;

    const data: Record<string, string> = JSON.parse(rows[0].value);
    if (!data["creds.json"]) return false;

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    for (const [file, content] of Object.entries(data)) {
      fs.writeFileSync(path.join(sessionDir, file), content, "utf8");
    }

    logger.info({ files: Object.keys(data).length }, "Session restored from DB backup");
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to restore session from DB");
    return false;
  }
}

export async function clearSessionBackup(): Promise<void> {
  try {
    await db.delete(settingsTable).where(eq(settingsTable.key, BACKUP_KEY));
    logger.info("Session backup cleared from DB");
  } catch (err) {
    logger.error({ err }, "Failed to clear session backup");
  }
}
