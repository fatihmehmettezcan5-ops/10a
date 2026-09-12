import { jsonError, requireUser } from "@/lib/auth";
import { createHomework, listHomeworks } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    return Response.json({ homeworks: await listHomeworks() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const created = await createHomework(user.id, body);
    return Response.json({ homework: created }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
