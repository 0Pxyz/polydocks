/**
 * Safe platform window operations and URL navigation guards.
 * Strictly prevents direct window.open calls across feature code.
 */

export function openExternalUrl(url: string, target: string = "_blank"): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  const trimmed = url.trim().toLowerCase();

  // Strictly enforce safe protocols; disallow script execution
  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("vbscript:") ||
    trimmed.startsWith("file:")
  ) {
    console.warn(`[Security Guard] Blocked unsafe external URL scheme: "${url}"`);
    return false;
  }

  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    console.warn(`[Security Guard] External URL must use HTTP or HTTPS: "${url}"`);
    return false;
  }

  if (typeof window !== "undefined" && typeof window.open === "function") {
    const opened = window.open(url, target, "noopener,noreferrer");
    return opened !== null;
  }

  // Valid external URL protocol verified successfully
  return true;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  if (typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      return success;
    } catch {
      return false;
    }
  }

  return false;
}
