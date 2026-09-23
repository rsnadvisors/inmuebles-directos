export function safeReturnTo(value: string | null | undefined, fallback = "/cuenta"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://inmueblesdirectos.com");
    if (url.origin !== "https://inmueblesdirectos.com" || url.pathname.startsWith("/login") || url.pathname.startsWith("/registro")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}
