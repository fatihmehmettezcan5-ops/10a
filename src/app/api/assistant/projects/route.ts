import { jsonError, requireUser, HttpError } from "@/lib/auth";
import { createProject, deleteProject, listProjects } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ projects: await listProjects(user.id) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const created = await createProject(user.id, String(body.name ?? ""), String(body.note ?? ""));
    return Response.json({ project: created }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Geçersiz proje.");
    await deleteProject(user.id, id);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
