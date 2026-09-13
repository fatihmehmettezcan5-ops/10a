import { jsonError, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Render'daki ses sunucusunun adresi (env ile ezilebilir). */
const DEFAULT_VOICE_URL = "https://one0a-voice.onrender.com";

/** Ses sunucusunun anlık durumu (oda dolulukları). */
export async function GET() {
  try {
    await requireUser();
    const secret = process.env.VOICE_SECRET?.trim();
    if (!secret) {
      return Response.json({ voiceUrl: null, online: 0, rooms: [] });
    }
    const url = (process.env.VOICE_URL?.trim() || DEFAULT_VOICE_URL).replace(/\/$/, "");
    try {
      const res = await fetch(`${url}/health`, {
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
