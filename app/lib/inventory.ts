export type Currency = "PEN" | "USD" | null;
export const operations = ["Comprar", "Alquilar"] as const;
export const propertyTypes = ["Casas", "Departamentos", "Terrenos", "Oficinas", "Locales comerciales"] as const;
export type ListingImage = { url: string; altText: string | null };
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
  const zone = formatLocation([item.address, item.district, item.city]) || "Ubicación no especificada";
  const location = formatLocation([item.address, item.district, item.city, item.region, item.country]) || "Ubicación no especificada";
  return {
    id: item.id, title: text(item.title), operation, type,
    price: optionalNumber(item.price), area: optionalNumber(item.area_total_m2),
    builtArea: optionalNumber(item.area_built_m2), maintenanceFee: optionalNumber(item.maintenance_fee),
    currency: item.currency === "PEN" || item.currency === "USD" ? item.currency : null,
    zone, location,
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
  if (a.price === null) return b.price === null ? 0 : 1;
  if (b.price === null) return -1;
  // No FX conversion: cross-currency ordering remains explicitly deferred.
  return descending ? b.price - a.price : a.price - b.price;
}
