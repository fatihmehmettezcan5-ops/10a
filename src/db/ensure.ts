import { sql } from "drizzle-orm";
import { pool } from "./index";

/**
 * Hafif çalışma zamanı şema düzeltmesi.
 * Deploy sırasında drizzle-kit push çalıştırmadığımız için, eklenen yeni
 * kolonlar ilk istekte burada idempotent (IF NOT EXISTS) olarak uygulanır.
 * Yeni kolon eklerken bu listeye ALTER satırı eklemek yeterli.
 */
const STATEMENTS = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS vc text`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS mentions jsonb DEFAULT '[]'::jsonb`,
  `CREATE TABLE IF NOT EXISTS chat_files (
     id text PRIMARY KEY,
     name text NOT NULL,
     mime text NOT NULL DEFAULT 'application/octet-stream',
     size integer NOT NULL DEFAULT 0,
     data text NOT NULL,
     uploader_id integer REFERENCES users(id) ON DELETE SET NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS ai_memory (
     id serial PRIMARY KEY,
     user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     content text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS assistant_projects (
     id serial PRIMARY KEY,
     user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name text NOT NULL,
     note text NOT NULL DEFAULT '',
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE assistant_messages ADD COLUMN IF NOT EXISTS project_id integer`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_all boolean NOT NULL DEFAULT false`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for jsonb DEFAULT '[]'::jsonb`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited boolean NOT NULL DEFAULT false`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id integer`,
  `CREATE TABLE IF NOT EXISTS message_reads (
     id serial PRIMARY KEY,
     message_id integer NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
     user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     read_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS message_reads_msg_idx ON message_reads(message_id)`,
] as const;

let done: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!done) {
    done = (async () => {
      for (const stmt of STATEMENTS) {
        await pool.query(stmt);
      }
    })().catch((error) => {
      done = null; // sonraki istekte tekrar denesin
      throw error;
    });
  }
  return done;
}

// sql importu drizzle tipleri için (kullanılmıyorsa derleyici kaldırmaz)
void sql;
