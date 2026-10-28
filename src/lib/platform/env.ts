/**
 * Safe platform environment resolution.
 */

export function isProduction(): boolean {
  return import.meta.env?.PROD ?? false;
}

export function isDevelopment(): boolean {
  return import.meta.env?.DEV ?? true;
}

export function getApiBaseUrl(): string {
  return (import.meta.env?.VITE_API_BASE_URL as string) || "";
}

export function getWsBaseUrl(): string {
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}`;
  }
  return "";
}
