import { HttpError, jsonError, requireUser } from "@/lib/auth";
import { deleteAnnouncement } from "@/lib/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const announcementId = Number(id);
    if (!Number.isInteger(announcementId)) throw new HttpError(400, "Geçersiz duyuru kimliği.");
    await deleteAnnouncement(announcementId, user.id, user.role);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
