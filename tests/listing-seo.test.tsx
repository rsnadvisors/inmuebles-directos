import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PropertyPage, { generateMetadata } from "../app/inmueble/[slug]/page";
import { normalizeInventory } from "../app/lib/inventory";
import { jsonLdText, listingJsonLd, listingSeoDescription, listingSeoTitle, siteJsonLd } from "../app/lib/listing-seo";
import { properties } from "./fixtures/properties";
import { setInventory } from "./mocks/supabase";

const ORIGIN = "https://inmueblesdirectosperu.com";
const listing = (row: Record<string, unknown>) => normalizeInventory([{ ...properties[0], ...row }])[0];

// Casos con la forma de los anuncios reales de producción (22/11/2026).
const ejidos = listing({
  title: "Hermosa Casa con Piscina en Los Ejidos - Piura.", listing_type: "sale", property_type: "house",
  price: 320000, currency: "USD", address: "Cerca a la iglesia de los Ejidos", district: null, city: "Piura", region: "Piura", country: "Peru",
  area_total_m2: 750, bedrooms: 4, bathrooms: 3, parking_spaces: 2, lat: -5.17, lng: -80.63,
  description: "(*) Ubicación privilegiada: En plena zona residencial de Los Ejidos, a pocos minutos del centro de Piura, con piscina, jardín y cochera para dos autos.",
  published_at: "2026-10-03T15:00:00Z",
});
const local = listing({ title: "Local en Alquiler Veintiseis de Octubre Piura", listing_type: "rent", property_type: "commercial", price: 1200, currency: "PEN", city: "Piura", district: "Veintiséis de Octubre", bedrooms: null });

describe("título de la ficha (A3)", () => {
  it("añade la operación si falta y deja fuera la marca cuando no cabe", () => {
    expect(listingSeoTitle(ejidos)).toBe("Hermosa Casa con Piscina en Los Ejidos - Piura | En venta");
  });
  it("no repite lo que el título ya dice y nunca pasa de 60 caracteres", () => {
    expect(listingSeoTitle(local)).toBe("Local en Alquiler Veintiseis de Octubre Piura");
    const long = listing({ title: "Espectacular casa de estreno con acabados de lujo, piscina temperada y jardín amplio", city: "Piura" });
    expect(listingSeoTitle(long).length).toBeLessThanOrEqual(60);
    expect(listingSeoTitle(long)).not.toMatch(/[\s,|-]$/);
  });
  it("agrega la ciudad cuando el título no la menciona, y la marca si cabe", () => {
    expect(listingSeoTitle(listing({ title: "Casa de prueba", city: "Piura" }))).toBe("Casa de prueba, Piura | En venta | Inmuebles Directos");
  });
});

describe("descripción de la ficha (A3)", () => {
  it("empieza por tipo, operación, zona y precio, sin doble punto ni «Peru» sin tilde", () => {
    const text = listingSeoDescription(ejidos);
    expect(text.startsWith("Casa en venta en Piura por US$ 320,000. 750 m², 4 habitaciones, 3 baños, 2 estacionamientos. (*) Ubicación")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text).toMatch(/…$/);
    expect(text).not.toMatch(/\.\.|Peru\b/);
    expect(text).toMatch(/[\p{L})]…$/u); // termina en palabra completa, sin puntuación colgando
  });
  it("usa distrito y ciudad, y marca los reservados", () => {
    expect(listingSeoDescription({ ...local, reserved: true })).toBe("Local comercial en alquiler en Veintiséis de Octubre, Piura por S/ 1,200 (reservado). 120 m², 2 baños, 1 estacionamiento. Inmueble ficticio para smoke tests.");
  });
});

describe("datos estructurados (A1, A2)", () => {
  it("describe el anuncio, la oferta, el lugar y la ruta de navegación", () => {
    const url = `${ORIGIN}/inmueble/hermosa-casa`;
    const graph = listingJsonLd(ejidos, url, ORIGIN)["@graph"] as Array<Record<string, any>>;
    const [ad, crumbs] = graph;
    expect(ad).toMatchObject({
      "@type": "RealEstateListing", url, name: ejidos.title, datePosted: "2026-10-03T15:00:00Z",
      offers: { "@type": "Offer", price: 320000, priceCurrency: "USD", availability: "https://schema.org/InStock", businessFunction: "http://purl.org/goodrelations/v1#Sell" },
      about: { "@type": "SingleFamilyResidence", address: { addressLocality: "Piura", addressCountry: "PE" },
        geo: { "@type": "GeoCoordinates", latitude: -5.17, longitude: -80.63 }, floorSize: { value: 750, unitCode: "MTK" }, numberOfBedrooms: 4, numberOfBathroomsTotal: 3 },
    });
    expect(JSON.stringify(ad)).not.toMatch(/contact|telephone|9\d{8}/);
    expect(crumbs["@type"]).toBe("BreadcrumbList");
    expect(crumbs.itemListElement.map((step: { name: string }) => step.name)).toEqual(["Inicio", "Comprar", "Piura", ejidos.title]);
    expect(crumbs.itemListElement[0].item).toBe(`${ORIGIN}/`);
    expect(crumbs.itemListElement.at(-1).item).toBe(url);
  });
  it("alquiler reservado: LeaseOut y disponibilidad limitada", () => {
    const offer = (listingJsonLd({ ...local, reserved: true }, `${ORIGIN}/x`, ORIGIN)["@graph"][0] as Record<string, any>).offers;
    expect(offer).toMatchObject({ priceCurrency: "PEN", availability: "https://schema.org/LimitedAvailability", businessFunction: "http://purl.org/goodrelations/v1#LeaseOut" });
  });
  it("escapa el texto para que un título no pueda cerrar el <script>", () => {
    const text = jsonLdText({ name: "</script><img src=x onerror=alert(1)>&" });
    expect(text).not.toMatch(/[<>&]/);
    expect(JSON.parse(text).name).toBe("</script><img src=x onerror=alert(1)>&");
  });
  it("Organization y WebSite del sitio", () => {
    const [org, site] = siteJsonLd(ORIGIN)["@graph"] as Array<Record<string, any>>;
    expect(org).toMatchObject({ "@type": "Organization", name: "Inmuebles Directos", url: `${ORIGIN}/`, logo: `${ORIGIN}/apple-icon.png` });
    expect(site).toMatchObject({ "@type": "WebSite", inLanguage: "es-PE", publisher: { "@id": `${ORIGIN}/#organizacion` } });
  });
  it("la ficha publica su JSON-LD y usa el título y la descripción nuevos", async () => {
    setInventory([{ ...properties[0], published_at: "2026-11-20T00:00:00Z" }]);
    const { container } = render(await PropertyPage({ params: Promise.resolve({ slug: "fixture-house" }) }));
    const data = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(data["@graph"][0]["@type"]).toBe("RealEstateListing");
    expect(data["@graph"][0].url).toBe(`${ORIGIN}/inmueble/fixture-house`);
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "fixture-house" }) });
    expect(metadata.title).toBe("Casa de prueba, Piura | En venta | Inmuebles Directos");
    expect(String(metadata.description)).toMatch(/^Casa en venta en Distrito de prueba, Piura por US\$ 125,000\./);
  });
});
