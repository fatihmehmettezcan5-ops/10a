import { jsonError, requireUser, HttpError } from "@/lib/auth";
import {
  addMemory,
  getProject,
  getSchedule,
  listAssistantMessages,
  listEvents,
  listHomeworks,
  listMemory,
  saveAssistantMessage,
} from "@/lib/data";
import { buildContext, executeActions, TOOL_GUIDE, type ActionResult } from "@/lib/ai/tools";
import { detectProvider, extractJson, runModel, type Attachment, type ChatTurn } from "@/lib/ai/provider";
import { formatResearchBlock, researchWeb } from "@/lib/ai/research";
import { localAssistant, type Snapshot } from "@/lib/ai/fallback";
import { CLASS_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILES = 2;
const MAX_FILE_BYTES = 3.5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

/** PDF'ten metin çıkarır (unpdf, serverless uyumlu). */
async function extractPdfText(buffer: Buffer, name: string): Promise<string> {
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text.replace(/\s+/g, " ").trim().slice(0, 8000);
  } catch {
    throw new HttpError(400, `${name} okunamadı; bozuk ya da şifreli bir PDF olabilir.`);
  }
}

/** İsteği ayrıştırır: JSON {message} ya da multipart (message + files). */
async function parseAssistantRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const attachments: Attachment[] = [];
  let message = "";
  let research = false;
  let projectId: number | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    message = String(form.get("message") ?? "").trim();
    const files = form.getAll("files").filter((v): v is File => v instanceof File);
    if (files.length > MAX_FILES) {
      throw new HttpError(400, `Bir mesaja en fazla ${MAX_FILES} dosya ekleyebilirsin.`);
    }
    let total = 0;
    for (const file of files) {
      const kind: Attachment["kind"] | null = ALLOWED_IMAGE_TYPES.includes(file.type)
        ? "image"
        : file.type === "application/pdf"
          ? "pdf"
          : null;
      if (!kind) throw new HttpError(400, `${file.name}: yalnızca fotoğraf (PNG/JPG/WebP) veya PDF eklenebilir.`);
      if (file.size > MAX_FILE_BYTES) {
        throw new HttpError(413, `${file.name} çok büyük; dosya başına en fazla 3,5 MB olabilir.`);
      }
      total += file.size;
      if (total > MAX_TOTAL_BYTES) {
        throw new HttpError(413, "Ek dosyaların toplam boyutu 4 MB'yi aşamaz.");
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const attachment: Attachment = {
        name: file.name,
        mimeType: file.type,
        kind,
        data: buffer.toString("base64"),
      };
      if (kind === "pdf") {
        const text = await extractPdfText(buffer, file.name);
        if (text) attachment.extractedText = text;
      }
      attachments.push(attachment);
    }
  } else {
    const body = (await request.json()) as Record<string, unknown>;
    message = String(body.message ?? "").trim();
    research = body.research === true;
    const pid = Number(body.projectId);
    projectId = Number.isInteger(pid) && pid > 0 ? pid : null;
  }

  return { message, attachments, research, projectId };
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const provider = detectProvider();
    const pid = Number(new URL(request.url).searchParams.get("project"));
    const projectId = Number.isInteger(pid) && pid > 0 ? pid : undefined;
    return Response.json({
      messages: await listAssistantMessages(user.id, 40, projectId ?? undefined),
      provider: { label: provider.label, model: provider.model, id: provider.id },
    });
  } catch (error) {
    return jsonError(error);
  }
}

async function buildSnapshot(userId: number, userName: string): Promise<Snapshot> {
  const [homeworks, events, schedule] = await Promise.all([
    listHomeworks(),
    listEvents(userId),
    getSchedule(),
  ]);
  return {
    homeworks: homeworks.map((h) => ({
      id: h.id,
      title: h.title,
      subject: h.subject,
      status: h.status,
      dueDate: h.dueDate,
    })),
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      time: e.time,
      scope: e.scope,
      done: e.done,
    })),
    schedule: schedule.map((s) => ({ dayOfWeek: s.dayOfWeek, period: s.period, subject: s.subject })),
    userName,
  };
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { message, attachments, research, projectId } = await parseAssistantRequest(request);
    if (!message && attachments.length === 0) throw new HttpError(400, "Bir şeyler yazmalısın.");
    if (message.length > 2000) throw new HttpError(400, "Mesaj çok uzun.");

    const project = projectId ? await getProject(user.id, projectId) : null;
    const memories = await listMemory(user.id, 30);
    const stored = `${message}${attachments.map((a) => ` [📎 ${a.name}]`).join("")}`;
    await saveAssistantMessage(user.id, "user", stored, [], projectId ?? null);

    const provider = detectProvider();
    let activeProvider = provider;
    let reply = "";
    let actions: Record<string, unknown>[] = [];
    let followups: string[] = [];
    let artifacts: { title: string; language: string; content: string }[] = [];
    let note = "";

    if (provider.id !== "local") {
      try {
        const [context, history] = await Promise.all([
          buildContext(user),
          listAssistantMessages(user.id, 10, projectId ?? 0),
        ]);

        // Araştırma Modu: model çağrısından ÖNCE web araması yapılıp bağlama eklenir.
        let researchBlock = "";
        if (research) {
          const results = await researchWeb(message);
          researchBlock = formatResearchBlock(results);
          if (!results.length) note = "\n\n_(Araştırma: web araması şu an sonuç döndürmedi.)_";
        }

        const memoryBlock = memories.length
          ? `\n\nKullanıcı hakkında hatırladıkların (uzun vadeli hafıza):\n${memories.map((m) => `- ${m.content}`).join("\n")}`
          : "";
        const projectBlock = project
          ? `\n\nAktif proje: "${project.name}"${project.note ? `\nProje notu: ${project.note}` : ""}`
          : "";

        const system = `Sen ${CLASS_NAME} sınıfının "Ödev Asistanı"sın. Türkçe, kısa ve samimi konuşursun.
Sınıfın ödevlerini, takvimini, ders programını ve sohbetini bilirsin; kullanıcı istediğinde bunları DEĞİŞTİREBİLİRSİN.
Kullanıcı mesaja ödev fotoğrafı veya PDF ekleyebilir; ekleri inceleyip soruları çözebilir, özet çıkarabilirsin.
Kod, HTML sayfa, SVG gibi üretilebilir içerikleri artifacts alanına koy; reply içinde uzun kod bloğu YAZMA.
Kullanıcı hakkında kalıcı bilgiler (hedefleri, tercihleri, çalışma alışkanlıkları vb.) öğrenirsen memories alanına kısa cümleler hâlinde ekle.
Cevabını SADECE şu biçimde geçerli JSON olarak ver:
{"reply":"kullanıcıya gösterilecek Türkçe metin","actions":[...],"followups":["2-3 takip sorusu"],"artifacts":[{"title":"...","language":"html|javascript|python|...","content":"kod"}],"memories":["hatırlanacak kısa bilgi"]}
followups, artifacts ve memories alanları opsiyoneldir; uygun değilse boş bırak.

${TOOL_GUIDE}

Güncel uygulama verisi:
${context}${memoryBlock}${projectBlock}${researchBlock}

Kurallar: Tarihleri her zaman YYYY-AA-GG biçiminde yaz. "yarın", "cuma" gibi ifadeleri bugünün tarihine göre hesapla.
Kullanıcı bir değişiklik istemiyorsa sadece bilgi ver ve actions'ı boş bırak. Emin olmadığında soru sor.`;

        // Az önce kaydedilen kullanıcı mesajını geçmişten çıkar; her zaman
        // taze bir kullanıcı turu olarak eklenir (ekli hâliyle).
        const prior =
          history.length && history[history.length - 1].role === "user"
            ? history.slice(0, -1)
            : history;

        const pdfAppendix = attachments
          .filter((a) => a.kind === "pdf" && a.extractedText)
          .map((a) => `\n\n[EK DOSYA: ${a.name}] içindeki metin:\n${a.extractedText}`)
          .join("");
        const modelMessage = `${message || "Eklediğim dosyayı inceleyip özetle."}${pdfAppendix}`;

        const turns: ChatTurn[] = [
          { role: "system", content: system },
          ...prior
            .slice(-8)
            .filter((m) => m.content.trim().length > 0)
            .map((m) => ({ role: m.role, content: m.content }) as ChatTurn),
          { role: "user", content: modelMessage },
        ];

        const modelResult = await runModel(turns, attachments);
        activeProvider = modelResult.provider;
        const parsed = extractJson(modelResult.raw);
        if (parsed) {
          reply = parsed.reply;
          actions = parsed.actions;
          const fu = (parsed as unknown as { followups?: unknown }).followups;
          if (Array.isArray(fu)) {
            followups = fu.map((v) => String(v)).filter((v) => v.trim()).slice(0, 3);
          }
          const art = (parsed as unknown as { artifacts?: unknown }).artifacts;
          if (Array.isArray(art)) {
            artifacts = art
              .map((v) => {
                const a = v as Record<string, unknown>;
                return {
                  title: String(a.title ?? "Artifact").slice(0, 80),
                  language: String(a.language ?? "text").slice(0, 24),
                  content: String(a.content ?? ""),
                };
              })
              .filter((a) => a.content.trim().length > 0)
              .slice(0, 3);
          }
          const mem = (parsed as unknown as { memories?: unknown }).memories;
          if (Array.isArray(mem)) {
            for (const m of mem.slice(0, 3)) {
              const text = String(m).trim();
              if (text.length >= 4) await addMemory(user.id, text);
            }
          }
        } else if (modelResult.raw.trim()) {
          reply = modelResult.raw.trim();
        } else {
          throw new Error("Model boş yanıt döndü.");
        }
      } catch (error) {
        note = `\n\n_(Uzak AI modelleri şu an yanıt veremedi; yerleşik asistana geçtim.)_`;
        activeProvider = {
          id: "local",
          label: "Yerleşik Asistan (otomatik yedek)",
          model: "kural-motoru",
        };
        const snapshot = await buildSnapshot(user.id, user.name);
        const local = localAssistant(message, snapshot);
        reply = local.reply;
        actions = local.actions;
        console.error("AI provider error:", error);
      }
    } else {
      if (attachments.length) {
        const imgs = attachments.filter((a) => a.kind === "image");
        const pdfs = attachments.filter((a) => a.kind === "pdf");
        const okPdfs = pdfs.filter((a) => a.extractedText);
        const lines: string[] = [];
        if (imgs.length) {
          lines.push(
            `📎 ${imgs.map((a) => a.name).join(", ")} fotoğrafını aldım ama şu an anahtarsız yerleşik moddayım; görselleri okuyamıyorum.`,
          );
        }
        if (pdfs.length) {
          lines.push(
            okPdfs.length
              ? `📄 ${okPdfs.map((a) => a.name).join(", ")} dosyasının metnini çıkardım; ama içeriği yorumlayabilmem için uzak bir modele ihtiyacım var.`
              : `📄 ${pdfs.map((a) => a.name).join(", ")} dosyasından metin çıkarılamadı (taranmış görsel PDF olabilir).`,
          );
        }
        lines.push(
          "Fotoğraf ve PDF okuyabilmem için ortam değişkenlerine ücretsiz bir anahtar ekleyin: GEMINI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY.",
        );
        reply = lines.join("\n\n");
      } else {
        const snapshot = await buildSnapshot(user.id, user.name);
        const local = localAssistant(message, snapshot);
        reply = local.reply;
        actions = local.actions;
      }
    }

    let results: ActionResult[] = [];
    if (actions.length) {
      results = await executeActions(user, actions);
    }

    const actionText = results.length
      ? `\n\n${results.map((r) => `${r.ok ? "✅" : "⚠️"} ${r.summary}`).join("\n")}`
      : "";
    const finalReply = `${reply}${actionText}${note}`.trim();

    // Artifact ve takip soruları kalıcı olsun: _meta etiketiyle actions'a göm.
    const persistedActions: unknown[] = [
      ...results,
      ...(followups.length ? [{ type: "_meta_followups", items: followups }] : []),
      ...(artifacts.length ? [{ type: "_meta_artifacts", items: artifacts }] : []),
    ];
    await saveAssistantMessage(user.id, "assistant", finalReply, persistedActions, projectId ?? null);

    return Response.json({
      reply: finalReply,
      actions: results,
      followups,
      artifacts,
      changed: results.some((r) => r.ok),
      provider: {
        label: activeProvider.label,
        model: activeProvider.model,
        id: activeProvider.id,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
