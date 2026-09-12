import { jsonError, requireUser } from "@/lib/auth";
import { getSchedule, upsertScheduleSlot } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    return Response.json({ schedule: await getSchedule() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const saved = await upsertScheduleSlot(body);
    return Response.json({ slot: saved });
  } catch (error) {
    return jsonError(error);
  }
}
