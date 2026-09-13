import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { HttpError, jsonError, requireUser, toSafeUser } from "@/lib/auth";
import { VC_OPTIONS } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Başkan üyelerin VC'sini güncelleyebilir (vc: "" -> kaldır). */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const me = await requireUser();
    if (me.role !== "admin") {
      throw new HttpError(403, "VC ataması sadece sınıf başkanında.");
    }
    const { id } = await params;
    const userId = Number(id);
    if (!Number.isInteger(userId)) throw new HttpError(400, "Geçersiz kullanıcı.");

    const body = (await request.json()) as Record<string, unknown>;
    const raw = String(body.vc ?? "").trim().toUpperCase();
    let vc: string | null;
    if (raw === "" || raw === "YOK" || raw === "NULL") {
      vc = null;
    } else if ((VC_OPTIONS as readonly string[]).includes(raw)) {
      vc = raw;
    } else {
      throw new HttpError(400, "Geçersiz VC. Seçenekler: E1-E3, K1-K3.");
    }

    const [updated] = await db
      .update(users)
      .set({ vc })
      .where(eq(users.id, userId))
      .returning();
    if (!updated) throw new HttpError(404, "Kullanıcı bulunamadı.");
    return Response.json({ user: toSafeUser(updated) });
  } catch (error) {
    return jsonError(error);
  }
}
