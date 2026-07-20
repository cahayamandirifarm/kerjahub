export const CHAT_BUCKET = "chat-attachments";
export const MAX_ATTACHMENT_MB = 10;

export function detectFileType(file: File): "image" | "pdf" | "document" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  return "document";
}

export function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatChatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.trim()[0]?.toUpperCase() ?? "?";
}

export const QUICK_EMOJIS = ["😀", "😂", "😍", "👍", "🙏", "🔥", "😢", "😮", "🎉", "❤️", "👏", "😅"];

export function isTanyaAdmin(text: string) {
  return text.trim().toLowerCase().startsWith("/tanyaadmin");
}
