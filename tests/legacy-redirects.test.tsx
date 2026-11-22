import { describe, expect, it } from "vitest";
import PropertyPage, { generateMetadata } from "../app/inmueble/[slug]/page";
import { normalizeInventory } from "../app/lib/inventory";
import { hintFromSlug, legacyListingTarget, looksLikeListingSlug, nearestLanding } from "../app/lib/listing-state";
import { properties } from "./fixtures/properties";
import { setInventory, setPublicState, setResponse } from "./mocks/supabase";

const ID = "34da4627-df58-4b7d-bff8-e51f1fd7190b";
const slug = (words: string) => `${words}-${ID}`;
const params = (value: string) => ({ params: Promise.resolve({ slug: value }) });
const digestOf = async (promise: Promise<unknown>) => {
  try { await promise; } catch (error) { return String((error as { digest?: string }).digest ?? (error as Error).message); }
  return "sin redirección";
};
// Fixture: casa y terreno en venta en Piura (2 → /venta/piura se indexa) y departamento en alquiler en Piura.
const inventory = () => normalizeInventory(properties);
// Con 3 casas en venta en Piura, /venta/piura/casas también se indexa.
const withHouses = () => normalizeInventory([...properties,
  { ...properties[0], id: "c2", slug: "c2" }, { ...properties[0], id: "c3", slug: "c3" }]);

describe("URLs antiguas sin rastro en la base", () => {
  it("solo se reconocen las URLs con formato de anuncio del portal", () => {
    expect(looksLikeListingSlug(slug("excelente-casa-en-piura"))).toBe(true);
    expect(looksLikeListingSlug("asdf")).toBe(false);
    expect(looksLikeListingSlug("casa-en-piura")).toBe(false);
    expect(looksLikeListingSlug(`casa-${ID.slice(0, 30)}`)).toBe(false);
    expect(looksLikeListingSlug(`Casa-${ID}`)).toBe(false);
  });

  it("deduce tipo, operación y ciudad del texto (la ciudad debe existir en el inventario)", () => {
    expect(hintFromSlug(slug("excelente-casa-en-piura"), inventory())).toEqual({ operation: null, city: "Piura", type: "Casas" });
    expect(hintFromSlug(slug("alquilo-depa-amplio-piura"), inventory())).toEqual({ operation: "Alquilar", city: "Piura", type: "Departamentos" });
    expect(hintFromSlug(slug("vendo-lote-en-lima"), inventory())).toEqual({ operation: "Comprar", city: "", type: "Terrenos" });
    expect(hintFromSlug(slug("piurana-hermosa"), inventory())).toEqual({ operation: null, city: "", type: null }); // «piurana» no es «piura»
  });

  it("elige la página más específica que se indexa", () => {
    expect(legacyListingTarget(slug("excelente-casa-en-piura"), inventory())).toBe("/venta/piura"); // casas: 1 → no se indexa
    expect(legacyListingTarget(slug("excelente-casa-en-piura"), withHouses())).toBe("/venta/piura/casas");
    expect(legacyListingTarget(slug("alquilo-depa-piura"), inventory())).toBe("/alquiler/piura/departamentos"); // ninguna se indexa: la más específica
    expect(legacyListingTarget(slug("vendo-lote-en-lima"), inventory())).toBe("/venta");
    expect(legacyListingTarget(slug("hermosa-propiedad"), [])).toBe("/");
    expect(legacyListingTarget(slug("hermosa-propiedad"), inventory())).toBe("/"); // sin pistas: el inicio, no /venta
    expect(legacyListingTarget("asdf", inventory())).toBeNull();
  });

  it("también ordena las redirecciones de anuncios con lápida", () => {
    expect(nearestLanding({ operation: "Comprar", city: "Piura", type: "Casas" }, withHouses())).toBe("/venta/piura/casas");
    expect(nearestLanding({ operation: "Alquilar", city: "Sullana", type: null }, inventory())).toBe("/alquiler");
  });

  it("la ficha redirige de forma permanente (308) la URL de tu ejemplo, también desde los metadatos", async () => {
    setInventory(properties); setPublicState(null);
    const target = /NEXT_REDIRECT;replace;\/venta\/piura;308;/;
    expect(await digestOf(PropertyPage(params(slug("excelente-casa-en-piura"))))).toMatch(target);
    expect(await digestOf(generateMetadata(params(slug("excelente-casa-en-piura"))))).toMatch(target);
  });

  it("una dirección sin formato de anuncio sigue dando 404", async () => {
    setInventory(properties); setPublicState(null);
    expect(await digestOf(PropertyPage(params("asdf")))).toMatch(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });

  it("si el inventario no se puede leer, error en lugar de una redirección permanente equivocada", async () => {
    setPublicState(null);
    setResponse(async () => ({ data: null, error: { message: "boom" } }));
    const result = await digestOf(PropertyPage(params(slug("excelente-casa-en-piura"))));
    expect(result).not.toMatch(/NEXT_REDIRECT/);
    expect(result).toMatch(/Unable to load the published property|No se pudieron leer los anuncios publicados/);
  });
});
