import { formatPrice, listingCity, propertyTypes, type Listing } from "./inventory";

/**
 * Páginas por operación, ciudad y tipo (auditoría SEO 22/11/2026, A4): /venta, /alquiler/piura, /venta/piura/casas.
 * Todo se calcula a partir de los anuncios publicados; no hay páginas para combinaciones sin anuncios (404) y las
 * que tienen pocos existen para el usuario pero no se indexan ni van al sitemap, para no ofrecer a Google páginas pobres.
 */

export type OperationSlug = "venta" | "alquiler";
export const OPERATION_SLUGS: Record<OperationSlug, "Comprar" | "Alquilar"> = { venta: "Comprar", alquiler: "Alquilar" };
const OPERATION_LABEL: Record<OperationSlug, string> = { venta: "en venta", alquiler: "en alquiler" };
const TYPE_SLUGS: Record<string, typeof propertyTypes[number]> = {
  casas: "Casas", departamentos: "Departamentos", terrenos: "Terrenos", oficinas: "Oficinas", "locales-comerciales": "Locales comerciales",
};
const TYPE_LOWER: Record<string, [string, string]> = {
  Casas: ["casa", "casas"], Departamentos: ["departamento", "departamentos"], Terrenos: ["terreno", "terrenos"],
  Oficinas: ["oficina", "oficinas"], "Locales comerciales": ["local comercial", "locales comerciales"],
};

const BRAND = "Inmuebles Directos";

/** Mínimo de anuncios para que una página se indexe: con menos, Google la vería como contenido pobre. */
export const MIN_INDEXABLE = { operation: 2, city: 2, type: 3 } as const;

export function slugify(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
export const operationSlug = (operation: string): OperationSlug | null =>
  operation === "Comprar" ? "venta" : operation === "Alquilar" ? "alquiler" : null;
export const typeSlug = (type: string): string | null => Object.entries(TYPE_SLUGS).find(([, value]) => value === type)?.[0] ?? null;

/** Ruta canónica de una combinación: /venta, /venta/piura, /venta/piura/casas. */
export function landingPath(operation: OperationSlug, city?: string | null, type?: string | null): string {
  const parts = [`/${operation}`];
  if (city) parts.push(slugify(city));
  if (city && type) { const slug = typeSlug(type); if (slug) parts.push(slug); }
  return parts.join("/");
}

export type Landing = {
  operation: OperationSlug;
  city: string | null;            // nombre tal como lo escribieron los anunciantes («Piura»)
  type: typeof propertyTypes[number] | null;
  listings: Listing[];
  path: string;
  indexable: boolean;
  title: string;                  // H1 y base del <title>
  intro: string;
  /** Otras combinaciones con anuncios para enlazar (tipos de la misma ciudad, otra operación, otras ciudades). */
  related: Array<{ label: string; path: string; count: number }>;
  mapHref: string;
};

const sortRecent = (items: Listing[]) => [...items].sort((a, b) =>
  (b.publishedAt ? Date.parse(b.publishedAt) : 0) - (a.publishedAt ? Date.parse(a.publishedAt) : 0) || String(a.id).localeCompare(String(b.id)));

/** Las ciudades con anuncios en la operación, cada una con su nombre más usado. */
function citiesOf(items: Listing[]): Map<string, string> {
  const names = new Map<string, Map<string, number>>();
  for (const item of items) {
    const city = listingCity(item);
    if (!city) continue;
    const slug = slugify(city);
    const counts = names.get(slug) ?? new Map<string, number>();
    counts.set(city, (counts.get(city) ?? 0) + 1);
    names.set(slug, counts);
  }
  return new Map([...names].map(([slug, counts]) => [slug, [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]]));
}

function priceRange(items: Listing[]): string {
  const parts: string[] = [];
  for (const currency of ["PEN", "USD"] as const) {
    const prices = items.filter(item => item.currency === currency && item.price !== null && item.price > 0).map(item => item.price as number);
    if (!prices.length) continue;
    const low = Math.min(...prices), high = Math.max(...prices);
    parts.push(low === high ? formatPrice(low, currency) : `de ${formatPrice(low, currency)} a ${formatPrice(high, currency)}`);
  }
  return parts.join(" y ");
}

function joinWords(values: string[]): string {
  return values.length <= 1 ? values.join("") : `${values.slice(0, -1).join(", ")} y ${values.at(-1)}`;
}

/** Arma la página de una combinación, o null si no existe (operación o tipo desconocidos, ciudad sin anuncios). */
export function buildLanding(all: Listing[], operation: string, citySlug?: string, typeSlugValue?: string): Landing | null {
  if (!(operation in OPERATION_SLUGS)) return null;
  const op = operation as OperationSlug;
  const byOperation = all.filter(item => item.operation === OPERATION_SLUGS[op]);
  const cities = citiesOf(byOperation);
  let city: string | null = null;
  let type: Landing["type"] = null;
  if (citySlug !== undefined) {
    city = cities.get(citySlug) ?? null;
    if (!city) return null;
  }
  if (typeSlugValue !== undefined) {
    type = TYPE_SLUGS[typeSlugValue] ?? null;
    if (!type) return null;
  }
  const inCity = city ? byOperation.filter(item => slugify(listingCity(item)) === citySlug) : byOperation;
  const listings = sortRecent(type ? inCity.filter(item => item.type === type) : inCity);
  if (!listings.length) return null;

  const what = type ? `${type}` : "Inmuebles";
  const where = city ? ` en ${city}` : "";
  const title = `${what} ${OPERATION_LABEL[op]}${where}`;
  const count = listings.length;
  const noun = (type ? TYPE_LOWER[type] : ["inmueble", "inmuebles"])[count === 1 ? 0 : 1];
  // «casa(s)» y «oficina(s)» son femeninos: «publicada(s)».
  const feminine = type === "Casas" || type === "Oficinas";
  const published = `publicad${feminine ? "a" : "o"}${count === 1 ? " directamente por su propietario" : "s directamente por sus propietarios"}`;
  const zones = [...new Set(listings.map(item => item.locationParts.district).filter(Boolean))].slice(0, 4);
  const range = priceRange(listings);
  const intro = [
    `${count} ${noun} ${OPERATION_LABEL[op]}${where}, ${published}.`,
    range && (count === 1 ? `Precio: ${range}.` : `Precios ${range}.`),
    zones.length > 0 && `${zones.length === 1 ? "Zona" : "Zonas"}: ${joinWords(zones)}.`,
    "Contacta al anunciante por llamada o WhatsApp, sin intermediarios.",
  ].filter(Boolean).join(" ");

  const minimum = type ? MIN_INDEXABLE.type : city ? MIN_INDEXABLE.city : MIN_INDEXABLE.operation;
  // La página general (/venta) solo aporta algo propio si reúne varias ciudades; con una sola duplica a /venta/piura.
  const indexable = count >= minimum && (city !== null || cities.size >= 2);
  const related: Landing["related"] = [];
  if (city) {
    // Tipos con anuncios en esta ciudad y operación (el actual primero no se repite).
    for (const value of propertyTypes) {
      const n = inCity.filter(item => item.type === value).length;
      if (n && value !== type) related.push({ label: `${value} ${OPERATION_LABEL[op]} en ${city}`, path: landingPath(op, city, value), count: n });
    }
    if (type) related.unshift({ label: `Todos los inmuebles ${OPERATION_LABEL[op]} en ${city}`, path: landingPath(op, city), count: inCity.length });
  } else {
    for (const [slug, name] of cities) related.push({ label: `Inmuebles ${OPERATION_LABEL[op]} en ${name}`, path: `/${op}/${slug}`, count: byOperation.filter(item => slugify(listingCity(item)) === slug).length });
  }
  const other: OperationSlug = op === "venta" ? "alquiler" : "venta";
  const otherItems = all.filter(item => item.operation === OPERATION_SLUGS[other] && (!city || slugify(listingCity(item)) === citySlug));
  if (otherItems.length) related.push({ label: `Inmuebles ${OPERATION_LABEL[other]}${where}`, path: city ? landingPath(other, city) : `/${other}`, count: otherItems.length });

  const mapParams = new URLSearchParams({ operacion: OPERATION_SLUGS[op], ...(city ? { ciudad: city } : {}) });
  return {
    operation: op, city, type, listings, title, intro, related,
    path: landingPath(op, city, type), indexable, mapHref: `/?${mapParams}`,
  };
}

export function landingMetaTitle(landing: Landing): string {
  const full = `${landing.title} | ${BRAND}`;
  return full.length <= 60 ? full : landing.title;
}
export function landingMetaDescription(landing: Landing): string {
  return landing.intro.length <= 160 ? landing.intro : `${landing.intro.slice(0, 159).replace(/\s+\S*$/, "")}…`;
}

/** Todas las combinaciones con anuncios (para el sitemap; filtrar por `indexable`). */
export function allLandings(all: Listing[]): Landing[] {
  const result: Landing[] = [];
  for (const op of Object.keys(OPERATION_SLUGS) as OperationSlug[]) {
    const base = buildLanding(all, op);
    if (!base) continue;
    result.push(base);
    for (const [citySlug] of citiesOf(base.listings)) {
      const city = buildLanding(all, op, citySlug);
      if (!city) continue;
      result.push(city);
      for (const value of propertyTypes) {
        const slug = typeSlug(value)!;
        const typed = buildLanding(all, op, citySlug, slug);
        if (typed) result.push(typed);
      }
    }
  }
  return result;
}

/** Ruta de navegación de la página: Inicio › Venta › Piura › Casas. */
export function landingBreadcrumb(landing: Landing): Array<{ name: string; path?: string }> {
  const steps: Array<{ name: string; path?: string }> = [{ name: "Inicio", path: "/" }];
  const opName = landing.operation === "venta" ? "Comprar" : "Alquilar";
  steps.push({ name: opName, path: landing.city ? `/${landing.operation}` : undefined });
  if (landing.city) steps.push({ name: landing.city, path: landing.type ? landingPath(landing.operation, landing.city) : undefined });
  if (landing.type) steps.push({ name: landing.type });
  return steps;
}

