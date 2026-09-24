export type Currency = "PEN" | "USD" | null;
export const operations = ["Comprar", "Alquilar"] as const;
export const propertyTypes = ["Casas", "Departamentos", "Terrenos", "Oficinas", "Locales comerciales"] as const;
export type ListingImage = { url: string; altText: string | null };
export type ComparisonAttribute = {
  key: "area" | "bedrooms" | "bathrooms" | "parking";
  icon: string;
  value: number;
  label: string;
  shortLabel: string;
};
export type ListingLocation = {
  address: string;
  district: string;
  city: string;
  region: string;
  country: string;
};
export type Listing = {
  id: string | number;
  title: string;
  operation: typeof operations[number] | "Operación no especificada";
  type: typeof propertyTypes[number] | "Tipo no especificado";
  price: number | null;
  area: number | null;
  builtArea: number | null;
  maintenanceFee: number | null;
  zone: string;
  description: string;
  coords: [number, number] | null;
  images: string[];
  imageItems: ListingImage[];
  currency: Currency;
  slug?: string;
  status?: string;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
  floors: number | null;
  locationParts: ListingLocation;
  location: string;
  publishedAt: string | null;
};
export type MappableListing = Listing & { coords: [number, number] };
export function propertyIcon(type: Listing["type"]): string {
  return type === "Casas" ? "⌂" : type === "Departamentos" ? "▥" : type === "Terrenos" ? "⌖" : type === "Oficinas" ? "▣" : type === "Locales comerciales" ? "▤" : "?";
}
type RawProperty = Record<string, unknown>;

function record(value: unknown): value is RawProperty {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function locationText(value: unknown): string {
  return text(value).replace(/\s+/g, " ");
}
function formatLocation(values: unknown[]): string {
  return values.map(locationText).filter(Boolean).filter((value, index, parts) =>
    index === 0 || value.toLowerCase() !== parts[index - 1].toLowerCase()
  ).join(", ");
}
export function primaryImage(listing: Listing): ListingImage | null {
  return listing.imageItems[0] ?? null;
}
export function compactLocation(listing: Listing): string {
  const { address, district, city } = listing.locationParts;
  return formatLocation([district, city]) || address || "Ubicación no especificada";
}
export function previewLocation(listing: Listing): string {
  const { address, district, city } = listing.locationParts;
  return formatLocation([address, district, city]) || "Ubicación no especificada";
}
function comparisonAttribute(key: ComparisonAttribute["key"], value: number | null): ComparisonAttribute | null {
  if (value === null) return null;
  if (key === "area") return { key, icon: "▧", value, label: `${value} metros cuadrados`, shortLabel: `${value} m²` };
  if (key === "bedrooms") return { key, icon: "⌂", value, label: `${value} ${value === 1 ? "habitación" : "habitaciones"}`, shortLabel: `${value} hab.` };
  if (key === "bathrooms") return { key, icon: "♧", value, label: `${value} ${value === 1 ? "baño" : "baños"}`, shortLabel: `${value} ${value === 1 ? "baño" : "baños"}` };
  return { key, icon: "▣", value, label: `${value} ${value === 1 ? "estacionamiento" : "estacionamientos"}`, shortLabel: `${value} est.` };
}
export function comparisonAttributes(listing: Listing): ComparisonAttribute[] {
  const keys: ComparisonAttribute["key"][] = listing.type === "Terrenos"
    ? ["area"]
    : listing.type === "Oficinas" || listing.type === "Locales comerciales"
      ? ["area", "bathrooms", "parking"]
      : ["area", "bedrooms", "bathrooms", "parking"];
  const values = {
    area: listing.area,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    parking: listing.parkingSpaces,
  };
  return keys.map(key => comparisonAttribute(key, values[key])).filter((item): item is ComparisonAttribute => item !== null);
}
export function optionalNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function coordinates(lat: unknown, lng: unknown): [number, number] | null {
  const latitude = optionalNumber(lat), longitude = optionalNumber(lng);
  return latitude !== null && longitude !== null && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    ? [latitude, longitude] : null;
}
export function isMappable(listing: Listing): listing is MappableListing {
  return listing.coords !== null;
}
export function normalizeListing(value: unknown): Listing | null {
  if (!record(value)) return null;
  const item = value;
  if ((typeof item.id !== "string" && typeof item.id !== "number") || !text(item.title)) return null;
  const operation = item.listing_type === "sale" ? "Comprar" : item.listing_type === "rent" ? "Alquilar" : "Operación no especificada";
  const typeMap: Record<string, Listing["type"]> = { house: "Casas", apartment: "Departamentos", land: "Terrenos", office: "Oficinas", commercial: "Locales comerciales" };
  const type = typeof item.property_type === "string" && Object.hasOwn(typeMap, item.property_type)
    ? typeMap[item.property_type] : "Tipo no especificado";
  const images = (Array.isArray(item.property_images) ? item.property_images.filter(record) : [])
    .map((image, index) => ({
      url: text(image.public_url),
      altText: text(image.alt_text) || null,
      isCover: image.is_cover === true,
      sortOrder: optionalNumber(image.sort_order),
      fallback: text(image.id) || `${text(image.public_url)}:${index}`,
    }))
    .filter(image => image.url)
    .sort((a, b) => Number(b.isCover) - Number(a.isCover)
      || (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
      || a.fallback.localeCompare(b.fallback));
  const locationParts = {
    address: locationText(item.address), district: locationText(item.district), city: locationText(item.city),
    region: locationText(item.region), country: locationText(item.country),
  };
  const zone = formatLocation([locationParts.address, locationParts.district, locationParts.city]) || "Ubicación no especificada";
  const location = formatLocation([locationParts.address, locationParts.district, locationParts.city, locationParts.region, locationParts.country]) || "Ubicación no especificada";
  return {
    id: item.id, title: text(item.title), operation, type,
    price: optionalNumber(item.price), area: optionalNumber(item.area_total_m2),
    builtArea: optionalNumber(item.area_built_m2), maintenanceFee: optionalNumber(item.maintenance_fee),
    currency: item.currency === "PEN" || item.currency === "USD" ? item.currency : null,
    zone, locationParts, location,
    description: text(item.description), slug: text(item.slug) || undefined, status: text(item.status) || undefined,
    bedrooms: optionalNumber(item.bedrooms), bathrooms: optionalNumber(item.bathrooms), parkingSpaces: optionalNumber(item.parking_spaces),
    floors: optionalNumber(item.floors), publishedAt: text(item.published_at) || null,
    coords: coordinates(item.lat, item.lng),
    imageItems: images.map(({ url, altText }) => ({ url, altText })),
    images: images.map(image => image.url),
  };
}
export function normalizeInventory(data: unknown): Listing[] {
  if (!Array.isArray(data)) throw new Error("Invalid inventory response");
  return data.map(normalizeListing).filter((item): item is Listing => item !== null);
}
export function formatPrice(amount: number | null, currency: Currency): string {
  if (amount === null || !Number.isFinite(amount)) return "Precio no disponible";
  const number = amount.toLocaleString("en-US", { maximumFractionDigits: 20 });
  return currency === "PEN" ? `S/ ${number}` : currency === "USD" ? `US$ ${number}` : `${number} · Moneda no especificada`;
}
export function comparePrice(a: Listing, b: Listing, descending = false): number {
  // Values in different currencies are deliberately grouped, never compared as FX.
  if (a.currency !== b.currency) return (a.currency ?? "ZZZ").localeCompare(b.currency ?? "ZZZ");
  if (a.price === null) return b.price === null ? 0 : 1;
  if (b.price === null) return -1;
  return descending ? b.price - a.price : a.price - b.price;
}

function searchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-PE").trim();
}

export function filterAndSortListings(listings: Listing[], query: string, operation: string, type: string, sort: string): Listing[] {
  const term = searchText(query);
  const result = listings.filter(item => {
    const searchable = [item.title, item.locationParts.district, item.locationParts.city, item.locationParts.region, item.type].join(" ");
    return (!term || searchText(searchable).includes(term))
      && (operation === "Todo" || item.operation === operation)
      && (type === "Todo" || item.type === type);
  });
  if (sort === "priceAsc" || sort === "priceDesc") return [...result].sort((a, b) => comparePrice(a, b, sort === "priceDesc") || String(a.id).localeCompare(String(b.id)));
  if (sort === "recent") return [...result].sort((a, b) => {
    const first = a.publishedAt ? Date.parse(a.publishedAt) : NaN;
    const second = b.publishedAt ? Date.parse(b.publishedAt) : NaN;
    if (!Number.isFinite(first)) return Number.isFinite(second) ? 1 : String(a.id).localeCompare(String(b.id));
    if (!Number.isFinite(second)) return -1;
    return second - first || String(a.id).localeCompare(String(b.id));
  });
  return result;
}
