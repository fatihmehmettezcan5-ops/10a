import { HttpError, jsonError, requireUser } from "@/lib/auth";
import { deleteMockExamGroup } from "@/lib/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** id = "tarih|denemeAdi" (URL-encode edilmiş). Tüm ders satırlarını birlikte siler. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await deleteMockExamGroup(id, user.id, user.role);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
