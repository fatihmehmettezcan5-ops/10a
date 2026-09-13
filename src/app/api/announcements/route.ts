import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { HttpError, jsonError, requireUser } from "@/lib/auth";
import { createAnnouncement, listAnnouncements } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    return Response.json({ announcements: await listAnnouncements() });
  } catch (error) {
    return jsonError(error);
  }
}

/** Duyuru yalnızca sınıf başkanı (admin) yayınlayabilir. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") {
      throw new HttpError(403, "Duyuru yayınlama yetkisi sadece sınıf başkanında.");
    }
    const body = (await request.json()) as Record<string, unknown>;
    const created = await createAnnouncement(user.id, body);
    return Response.json({ announcement: created }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
