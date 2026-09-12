import { getCurrentUser, jsonError } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return Response.json({ user });
  } catch (error) {
    return jsonError(error);
  }
}
