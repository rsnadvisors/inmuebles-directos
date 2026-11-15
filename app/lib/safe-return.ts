import { siteOrigin } from "./auth-origin";

export function safeReturnTo(value: string | null | undefined, fallback = "/cuenta"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return fallback;
  try {
    const origin = siteOrigin();
    const url = new URL(value, origin);
    if (url.origin !== origin || url.pathname.startsWith("//") || url.pathname.startsWith("/login") || url.pathname.startsWith("/registro")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}
