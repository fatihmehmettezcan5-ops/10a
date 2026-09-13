import { jsonError, requireUser } from "@/lib/auth";
import { deleteMemory, listMemory } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ memories: await listMemory(user.id, 60) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (Number.isInteger(id) && id > 0) await deleteMemory(user.id, id);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
