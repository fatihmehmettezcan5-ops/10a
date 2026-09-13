import { jsonError, requireUser } from "@/lib/auth";
import { getChatFile } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Yüklenen dosyayı kimliği doğrulanmış kullanıcıya servis eder. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const row = await getChatFile(id);
    if (!row) return new Response("Bulunamadı", { status: 404 });
    const buffer = Buffer.from(row.data, "base64");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": row.mime,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
