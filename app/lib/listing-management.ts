import { normalizeContactPhone } from "./contact-phone";
import { MAX_PRICE } from "./publication";

/** Gestión de anuncios por su dueño (fase 1): validación compartida por el formulario y la ruta del servidor. */
export const LISTING_ACTIONS = ["mark_sold", "mark_rented", "reserve", "unreserve", "pause", "reactivate"] as const;
export type ListingAction = typeof LISTING_ACTIONS[number];
/** Frase que el usuario escribe para confirmar la baja de su cuenta. */
export const ACCOUNT_DELETION_PHRASE = "ELIMINAR";
export const LISTING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type EditableListing = {
  title: string; description: string; price: number; currency: "PEN" | "USD"; contact_phone: string;
  maintenance_fee: number | null; area_total_m2: number | null; area_built_m2: number | null;
  bedrooms: number | null; bathrooms: number | null; parking_spaces: number | null; floors: number | null;
  address: string; district: string | null; city: string; region: string; lat: number; lng: number;
};
export const EDITABLE_KEYS = ["title", "description", "price", "currency", "contact_phone", "maintenance_fee", "area_total_m2",
  "area_built_m2", "bedrooms", "bathrooms", "parking_spaces", "floors", "address", "district", "city", "region", "lat", "lng"] as const;

export class ListingValidationError extends Error {}
const fail = (message: string): never => { throw new ListingValidationError(message); };

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) fail(`Revisa «${label}»: es obligatorio y admite hasta ${max} caracteres.`);
  return (value as string).trim();
}
function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) fail(`Revisa «${label}».`);
  return (value as string).trim() || null;
}
function num(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return NaN;
  return Number(value);
}
function optionalNumber(value: unknown, label: string, max: number, integer = false): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = num(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max || (integer && !Number.isInteger(parsed))) fail(`Revisa «${label}»: debe ser un número válido no negativo.`);
  return parsed;
}

/** Valida y normaliza los campos editables. `propertyType` viene de la base de datos, no del formulario. */
export function validateListingEdit(input: Record<string, unknown>, propertyType: string): EditableListing {
  for (const key of Object.keys(input)) if (!(EDITABLE_KEYS as readonly string[]).includes(key)) fail("El formulario contiene campos no permitidos.");
  const contact_phone = normalizeContactPhone(input.contact_phone);
  if (!contact_phone) fail("Ingresa un teléfono de contacto válido: un móvil peruano de 9 dígitos o un número internacional con +.");
  const currency = input.currency;
  if (currency !== "PEN" && currency !== "USD") fail("Selecciona una moneda válida.");
  const price = num(input.price);
  if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) fail("El precio debe ser mayor que cero y no superar 1 000 000 000.");
  const lat = num(input.lat), lng = num(input.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -19 || lat > 1 || lng < -82 || lng > -68) fail("Indica coordenadas válidas dentro del área de Perú.");
  const land = propertyType === "land";
  const noRooms = land || propertyType === "office" || propertyType === "commercial";
  const result: EditableListing = {
    title: text(input.title, "Título", 120), description: text(input.description, "Descripción", 3000),
    price, currency: currency as "PEN" | "USD", contact_phone: contact_phone as string,
    maintenance_fee: land ? null : optionalNumber(input.maintenance_fee, "Mantenimiento", MAX_PRICE),
    area_total_m2: optionalNumber(input.area_total_m2, "Área total", 100_000_000),
    area_built_m2: land ? null : optionalNumber(input.area_built_m2, "Área construida", 100_000_000),
    bedrooms: noRooms ? null : optionalNumber(input.bedrooms, "Habitaciones", 1000, true),
    bathrooms: land ? null : optionalNumber(input.bathrooms, "Baños", 1000, true),
    parking_spaces: land ? null : optionalNumber(input.parking_spaces, "Estacionamientos", 1000, true),
    floors: land ? null : optionalNumber(input.floors, "Pisos", 1000, true),
    address: text(input.address, "Dirección o sector", 250), district: optionalText(input.district, "Distrito", 120),
    city: text(input.city, "Ciudad o provincia", 120), region: text(input.region, "Región", 120), lat, lng,
  };
  return result;
}

/** Acciones disponibles según el estado (espejo de las transiciones permitidas en la base de datos). */
export function availableActions(row: { status: string; listing_type: string; is_reserved?: boolean | null;
  owner_paused?: boolean | null; deletion_requested_at?: string | null; published_at?: string | null }) {
  const deleting = !!row.deletion_requested_at;
  const moderated = row.status === "archived" && !row.owner_paused && !deleting;
  const actions: ListingAction[] = [];
  if (!deleting && row.status === "published") {
    actions.push(row.listing_type === "rent" ? "mark_rented" : "mark_sold", row.is_reserved ? "unreserve" : "reserve", "pause");
  }
  if (!deleting && row.published_at && ((row.status === "archived" && row.owner_paused) || row.status === "sold" || row.status === "rented")) actions.push("reactivate");
  return {
    actions,
    canEdit: !deleting && (row.status === "published" || row.status === "sold" || row.status === "rented" || (row.status === "archived" && !!row.owner_paused)),
    canDelete: row.status !== "draft",
    deleting, moderated,
  };
}

export function listingStatusLabel(row: { status: string; is_reserved?: boolean | null; owner_paused?: boolean | null; deletion_requested_at?: string | null }): string {
  if (row.deletion_requested_at) return "Eliminación pendiente";
  if (row.status === "published") return row.is_reserved ? "Reservado" : "Publicado";
  if (row.status === "archived") return row.owner_paused ? "Pausado" : "Archivado por revisión";
  return ({ draft: "Borrador", reserved: "Reservado", sold: "Vendido", rented: "Alquilado" } as Record<string, string>)[row.status] ?? row.status;
}

export const ACTION_LABELS: Record<ListingAction, string> = {
  mark_sold: "Marcar como vendido", mark_rented: "Marcar como alquilado", reserve: "Marcar como reservado",
  unreserve: "Quitar «Reservado»", pause: "Pausar anuncio", reactivate: "Volver a publicar",
};
export const ACTION_CONFIRM: Partial<Record<ListingAction, string>> = {
  mark_sold: "El anuncio dejará de mostrarse en el mapa y pasará a «Cerradas». Podrás volver a publicarlo si la venta no se concreta. ¿Continuar?",
  mark_rented: "El anuncio dejará de mostrarse en el mapa y pasará a «Cerradas». Podrás volver a publicarlo cuando quede libre. ¿Continuar?",
  pause: "El anuncio dejará de mostrarse en el mapa hasta que lo vuelvas a publicar. ¿Continuar?",
};
