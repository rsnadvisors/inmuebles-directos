import { formatPrice, listingCity, type Listing } from "./inventory";
import { landingPath, operationSlug } from "./landing";

/**
 * SEO de la ficha y del sitio (auditoría 22/11/2026, A1–A3): título y descripción para Google y datos
 * estructurados JSON-LD. Funciones puras: reciben el anuncio ya normalizado y el origen canónico.
 */

export const BRAND = "Inmuebles Directos";
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;

const SINGULAR: Record<string, string> = {
  Casas: "Casa", Departamentos: "Departamento", Terrenos: "Terreno", Oficinas: "Oficina", "Locales comerciales": "Local comercial",
};
const OPERATION_PHRASE: Record<string, string> = { Comprar: "en venta", Alquilar: "en alquiler" };
const OPERATION_WORDS = { Comprar: /\b(venta|vendo|vende|compra)\b/i, Alquilar: /\b(alquiler|alquilo|alquila|renta|arriendo)\b/i } as const;

const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const tidy = (value: string) => value.replace(/\s+/g, " ").trim();
/** Quita la puntuación final del título del anunciante («Piura.» → «Piura») para no duplicarla al unir frases. */
const bare = (value: string) => tidy(value).replace(/[\s.,;:·\-–—|]+$/u, "");

/** Corta en una palabra completa, sin dejar puntuación colgando. */
function cut(value: string, max: number, ellipsis = false): string {
  if (value.length <= max) return value;
  const room = ellipsis ? max - 1 : max;
  const head = value.slice(0, room + 1);
  const space = head.lastIndexOf(" ");
  const trimmed = (space > room * 0.6 ? head.slice(0, space) : value.slice(0, room)).replace(/[\s.,;:·\-–—|(]+$/u, "");
  return ellipsis ? `${trimmed}…` : trimmed;
}

/** «Casa en venta», «Terreno en alquiler»; vacío si faltan tipo u operación. */
export function listingKind(property: Listing): string {
  const type = SINGULAR[property.type];
  const operation = OPERATION_PHRASE[property.operation];
  return type && operation ? `${type} ${operation}` : type ?? "";
}

/** «Los Ejidos, Piura»: distrito y ciudad sin repetir (o la región si no hay ciudad). */
export function listingZone(property: Listing): string {
  const { district } = property.locationParts;
  const city = listingCity(property);
  return [district, city].filter(Boolean).filter((part, index, parts) => index === 0 || plain(part) !== plain(parts[index - 1])).join(", ");
}

/**
 * Título para Google (máx. 60): el título del anunciante, más la ciudad si no la menciona y la operación si
 * no la dice; la marca solo si cabe (Open Graph ya la lleva en site_name).
 */
export function listingSeoTitle(property: Listing): string {
  let title = bare(property.title) || listingKind(property) || "Inmueble";
  const city = listingCity(property);
  if (city && !plain(title).includes(plain(city))) title = `${title}, ${city}`;
  const words = OPERATION_WORDS[property.operation as keyof typeof OPERATION_WORDS];
  const phrase = OPERATION_PHRASE[property.operation];
  if (words && phrase && !words.test(plain(title))) {
    const tagged = `${title} | ${phrase[0].toUpperCase()}${phrase.slice(1)}`;
    if (tagged.length <= TITLE_MAX) title = tagged;
  }
  const branded = `${title} | ${BRAND}`;
  return branded.length <= TITLE_MAX ? branded : cut(title, TITLE_MAX);
}

/** Datos clave en frase corta: «750 m², 4 habitaciones, 3 baños». */
function facts(property: Listing): string {
  const parts: string[] = [];
  if (property.area !== null && property.area > 0) parts.push(`${property.area.toLocaleString("es-PE")} m²`);
  if (property.bedrooms) parts.push(`${property.bedrooms} ${property.bedrooms === 1 ? "habitación" : "habitaciones"}`);
  if (property.bathrooms) parts.push(`${property.bathrooms} ${property.bathrooms === 1 ? "baño" : "baños"}`);
  if (property.parkingSpaces) parts.push(`${property.parkingSpaces} ${property.parkingSpaces === 1 ? "estacionamiento" : "estacionamientos"}`);
  return parts.join(", ");
}

/**
 * Descripción para Google (máx. 160): «Casa en venta en Los Ejidos, Piura por US$ 320,000. 750 m², 4 habitaciones.
 * <inicio de la descripción del anunciante>…». Sin repetir el título ni cortar a media palabra.
 */
export function listingSeoDescription(property: Listing): string {
  const kind = listingKind(property);
  const zone = listingZone(property);
  const price = property.price !== null && property.currency ? formatPrice(property.price, property.currency) : "";
  let lead = [kind || bare(property.title), zone && `en ${zone}`, price && `por ${price}`].filter(Boolean).join(" ");
  lead = tidy(lead);
  if (property.reserved) lead += " (reservado)";
  const sentences = [lead, facts(property)].filter(Boolean).map(part => `${part}.`);
  const body = tidy(property.description);
  const base = sentences.join(" ");
  if (!body) return cut(base, DESCRIPTION_MAX, true);
  const full = `${base} ${body}`;
  return cut(full, DESCRIPTION_MAX, true);
}

type BreadcrumbStep = { name: string; path?: string };

/** Niveles de la ruta de navegación visible de la ficha; el JSON-LD usa los mismos. */
export function listingBreadcrumb(property: Listing): BreadcrumbStep[] {
  // Cada nivel enlaza a su página por operación y ciudad (/venta, /venta/piura), que siempre existe porque
  // este mismo anuncio publicado la alimenta. Sin operación conocida no hay página a la que enlazar.
  const op = operationSlug(property.operation);
  const city = listingCity(property);
  return [
    { name: "Inicio", path: "/" },
    ...(op ? [{ name: property.operation, path: landingPath(op) }] : []),
    ...(op && city ? [{ name: city, path: landingPath(op, city) }] : []),
    { name: property.title },
  ];
}

const SCHEMA_TYPE: Record<string, string> = {
  Casas: "SingleFamilyResidence", Departamentos: "Apartment", Terrenos: "Place", Oficinas: "Place", "Locales comerciales": "Place",
};

/** Convierte un objeto JSON-LD en texto seguro para <script>: sin «</script>» ni HTML interpretable. */
export function jsonLdText(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

/** RealEstateListing + Offer + lugar (dirección y coordenadas) + BreadcrumbList de una ficha publicada. */
export function listingJsonLd(property: Listing, canonicalUrl: string, origin: string) {
  const absolute = (path: string) => new URL(path, origin).href;
  const { address, region } = property.locationParts;
  const city = listingCity(property);
  const place: Record<string, unknown> = {
    "@type": SCHEMA_TYPE[property.type] ?? "Place",
    name: property.title,
    address: {
      "@type": "PostalAddress",
      ...(address ? { streetAddress: address } : {}),
      ...(city ? { addressLocality: city } : {}),
      ...(region ? { addressRegion: region } : {}),
      addressCountry: "PE",
    },
    ...(property.coords ? { geo: { "@type": "GeoCoordinates", latitude: property.coords[0], longitude: property.coords[1] } } : {}),
    ...(property.area !== null && property.area > 0 ? { floorSize: { "@type": "QuantitativeValue", value: property.area, unitCode: "MTK" } } : {}),
    ...(property.bedrooms ? { numberOfBedrooms: property.bedrooms } : {}),
    ...(property.bathrooms ? { numberOfBathroomsTotal: property.bathrooms } : {}),
  };
  const listing: Record<string, unknown> = {
    "@type": "RealEstateListing",
    "@id": `${canonicalUrl}#anuncio`,
    url: canonicalUrl,
    name: property.title,
    description: listingSeoDescription(property),
    ...(property.publishedAt ? { datePosted: property.publishedAt } : {}),
    ...(property.imageItems.length ? { image: property.imageItems.slice(0, 10).map(image => absolute(image.url)) } : {}),
    about: place,
    ...(property.price !== null && property.currency ? { offers: {
      "@type": "Offer",
      price: property.price,
      priceCurrency: property.currency,
      availability: property.reserved ? "https://schema.org/LimitedAvailability" : "https://schema.org/InStock",
      businessFunction: property.operation === "Alquilar" ? "http://purl.org/goodrelations/v1#LeaseOut" : "http://purl.org/goodrelations/v1#Sell",
      url: canonicalUrl,
    } } : {}),
  };
  const breadcrumb = {
    "@type": "BreadcrumbList",
    itemListElement: listingBreadcrumb(property).map((step, index) => ({
      "@type": "ListItem", position: index + 1, name: step.name,
      item: step.path ? absolute(step.path) : canonicalUrl,
    })),
  };
  return { "@context": "https://schema.org", "@graph": [listing, breadcrumb] };
}

/** Organization + WebSite para todo el sitio (va en el layout). */
export function siteJsonLd(origin: string) {
  const url = new URL("/", origin).href;
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${url}#organizacion`, name: BRAND, url, logo: new URL("/apple-icon.png", origin).href,
        areaServed: { "@type": "City", name: "Piura" } },
      { "@type": "WebSite", "@id": `${url}#sitio`, name: BRAND, url, inLanguage: "es-PE", publisher: { "@id": `${url}#organizacion` } },
    ],
  };
}
