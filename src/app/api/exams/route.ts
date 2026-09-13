import { jsonError, requireUser } from "@/lib/auth";
import { createMockExam, listMockExams } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ exams: await listMockExams(user.id) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const created = await createMockExam(user.id, body);
    return Response.json({ exam: created }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
