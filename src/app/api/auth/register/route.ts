import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  HttpError,
  hashPassword,
  jsonError,
  rateLimit,
  setSessionCookie,
  toSafeUser,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6", "#22c55e", "#ef4444", "#0ea5e9"];

export async function POST(request: Request) {
  try {
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

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);

    const [created] = await db
      .insert(users)
      .values({
        name,
        email,
        passwordHash: hashPassword(password),
        role: count === 0 ? "admin" : "student",
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      })
      .returning();

    await setSessionCookie(created.id);
    return Response.json({ user: toSafeUser(created) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
