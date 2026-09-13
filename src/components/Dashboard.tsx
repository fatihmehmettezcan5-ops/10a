"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  type ChatItem,
  type EventItem,
  type AnnouncementItem,
  type ExamItem,
  type HomeworkItem,
  type MemberItem,
  type Me,
  type SlotItem,
  type Stats,
} from "@/lib/client";
import { CLASS_NAME } from "@/lib/constants";
import OverviewPanel from "@/components/panels/OverviewPanel";
import HomeworkPanel from "@/components/panels/HomeworkPanel";
import CalendarPanel from "@/components/panels/CalendarPanel";
import SchedulePanel from "@/components/panels/SchedulePanel";
import ExamsPanel from "@/components/panels/ExamsPanel";
import ChatPanel from "@/components/panels/ChatPanel";
import AssistantPanel from "@/components/panels/AssistantPanel";
import ProfileModal from "@/components/ProfileModal";

const TABS = [
  { id: "overview", label: "Genel", icon: "🏠" },
  { id: "homework", label: "Ödevler", icon: "📚" },
  { id: "calendar", label: "Takvim", icon: "🗓️" },
  { id: "schedule", label: "Ders Programı", icon: "⏰" },
  { id: "exams", label: "Denemeler", icon: "📊" },
  { id: "chat", label: "Sınıf Sohbeti", icon: "💬" },
  { id: "assistant", label: "Ödev Asistanı", icon: "🤖" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export default function Dashboard({ me: initialMe }: { me: Me }) {
  const router = useRouter();
  const [me, setMe] = useState<Me>(initialMe);
  const [tab, setTab] = useState<TabId>("overview");
  const [profileOpen, setProfileOpen] = useState(false);
  const [homeworks, setHomeworks] = useState<HomeworkItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [schedule, setSchedule] = useState<SlotItem[]>([]);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [toast, setToast] = useState("");

  const notify = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 3500);
  }, []);

  const loadHomeworks = useCallback(async () => {
    const data = await api<{ homeworks: HomeworkItem[] }>("/api/homeworks");
    setHomeworks(data.homeworks);
  }, []);

  const loadEvents = useCallback(async () => {
    const data = await api<{ events: EventItem[] }>("/api/events");
    setEvents(data.events);
  }, []);

  const loadSchedule = useCallback(async () => {
    const data = await api<{ schedule: SlotItem[] }>("/api/schedule");
    setSchedule(data.schedule);
  }, []);

  const loadExams = useCallback(async () => {
    const data = await api<{ exams: ExamItem[] }>("/api/exams");
    setExams(data.exams);
  }, []);

  const loadAnnouncements = useCallback(async () => {
    const data = await api<{ announcements: AnnouncementItem[] }>("/api/announcements");
    setAnnouncements(data.announcements);
  }, []);

  const loadMessages = useCallback(async () => {
    const data = await api<{ messages: ChatItem[] }>("/api/messages");
    setMessages(data.messages);
  }, []);

  const loadStats = useCallback(async () => {
    const data = await api<{ stats: Stats }>("/api/stats");
    setStats(data.stats);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadHomeworks(),
      loadEvents(),
      loadSchedule(),
      loadMessages(),
      loadStats(),
      loadExams(),
      loadAnnouncements(),
      ...(me.role === "admin" ? [api<{ members: MemberItem[] }>("/api/members").then((d) => setMembers(d.members))] : []),
    ]).catch(
      (error: unknown) => notify(error instanceof Error ? error.message : "Veri yüklenemedi."),
    );
  }, [loadHomeworks, loadEvents, loadSchedule, loadMessages, loadStats, loadExams, loadAnnouncements, me.role, notify]);

  useEffect(() => {
    // İlk veri yüklemesi effect içinde yapılıyor; setState burada senkron çağrılmıyor
    // (async callback). react-hooks kuralının yanlış pozitifi — bakınız: you-might-not-need-an-effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshAll();
  }, [refreshAll]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/giris");
    router.refresh();
  }

  function discuss(homework: HomeworkItem) {
    setChatDraft(`#${homework.id} "${homework.title}" hakkında: `);
    setTab("chat");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-6">
      <header className="card mb-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-lg font-black text-white shadow-lg">
            {CLASS_NAME.replace("/", "")}
          </div>
          <div>
            <div className="text-sm font-bold text-white">{CLASS_NAME} Sınıf Paneli</div>
            <div className="text-xs text-slate-400">
              {stats ? `${stats.members} üye · ${stats.open} açık ödev` : "Yükleniyor..."}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 transition hover:border-indigo-500/50"
            onClick={() => setProfileOpen(true)}
            title="Profil ayarları"
          >
            <span
              className="grid h-7 w-7 place-items-center rounded-lg text-xs font-bold text-white"
              style={{ background: me.color }}
            >
              {me.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
            </span>
            <div className="text-left leading-tight">
              <div className="text-xs font-semibold text-white">{me.name}</div>
              <div className="text-[10px] text-slate-400">
                {me.role === "admin" ? "Sınıf başkanı" : "Öğrenci"}
              </div>
            </div>
          </button>
          <button className="btn btn-ghost" onClick={logout}>
            Çıkış
          </button>
        </div>
      </header>

      <nav className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`btn shrink-0 ${tab === item.id ? "btn-primary" : "btn-ghost"}`}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <main className="fade-up">
        {tab === "overview" && (
          <OverviewPanel
            me={me}
            stats={stats}
            homeworks={homeworks}
            events={events}
            schedule={schedule}
            announcements={announcements}
            members={members}
            reloadAnnouncements={loadAnnouncements}
            notify={notify}
            onGo={setTab}
          />
        )}
        {tab === "homework" && (
          <HomeworkPanel
            me={me}
            homeworks={homeworks}
            reload={async () => {
              await loadHomeworks();
              await loadStats();
            }}
            notify={notify}
            onDiscuss={discuss}
          />
        )}
        {tab === "calendar" && (
          <CalendarPanel
            me={me}
            events={events}
            homeworks={homeworks}
            reload={async () => {
              await loadEvents();
              await loadStats();
            }}
            notify={notify}
          />
        )}
        {tab === "schedule" && <SchedulePanel schedule={schedule} reload={loadSchedule} notify={notify} />}
        {tab === "exams" && (
          <ExamsPanel me={me} exams={exams} reload={loadExams} notify={notify} />
        )}
        {tab === "chat" && (
          <ChatPanel
            me={me}
            messages={messages}
            setMessages={setMessages}
            draft={chatDraft}
            setDraft={setChatDraft}
            notify={notify}
          />
        )}
        {tab === "assistant" && <AssistantPanel me={me} onChanged={refreshAll} notify={notify} />}
      </main>

      {profileOpen && (
        <ProfileModal
          me={me}
          onSaved={setMe}
          onClose={() => setProfileOpen(false)}
          notify={notify}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-indigo-400/30 bg-slate-900/95 px-4 py-2 text-sm text-slate-100 shadow-2xl fade-up">
          {toast}
        </div>
      )}
    </div>
  );
}
