const CURRENT_SITE_ORIGIN = "https://inmueblesdirectos.com";

export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_ORIGIN;
  if (!configured) return CURRENT_SITE_ORIGIN;
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.port ||
    (configured !== url.origin && configured !== `${url.origin}/`)) {
    throw new Error("NEXT_PUBLIC_SITE_ORIGIN must be a canonical HTTPS origin");
  }
  return url.origin;
}

/** Production never derives an Auth redirect from browser/request headers. */
export function authOrigin(localOrigin: string): string {
  if (process.env.NODE_ENV === "production") return siteOrigin();
  try {
    const url = new URL(localOrigin);
    if ((url.protocol === "http:" || url.protocol === "https:") &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return url.origin;
  } catch { /* Untrusted/malformed origin falls back to the canonical site. */ }
  return siteOrigin();
}

export function recoveryRedirect(localOrigin: string): string {
  return `${authOrigin(localOrigin)}/auth/callback?returnTo=%2Frestablecer-password`;
}
