import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import VentaPage, { generateMetadata as ventaMeta } from "../app/venta/page";
import CiudadPage, { generateMetadata as ciudadMeta } from "../app/venta/[ciudad]/page";
import TipoPage, { generateMetadata as tipoMeta } from "../app/alquiler/[ciudad]/[tipo]/page";
import sitemap from "../app/sitemap";
import { normalizeInventory } from "../app/lib/inventory";
import { allLandings, buildLanding, landingPath, slugify } from "../app/lib/landing";
import { properties } from "./fixtures/properties";
import { setInventory, setResponse } from "./mocks/supabase";

const ORIGIN = "https://inmueblesdirectosperu.com";
const rows = (extra: Array<Record<string, unknown>> = []) => [...properties, ...extra];
// 3 casas en venta en Piura (una en Castilla) + el resto del fixture: venta/piura tiene 4, venta/piura/casas 3.
const casas = [
  { ...properties[0], id: "casa-2", slug: "casa-2", title: "Casa en Castilla", district: "Castilla", price: 210000, published_at: "2026-11-20T00:00:00Z" },
  { ...properties[0], id: "casa-3", slug: "casa-3", title: "Casa grande", price: 450000, published_at: "2026-11-21T00:00:00Z" },
];

describe("lógica de páginas por zona (A4)", () => {
  it("slugs y rutas canónicas", () => {
    expect(slugify("Veintiséis de Octubre")).toBe("veintiseis-de-octubre");
    expect(landingPath("venta")).toBe("/venta");
    expect(landingPath("venta", "Piura")).toBe("/venta/piura");
    expect(landingPath("alquiler", "La Libertad", "Locales comerciales")).toBe("/alquiler/la-libertad/locales-comerciales");
  });

  it("arma título, texto con datos reales, enlaces relacionados y decide si se indexa", () => {
    const all = normalizeInventory(rows(casas));
    const page = buildLanding(all, "venta", "piura", "casas")!;
    expect(page.title).toBe("Casas en venta en Piura");
    expect(page.listings.map(item => item.id)).toEqual(["casa-3", "casa-2", "fixture-house"]); // más recientes primero
    expect(page.intro).toBe("3 casas en venta en Piura, publicadas directamente por sus propietarios. Precios de US$ 125,000 a US$ 450,000. Zonas: Distrito de prueba y Castilla. Contacta al anunciante por llamada o WhatsApp, sin intermediarios.");
    expect(page.indexable).toBe(true);
    expect(page.related.map(link => link.path)).toEqual(["/venta/piura", "/venta/piura/terrenos", "/alquiler/piura"]);
    expect(page.mapHref).toBe("/?operacion=Comprar&ciudad=Piura");
  });

  it("con pocos anuncios existe pero no se indexa; sin anuncios o con datos desconocidos no existe", () => {
    const all = normalizeInventory(rows());
    const single = buildLanding(all, "alquiler", "piura", "departamentos")!;
    expect(single.intro.startsWith("1 departamento en alquiler en Piura, publicado directamente por su propietario.")).toBe(true);
    expect(single.intro).toContain("Precio: S/ 1,800. Zona: Distrito de prueba.");
    expect(single.indexable).toBe(false);
    expect(buildLanding(normalizeInventory(rows(casas)), "venta", "piura", "casas")!.intro).toMatch(/^3 casas en venta en Piura, publicadas/);
    expect(buildLanding(all, "venta", "piura")!.indexable).toBe(true); // 2 anuncios
    expect(buildLanding(all, "venta", "piura", "oficinas")).toBeNull();
    expect(buildLanding(all, "venta", "lima")).toBeNull();
    expect(buildLanding(all, "venta", "piura", "castillos")).toBeNull();
    expect(buildLanding(all, "permuta")).toBeNull();
  });

  it("la página general se indexa solo con dos o más ciudades", () => {
    const one = normalizeInventory(rows());
    expect(buildLanding(one, "venta")!.indexable).toBe(false);
    const two = normalizeInventory(rows([{ ...properties[0], id: "sullana", slug: "sullana", city: "Sullana" }]));
    expect(buildLanding(two, "venta")!.indexable).toBe(true);
    expect(buildLanding(two, "venta")!.related.map(link => link.path)).toEqual(["/venta/piura", "/venta/sullana", "/alquiler"]);
  });

  it("enumera todas las combinaciones con anuncios", () => {
    const paths = allLandings(normalizeInventory(rows())).map(page => page.path);
    expect(paths).toEqual(["/venta", "/venta/piura", "/venta/piura/casas", "/venta/piura/terrenos", "/alquiler", "/alquiler/piura", "/alquiler/piura/departamentos"]);
  });
});

describe("páginas renderizadas en el servidor (A4)", () => {
  it("/venta/piura: H1, texto, tarjetas con enlace a la ficha, JSON-LD y canonical", async () => {
    setInventory(rows(casas));
    const { container } = render(await CiudadPage({ params: Promise.resolve({ ciudad: "piura" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Inmuebles en venta en Piura" })).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Casa grande" }).getAttribute("href")).toBe("/inmueble/casa-3");
    expect(screen.getByRole("link", { name: /Ver en el mapa/ }).getAttribute("href")).toBe("/?operacion=Comprar&ciudad=Piura");
    const nav = screen.getByRole("navigation", { name: "Ruta de navegación" });
    expect(within(nav).getAllByRole("listitem").map(item => item.textContent)).toEqual(["Inicio", "Comprar", "Piura"]);
    expect(within(nav).getByRole("link", { name: "Comprar" }).getAttribute("href")).toBe("/venta");
    const data = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(data["@graph"][0]).toMatchObject({ "@type": "CollectionPage", url: `${ORIGIN}/venta/piura` });
    expect(data["@graph"][0].mainEntity.itemListElement[0].url).toBe(`${ORIGIN}/inmueble/casa-3`);
    expect(data["@graph"][1]["@type"]).toBe("BreadcrumbList");
    const metadata = await ciudadMeta({ params: Promise.resolve({ ciudad: "piura" }) });
    expect(metadata.title).toBe("Inmuebles en venta en Piura | Inmuebles Directos");
    expect(metadata.alternates?.canonical).toBe("/venta/piura");
    expect(metadata.robots).toBeUndefined();
  });

  it("una página con pocos anuncios lleva noindex,follow", async () => {
    setInventory(rows());
    render(await TipoPage({ params: Promise.resolve({ ciudad: "piura", tipo: "departamentos" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Departamentos en alquiler en Piura" })).toBeTruthy();
    const metadata = await tipoMeta({ params: Promise.resolve({ ciudad: "piura", tipo: "departamentos" }) });
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("404 para combinaciones sin anuncios; 500 (no 404) si la base no responde", async () => {
    setInventory(rows());
    await expect(CiudadPage({ params: Promise.resolve({ ciudad: "lima" }) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    setResponse(async () => ({ data: null, error: { message: "boom" } }));
    await expect(VentaPage()).rejects.toThrow("No se pudieron leer los anuncios publicados");
    await expect(ventaMeta()).rejects.toThrow("No se pudieron leer los anuncios publicados");
  });

  it("el sitemap incluye solo las páginas indexables", async () => {
    setInventory(rows());
    const urls = (await sitemap()).map(entry => entry.url);
    expect(urls).toContain(`${ORIGIN}/venta/piura`);
    expect(urls).not.toContain(`${ORIGIN}/venta`); // una sola ciudad: duplicaría /venta/piura
    expect(urls).not.toContain(`${ORIGIN}/alquiler/piura/departamentos`);
    expect(urls).not.toContain(`${ORIGIN}/alquiler`); // 1 solo anuncio en alquiler
  });
});
