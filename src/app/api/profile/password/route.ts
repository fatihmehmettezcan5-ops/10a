import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { HttpError, hashPassword, jsonError, rateLimit, requireUser, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Şifre değiştirme: mevcut şifre doğrulanır, yenisi kayıt kurallarına uymalı. */
export async function POST(request: Request) {
  try {
    const me = await requireUser();
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    rateLimit(`password:${ip}:${me.id}`, 6, 60_000);

    const body = (await request.json()) as Record<string, unknown>;
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");

    if (!currentPassword || !newPassword) {
      throw new HttpError(400, "Mevcut ve yeni şifre gerekli.");
    }
    if (newPassword.length < 8) throw new HttpError(400, "Yeni şifre en az 8 karakter olmalı.");
    if (!/[0-9]/.test(newPassword) || !/[a-zA-ZğüşıöçĞÜŞİÖÇ]/.test(newPassword)) {
      throw new HttpError(400, "Yeni şifre en az bir harf ve bir rakam içermeli.");
    }

    const rows = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
    const user = rows[0];
    if (!user) throw new HttpError(404, "Kullanıcı bulunamadı.");

    if (!verifyPassword(currentPassword, user.passwordHash)) {
      throw new HttpError(403, "Mevcut şifren hatalı.");
    }

    await db
      .update(users)
      .set({ passwordHash: hashPassword(newPassword) })
      .where(eq(users.id, me.id));

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
