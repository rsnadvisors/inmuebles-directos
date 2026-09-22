import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PropertyPage, { generateMetadata } from "../app/inmueble/[slug]/page";
import PropertyGallery from "../app/inmueble/[slug]/PropertyGallery";
import { PROPERTY_DETAIL_SELECT, queryPublishedListing } from "../app/lib/property";
import { properties } from "./fixtures/properties";
import { setInventory } from "./mocks/supabase";

describe("canonical property page", () => {
  it("queries and renders a published property with canonical metadata", async () => {
    setInventory([{ ...properties[0], area_built_m2: 90, maintenance_fee: 0, floors: 0, country: "Perú", published_at: "2026-09-01T00:00:00Z" }]);
    expect((await queryPublishedListing("fixture-house"))?.title).toBe("Casa de prueba");
    render(await PropertyPage({ params: Promise.resolve({ slug: "fixture-house" }) }));
    expect(screen.getByRole("heading", { name: "Casa de prueba", level: 1 })).toBeTruthy();
    expect(screen.getByText("US$ 125,000")).toBeTruthy();
    expect(screen.getByText("90 m²")).toBeTruthy();
    expect(screen.getByText("Mantenimiento: US$ 0")).toBeTruthy();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "fixture-house" }) });
    expect(metadata.alternates?.canonical).toBe("/inmueble/fixture-house");
    expect(metadata.title).toBe("Casa de prueba | Inmuebles Directos");
  });

  it("normalizes geographic duplicates and whitespace in SEO descriptions", async () => {
    setInventory([{ ...properties[0], city: " Piura ", region: "PIURA", country: "Perú", description: "Amplia casa\n\ncon excelente\tubicación y     buena iluminación." }]);
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "fixture-house" }) });
    const description = "Casa de prueba. Comprar · Casas · Dirección ficticia 100, Distrito de prueba, Piura, Perú. Amplia casa con excelente ubicación y buena iluminación.";
    expect(metadata.description).toBe(description);
    expect(metadata.openGraph?.description).toBe(description);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).not.toMatch(/\s{2,}|\r|\n|Piura, Piura/i);
    expect(metadata.alternates?.canonical).toBe("/inmueble/fixture-house");
  });

  it("returns notFound for unknown, empty and non-published slugs", async () => {
    setInventory([{ ...properties[0], status: "draft" }]);
    await expect(PropertyPage({ params: Promise.resolve({ slug: "fixture-house" }) })).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    await expect(PropertyPage({ params: Promise.resolve({ slug: "unknown" }) })).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    await expect(queryPublishedListing(" ")).resolves.toBeNull();
  });

  it("keeps infrastructure failures distinct from not-found responses and excludes personal data", async () => {
    const { setResponse } = await import("./mocks/supabase");
    setResponse(async () => ({ data: null, error: { message: "synthetic failure" } }));
    await expect(queryPublishedListing("fixture-house")).rejects.toThrow("Unable to load the published property");
    expect(PROPERTY_DETAIL_SELECT).not.toMatch(/profiles|owner_id|agent_id|auth/);
  });

  it("supports legacy listings without images, optional data, owner or coordinates", async () => {
    setInventory([{ ...properties[2], owner_id: null, agent_id: null, price: null, address: null, district: null, city: null, lat: null, lng: null, property_images: [] }]);
    render(await PropertyPage({ params: Promise.resolve({ slug: "fixture-land" }) }));
    expect(screen.getByRole("img", { name: "Sin fotografías de Terreno de prueba" })).toBeTruthy();
    expect(screen.getByText("Precio no disponible")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Ubicación" })).toBeNull();
    expect(screen.queryByText(/Usuario null|WhatsApp|Teléfono|Negociable/)).toBeNull();
  });

  it("renders one image without navigation controls and uses alt text", () => {
    render(<PropertyGallery title="Casa" images={[{ url: "one.jpg", altText: "Fachada real" }]} />);
    expect(screen.getByAltText("Fachada real")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Imagen siguiente" })).toBeNull();
  });

  it("navigates multiple ordered images and falls back to the property title for alt", () => {
    render(<PropertyGallery title="Casa real" images={[{ url: "cover.jpg", altText: null }, { url: "second.jpg", altText: "Interior" }]} />);
    expect(screen.getByAltText("Casa real")).toBeTruthy();
    expect(screen.getByText("1 / 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Imagen siguiente" }));
    expect(screen.getByAltText("Interior")).toBeTruthy();
    expect(screen.getByText("2 / 2")).toBeTruthy();
  });
});
