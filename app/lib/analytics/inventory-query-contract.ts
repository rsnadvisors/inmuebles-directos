import { getMetric, isDimensionAllowedForMetric } from "./semantics";
import { CONTRACT_VERSION } from "./contract";

export const INVENTORY_METRICS = Object.freeze([
 "inventory_total", "inventory_published", "inventory_draft", "inventory_archived",
 "inventory_reserved", "inventory_sold", "inventory_rented", "publication_share",
 "type_mix", "operation_mix", "currency_mix", "image_coverage",
] as const);
export const INVENTORY_DIMENSIONS = Object.freeze(["property_type", "operation", "property_status", "currency"] as const);
export const INVENTORY_VALUES = Object.freeze({
 property_type: Object.freeze(["house", "apartment", "land", "office", "commercial"] as const),
 operation: Object.freeze(["sale", "rent"] as const),
 property_status: Object.freeze(["draft", "published", "reserved", "sold", "rented", "archived"] as const),
 currency: Object.freeze(["PEN", "USD"] as const),
});
export type InventoryMetric = typeof INVENTORY_METRICS[number];
export type InventoryDimension = typeof INVENTORY_DIMENSIONS[number];
export type InventoryFilters = Readonly<{ [K in InventoryDimension]?: typeof INVENTORY_VALUES[K][number] }>;
export type InventoryScope = "OWN_PROPERTY" | "PLATFORM_AGGREGATE";
export type InventoryQuery = Readonly<{ metric: InventoryMetric; dimension?: InventoryDimension; filters: InventoryFilters }>;
export type InventoryErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "UNSUPPORTED_METRIC" | "UNSUPPORTED_DIMENSION" | "UNSUPPORTED_COMBINATION" | "INVALID_QUERY" | "DATA_UNAVAILABLE" | "QUERY_FAILED";
export class InventoryQueryError extends Error {
 constructor(public readonly code: InventoryErrorCode) { super(code); this.name = "InventoryQueryError"; }
}
export const MIX_DIMENSIONS = Object.freeze({ type_mix: "property_type", operation_mix: "operation", currency_mix: "currency" } as const);
const contains = (a: readonly string[], v: unknown): boolean => typeof v === "string" && a.includes(v);
function record(v: unknown): v is Record<string, unknown> {
 return !!v && typeof v === "object" && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));
}
export function parseInventoryQuery(input: unknown): InventoryQuery {
 if (!record(input) || Object.keys(input).some(k => !["metric", "dimension", "filters"].includes(k)))
  throw new InventoryQueryError("INVALID_QUERY");
 if (!contains(INVENTORY_METRICS, input.metric)) throw new InventoryQueryError("UNSUPPORTED_METRIC");
 const metric = input.metric as InventoryMetric;
 const mix = MIX_DIMENSIONS[metric as keyof typeof MIX_DIMENSIONS];
 const dimension = input.dimension === undefined ? mix : input.dimension;
 if (dimension !== undefined && !contains(INVENTORY_DIMENSIONS, dimension)) throw new InventoryQueryError("UNSUPPORTED_DIMENSION");
 if (mix && dimension !== mix) throw new InventoryQueryError("UNSUPPORTED_COMBINATION");
 if (dimension && !getMetric(metric)?.dimensions.includes(dimension as InventoryDimension)) throw new InventoryQueryError("UNSUPPORTED_COMBINATION");
 const raw = input.filters === undefined ? {} : input.filters;
 if (!record(raw) || Object.keys(raw).some(k => !contains(INVENTORY_DIMENSIONS, k))) throw new InventoryQueryError("INVALID_QUERY");
 const filters: Record<string, string> = {};
 for (const [key, value] of Object.entries(raw)) {
  if (!contains(INVENTORY_VALUES[key as InventoryDimension], value)) throw new InventoryQueryError("INVALID_QUERY");
  filters[key] = value as string;
 }
 return Object.freeze({ metric, dimension: dimension as InventoryDimension | undefined, filters: Object.freeze(filters) as InventoryFilters });
}
export function assertInventorySemantics(query: InventoryQuery, scope: InventoryScope) {
 const role = scope === "OWN_PROPERTY" ? "STANDARD_USER" : "SUPER_ADMIN";
 const metric = getMetric(query.metric);
 if (!metric || metric.status !== "ACTIVE" || metric.availability !== "AVAILABLE"
  || metric.storageDependent || metric.instrumentationDependent
  || !metric.grants.some(g => g.role === role && g.scopes.includes(scope)))
  throw new InventoryQueryError("FORBIDDEN");
 if (query.dimension && !isDimensionAllowedForMetric(query.dimension, query.metric, role, scope))
  throw new InventoryQueryError("UNSUPPORTED_COMBINATION");
}
export type InventoryReading = Readonly<{ status: "AVAILABLE" | "NO_DATA"; value: number | null; numerator?: number; denominator?: number }>;
export type InventoryQueryResult = Readonly<{
 contractVersion: typeof CONTRACT_VERSION; metric: InventoryMetric; dimension?: InventoryDimension;
 scope: InventoryScope; filters: InventoryFilters; unit: "count" | "percentage";
 status: "AVAILABLE" | "NO_DATA"; value: number | null;
 numerator?: number; denominator?: number;
 groups: readonly Readonly<{ key: string; reading: InventoryReading }>[];
 observedFrom: string; observedTo: string; consistency: "READ_INTERVAL";
}>;
export type InventoryResponse = Readonly<{ ok: true; result: InventoryQueryResult } | { ok: false; code: InventoryErrorCode }>;
