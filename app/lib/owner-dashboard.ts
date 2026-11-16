import { daysLeft, listingExpiry, RENEW_WINDOW_DAYS } from "./listing-management";

/** Dashboard del anunciante: convierte sus anuncios y contadores en pendientes accionables y cifras. */
export type OwnerListing = {
  id: string; title: string; slug: string; status: string; listing_type: string; published_at: string | null;
  renewed_at: string | null; expired_at: string | null; deletion_requested_at: string | null; is_reserved: boolean | null; owner_paused?: boolean | null;
  closed_via_portal: boolean | null; photos: number;
};
export type Counts = { view: number; call: number; whatsapp: number };
export type Week = Counts & { week: string };

export type Attention = {
  key: string; tone: "warn" | "info"; title: string; detail: string;
  action: { kind: "status"; status: "renew" | "reactivate"; label: string } | { kind: "link"; href: string; label: string };
};

const n = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
export function counts(value: unknown): Counts {
  const v = (value ?? {}) as Record<string, unknown>;
  return { view: n(v.view), call: n(v.call), whatsapp: n(v.whatsapp) };
}
export const contacts = (c: Counts) => c.call + c.whatsapp;

const DAY = 86_400_000;
/** Pendientes ordenados por urgencia; como máximo 4 para no abrumar. */
export function attentionItems(listings: OwnerListing[], stats30: Record<string, Counts>, now = Date.now()): Attention[] {
  const items: (Attention & { rank: number })[] = [];
  for (const l of listings) {
    if (l.deletion_requested_at) continue;
    const left = l.status === "published" ? daysLeft(listingExpiry(l), now) : null;
    if (left !== null && left <= RENEW_WINDOW_DAYS) {
      items.push({ rank: left, key: `renew-${l.id}`, tone: "warn", title: left <= 0 ? "Vence hoy" : `Vence en ${left} ${left === 1 ? "día" : "días"}`,
        detail: l.title, action: { kind: "status", status: "renew", label: "Renovar" } });
    }
    if (l.status === "archived" && l.expired_at) {
      items.push({ rank: 0, key: `expired-${l.id}`, tone: "warn", title: "Caducó: ya no se ve en el mapa", detail: l.title,
        action: { kind: "status", status: "reactivate", label: "Volver a publicar" } });
    }
    if (l.status === "published" && l.photos <= 1) {
      items.push({ rank: 30, key: `photos-${l.id}`, tone: "info", title: l.photos === 0 ? "Sin fotos" : "Solo 1 foto",
        detail: `${l.title} · las fichas con varias fotos se entienden mejor`, action: { kind: "link", href: `/mis-propiedades/${l.id}/editar`, label: "Añadir fotos" } });
    }
    const ageDays = l.published_at ? (now - Date.parse(l.renewed_at ?? l.published_at)) / DAY : 0;
    if (l.status === "published" && ageDays >= 14 && contacts(stats30[l.id] ?? counts(null)) === 0) {
      items.push({ rank: 20, key: `quiet-${l.id}`, tone: "info", title: "Sin contactos en 30 días", detail: `${l.title} · revisa el precio, las fotos y el título`,
        action: { kind: "link", href: `/mis-propiedades/${l.id}/editar`, label: "Mejorar anuncio" } });
    }
    if (l.status === "published" && l.is_reserved) {
      items.push({ rank: 40, key: `reserved-${l.id}`, tone: "info", title: "Reservado: ¿ya se cerró?", detail: l.title,
        action: { kind: "link", href: "/mis-propiedades", label: "Actualizar estado" } });
    }
    if ((l.status === "sold" || l.status === "rented") && l.closed_via_portal === null) {
      items.push({ rank: 50, key: `feedback-${l.id}`, tone: "info", title: l.status === "sold" ? "¿Lo vendiste por aquí?" : "¿Lo alquilaste por aquí?",
        detail: l.title, action: { kind: "link", href: "/mis-propiedades?estado=cerradas", label: "Responder" } });
    }
  }
  return items.sort((a, b) => a.rank - b.rank).slice(0, 4).map(({ rank: _rank, ...item }) => item);
}

export type Trend = { value: number; previous: number; delta: number | null };
export function trend(value: number, previous: number): Trend {
  return { value, previous, delta: previous > 0 ? Math.round(((value - previous) / previous) * 100) : null };
}
/** «De cada 100 visitas, contactan X». Solo con 20 visitas o más, para no dar porcentajes engañosos. */
export function contactRate(c: Counts): number | null {
  return c.view >= 20 ? Math.round((contacts(c) / c.view) * 1000) / 10 : null;
}
