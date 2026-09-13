import { jsonError, requireUser, HttpError, type SafeUser } from "@/lib/auth";
import { createAiMessage, createMessage, getChatFile, getChatMessage, listMessages } from "@/lib/data";
import { buildContext, executeActions, type ActionResult } from "@/lib/ai/tools";
import { detectProvider, extractJson, runModel, type ChatTurn } from "@/lib/ai/provider";
import { createAiAttachmentFromUrl } from "@/lib/ai/chat-utils";
import type { ChatAttachment } from "@/lib/attachments";
import { CLASS_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";

const AI_MENTION = "@10asistan";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const after = Number(params.get("after") ?? 0);
    const withReads = params.get("reads") === "1";
    const list = await listMessages(Number.isFinite(after) ? after : 0, 120, user.id, withReads);
    return Response.json({ messages: list });
  } catch (error) {
    return jsonError(error);
  }
}

/** Kullanıcının ek referanslarını gerçek dosyalara çözer (en fazla 4). */
async function resolveAttachments(rawIds: unknown, userId: number): Promise<ChatAttachment[]> {
  if (!Array.isArray(rawIds)) return [];
  const out: ChatAttachment[] = [];
  for (const item of rawIds.slice(0, 4)) {
    const id = typeof item === "string" ? item : String((item as { id?: unknown })?.id ?? "");
    if (!id) continue;
    const row = await getChatFile(id);
    if (!row) continue;
    if (row.uploaderId !== userId) continue; // başkasının eki mesaja eklenemez
    out.push({
      id: row.id,
      name: row.name,
      mime: row.mime,
      size: row.size,
      kind: row.mime.startsWith("image/")
        ? "image"
        : row.mime.startsWith("video/")
          ? "video"
          : row.mime.startsWith("audio/")
            ? "audio"
            : "file",
      url: `/api/files/${row.id}`,
    });
  }
  return out;
}

function cleanMentions(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v > 0)
        .slice(0, 10),
    ),
  );
}

/**
 * @10Asistan çağrısını işler: sohbet bağlamıyla modeli çalıştırır,
 * cevabı sınıf sohbetine AI mesajı olarak ekler. Model yoksa sessizce atlar.
 */
async function runChatAssistant(
  user: SafeUser,
  body: string,
  attachments: ChatAttachment[],
): Promise<boolean> {
  const provider = detectProvider();
  if (provider.id === "local") return false; // anahtar yoksa sohbete AI yazmaz

  try {
    const [context, recent] = await Promise.all([buildContext(user), listMessages(0, 20)]);

    const transcript = recent
      .slice(-20)
      .map(
        (m) =>
          `${m.authorName}: ${m.body}${m.attachments.length ? ` [📎 ${m.attachments.map((a) => a.name).join(", ")}]` : ""}`,
      )
      .join("\n");

    const system = `Sen ${CLASS_NAME} sınıf sohbetindeki yapay zekâ asistanısın; adın "10A Asistan". Kullanıcılar "@10Asistan" yazarak seni sohbete çağırır.
Türkçe, kısa (1-4 cümle), samimi ve yardımsever konuşursun; gerektiğinde emoji kullanırsın.
Sohbetin son 20 mesajını görüyorsun; sınıfın ödev/takvim/program verisi elinde.
İstenirse görsel üretebilirsin (action: generate_image) ve sınıf sohbetine mesaj yazabilirsin (action: send_message — yalnızca kullanıcı özellikle ister).
Cevabını SADECE şu biçimde geçerli JSON olarak ver:
{"reply":"sohbete yazılacak Türkçe metin","actions":[...],"followups":["opsiyonel 2-3 takip sorusu"]}

${`Güncel uygulama verisi:\n${context}`}

Sohbet dökümü (en yenisi sonda):
${transcript}

Kurallar: Sohbet ortamındasın; cevabın herkese görünür. Kısa tut, ders içi konularda yardım et, uygunsuz içerik üretme.`;

    const attachmentNote = attachments.length
      ? `\n[Not: ${user.name} mesaja ${attachments.map((a) => a.name).join(", ")} ek(ler)ini koydu; içeriğini sohbetten göremezsin ama adlarından yola çıkabilirsin.]`
      : "";

    const turns: ChatTurn[] = [
      { role: "system", content: system },
      {
        role: "user",
        content: `${user.name} sana şu mesajla seslendi: "${body}"${attachmentNote}\nSohbete yazılacak cevabı üret.`,
      },
    ];

    const result = await runModel(turns);
    const parsed = extractJson(result.raw);
    const reply = (parsed?.reply ?? result.raw.trim()).slice(0, 1200);
    if (!reply) return false;

    // Eylemler: yalnızca generate_image ve send_message desteklenir.
    let imageAttachment: ChatAttachment | null = null;
    const actions = (parsed?.actions ?? []) as Record<string, unknown>[];
    const safeActions = actions.filter((a) =>
      ["generate_image", "send_message"].includes(String(a.type ?? "")),
    );
    if (safeActions.length) {
      const results: ActionResult[] = await executeActions(user, safeActions);
      const image = results.find((r) => r.type === "generate_image" && r.ok && r.url);
      if (image?.url) imageAttachment = createAiAttachmentFromUrl(image.url, "uretilen-gorsel.png");
    }

    await createAiMessage(reply, imageAttachment ? [imageAttachment] : []);
    return true;
  } catch (error) {
    console.error("chat assistant error:", error);
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const payload = (await request.json()) as Record<string, unknown>;
    const body = String(payload.body ?? "").trim();
    if (!body) throw new HttpError(400, "Boş mesaj gönderemezsin.");
    if (body.length > 1200) throw new HttpError(400, "Mesaj çok uzun (en fazla 1200 karakter).");
    const homeworkId = Number(payload.homeworkId);

    const attachments = await resolveAttachments(payload.attachments, user.id);
    const mentions = cleanMentions(payload.mentions);
    const replyToRaw = Number(payload.replyTo);
    const replyToId = Number.isInteger(replyToRaw) && replyToRaw > 0 ? replyToRaw : null;
    if (replyToId) {
      const target = await getChatMessage(replyToId);
      if (!target) throw new HttpError(400, "Cevap verilecek mesaj bulunamadı.");
    }

    const created = await createMessage(user, body, Number.isInteger(homeworkId) && homeworkId > 0 ? homeworkId : null, attachments, mentions, replyToId);

    // @10Asistan çağrısı: model varsa sohbete cevap yazar.
    const aiTriggered = body.toLowerCase().includes(AI_MENTION);
    let aiReplied = false;
    if (aiTriggered) {
      aiReplied = await runChatAssistant(user, body, attachments);
    }

    return Response.json(
      {
        message: {
          ...created,
          attachments,
          mentions,
          deletedForAll: false,
          edited: false,
          replyTo: replyToId ? { id: replyToId, authorName: "", body: "", deletedForAll: false } : null,
          reads: [],
          createdAt: created.createdAt.toISOString(),
        },
        aiTriggered,
        aiReplied,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
