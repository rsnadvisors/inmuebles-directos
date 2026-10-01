export const adminStatuses = { draft: "Borrador", published: "Publicada", reserved: "Reservada", sold: "Vendida", rented: "Alquilada", archived: "Archivada" } as const;
export const adminTypes = { house: "Casa", apartment: "Departamento", land: "Terreno", office: "Oficina", commercial: "Local comercial" } as const;
export const adminOperations = { sale: "Venta", rent: "Alquiler" } as const;
export const adminRoles = { admin: "Administrador", agent: "Agente", owner: "Propietario", viewer: "Usuario" } as const;
export type AdminStatus = keyof typeof adminStatuses;
export type AdminType = keyof typeof adminTypes;
export type AdminOperation = keyof typeof adminOperations;
export type AdminRole = keyof typeof adminRoles;
export type AdminProperty = { id: string; code: string | null; slug: string; title: string; status: AdminStatus; listing: AdminOperation | null; type: AdminType | null; price: number | null; currency: "PEN" | "USD" | null; city: string | null; district: string | null; owner: string | null; agent: string | null; createdAt: string; updatedAt: string | null; publishedAt: string | null };
export type AdminUser = { id: string; name: string | null; email: string | null; role: AdminRole; createdAt: string; properties: number; published: number; drafts: number };
export type AdminSummary = { counts: Record<string, number>; markets: { currency: "PEN" | "USD" | null; listing: AdminOperation | null; type: AdminType | null; count: number }[] };
export type AdminPage<T> = { rows: T[]; next: { before: string; beforeId: string } | null };
export function adminDate(value: string | null) { return value === null ? "No registrada" : new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "America/Lima" }).format(new Date(value)); }
