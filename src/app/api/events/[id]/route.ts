import { HttpError, jsonError, requireUser } from "@/lib/auth";
import { deleteEvent, toggleEvent } from "@/lib/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const eventId = Number(id);
    if (!Number.isInteger(eventId)) throw new HttpError(400, "Geçersiz hatırlatıcı kimliği.");
    const body = (await request.json()) as Record<string, unknown>;
    const updated = await toggleEvent(eventId, user.id, user.role, Boolean(body.done));
    return Response.json({ event: updated });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const eventId = Number(id);
    if (!Number.isInteger(eventId)) throw new HttpError(400, "Geçersiz hatırlatıcı kimliği.");
    await deleteEvent(eventId, user.id, user.role);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
