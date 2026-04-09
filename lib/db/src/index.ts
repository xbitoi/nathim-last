import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      name TEXT,
      first_seen TIMESTAMP NOT NULL DEFAULT NOW(),
      last_seen TIMESTAMP NOT NULL DEFAULT NOW(),
      message_count INTEGER NOT NULL DEFAULT 0,
      is_blocked BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      contact_id INTEGER NOT NULL REFERENCES contacts(id),
      content TEXT NOT NULL,
      direction TEXT NOT NULL,
      ai_model TEXT,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id SERIAL PRIMARY KEY,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      event TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}
