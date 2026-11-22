import { cache } from "react";
import { listingCity, type Listing } from "./inventory";
import { buildLanding, landingPath, operationSlug, slugify } from "./landing";
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

/** Destino de la redirección permanente de un anuncio retirado: su página de zona, la de la operación o el inicio. */
export function removedListingTarget(state: ListingPublicState, inventory: Listing[] | undefined): string {
  const op = state.operation ? operationSlug(state.operation) : null;
  if (!op || !inventory) return "/";
  if (state.city && buildLanding(inventory, op, slugify(state.city))) return landingPath(op, state.city);
  return buildLanding(inventory, op) ? `/${op}` : "/";
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
