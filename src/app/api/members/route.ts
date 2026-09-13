import { db } from "@/db";
import { users } from "@/db/schema";
import { HttpError, jsonError, requireUser } from "@/lib/auth";
import { listMembers } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Üye listesi: yalnızca sınıf başkanı (admin). */
export async function GET() {
  try {
    const user = await requireUser();
    if (user.role !== "admin") {
      throw new HttpError(403, "Üye listesini sadece sınıf başkanı görebilir.");
    }
    return Response.json({ members: await listMembers() });
  } catch (error) {
    return jsonError(error);
  }
}
