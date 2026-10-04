import { METRICS, DIMENSIONS } from "./registry";
import { METRIC_IDS, DIMENSION_IDS, ROLES, SCOPES, CATEGORIES, UNITS, AGGREGATIONS, AVAILABILITIES, BACKFILLS, DEPENDENCIES, STATUSES, PRIVACY_CLASSES, type Metric, type Dimension, type Readiness, type Role, type Scope } from "./contract";

const contains = (values: readonly unknown[], value: unknown) => values.includes(value);
// Discovery §50 Publishers + §39 report 8. Compatibility is not readiness.
const PUBLISHER_METRICS = Object.freeze(["inventory_total", "image_coverage", "contact_rate"]);
// Discovery §32: current image coverage is a property/image-metadata ratio,
// not evidence of behavioral events or binary Storage availability.
function validCurrentImageSources(m: Metric): boolean {
 if (m.id !== "image_coverage" && !(m.time === "CURRENT_SNAPSHOT" && m.dependencies?.includes("IMAGE_METADATA"))) return true;
 return Array.isArray(m.dependencies)
  && ["PROPERTY_CURRENT", "IMAGE_METADATA", "QUERY_LAYER"].every(d => contains(m.dependencies, d))
  && !m.dependencies.some(d => ["ANALYTICS_EVENTS", "CONTACT_EVENTS", "SEARCH_EVENTS", "STORAGE_PUBLICATION_INTERNALS"].includes(d))
  && !m.instrumentationDependent && !m.storageDependent;
}
export function getMetric(id: unknown): Metric | undefined { return typeof id === "string" ? METRICS.find(m => m.id === id) : undefined; }
export function getDimension(id: unknown): Dimension | undefined { return typeof id === "string" ? DIMENSIONS.find(d => d.id === id) : undefined; }
export function isMetricAllowedForRole(id: unknown, role: unknown, scope?: unknown): boolean {
 const m = getMetric(id);
 return !!m && contains(ROLES, role) && m.grants.some(g => g.role === role && (scope === undefined || contains(g.scopes, scope)));
}
/** Metadata visibility only, including unresolved traceability. NOT permission to calculate. */
export function getMetricsForRole(role: unknown) {
 if (!contains(ROLES, role)) return [];
 return METRICS.filter(m => isMetricAllowedForRole(m.id, role)).map(m => Object.freeze({ ...m, grants: Object.freeze(m.grants.filter(g => g.role === role)), dimensions: Object.freeze(m.dimensions.filter(id => getDimension(id)?.grants.some(g => g.role === role))) }));
}
export function getDimensionsForRole(role: unknown) {
 if (!contains(ROLES, role)) return [];
 return DIMENSIONS.filter(d => d.grants.some(g => g.role === role)).map(d => Object.freeze({ ...d, grants: Object.freeze(d.grants.filter(g => g.role === role)) }));
}
export function isDimensionAllowedForMetric(dimensionId: unknown, metricId: unknown, role: unknown, scope: unknown): boolean {
 const m = getMetric(metricId), d = getDimension(dimensionId);
 return !!m && !!d && m.status !== "UNRESOLVED" && isMetricAllowedForRole(metricId, role, scope)
  && contains(m.dimensions, dimensionId) && contains(d.families, m.category)
  && d.grants.some(g => g.role === role && contains(g.scopes, scope));
}
/** No readiness state grants security authorization. No metric is READY_NOW in this gate. */
export function getMetricReadiness(id: unknown, role: unknown = "SUPER_ADMIN", scope: unknown = "PLATFORM_AGGREGATE"): Readiness {
 const m = getMetric(id);
 if (!m || !isMetricAllowedForRole(id, role, scope)) return "UNKNOWN";
 if (m.status === "UNRESOLVED" || m.availability === "UNRESOLVED") return "UNRESOLVED";
 if (m.dependencies.some(d => !contains(DEPENDENCIES, d))) return "UNKNOWN";
 if (!validCurrentImageSources(m)) return "UNKNOWN";
 if (m.storageDependent || m.availability === "DEFERRED_STORAGE_DEPENDENCY") return "DEFERRED";
 if (m.status === "DEPRECATED" || m.availability === "REQUIRES_POLICY" || scope === "PRIVACY_SAFE_BENCHMARK") return "DEFERRED";
 if (m.externalDependent || m.availability === "REQUIRES_EXTERNAL_INTEGRATION") return "REQUIRES_EXTERNAL_INTEGRATION";
 if (m.dependencies.includes("PROPERTY_HISTORY")) return "DEFERRED";
 if (m.instrumentationDependent || m.availability === "NOT_TRACKED") return "REQUIRES_INSTRUMENTATION";
 if (m.availability === "UNKNOWN") return "UNKNOWN";
 return m.dependencies.includes("QUERY_LAYER") ? "READY_AFTER_QUERY_LAYER" : "UNKNOWN";
}
export function canRequestMetric(id: unknown, role: unknown, scope: unknown): boolean {
 // Even a structurally valid own/admin metric still needs a separately authorized query layer.
 return getMetricReadiness(id, role, scope) === "READY_NOW";
}
export type MetricResult = Readonly<{ state: "VALUE"; value: number } | { state: "ZERO"; value: 0 } | { state: "NO_DATA" | "NOT_TRACKED" | "INSUFFICIENT_SAMPLE" | "UNAVAILABLE" | "UNRESOLVED" }>;
export function unavailableResult(state: Exclude<MetricResult["state"], "VALUE" | "ZERO">): MetricResult {
 return Object.freeze({ state: ["NO_DATA","NOT_TRACKED","INSUFFICIENT_SAMPLE","UNAVAILABLE","UNRESOLVED"].includes(state) ? state : "UNAVAILABLE" });
}
/** Normalizes a supplied reading, never fetches or calculates a metric. */
export function metricResult(id: unknown, value: number | null): MetricResult {
 const m = getMetric(id);
 if (!m) return unavailableResult("UNAVAILABLE");
 if (m.status === "UNRESOLVED" || m.availability === "UNRESOLVED") return unavailableResult("UNRESOLVED");
 if (m.availability === "NOT_TRACKED") return unavailableResult("NOT_TRACKED");
 if (!["AVAILABLE", "PARTIAL"].includes(m.availability)) return unavailableResult("UNAVAILABLE");
 if (value === null) return unavailableResult("NO_DATA");
 if (typeof value !== "number" || !Number.isFinite(value) || (value < 0 && id !== "price_change") || (m.unit === "count" && !Number.isInteger(value))) return unavailableResult("UNAVAILABLE");
 return Object.freeze(value === 0 ? { state: "ZERO", value: 0 } : { state: "VALUE", value });
}
/** Primitive ratio contract only; not a report/metric execution engine. */
export function ratioResult(numerator: number | null, denominator: number | null, scale: 1 | 100 = 1): MetricResult {
 if (numerator === null || denominator === null) return unavailableResult("NO_DATA");
 if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator < 0 || denominator <= 0 || ![1,100].includes(scale)) return unavailableResult("NO_DATA");
 const value = numerator / denominator * scale;
 if (!Number.isFinite(value)) return unavailableResult("UNAVAILABLE");
 return Object.freeze(value === 0 ? { state: "ZERO", value: 0 } : { state: "VALUE", value });
}
export function pricePerSqmResult(price: number | null, area: number | null): MetricResult { return ratioResult(price, area); }
export function serializeRegistry(): string { return JSON.stringify({ metrics: METRICS, dimensions: DIMENSIONS }); }

export function validateRegistry(metrics: readonly Metric[] = METRICS, dimensions: readonly Dimension[] = DIMENSIONS): readonly string[] {
 const errors: string[] = [];
 if (!Array.isArray(metrics) || !Array.isArray(dimensions)) return ["INVALID_COLLECTION"];
 const ids = metrics.map(m => m?.id), dimensionIds = dimensions.map(d => d?.id);
 if (new Set(ids).size !== ids.length) errors.push("DUPLICATE_METRIC");
 if (new Set(dimensionIds).size !== dimensionIds.length) errors.push("DUPLICATE_DIMENSION");
 if (ids.length !== 46 || METRIC_IDS.some(id => !ids.includes(id))) errors.push("METRIC_RECONCILIATION");
 for (const d of dimensions) {
  if (!d || !contains(DIMENSION_IDS,d.id) || !contains(PRIVACY_CLASSES,d.privacy) || !["LOW","MEDIUM","HIGH"].includes(d.cardinality) || !["identifier","category","date"].includes(d.dataType)) { errors.push("INVALID_DIMENSION"); continue; }
  if (!Array.isArray(d.families) || d.families.some(f => !contains(CATEGORIES,f))) errors.push("INVALID_FAMILY");
  if (d.id === "publisher" && (d.privacy !== "SENSITIVE_INTERNAL" || d.grants?.length !== 1 || d.grants[0].role !== "SUPER_ADMIN" || d.grants[0].scopes.length !== 1 || d.grants[0].scopes[0] !== "PLATFORM_AGGREGATE")) errors.push("PUBLISHER_PRIVACY_CONTRACT");
  for (const g of d.grants ?? []) if (!contains(ROLES,g.role) || !Array.isArray(g.scopes) || g.scopes.some(s => !contains(SCOPES,s) || g.role === "STANDARD_USER" && s === "PLATFORM_AGGREGATE")) errors.push("INVALID_DIMENSION_GRANT");
 }
 for (const m of metrics) {
  if (!m || !contains(METRIC_IDS,m.id)) { errors.push("UNKNOWN_METRIC"); continue; }
  if (!contains(CATEGORIES,m.category) || !contains(UNITS,m.unit) || !contains(AGGREGATIONS,m.aggregation) || !contains(AVAILABILITIES,m.availability) || !contains(BACKFILLS,m.backfill) || !contains(STATUSES,m.status) || !contains(PRIVACY_CLASSES,m.privacy)) errors.push("INVALID_ENUM");
  if (!Array.isArray(m.dependencies) || m.dependencies.length === 0 || m.dependencies.some(d => !contains(DEPENDENCIES,d))) errors.push("INVALID_DEPENDENCY");
  if (!validCurrentImageSources(m)) errors.push("CURRENT_IMAGE_SOURCE_CONTRACT");
  if (!Array.isArray(m.dimensions) || m.dimensions.some(d => !dimensionIds.includes(d))) errors.push("UNKNOWN_DIMENSION");
  if (contains(PUBLISHER_METRICS, m.id) !== !!m.dimensions?.includes("publisher")) errors.push("PUBLISHER_COMPATIBILITY_CONTRACT");
  if (m.dimensions?.some(id => !dimensions.find(d => d.id === id)?.families.includes(m.category))) errors.push("INCOMPATIBLE_FAMILY");
  if (m.valueType !== "NUMBER" || !["CURRENT_SNAPSHOT","SURVIVING_COHORT","EVENT_PERIOD","HISTORICAL_PERIOD"].includes(m.time) || ![false,"DISJOINT_POPULATIONS","DISJOINT_EVENTS"].includes(m.additive) || m.nullBehavior !== "NO_DATA" || m.zeroBehavior !== "ONLY_OBSERVED_VALID_ZERO") errors.push("INVALID_VALUE_CONTRACT");
  if (m.privacyByScope?.OWN_PROPERTY !== "USER_PRIVATE" || m.privacyByScope?.PRIVACY_SAFE_BENCHMARK !== "PRIVACY_SAFE_BENCHMARK") errors.push("INVALID_SCOPE_PRIVACY");
  for (const g of m.grants ?? []) if (!contains(ROLES,g.role) || !Array.isArray(g.scopes) || g.scopes.some(s => !contains(SCOPES,s) || g.role === "STANDARD_USER" && s === "PLATFORM_AGGREGATE")) errors.push("INVALID_GRANT");
  if (!m.grants?.length) errors.push("MISSING_GRANT");
  if (["MEAN","MEDIAN","QUANTILE","RATIO","DISTINCT_COUNT","DERIVED","UNRESOLVED"].includes(m.aggregation) && (m.additive !== false || m.temporalAdditive)) errors.push("NON_ADDITIVE");
  if (m.time === "CURRENT_SNAPSHOT" && m.temporalAdditive) errors.push("SNAPSHOT_SUM");
  if (m.monetaryPolicy === "SEPARATE_CURRENCY_OPERATION" && !m.dimensions.includes("currency") && m.status !== "UNRESOLVED") errors.push("MONETARY_DIMENSION");
  if (m.aggregation === "RATIO" && (m.formula?.scale !== (m.unit === "percentage" ? 100 : 1))) errors.push("RATIO_SCALE");
  if (m.instrumentationDependent && m.backfill !== "NOT_BACKFILLABLE" && m.status !== "UNRESOLVED") errors.push("FABRICATED_BACKFILL");
  if (m.storageDependent && m.availability !== "DEFERRED_STORAGE_DEPENDENCY") errors.push("STORAGE_AVAILABILITY");
  if (m.externalDependent && m.availability !== "REQUIRES_EXTERNAL_INTEGRATION") errors.push("EXTERNAL_AVAILABILITY");
  if (m.dependencies.includes("RULE_POLICY") && m.availability !== "REQUIRES_POLICY") errors.push("UNCALIBRATED_RULE");
  if (m.grants?.some(g => g.scopes.includes("PRIVACY_SAFE_BENCHMARK")) && (!m.benchmark?.aggregateOnly || m.benchmark?.policy !== "REQUIRES_VALIDATION")) errors.push("BENCHMARK_POLICY");
  const expectedUnresolved = ["detail_ctr","demand_supply","return_sessions"].includes(m.id);
  if (expectedUnresolved !== (m.status === "UNRESOLVED")) errors.push("UNRESOLVED_ACCOUNTING");
  if (m.status === "UNRESOLVED" && (m.availability !== "UNRESOLVED" || m.formula?.kind !== "UNRESOLVED" || Object.keys(m.formula).length !== 1 || m.aggregation !== "UNRESOLVED" || m.dimensions.length !== 0 || !m.unresolved || m.unresolved.calculationEnabled !== false || m.unresolved.numerator !== "UNCERTIFIED" || m.unresolved.denominator !== "UNCERTIFIED" || m.unresolved.excludedConsumers.length !== 5)) errors.push("UNRESOLVED_CONTRACT");
 }
 return Object.freeze(errors);
}
