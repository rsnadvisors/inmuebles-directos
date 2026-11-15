/** Contadores agregados por anuncio (visitas, Llamar, WhatsApp): sin cookies ni datos personales. */
export const LISTING_EVENT_KINDS = ["view", "call", "whatsapp"] as const;
export type ListingEventKind = typeof LISTING_EVENT_KINDS[number];

/** Envía un evento una sola vez por pestaña y anuncio. Nunca bloquea ni falla la navegación. */
export function trackListingEvent(id: string | number | undefined, kind: ListingEventKind): void {
  if (typeof window === "undefined" || id === undefined || id === null) return;
  const key = `ide:${kind}:${id}`;
  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
  } catch { /* storage blocked: still count once per call */ }
  const body = JSON.stringify({ id: String(id), kind });
  try {
    if (navigator.sendBeacon?.("/api/eventos", new Blob([body], { type: "application/json" }))) return;
  } catch { /* fall back to fetch */ }
  try { void fetch("/api/eventos", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined); }
  catch { /* ignore */ }
}
