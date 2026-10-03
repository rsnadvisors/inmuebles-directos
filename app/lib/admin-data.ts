import "server-only";
import { requireDashboardAdmin, DashboardAuthorizationError } from "./admin-auth-server";
import { adminStatuses, adminTypes, adminOperations, adminRoles, type AdminProperty, type AdminUser, type AdminSummary, type AdminPage } from "./admin-display";

export class AdminInputError extends Error { constructor() { super("Filtros inválidos. Revisa la búsqueda y vuelve a intentarlo."); } }
export class AdminReadError extends Error { readonly status = 503; constructor() { super("No se pudo cargar la información. Inténtalo más tarde."); } }
export type AdminParams = Record<string, string | string[] | undefined>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdminReadError(); return value as Record<string, unknown>; }
function text(value: unknown, nullable = false): string | null { if (nullable && value === null) return null; if (typeof value !== "string") throw new AdminReadError(); return value; }
function identifier(value: unknown, nullable = false): string | null { const v = text(value, nullable); if (v !== null && !uuid.test(v)) throw new AdminReadError(); return v; }
function date(value: unknown, nullable = false): string | null { const v = text(value, nullable); if (v !== null && (!timestamp.test(v) || !Number.isFinite(Date.parse(v)))) throw new AdminReadError(); return v; }
function count(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new AdminReadError(); return value; }
function choice<T extends string>(value: unknown, choices: Record<T, string>, nullable = false): T | null { if (nullable && value === null) return null; if (typeof value !== "string" || !Object.hasOwn(choices, value)) throw new AdminReadError(); return value as T; }
function currency(value: unknown): "PEN" | "USD" | null { return choice(value, { PEN: "PEN", USD: "USD" }, true); }
function money(value: unknown): number | null { if (value === null) return null; const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN; if (!Number.isFinite(n) || n < 0) throw new AdminReadError(); return n; }
function required(value: string | null): string { if (value === null) throw new AdminReadError(); return value; }
export function parseAdminParams(params: AdminParams, kind: "properties" | "users") {
  const allowed = kind === "properties" ? ["q", "status", "listing", "type", "city", "district", "ownerless", "before", "beforeId", "id"] : ["q", "before", "beforeId"];
  for (const key of Object.keys(params)) if (!allowed.includes(key)) throw new AdminInputError();
  const get = (key: string, max = 80) => { const v = params[key]; if (Array.isArray(v) || (v !== undefined && (v.length > max || /[\u0000-\u001f]/.test(v)))) throw new AdminInputError(); return v?.trim() || null; };
  const enumParam = (key: string, values: Record<string, string>) => { const v = get(key); if (v !== null && !Object.hasOwn(values, v)) throw new AdminInputError(); return v; };
  const before = get("before"), beforeId = get("beforeId"), id = get("id");
  if (!!before !== !!beforeId || (before && (!timestamp.test(before) || !Number.isFinite(Date.parse(before)))) || (beforeId && !uuid.test(beforeId)) || (id && !uuid.test(id))) throw new AdminInputError();
  const ownerless = get("ownerless"); if (ownerless !== null && ownerless !== "true") throw new AdminInputError();
  return { q: get("q"), before, beforeId, id, status: enumParam("status", adminStatuses), listing: enumParam("listing", adminOperations), type: enumParam("type", adminTypes), city: get("city", 120), district: get("district", 120), ownerless: ownerless === "true" };
}
export async function readAdminRpc(name: "admin_dashboard_summary" | "admin_properties" | "admin_users", args?: Record<string, unknown>): Promise<unknown> {
  const { client } = await requireDashboardAdmin();
  try { const result = args ? await client.rpc(name, args) : await client.rpc(name); if (result.error) { if (result.error.code === "42501") throw new DashboardAuthorizationError(403); throw new AdminReadError(); } return result.data; }
  catch (error) { if (error instanceof DashboardAuthorizationError) throw error; throw new AdminReadError(); }
}
export async function readAdminSummary(): Promise<AdminSummary> {
  const row = object(await readAdminRpc("admin_dashboard_summary"));
  const keys = ["profiles_total", "auth_users_total", "properties_total", "published", "draft", "archived", "reserved", "sold", "rented", "sale", "rent", "today", "7d", "30d", "views_raw_count", "leads_raw_count", "favorites_count"];
  const counts = Object.fromEntries(keys.map(key => [key, count(row[key])]));
  if (!Array.isArray(row.by_market)) throw new AdminReadError();
  const markets = row.by_market.map(value => { const r = object(value); return { currency: currency(r.currency), listing: choice(r.listing_type, adminOperations, true), type: choice(r.property_type, adminTypes, true), count: count(r.count) }; });
  return { counts, markets };
}
export function normalizeAdminProperty(value: unknown): AdminProperty {
  const r = object(value); return { id: required(identifier(r.id)), code: text(r.code, true), slug: required(text(r.slug)), title: required(text(r.title)), status: choice(r.status, adminStatuses)!, listing: choice(r.listing_type, adminOperations, true), type: choice(r.property_type, adminTypes, true), price: money(r.price), currency: currency(r.currency), city: text(r.city, true), district: text(r.district, true), owner: identifier(r.owner_id, true), agent: identifier(r.agent_id, true), createdAt: required(date(r.created_at)), updatedAt: date(r.updated_at, true), publishedAt: date(r.published_at, true) };
}
export function normalizeAdminUser(value: unknown): AdminUser {
  const r = object(value); return { id: required(identifier(r.profile_id)), name: text(r.full_name, true), email: text(r.email, true), role: choice(r.role, adminRoles)!, createdAt: required(date(r.profile_created_at)), properties: count(r.property_count), published: count(r.published_count), drafts: count(r.draft_count) };
}
const pageSize = 20;
function page<T extends { id: string; createdAt: string }>(payload: unknown, normalize: (r: unknown) => T): AdminPage<T> {
  if (!Array.isArray(payload) || payload.length > pageSize + 1) throw new AdminReadError();
  const all = payload.map(normalize); const rows = all.slice(0, pageSize); const last = rows.at(-1);
  if (new Set(all.map(r => r.id)).size !== all.length) throw new AdminReadError();
  return { rows, next: all.length > pageSize && last ? { before: last.createdAt, beforeId: last.id } : null };
}
export async function readAdminProperties(params: AdminParams): Promise<AdminPage<AdminProperty>> {
  const p = parseAdminParams(params, "properties");
  const payload = await readAdminRpc("admin_properties", { p_limit: pageSize + 1, p_before: p.before, p_before_id: p.beforeId, p_search: p.q, p_status: p.status, p_listing: p.listing, p_type: p.type, p_city: p.city, p_district: p.district, p_owner: null, p_ownerless: p.ownerless, p_from: null, p_to: null, p_id: p.id });
  return page(payload, normalizeAdminProperty);
}
/** Detail IDs are required; never interpret an invalid ID as an inventory filter. */
export async function readAdminProperty(id: string): Promise<AdminProperty | null> {
  await requireDashboardAdmin();
  const requested = id.trim().toLowerCase();
  if (!uuid.test(requested)) return null;
  const { rows } = await readAdminProperties({ id: requested });
  if (rows.length > 1 || (rows[0] && rows[0].id.toLowerCase() !== requested)) throw new AdminReadError();
  return rows[0] ?? null;
}
export async function readAdminUsers(params: AdminParams): Promise<AdminPage<AdminUser>> {
  const p = parseAdminParams(params, "users");
  return page(await readAdminRpc("admin_users", { p_limit: pageSize + 1, p_before: p.before, p_before_id: p.beforeId, p_search: p.q, p_user: null }), normalizeAdminUser);
}
