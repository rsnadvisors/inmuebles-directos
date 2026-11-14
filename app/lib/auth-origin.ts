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

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Next may normalize a development request URL to localhost behind proxy.ts.
 * Accept its actual loopback Host only on the same port. Never trust forwarded
 * headers, allow remote development hosts, or derive production origin here.
 */
export function developmentRequestOrigin(request: Request): string | null {
  try {
    const actual = new URL(request.url);
    if (!["http:", "https:"].includes(actual.protocol) || !LOOPBACK.has(actual.hostname)) return null;
    const host = request.headers.get("host");
    if (!host) return actual.origin;
    const publicUrl = new URL(`${actual.protocol}//${host}`);
    if (publicUrl.username || publicUrl.password || publicUrl.pathname !== "/" ||
      publicUrl.search || publicUrl.hash || publicUrl.host.toLowerCase() !== host.toLowerCase() ||
      !LOOPBACK.has(publicUrl.hostname) || publicUrl.port !== actual.port) return null;
    return publicUrl.origin;
  } catch { return null; }
}

/** Preserve the browser's loopback cookie host when Next normalizes nextUrl.
 * A non-loopback Host is ignored; the loopback request URL (or the canonical
 * site) is used instead, exactly as authOrigin() already does.
 */
export function authRequestOrigin(request: Request): string {
  if (process.env.NODE_ENV === "production") return siteOrigin();
  return developmentRequestOrigin(request) ?? authOrigin(request.url);
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
