import { clearSessionCookie, jsonError } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
