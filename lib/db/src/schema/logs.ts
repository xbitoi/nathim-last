import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const systemLogsTable = pgTable("system_logs", {
  id:        serial("id").primaryKey(),
  level:     text("level").notNull(),     // 'info' | 'warn' | 'error' | 'success'
  category:  text("category").notNull(),  // 'whatsapp' | 'ai' | 'system'
  event:     text("event").notNull(),     // short machine key e.g. "ai_success"
  message:   text("message").notNull(),   // human-readable Arabic/English
  details:   text("details"),             // JSON string for extra data
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertSystemLogSchema = createInsertSchema(systemLogsTable).omit({ id: true, timestamp: true });
export type InsertSystemLog = z.infer<typeof insertSystemLogSchema>;
export type SystemLog = typeof systemLogsTable.$inferSelect;
