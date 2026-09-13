import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { HttpError, jsonError, requireUser, toSafeUser } from "@/lib/auth";
import { PROFILE_COLORS, VC_OPTIONS } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Profil bilgisi güncelleme (ad soyad + avatar rengi). */
export async function PATCH(request: Request) {
  try {
    const me = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;

    const patch: { name?: string; color?: string; vc?: string | null } = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2) throw new HttpError(400, "Ad soyad en az 2 karakter olmalı.");
      if (name.length > 60) throw new HttpError(400, "Ad soyad çok uzun.");
      patch.name = name;
    }

    if (body.vc !== undefined) {
      const raw = String(body.vc ?? "").trim().toUpperCase();
      if (raw === "" || raw === "YOK" || raw === "null") {
        patch.vc = null;
      } else if ((VC_OPTIONS as readonly string[]).includes(raw)) {
        patch.vc = raw;
      } else {
        throw new HttpError(400, "Geçersiz VC. Seçenekler: E1-E3, K1-K3.");
      }
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
