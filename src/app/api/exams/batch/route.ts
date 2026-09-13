import { jsonError, requireUser } from "@/lib/auth";
import { createMockExamBatch } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Hızlı TYT girişi: tek istekte tüm ders sonuçları. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createMockExamBatch(user.id, body);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
