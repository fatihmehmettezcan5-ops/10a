/** WhatsApp tarzı sohbet görünümü için ortak yardımcılar. */

export function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

/** "BUGÜN" / "DÜN" / "12 Mart 2026" biçiminde gün etiketi. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "BUGÜN";
  if (d.toDateString() === yesterday.toDateString()) return "DÜN";
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

type GroupableMessage = { userId: number | null; authorName: string; createdAt: string };

/** WhatsApp gruplaması: aynı kişi + aynı gün + 5 dk içinde → isim/avatar gizlenir. */
export function withinGroup(
  prev: GroupableMessage | null | undefined,
  current: GroupableMessage,
): boolean {
  if (!prev) return false;
  if (prev.userId !== current.userId || prev.authorName !== current.authorName) return false;
  if (dayKey(prev.createdAt) !== dayKey(current.createdAt)) return false;
  return new Date(current.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
}

/** Sohbet alanının WhatsApp benzeri koyu dokulu arka planı. */
export const CHAT_BG_STYLE = {
  backgroundColor: "#0b141a",
  backgroundImage: "radial-gradient(rgba(148,163,184,0.07) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
} as const;

export const BUBBLE_IN = "#202c33";
export const BUBBLE_OUT = "#005c4b";
