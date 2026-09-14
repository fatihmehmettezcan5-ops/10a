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
  type MockExamGroup,
  type Me,
  type SlotItem,
  type Stats,
} from "@/lib/client";
import { CLASS_NAME, ROLE_LABELS } from "@/lib/constants";
import OverviewPanel from "@/components/panels/OverviewPanel";
import HomeworkPanel from "@/components/panels/HomeworkPanel";
import CalendarPanel from "@/components/panels/CalendarPanel";
import SchedulePanel from "@/components/panels/SchedulePanel";
import ExamsPanel from "@/components/panels/ExamsPanel";
import VoicePanel from "@/components/panels/VoicePanel";
import ChatPanel from "@/components/panels/ChatPanel";
import AssistantPanel from "@/components/panels/AssistantPanel";
import ProfileModal from "@/components/ProfileModal";

const TABS = [
  { id: "overview", label: "Genel", icon: "🏠", primary: true },
  { id: "homework", label: "Ödevler", icon: "📚", primary: true },
  { id: "exams", label: "Denemeler", icon: "📊", primary: true },
  { id: "chat", label: "Sohbet", icon: "💬", primary: true },
  { id: "assistant", label: "Asistan", icon: "🤖", primary: true },
  { id: "calendar", label: "Takvim", icon: "🗓️", primary: false },
  { id: "schedule", label: "Ders Programı", icon: "⏰", primary: false },
  { id: "voice", label: "VC Odaları", icon: "🎧", primary: false },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export default function Dashboard({ me: initialMe }: { me: Me }) {
  const router = useRouter();
  const [me, setMe] = useState<Me>(initialMe);
  const [tab, setTab] = useState<TabId>("overview");
  const [profileOpen, setProfileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [homeworks, setHomeworks] = useState<HomeworkItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [schedule, setSchedule] = useState<SlotItem[]>([]);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [examGroups, setExamGroups] = useState<MockExamGroup[]>([]);
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
    const data = await api<{ exams: ExamItem[]; groups: MockExamGroup[] }>("/api/exams");
    setExams(data.exams);
    setExamGroups(data.groups);
  }, []);

  const loadMembers = useCallback(async () => {
    const data = await api<{ members: MemberItem[] }>("/api/members");
    setMembers(data.members);
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
      ...(me.role === "admin" ? [loadMembers()] : []),
    ]).catch(
      (error: unknown) => notify(error instanceof Error ? error.message : "Veri yüklenemedi."),
    );
  }, [loadHomeworks, loadEvents, loadSchedule, loadMessages, loadStats, loadExams, loadAnnouncements, loadMembers, me.role, notify]);

  useEffect(() => {
    // İlk veri yüklemesi effect içinde yapılıyor; react-hooks yanlış pozitifi.
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

  function go(next: TabId) {
    setTab(next);
    setMoreOpen(false);
  }

  const activeTab = TABS.find((t) => t.id === tab);
  const primaryTabs = TABS.filter((t) => t.primary);
  const secondaryTabs = TABS.filter((t) => !t.primary);

  const userBlock = (
    <button
      className="flex w-full items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-left transition hover:border-amber-500/40"
      onClick={() => setProfileOpen(true)}
      title="Profil ayarları"
    >
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
        style={{ background: me.color }}
      >
        {me.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-xs font-semibold text-white">{me.name}</span>
        <span className="block text-xs text-slate-300">{ROLE_LABELS[me.role] ?? "Öğrenci"}</span>
      </span>
      <span aria-hidden className="text-slate-400">⚙️</span>
    </button>
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1400px]">
      {/* ------- Masaüstü kenar çubuğu ------- */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-white/5 bg-white/[0.015] px-3 py-4 lg:flex">
        <div>
          <div className="mb-6 flex items-center gap-2.5 px-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500 text-black font-black shadow-lg">
              {CLASS_NAME.replace("/", "")}
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold text-white">{CLASS_NAME} Paneli</div>
              <div className="text-xs text-slate-400">
                {stats ? `${stats.members} üye · ${stats.open} açık ödev` : "yükleniyor…"}
              </div>
            </div>
          </div>

          <nav className="space-y-0.5">
            {TABS.map((item) => (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                className={`nav-item ${tab === item.id ? "nav-item-active" : ""}`}
              >
                <span className="text-base leading-none" aria-hidden>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="space-y-2">
          {userBlock}
          <button className="btn btn-ghost w-full" onClick={logout}>
            Çıkış yap
          </button>
        </div>
      </aside>

      {/* ------- İçerik ------- */}
      <div className="min-w-0 flex-1">
        {/* Mobil üst çubuk */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/5 bg-[#080b12]/90 px-4 py-2.5 backdrop-blur-xl lg:hidden">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-amber-500 text-black font-black">
            {CLASS_NAME.replace("/", "")}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-bold text-white">{activeTab?.label ?? CLASS_NAME}</div>
            <div className="text-[11px] text-slate-400">
              {stats ? `${stats.members} üye · ${stats.open} açık ödev` : "\u00A0"}
            </div>
          </div>
          <button
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-2.5"
            onClick={() => setProfileOpen(true)}
            aria-label="Profil"
          >
            <span
              className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-white"
              style={{ background: me.color }}
            >
              {me.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
            </span>
            <span className="text-[11px] font-semibold text-slate-200">
              {me.name.split(" ")[0]}
            </span>
          </button>
        </header>

        {/* Masaüstü üst satır: sayfa başlığı + çıkış */}
        <div className="hidden items-center justify-between px-6 pt-5 lg:flex">
          <h1 className="text-lg font-bold text-white">{activeTab?.label}</h1>
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            Çıkış
          </button>
        </div>

        <main key={tab} className="fade-up px-3 pb-28 pt-4 sm:px-5 lg:px-6 lg:pb-10">
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
              reloadMembers={loadMembers}
              notify={notify}
              onGo={go}
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
            <ExamsPanel me={me} exams={exams} groups={examGroups} reload={loadExams} notify={notify} />
          )}
          {tab === "voice" && <VoicePanel me={me} notify={notify} />}
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
      </div>

      {/* ------- Mobil alt sekme çubuğu ------- */}
      <nav className="bottom-nav lg:hidden" aria-label="Ana menü">
        {primaryTabs.map((item) => (
          <button
            key={item.id}
            onClick={() => go(item.id)}
            className={`bottom-nav-item ${tab === item.id ? "bottom-nav-active" : ""}`}
          >
            <span className="bn-icon" aria-hidden>{item.icon}</span>
            {item.label}
          </button>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className={`bottom-nav-item ${secondaryTabs.some((t) => t.id === tab) ? "bottom-nav-active" : ""}`}
        >
          <span className="bn-icon" aria-hidden>☰</span>
          Daha
        </button>
      </nav>

      {/* "Daha" alt sayfası */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 lg:hidden" onClick={() => setMoreOpen(false)} role="presentation">
          <div
            className="sheet-up w-full rounded-t-2xl border-t border-white/10 bg-[#0d1220] px-4 pb-8 pt-3"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Diğer sayfalar"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />
            <div className="grid grid-cols-3 gap-2">
              {secondaryTabs.map((item) => (
                <button
                  key={item.id}
                  onClick={() => go(item.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-4 text-xs font-semibold transition ${
                    tab === item.id
                      ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-200"
                      : "border-white/5 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="text-2xl" aria-hidden>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {profileOpen && (
        <ProfileModal
          me={me}
          onSaved={setMe}
          onClose={() => setProfileOpen(false)}
          notify={notify}
        />
      )}

      {toast && (
        <div className="toast fade-up">
          <span aria-hidden className="text-amber-400">✦</span>
          <span className="min-w-0 flex-1">{toast}</span>
        </div>
      )}
    </div>
  );
}
