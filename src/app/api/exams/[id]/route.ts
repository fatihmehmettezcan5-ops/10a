import { HttpError, jsonError, requireUser } from "@/lib/auth";
import { deleteMockExam } from "@/lib/data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const examId = Number(id);
    if (!Number.isInteger(examId)) throw new HttpError(400, "Geçersiz deneme kimliği.");
    await deleteMockExam(examId, user.id, user.role);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
