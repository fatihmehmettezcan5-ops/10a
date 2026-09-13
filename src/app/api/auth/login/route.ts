import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSchema } from "@/db/ensure";
import {
  HttpError,
  jsonError,
  rateLimit,
  setSessionCookie,
  toSafeUser,
  verifyPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = (await request.json()) as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    rateLimit(`login:${ip}:${email}`, 8, 60_000);

    if (!email || !password) throw new HttpError(400, "E-posta ve şifre gerekli.");

    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, "E-posta veya şifre hatalı.");
    }

    await setSessionCookie(user.id);
    return Response.json({ user: toSafeUser(user) });
  } catch (error) {
    return jsonError(error);
  }
}
