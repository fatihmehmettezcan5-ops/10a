import { jsonError, requireUser, HttpError } from "@/lib/auth";
import { deleteMessageForAll, deleteMessageForMe, editMessage, markMessagesRead } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Sohbet açıldığında/güncellerken: yeni mesajları "gördü" işaretle. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "read");

    if (action === "read") {
      const marked = await markMessagesRead(user.id);
      return Response.json({ ok: true, marked });
    }
    if (action === "deleteForAll") {
      const id = Number(body.messageId);
      if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Geçersiz mesaj.");
      await deleteMessageForAll(user, id);
      return Response.json({ ok: true });
    }
    if (action === "deleteForMe") {
      const id = Number(body.messageId);
      if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Geçersiz mesaj.");
      await deleteMessageForMe(user.id, id);
      return Response.json({ ok: true });
    }
    if (action === "edit") {
      const id = Number(body.messageId);
      if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Geçersiz mesaj.");
      await editMessage(user.id, id, String(body.body ?? ""));
      return Response.json({ ok: true });
    }
    throw new HttpError(400, "Bilinmeyen işlem.");
  } catch (error) {
    return jsonError(error);
  }
}
