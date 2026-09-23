export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 27 * 1024 * 1024;
export const MAX_PRICE = 1_000_000_000;
export const imageExtensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const PARTIAL_MESSAGE = "La publicación no pudo completarse correctamente. Parte de la información podría haberse guardado. No vuelvas a enviarla inmediatamente.";
const operations = { Vender: "sale", Alquilar: "rent" } as const;
const types = { Casas: "house", Departamentos: "apartment", Terrenos: "land", Oficinas: "office", "Locales comerciales": "commercial" } as const;
const fields = ["title", "description", "address", "district", "city", "region", "operation", "type", "price", "currency", "area_total_m2", "area_built_m2", "bedrooms", "bathrooms", "parking_spaces", "floors", "maintenance_fee", "latitude", "longitude", "coordinatesConfirmed"];

export class PublicationValidationError extends Error {}
function invalid(message: string): never { throw new PublicationValidationError(message); }
function text(form: FormData, key: string, max: number): string {
  const value = form.get(key);
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) invalid(`Revisa el campo ${key}: es obligatorio y admite hasta ${max} caracteres.`);
  return value.trim();
}
function optionalText(form: FormData, key: string, max: number): string | null {
  const value = form.get(key);
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) invalid(`Revisa el campo ${key}.`);
  return value.trim() || null;
}
function number(value: unknown): number {
  if (typeof value !== "string" || !value.trim() || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return NaN;
  return Number(value);
}
function optionalNumber(form: FormData, key: string, maximum: number, integer = false): number | null {
  const value = form.get(key);
  if (value === null || value === "") return null;
  const parsed = number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum || (integer && !Number.isInteger(parsed))) invalid(`Revisa el campo ${key}: debe ser un número válido no negativo.`);
  return parsed;
}
export function validCoordinates(latitude: string, longitude: string): boolean {
  const lat = number(latitude), lng = number(longitude);
  // Geographic bounding box, not proof that the point lies within national borders.
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -19 && lat <= 1 && lng >= -82 && lng <= -68;
}
export function validatePhotos(files: File[]): void {
  if (files.length < 1 || files.length > MAX_PHOTOS) invalid("Añade entre 1 y 5 fotos.");
  for (const file of files) {
    if (!(file instanceof File) || !Object.hasOwn(imageExtensions, file.type) || file.size <= 0 || file.size > MAX_PHOTO_BYTES) invalid("Cada foto debe ser JPG, PNG o WebP, no estar vacía y pesar como máximo 5 MiB.");
  }
}
export function validatePublication(form: FormData) {
  for (const key of form.keys()) {
    if (key !== "images" && (!fields.includes(key) || form.getAll(key).length !== 1)) invalid("El formulario contiene campos no permitidos o repetidos.");
  }
  const title = text(form, "title", 120), description = text(form, "description", 3000), address = text(form, "address", 250);
  const district = optionalText(form, "district", 120), city = text(form, "city", 120), region = text(form, "region", 120);
  const operation = text(form, "operation", 20), type = text(form, "type", 30), currency = text(form, "currency", 3);
  if (!Object.hasOwn(operations, operation) || !Object.hasOwn(types, type)) invalid("Selecciona una operación y un tipo de propiedad válidos.");
  if (currency !== "PEN" && currency !== "USD") invalid("Selecciona una moneda válida.");
  const price = number(form.get("price"));
  if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) invalid("El precio debe ser mayor que cero y no superar 1 000 000 000.");
  const area_total_m2 = optionalNumber(form, "area_total_m2", 100_000_000);
  const area_built_m2 = optionalNumber(form, "area_built_m2", 100_000_000);
  const bedrooms = optionalNumber(form, "bedrooms", 1000, true);
  const bathrooms = optionalNumber(form, "bathrooms", 1000, true);
  const parking_spaces = optionalNumber(form, "parking_spaces", 1000, true);
  const floors = optionalNumber(form, "floors", 1000, true);
  const maintenance_fee = optionalNumber(form, "maintenance_fee", MAX_PRICE);
  if (type === "Terrenos" && [area_built_m2, bedrooms, bathrooms, parking_spaces, floors, maintenance_fee].some(value => value !== null)) invalid("Los atributos residenciales no corresponden a un terreno.");
  if ((type === "Oficinas" || type === "Locales comerciales") && bedrooms !== null) invalid("Las habitaciones no corresponden a este tipo de inmueble.");
  const latitude = form.get("latitude"), longitude = form.get("longitude");
  if (typeof latitude !== "string" || typeof longitude !== "string" || !validCoordinates(latitude, longitude)) invalid("Indica coordenadas válidas dentro del área de Perú.");
  if (form.get("coordinatesConfirmed") !== "true") invalid("Confirma las coordenadas de la propiedad antes de publicar.");
  const images = form.getAll("images");
  if (images.some(file => !(file instanceof File))) invalid("Las fotos recibidas no son válidas.");
  const files = images as File[];
  validatePhotos(files);
  return { title, description, address, district, city, region, listing_type: operations[operation as keyof typeof operations], property_type: types[type as keyof typeof types], price, currency, area_total_m2, area_built_m2, bedrooms, bathrooms, parking_spaces, floors, maintenance_fee, lat: number(latitude), lng: number(longitude), files };
}
