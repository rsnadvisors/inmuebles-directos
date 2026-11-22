import { cache } from "react";
import { listingCity, type Listing } from "./inventory";
import { buildLanding, operationSlug, slugify, typeSlug } from "./landing";
import { supabase } from "./supabase";

/**
 * Qué mostrar en la URL de un anuncio que ya no está publicado (ciclo de vida, 22/11/2026). Lo decide la base
 * (public.listing_public_state) y aquí solo se traduce: nunca llega teléfono, dueño ni motivo de moderación.
 */
export type ListingPublicState = {
  state: "sold" | "rented" | "unavailable" | "removed";
  title: string | null;
  operation: "Comprar" | "Alquilar" | null;
  type: Listing["type"] | null;
  district: string;
  city: string;            // ciudad o, si falta, región
  closedAt: string | null;
};

const TYPES: Record<string, Listing["type"]> = { house: "Casas", apartment: "Departamentos", land: "Terrenos", office: "Oficinas", commercial: "Locales comerciales" };
const STATES = new Set(["sold", "rented", "unavailable", "removed"]);
const text = (value: unknown) => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

export function parseListingPublicState(value: unknown): ListingPublicState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.state !== "string" || !STATES.has(row.state)) return null;
  const closedAt = text(row.closed_at);
  return {
    state: row.state as ListingPublicState["state"],
    title: text(row.title).slice(0, 160) || null,
    operation: row.listing_type === "sale" ? "Comprar" : row.listing_type === "rent" ? "Alquilar" : null,
    type: typeof row.property_type === "string" ? TYPES[row.property_type] ?? null : null,
    district: text(row.district),
    city: text(row.city) || text(row.region),
    closedAt: closedAt && !Number.isNaN(Date.parse(closedAt)) ? closedAt : null,
  };
}

/** null = la URL nunca fue pública (o la consulta falló): la ficha responde 404 como siempre. */
export async function queryListingPublicState(slug: string): Promise<ListingPublicState | null> {
  const value = slug.trim();
  if (!supabase || !value || value.length > 200) return null;
  try {
    const { data, error } = await supabase.rpc("listing_public_state", { p_slug: value });
    return error ? null : parseListingPublicState(data);
  } catch { return null; }
}
export const getListingPublicState = cache(queryListingPublicState);

type ZoneHint = { operation: "Comprar" | "Alquilar" | null; city: string; type: Listing["type"] | null };

/**
 * Página existente más cercana a una operación, ciudad y tipo (redirecciones permanentes, 22/11/2026). Prueba de
 * lo más específico a lo más general —/venta/piura/casas → /venta/piura → /venta— y prefiere una página que se
 * indexa (con anuncios suficientes) para que Google traslade la autoridad; si ninguna se indexa, la más específica
 * que exista; si nada coincide, el inicio. Sin operación conocida prueba venta y luego alquiler.
 */
export function nearestLanding(hint: ZoneHint, inventory: Listing[]): string {
  const op = hint.operation ? operationSlug(hint.operation) : null;
  const ops = op ? [op] : (["venta", "alquiler"] as const);
  const city = hint.city ? slugify(hint.city) : "";
  const type = hint.type ? typeSlug(hint.type) : null;
  const candidates = [
    ...(city && type ? ops.map(o => buildLanding(inventory, o, city, type)) : []),
    ...(city ? ops.map(o => buildLanding(inventory, o, city)) : []),
    ...ops.map(o => buildLanding(inventory, o)),
  ].filter((page): page is NonNullable<typeof page> => page !== null);
  return (candidates.find(page => page.indexable) ?? candidates[0])?.path ?? "/";
}

/** Destino de la redirección permanente de un anuncio retirado (con lápida o cerrado hace más de 6 meses). */
export function removedListingTarget(state: ListingPublicState, inventory: Listing[] | undefined): string {
  return inventory ? nearestLanding(state, inventory) : "/";
}

/**
 * Formato de las URLs de anuncio del portal: palabras del título + identificador de 36 caracteres. Solo las URLs
 * con este formato se redirigen; una dirección mal escrita o inventada sigue respondiendo 404.
 */
const LISTING_SLUG = /^([a-z0-9]+(?:-[a-z0-9]+)*)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const looksLikeListingSlug = (slug: string) => LISTING_SLUG.test(slug);

const TYPE_WORDS: Array<[Listing["type"], string[]]> = [
  ["Casas", ["casa", "casas", "chalet", "residencia"]],
  ["Departamentos", ["departamento", "departamentos", "depa", "depas", "dpto", "minidepartamento", "flat"]],
  ["Terrenos", ["terreno", "terrenos", "lote", "lotes", "parcela"]],
  ["Oficinas", ["oficina", "oficinas"]],
  ["Locales comerciales", ["local", "locales", "tienda", "almacen", "deposito"]],
];
const SALE_WORDS = ["venta", "vendo", "vende", "remato", "compra"];
const RENT_WORDS = ["alquiler", "alquilo", "alquila", "renta", "arriendo", "alquilar"];

/**
 * Pistas que deja el texto de una URL antigua sin rastro en la base («excelente-casa-en-piura-<id>» → casa,
 * Piura). La ciudad solo cuenta si coincide con una ciudad que hoy tiene anuncios publicados.
 */
export function hintFromSlug(slug: string, inventory: Listing[]): ZoneHint | null {
  const match = LISTING_SLUG.exec(slug);
  if (!match) return null;
  const words = match[1].split("-");
  const has = (list: string[]) => list.some(word => words.includes(word));
  const type = TYPE_WORDS.find(([, list]) => has(list))?.[0] ?? null;
  const operation = has(RENT_WORDS) ? "Alquilar" : has(SALE_WORDS) ? "Comprar" : null;
  const text = `-${words.join("-")}-`;
  const cities = [...new Set(inventory.map(listingCity).filter(Boolean))]
    .sort((a, b) => slugify(b).length - slugify(a).length); // «la-libertad» antes que «libertad»
  const city = cities.find(name => text.includes(`-${slugify(name)}-`)) ?? "";
  return { operation, city, type };
}

/** Destino de una URL de anuncio con formato válido pero sin rastro en la base (borrada antes de las lápidas). */
export function legacyListingTarget(slug: string, inventory: Listing[]): string | null {
  const hint = hintFromSlug(slug, inventory);
  if (!hint) return null;
  // Sin ninguna pista (ni operación, ni ciudad, ni tipo), el inicio: no hay una categoría «más cercana».
  return hint.operation || hint.city || hint.type ? nearestLanding(hint, inventory) : "/";
}

/** Hasta 4 anuncios publicados de la misma operación y ciudad (o, si no hay, de la misma operación). */
export function suggestionsFor(state: ListingPublicState, inventory: Listing[] | undefined): { items: Listing[]; sameCity: boolean } {
  if (!inventory) return { items: [], sameCity: false };
  const recent = (items: Listing[]) => [...items].filter(item => item.slug)
    .sort((a, b) => (b.publishedAt ? Date.parse(b.publishedAt) : 0) - (a.publishedAt ? Date.parse(a.publishedAt) : 0)).slice(0, 4);
  const byOperation = state.operation ? inventory.filter(item => item.operation === state.operation) : inventory;
  const city = slugify(state.city);
  const sameCity = city ? byOperation.filter(item => slugify(listingCity(item)) === city) : [];
  return sameCity.length ? { items: recent(sameCity), sameCity: true } : { items: recent(byOperation), sameCity: false };
}
