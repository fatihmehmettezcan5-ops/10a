import { createHmac } from "node:crypto";
import { jsonError, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Panel → ses sunucusu geçiş anahtarı. */
function voiceSecret(): string {
  return process.env.VOICE_SECRET ?? "degistir-beni-render-env-de";
}

function voiceUrl(): string | null {
  const url = process.env.VOICE_URL?.trim();
  return url && url.length > 0 ? url.replace(/\/$/, "") : null;
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
    if (!target) {
      return Response.json({ error: "Ses sunucusu yapılandırılmadı." }, { status: 503 });
    }
    const token = createHmac("sha256", voiceSecret()).update("voice").digest("hex").slice(0, 32);
    return Response.json({ token, url: `${target}/voice` });
  } catch (error) {
    return jsonError(error);
  }
}
