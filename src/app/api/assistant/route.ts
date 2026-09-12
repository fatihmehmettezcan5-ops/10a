import { jsonError, requireUser, HttpError } from "@/lib/auth";
import {
  getSchedule,
  listAssistantMessages,
  listEvents,
  listHomeworks,
  saveAssistantMessage,
} from "@/lib/data";
import { buildContext, executeActions, TOOL_GUIDE, type ActionResult } from "@/lib/ai/tools";
import { detectProvider, extractJson, runModel, type ChatTurn } from "@/lib/ai/provider";
import { localAssistant, type Snapshot } from "@/lib/ai/fallback";
import { CLASS_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const provider = detectProvider();
    return Response.json({
      messages: await listAssistantMessages(user.id),
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
    const body = (await request.json()) as Record<string, unknown>;
    const message = String(body.message ?? "").trim();
    if (!message) throw new HttpError(400, "Bir şeyler yazmalısın.");
    if (message.length > 2000) throw new HttpError(400, "Mesaj çok uzun.");

    await saveAssistantMessage(user.id, "user", message);

    const provider = detectProvider();
    let reply = "";
    let actions: Record<string, unknown>[] = [];
    let note = "";

    if (provider.id !== "local") {
      try {
        const [context, history] = await Promise.all([
          buildContext(user),
          listAssistantMessages(user.id, 10),
        ]);

        const system = `Sen ${CLASS_NAME} sınıfının "Ödev Asistanı"sın. Türkçe, kısa ve samimi konuşursun.
Sınıfın ödevlerini, takvimini, ders programını ve sohbetini bilirsin; kullanıcı istediğinde bunları DEĞİŞTİREBİLİRSİN.
Cevabını SADECE şu biçimde geçerli JSON olarak ver:
{"reply":"kullanıcıya gösterilecek Türkçe metin","actions":[...]}

${TOOL_GUIDE}

Güncel uygulama verisi:
${context}

Kurallar: Tarihleri her zaman YYYY-AA-GG biçiminde yaz. "yarın", "cuma" gibi ifadeleri bugünün tarihine göre hesapla.
Kullanıcı bir değişiklik istemiyorsa sadece bilgi ver ve actions'ı boş bırak. Emin olmadığında soru sor.`;

        const turns: ChatTurn[] = [
          { role: "system", content: system },
          ...history
            .slice(-8)
            .filter((m) => m.content.trim().length > 0)
            .map((m) => ({ role: m.role, content: m.content }) as ChatTurn),
        ];
        if (turns[turns.length - 1]?.content !== message) {
          turns.push({ role: "user", content: message });
        }

        const { raw } = await runModel(turns);
        const parsed = extractJson(raw);
        if (parsed) {
          reply = parsed.reply;
          actions = parsed.actions;
        } else if (raw.trim()) {
          reply = raw.trim();
        } else {
          throw new Error("Model boş yanıt döndü.");
        }
      } catch (error) {
        note = `\n\n_(${provider.label} şu an yanıt veremedi, yerleşik asistana geçtim.)_`;
        const snapshot = await buildSnapshot(user.id, user.name);
        const local = localAssistant(message, snapshot);
        reply = local.reply;
        actions = local.actions;
        console.error("AI provider error:", error);
      }
    } else {
      const snapshot = await buildSnapshot(user.id, user.name);
      const local = localAssistant(message, snapshot);
      reply = local.reply;
      actions = local.actions;
    }

    let results: ActionResult[] = [];
    if (actions.length) {
      results = await executeActions(user, actions);
    }

    const actionText = results.length
      ? `\n\n${results.map((r) => `${r.ok ? "✅" : "⚠️"} ${r.summary}`).join("\n")}`
      : "";
    const finalReply = `${reply}${actionText}${note}`.trim();

    await saveAssistantMessage(user.id, "assistant", finalReply, results);

    return Response.json({
      reply: finalReply,
      actions: results,
      changed: results.some((r) => r.ok),
      provider: { label: provider.label, model: provider.model, id: provider.id },
    });
  } catch (error) {
    return jsonError(error);
  }
}
