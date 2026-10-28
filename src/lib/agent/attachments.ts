/**
 * Chat Attachment Types & Utilities
 */

export interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  isImage: boolean;
  textContent?: string;
}

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB limit
export const MAX_ATTACHMENTS_COUNT = 6;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageMimeType(type: string): boolean {
  return (
    type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(type)
  );
}

export function isTextMimeType(type: string, name: string): boolean {
  if (
    type.startsWith("text/") ||
    type === "application/json" ||
    type === "application/javascript" ||
    type === "application/typescript"
  ) {
    return true;
  }
  return /\.(txt|md|markdown|json|csv|ts|tsx|js|jsx|py|html|css|yaml|yml|sh|env)$/i.test(name);
}

export async function processFileToAttachment(file: File): Promise<ChatAttachment> {
  const isImage = isImageMimeType(file.type || file.name);
  const isText = isTextMimeType(file.type, file.name);

  // Read data URL (base64)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  let textContent: string | undefined;
  if (isText) {
    try {
      textContent = await file.text();
    } catch {
      // Ignore text decoding failure
    }
  }

  return {
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    dataUrl,
    isImage,
    textContent,
  };
}
