import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import PropertyPage from "../app/inmueble/[slug]/page";
import sitemap from "../app/sitemap";
import { properties } from "./fixtures/properties";
import { setInventory } from "./mocks/supabase";

const ORIGIN = "https://inmueblesdirectosperu.com";
const image = (id: string, extra: Record<string, unknown> = {}) => ({ id, storage_bucket: "property-images-private", public_url: null, sort_order: 0, is_cover: false, alt_text: null, ...extra });

describe("mejoras medias de SEO", () => {
  it("M1: sin @import de Google Fonts; las fuentes llegan por next/font", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).not.toMatch(/fonts\.googleapis\.com/);
    expect(css).toMatch(/--ui:var\(--font-ui\)/);
    expect(readFileSync("app/layout.tsx", "utf8")).toMatch(/next\/font\/google/);
  });

  it("M5: la ficha enlaza otros anuncios de la misma operación y ciudad, y su página de zona", async () => {
    setInventory([
      properties[0],
      { ...properties[0], id: "casa-2", slug: "casa-2", title: "Casa vecina", published_at: "2026-11-20T00:00:00Z" },
      { ...properties[0], id: "casa-lejos", slug: "casa-lejos", title: "Casa en Sullana", city: "Sullana" },
      properties[1], // alquiler: no se mezcla con la venta
    ]);
    render(await PropertyPage({ params: Promise.resolve({ slug: "fixture-house" }) }));
    const section = screen.getByRole("region", { name: "Más inmuebles en venta en Piura" });
    const links = within(section).getAllByRole("link");
    expect(links.map(link => link.getAttribute("href"))).toEqual(["/inmueble/casa-2", "/venta/piura"]);
    expect(within(section).getByText("Casa vecina")).toBeTruthy();
    expect(within(section).queryByText("Casa en Sullana")).toBeNull();
    expect(within(section).queryByText("Casa de prueba")).toBeNull(); // no se enlaza a sí misma
  });

  it("M5: sin otros anuncios en la zona no muestra el bloque", async () => {
    setInventory([properties[0], properties[1]]);
    render(await PropertyPage({ params: Promise.resolve({ slug: "fixture-house" }) }));
    expect(screen.queryByRole("region", { name: /Más inmuebles/ })).toBeNull();
  });

  it("M7: el sitemap lista las fotos de cada anuncio, portada primero", async () => {
    setInventory([{ ...properties[0], property_images: [
      image("22222222-2222-4222-8222-222222222222", { sort_order: 1 }),
      image("11111111-1111-4111-8111-111111111111", { is_cover: true, sort_order: 2 }),
    ] }]);
    const entry = (await sitemap()).find(item => item.url === `${ORIGIN}/inmueble/fixture-house`)!;
    expect(entry.images).toEqual([
      `${ORIGIN}/api/property-images/11111111-1111-4111-8111-111111111111`,
      `${ORIGIN}/api/property-images/22222222-2222-4222-8222-222222222222`,
    ]);
  });
});
