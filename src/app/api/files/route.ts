import { jsonError, requireUser, HttpError } from "@/lib/auth";
import { saveChatFile } from "@/lib/data";
import { CHAT_MAX_FILE_BYTES, CHAT_MAX_TOTAL_BYTES, kindOf } from "@/lib/attachments";

export const dynamic = "force-dynamic";

/** Sohbete dosya/görsel yükleme → ChatAttachment döner. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const form = await request.formData();
    const files = form.getAll("files").filter((v): v is File => v instanceof File);
    if (!files.length) throw new HttpError(400, "Dosya seçilmedi.");
    if (files.length > 4) throw new HttpError(400, "Bir istekte en fazla 4 dosya yükleyebilirsin.");
    let total = 0;
    for (const file of files) {
      if (file.size > CHAT_MAX_FILE_BYTES) {
        throw new HttpError(413, `${file.name} çok büyük; dosya başına en fazla 6 MB.`);
      }
      total += file.size;
      if (total > CHAT_MAX_TOTAL_BYTES) {
        throw new HttpError(413, "Dosyaların toplam boyutu 12 MB'yi aşamaz.");
      }
    }
    const attachments = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      attachments.push(
        await saveChatFile({
          name: file.name || "dosya",
          mime: file.type,
          size: buffer.length,
          dataBase64: buffer.toString("base64"),
          uploaderId: user.id,
        }),
      );
    }
    return Response.json({ attachments }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// kindOf kullanılmasa bile tipler yaşasın
void kindOf;
