import type { ChatAttachment } from "@/lib/attachments";

/** Dış görsel URL'ini (ör. Pollinations çıktısı) sohbet eki gibi gösterir. */
export function createAiAttachmentFromUrl(url: string, name: string): ChatAttachment {
  return {
    id: `ext:${url}`,
    name,
    mime: "image/png",
    size: 0,
    kind: "image",
    url,
  };
}
