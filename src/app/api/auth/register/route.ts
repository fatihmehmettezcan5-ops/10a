import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { ensureSchema } from "@/db/ensure";
import {
  HttpError,
  hashPassword,
  jsonError,
  rateLimit,
  setSessionCookie,
  toSafeUser,
} from "@/lib/auth";
import { PROFILE_COLORS } from "@/lib/constants";

export const dynamic = "force-dynamic";



export async function POST(request: Request) {
  try {
    await ensureSchema();
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    rateLimit(`register:${ip}`, 10, 60_000);

    const body = (await request.json()) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const joinCode = String(body.joinCode ?? "").trim();

    if (name.length < 2) throw new HttpError(400, "Ad soyad en az 2 karakter olmalı.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Geçerli bir e-posta gir.");
    if (password.length < 8) throw new HttpError(400, "Şifre en az 8 karakter olmalı.");
    if (!/[0-9]/.test(password) || !/[a-zA-ZğüşıöçĞÜŞİÖÇ]/.test(password)) {
      throw new HttpError(400, "Şifre en az bir harf ve bir rakam içermeli.");
    }

    const expectedCode = (process.env.CLASS_JOIN_CODE ?? "10A").toLowerCase();
    if (joinCode.toLowerCase() !== expectedCode) {
      throw new HttpError(403, "Sınıf katılım kodu hatalı. Sınıf başkanından kodu iste.");
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) throw new HttpError(409, "Bu e-posta ile zaten bir hesap var.");

    // Danışma kilidi: aynı anda kaydolan ilk iki kullanıcıdan ikisinin de
    // admin olmasını engeller (sayım + ekleme atomik olur).
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(86001010)`);
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(users);
      const [row] = await tx
        .insert(users)
        .values({
          name,
          email,
          passwordHash: hashPassword(password),
          role: count === 0 ? "admin" : "student",
          color: PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)],
        })
        .returning();
      return row;
    });

    await setSessionCookie(created.id);
    return Response.json({ user: toSafeUser(created) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
