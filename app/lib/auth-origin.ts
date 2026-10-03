const PRODUCTION_ORIGIN = "https://inmueblesdirectos.com";

/** Production never derives an Auth redirect from browser/request headers. */
export function authOrigin(localOrigin: string): string {
  if (process.env.NODE_ENV === "production") return PRODUCTION_ORIGIN;
  try {
    const url = new URL(localOrigin);
    if ((url.protocol === "http:" || url.protocol === "https:") &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return url.origin;
  } catch { /* Untrusted/malformed origin falls back to the canonical site. */ }
  return PRODUCTION_ORIGIN;
}

export function recoveryRedirect(localOrigin: string): string {
  return `${authOrigin(localOrigin)}/auth/callback?returnTo=%2Frestablecer-password`;
}
