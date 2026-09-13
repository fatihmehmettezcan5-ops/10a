import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { HttpError, jsonError, requireUser, toSafeUser } from "@/lib/auth";
import { PROFILE_COLORS } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Profil bilgisi güncelleme (ad soyad + avatar rengi). */
export async function PATCH(request: Request) {
  try {
    const me = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;

    const patch: { name?: string; color?: string } = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2) throw new HttpError(400, "Ad soyad en az 2 karakter olmalı.");
      if (name.length > 60) throw new HttpError(400, "Ad soyad çok uzun.");
      patch.name = name;
    }

    if (body.color !== undefined) {
      const color = String(body.color).trim().toLowerCase();
      if (!(PROFILE_COLORS as readonly string[]).includes(color)) {
        throw new HttpError(400, "Geçersiz renk.");
      }
      patch.color = color;
    }

    if (Object.keys(patch).length === 0) {
      throw new HttpError(400, "Güncellenecek bir şey yok.");
    }

    const [updated] = await db.update(users).set(patch).where(eq(users.id, me.id)).returning();
    return Response.json({ user: toSafeUser(updated) });
  } catch (error) {
    return jsonError(error);
  }
}
