import { pool } from "./index";

/**
 * Hafif çalışma zamanı şema düzeltmesi.
 * Deploy sırasında drizzle-kit push çalıştırmadığımız için, eklenen yeni
 * kolonlar ilk istekte burada idempotent (IF NOT EXISTS) olarak uygulanır.
 * Yeni kolon eklerken bu listeye ALTER satırı eklemek yeterli.
 */
const STATEMENTS = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS vc text`,
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
