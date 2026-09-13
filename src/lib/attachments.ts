/** Sohbet/asistan ekleri için ortak tipler ve yardımcılar. */

export type AttachmentKind = "image" | "video" | "audio" | "file";

export type ChatAttachment = {
  /** chat_files kaydı ya da "ext:<url>" (dış kaynak, ör. üretilen görsel). */
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
  url: string;
};

export function kindOf(mime: string): AttachmentKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

export function fileIcon(mime: string, name: string): string {
  const m = mime.toLowerCase();
  const n = name.toLowerCase();
  if (m.startsWith("image/")) return "🖼️";
  if (m.startsWith("video/")) return "🎬";
  if (m.startsWith("audio/")) return "🎵";
  if (m.includes("pdf") || n.endsWith(".pdf")) return "📕";
  if (m.includes("zip") || m.includes("rar") || m.includes("7z")) return "🗜️";
  if (m.includes("word") || n.endsWith(".doc") || n.endsWith(".docx")) return "📘";
  if (m.includes("sheet") || n.endsWith(".xls") || n.endsWith(".xlsx")) return "📊";
  if (m.includes("presentation") || n.endsWith(".ppt") || n.endsWith(".pptx")) return "📽️";
  if (m.startsWith("text/") || n.endsWith(".txt") || n.endsWith(".md")) return "📄";
  return "📎";
}

/** Bayt → kısa okunur boyut ("1,4 MB"). */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Dış kaynak ekleri ("ext:<url>") için URL'i çıkarır. */
export function externalUrl(att: ChatAttachment): string | null {
  return att.id.startsWith("ext:") ? att.id.slice(4) : null;
}

export const CHAT_MAX_FILES = 4;
export const CHAT_MAX_FILE_BYTES = 6 * 1024 * 1024; // 6 MB
export const CHAT_MAX_TOTAL_BYTES = 12 * 1024 * 1024; // 12 MB
