import { createHmac } from "node:crypto";
import { jsonError, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Render'daki ses sunucusunun adresi (env ile ezilebilir). */
const DEFAULT_VOICE_URL = "https://one0a-voice.onrender.com";

/** Yapılandırıldı = VOICE_SECRET girilmiş olması. */
function voiceSecret(): string | null {
  const s = process.env.VOICE_SECRET?.trim();
  return s && s.length > 0 ? s : null;
}

function voiceUrl(): string {
  const url = process.env.VOICE_URL?.trim();
  return (url && url.length > 0 ? url : DEFAULT_VOICE_URL).replace(/\/$/, "");
}

/** Kısa ömürlü sinyal token'ı üretir. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const room = String(body.room ?? "").trim();
    if (!/^[EK][123]$/.test(room)) {
      return Response.json({ error: "Geçersiz oda." }, { status: 400 });
    }
    const target = voiceUrl();
    const secret = voiceSecret();
    if (!secret) {
      return Response.json({ error: "Ses sunucusu yapılandırılmadı." }, { status: 503 });
    }
    const token = createHmac("sha256", secret).update("voice").digest("hex").slice(0, 32);
    return Response.json({ token, url: `${target}/voice` });
  } catch (error) {
    return jsonError(error);
  }
}
