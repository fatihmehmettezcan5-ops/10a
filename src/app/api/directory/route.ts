import { jsonError, requireUser } from "@/lib/auth";
import { listDirectory } from "@/lib/data";

export const dynamic = "force-dynamic";

/** @pingleme önerileri için hafif üye dizini (ad + renk). */
export async function GET() {
  try {
    await requireUser();
    return Response.json({ members: await listDirectory() });
  } catch (error) {
    return jsonError(error);
  }
}
