import { jsonError, requireUser } from "@/lib/auth";
import { getDashboardStats } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ stats: await getDashboardStats(user.id) });
  } catch (error) {
    return jsonError(error);
  }
}
