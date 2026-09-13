import { jsonError, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Ses sunucusunun anlık durumu (oda dolulukları). */
export async function GET() {
  try {
    await requireUser();
    const url = process.env.VOICE_URL?.trim();
    if (!url) {
      return Response.json({ voiceUrl: null, online: 0, rooms: [] });
    }
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/health`, {
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { rooms: string[]; users: number };
        return Response.json({
          voiceUrl: url,
          online: data.users ?? 0,
          rooms: (data.rooms ?? []).map((name) => ({ name, users: -1 })),
        });
      }
    } catch {}
    return Response.json({ voiceUrl: url, online: 0, rooms: [] });
  } catch (error) {
    return jsonError(error);
  }
}
