import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { eq } from "drizzle-orm";

const COOKIE_NAME = "sinif_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 gün

function secret(): string {
  return process.env.SESSION_SECRET ?? process.env.DATABASE_URL ?? "sinif-10a-dev-secret";
}

/* ----------------------------- parola işlemleri ---------------------------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, digest] = parts;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

/* --------------------------------- oturum --------------------------------- */

type SessionPayload = { uid: number; exp: number };

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createSessionToken(userId: number): string {
  const payload: SessionPayload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (!payload?.uid || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(userId: number) {
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export type SafeUser = Pick<User, "id" | "name" | "email" | "role" | "color">;

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    color: user.color,
  };
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  const store = await cookies();
  const payload = readSessionToken(store.get(COOKIE_NAME)?.value);
  if (!payload) return null;
  const rows = await db.select().from(users).where(eq(users.id, payload.uid)).limit(1);
  const user = rows[0];
  return user ? toSafeUser(user) : null;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Önce giriş yapmalısın.");
  return user;
}

export function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Beklenmeyen bir hata oluştu." }, { status: 500 });
}

/* ------------------------- basit giriş hız sınırı -------------------------- */

const attempts = new Map<string, { count: number; resetAt: number }>();
let lastSweepAt = 0;

export function rateLimit(key: string, max = 8, windowMs = 60_000) {
  const now = Date.now();
  // Süresi dolan kayıtları 5 dakikada bir temizle; Map sınırsız büyümesin.
  if (now - lastSweepAt > 300_000) {
    lastSweepAt = now;
    for (const [k, v] of attempts) {
      if (v.resetAt < now) attempts.delete(k);
    }
  }
  const current = attempts.get(key);
  if (!current || current.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > max) {
    throw new HttpError(429, "Çok fazla deneme yaptın. Bir dakika sonra tekrar dene.");
  }
}
