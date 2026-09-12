import { jsonError, requireUser } from "@/lib/auth";
import { createMessage, listMessages } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireUser();
    const after = Number(new URL(request.url).searchParams.get("after") ?? 0);
    const list = await listMessages(Number.isFinite(after) ? after : 0);
    return Response.json({ messages: list });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const homeworkId = Number(body.homeworkId);
    const created = await createMessage(
      user,
      String(body.body ?? ""),
      Number.isInteger(homeworkId) && homeworkId > 0 ? homeworkId : null,
    );
    return Response.json({ message: created }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
