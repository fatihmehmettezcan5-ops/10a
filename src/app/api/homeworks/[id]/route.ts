import { HttpError, jsonError, requireUser } from "@/lib/auth";
import { deleteHomework, editHomework } from "@/lib/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const homeworkId = Number(id);
    if (!Number.isInteger(homeworkId)) throw new HttpError(400, "Geçersiz ödev kimliği.");
    const body = (await request.json()) as Record<string, unknown>;
    const updated = await editHomework(homeworkId, user.id, body);
    return Response.json({ homework: updated });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const homeworkId = Number(id);
    if (!Number.isInteger(homeworkId)) throw new HttpError(400, "Geçersiz ödev kimliği.");
    await deleteHomework(homeworkId, user);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
