// Syntactic dialable format, not verification that a number exists or uses WhatsApp.
// Bare nine-digit Peruvian mobiles default to +51; other countries require +.
export function normalizeContactPhone(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const input = value.trim();
  if (!input || !/^\+?[0-9 ()-]+$/.test(input)) return null;
  const compact = input.replace(/[ ()-]/g, "");
  if (/^9\d{8}$/.test(compact)) return `+51${compact}`;
  if (/^519\d{8}$/.test(compact)) return `+${compact}`;
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}

export function propertyContactLinks(phone: unknown, title: string) {
  const normalized = normalizeContactPhone(phone);
  if (!normalized) return null;
  const message = `Hola, vi tu propiedad "${title}" en Inmuebles Directos y quisiera más información.`;
  return { tel: `tel:${normalized}`, whatsapp: `https://wa.me/${normalized.slice(1)}?text=${encodeURIComponent(message)}` };
}
