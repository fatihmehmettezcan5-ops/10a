import { jsonError, requireUser } from "@/lib/auth";
import { createEvent, listEvents } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ events: await listEvents(user.id) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const created = await createEvent(user.id, body);
    return Response.json({ event: created }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
