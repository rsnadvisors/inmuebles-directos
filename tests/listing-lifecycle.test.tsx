import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import PropertyPage, { generateMetadata } from "../app/inmueble/[slug]/page";
import { normalizeInventory } from "../app/lib/inventory";
import { parseListingPublicState, removedListingTarget } from "../app/lib/listing-state";
import { ACTION_CONFIRM } from "../app/lib/listing-management";
import { properties } from "./fixtures/properties";
import { setInventory, setPublicState } from "./mocks/supabase";

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
// Inventario publicado: 2 en venta en Piura (casa y terreno) y 1 en alquiler.
const published = () => setInventory(properties);
const redirectOf = async (promise: Promise<unknown>) => {
  try { await promise; } catch (error) { return String((error as { digest?: string }).digest ?? error); }
  return "sin redirección";
};

describe("URL de un anuncio vendido o alquilado", () => {
  it("muestra la ficha de cierre sin fotos, precio ni contacto, y sugiere la zona", async () => {
    published();
    setPublicState({ state: "sold", title: "Casa vendida en Castilla", listing_type: "sale", property_type: "house", district: "Castilla", city: "Piura", region: "Piura", closed_at: "2026-11-10T12:00:00Z" });
    const { container } = render(await PropertyPage(params("casa-vendida")));
    expect(screen.getByRole("heading", { level: 1, name: "Casa vendida en Castilla" })).toBeTruthy();
    expect(screen.getByText("Vendido")).toBeTruthy();
    expect(screen.getByText("Esta casa en Castilla, Piura ya se vendió (noviembre de 2026). El anuncio se mantiene como referencia, sin datos de contacto.")).toBeTruthy();
    expect(container.querySelector("img[src*='/api/property-images/']:not([src*='w=320'])")).toBeNull();
    expect(screen.queryByRole("link", { name: /WhatsApp|Llamar/ })).toBeNull();
    expect(screen.queryByText(/US\$|S\//, { selector: ".closed-listing-card *" })).toBeNull();
    const similar = screen.getByRole("region", { name: "Inmuebles similares en venta en Piura" });
    expect(within(similar).getAllByRole("link").map(link => link.getAttribute("href"))).toContain("/inmueble/fixture-house");
    expect(screen.getAllByRole("link", { name: "Ver inmuebles en venta en Piura" })[0].getAttribute("href")).toBe("/venta/piura");
    const metadata = await generateMetadata(params("casa-vendida"));
    expect(metadata.title).toBe("Vendido: Casa vendida en Castilla | Inmuebles Directos");
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("alquilado usa su propio texto", async () => {
    published();
    setPublicState({ state: "rented", title: "Depa alquilado", listing_type: "rent", property_type: "apartment", district: "", city: "Piura", closed_at: null });
    render(await PropertyPage(params("depa")));
    expect(screen.getByText("Alquilado")).toBeTruthy();
    expect(screen.getByText("Este departamento en Piura ya se alquiló. El anuncio se mantiene como referencia, sin datos de contacto.")).toBeTruthy();
  });
});

describe("URL de un anuncio pausado, caducado o en revisión", () => {
  it("dice «no disponible por ahora» sin ningún dato del anuncio", async () => {
    published();
    setPublicState({ state: "unavailable", listing_type: "sale", property_type: "land", city: "Piura" });
    render(await PropertyPage(params("terreno-pausado")));
    expect(screen.getByRole("heading", { level: 1, name: "Este anuncio no está disponible por ahora" })).toBeTruthy();
    expect(screen.getByText(/Puede volver a publicarse más adelante en esta misma dirección/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Inmuebles similares en venta en Piura" })).toBeTruthy();
    expect((await generateMetadata(params("terreno-pausado"))).title).toBe("Anuncio no disponible | Inmuebles Directos");
  });
});

describe("URL de un anuncio eliminado", () => {
  it("redirige de forma permanente a su página de zona", async () => {
    published();
    setPublicState({ state: "removed", listing_type: "sale", property_type: "house", city: "Piura" });
    const digest = await redirectOf(PropertyPage(params("casa-borrada")));
    expect(digest).toMatch(/NEXT_REDIRECT;replace;\/venta\/piura;308;/);
  });

  it("sin página de zona, va a la operación o al inicio", () => {
    const inventory = normalizeInventory(properties);
    const removed = (city: string, listing_type = "sale") => parseListingPublicState({ state: "removed", listing_type, city })!;
    expect(removedListingTarget(removed("Piura"), inventory)).toBe("/venta/piura");
    expect(removedListingTarget(removed("Lima"), inventory)).toBe("/venta");
    expect(removedListingTarget(removed("Lima"), [])).toBe("/");
    expect(removedListingTarget(removed("Piura"), undefined)).toBe("/");
  });

  it("una URL que nunca fue pública sigue respondiendo 404", async () => {
    published();
    setPublicState(null);
    await expect(PropertyPage(params("no-existe"))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });
});

describe("reglas de privacidad y avisos", () => {
  it("el estado público descarta campos que no se esperan", () => {
    expect(parseListingPublicState({ state: "sold", title: "X", contact_phone: "+51999", owner_id: "abc", listing_type: "sale" })).toEqual({
      state: "sold", title: "X", operation: "Comprar", type: null, district: "", city: "", closedAt: null,
    });
    expect(parseListingPublicState({ state: "published" })).toBeNull();
    expect(parseListingPublicState(null)).toBeNull();
  });

  it("la migración deja lápida solo de anuncios que llegaron a publicarse y no expone datos personales", () => {
    const sql = readFileSync("supabase/migrations/20261122120000_listing_lifecycle_urls.sql", "utf8");
    expect(sql).toMatch(/before delete on public\.properties/);
    expect(sql).toMatch(/old\.published_at is not null/);
    expect(sql).toMatch(/interval '6 months'/);
    expect(sql).toMatch(/revoke all on private\.listing_tombstones from public, anon, authenticated/);
    const fn = sql.slice(sql.indexOf("create or replace function public.listing_public_state"));
    expect(fn).not.toMatch(/contact_phone|owner_id|moderation_note|description|price|address/);
  });

  it("el panel explica qué pasa con el enlace al vender, pausar o eliminar", () => {
    expect(ACTION_CONFIRM.mark_sold).toMatch(/enlace seguirá abierto durante 6 meses con el aviso «Vendido»/);
    expect(ACTION_CONFIRM.pause).toMatch(/«No disponible por ahora»/);
    expect(readFileSync("app/components/account/ListingActions.tsx", "utf8")).toMatch(/será llevado a otros inmuebles de la misma zona/);
  });
});
