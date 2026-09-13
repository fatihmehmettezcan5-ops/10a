export type Me = {
  id: number;
  name: string;
  email: string;
  role: string;
  color: string;
};

export type HomeworkItem = {
  id: number;
  title: string;
  subject: string;
  description: string;
  dueDate: string | null;
  status: string;
  priority: string;
  createdBy: number;
  createdByName: string;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
  history: {
    id: number;
    toStatus: string;
    fromStatus: string | null;
    note: string;
    newDueDate: string | null;
    userName: string | null;
    createdAt: string;
  }[];
};

export type EventItem = {
  id: number;
  title: string;
  description: string;
  date: string;
  time: string | null;
  scope: string;
  type: string;
  done: boolean;
  ownerId: number;
  ownerName: string;
};

export type SlotItem = {
  id: number;
  dayOfWeek: number;
  period: number;
  subject: string;
  teacher: string;
  room: string;
  startTime: string;
  endTime: string;
};

export type ChatItem = {
  id: number;
  userId: number | null;
  authorName: string;
  authorColor: string;
  authorRole: string;
  body: string;
  homeworkId: number | null;
  createdAt: string;
};

export type AssistantItem = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type Stats = {
  total: number;
  open: number;
  done: number;
  overdue: number;
  members: number;
  messages: number;
  upcoming: { id: number; title: string; date: string; scope: string; type: string }[];
};

export type ExamItem = {
  id: number;
  examName: string;
  examType: string;
  subject: string;
  date: string;
  correct: number;
  wrong: number;
  empty: number;
  net: number;
  createdAt: string;
};

export type AnnouncementItem = {
  id: number;
  title: string;
  body: string;
  authorId: number;
  authorName: string;
  authorColor: string;
  createdAt: string;
};

export type MemberItem = {
  id: number;
  name: string;
  email: string;
  role: string;
  color: string;
  createdAt: string;
};

export type MockExamGroup = {
  id: string; // "tarih|denemeAdi"
  examName: string;
  date: string;
  totalNet: number;
  rows: ExamItem[];
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    headers: isForm ? init?.headers : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "İstek başarısız oldu.");
  return data;
}
