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

/** Zonas reconocidas de la región Piura (mismo listado que la base de datos). Solo se guarda el código de zona. */
export const SEARCH_ZONES: Record<string, string> = {
  "veintiseis de octubre": "veintiseis-de-octubre", "cura mori": "cura-mori", "el tallan": "el-tallan", "la arena": "la-arena",
  "la union": "la-union", "las lomas": "las-lomas", "tambo grande": "tambogrande", tambogrande: "tambogrande", "ignacio escudero": "ignacio-escudero",
  "miguel checa": "miguel-checa", "los organos": "los-organos", "el alto": "el-alto", castilla: "castilla", catacaos: "catacaos",
  sullana: "sullana", bellavista: "bellavista", marcavelica: "marcavelica", querecotillo: "querecotillo", salitral: "salitral",
  lancones: "lancones", paita: "paita", colan: "colan", vichayal: "vichayal", amotape: "amotape", talara: "talara", parinas: "parinas",
  mancora: "mancora", lobitos: "lobitos", sechura: "sechura", bernal: "bernal", vice: "vice", chulucanas: "chulucanas",
  morropon: "morropon", huancabamba: "huancabamba", ayabaca: "ayabaca", piura: "piura",
};
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Traduce el texto libre a una zona conocida. El texto en sí nunca se envía. */
export function searchZone(query: string): string {
  const text = normalize(query);
  if (!text) return "ninguna";
  const padded = ` ${text} `;
  // Longest names first, so "veintiseis de octubre" wins over "piura" in "veintiseis de octubre piura".
  for (const name of Object.keys(SEARCH_ZONES).sort((a, b) => b.length - a.length)) {
    if (padded.includes(` ${name} `)) return SEARCH_ZONES[name];
  }
  return "otra";
}
export function resultsBucket(count: number): "0" | "1-5" | "6-20" | "21+" {
  return count <= 0 ? "0" : count <= 5 ? "1-5" : count <= 20 ? "6-20" : "21+";
}

/** Registra una búsqueda agregada una vez por pestaña y combinación. */
export function trackSearch(operation: string, type: string, query: string, results: number): void {
  if (typeof window === "undefined") return;
  const body = { operation, type, zone: searchZone(query), results: resultsBucket(results) };
  if (body.operation === "Todo" && body.type === "Todo" && body.zone === "ninguna") return; // sin filtros no es una búsqueda
  const key = `ids:${body.operation}:${body.type}:${body.zone}:${body.results}`;
  try { if (window.sessionStorage.getItem(key)) return; window.sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
  const json = JSON.stringify(body);
  try { if (navigator.sendBeacon?.("/api/busquedas", new Blob([json], { type: "application/json" }))) return; } catch { /* fall back */ }
  try { void fetch("/api/busquedas", { method: "POST", headers: { "Content-Type": "application/json" }, body: json, keepalive: true }).catch(() => undefined); }
  catch { /* ignore */ }
}
