/**
 * Semantic metadata only: role filtering is NOT authorization.
 * Consumers must verify getUser + dashboard_access/private approval or own-property
 * ownership on server AND DB. No query, event collection or formula execution here.
 */
export const CONTRACT_VERSION = "1.0.0" as const;
export const TIME_POLICY = Object.freeze({ storage: "UTC", display: "America/Lima", interval: "HALF_OPEN", week: "ISO", incompletePeriods: "MATCH_ELAPSED_DURATION" } as const);
export const METRIC_IDS = ["inventory_total","inventory_published","inventory_draft","inventory_archived","inventory_reserved","inventory_sold","inventory_rented","listing_creations","publication_records","publication_share","type_mix","operation_mix","currency_mix","location_mix","ask_median","ask_mean","ask_p25","ask_p75","ask_total_m2","ask_built_m2","age_published","image_coverage","area_coverage","contact_coverage","completeness","active_publishers","profile_stock","favorite_stock","legacy_view_rows","legacy_session_rows","legacy_leads","impressions","drawer_opens","detail_views","phone_clicks","whatsapp_clicks","contact_clicks","detail_ctr","contact_rate","zero_results","demand_supply","price_change","time_to_declared_close","seo_clicks","return_sessions","recommendation_count"] as const;
export const DIMENSION_IDS = ["property","property_type","operation","property_status","currency","region","city","district","price_band","area_band","created_date","published_date","date","publisher","surface","event_name","traffic_source","device"] as const;
export const ROLES = ["SUPER_ADMIN", "STANDARD_USER"] as const;
export const SCOPES = ["PLATFORM_AGGREGATE", "OWN_PROPERTY", "PRIVACY_SAFE_BENCHMARK"] as const;
export const CATEGORIES = ["INVENTORY", "PRICING", "QUALITY", "AUDIENCE", "DEMAND", "HISTORY", "SEO", "RECOMMENDATION"] as const;
export const UNITS = ["count", "currency", "currency_per_sqm", "percentage", "ratio", "days", "score"] as const;
export const AGGREGATIONS = ["COUNT", "DISTINCT_COUNT", "MEAN", "MEDIAN", "QUANTILE", "RATIO", "LAST_VALUE", "SUM_COUNTS", "DERIVED", "UNRESOLVED"] as const;
export const AVAILABILITIES = ["AVAILABLE", "PARTIAL", "NOT_TRACKED", "REQUIRES_EXTERNAL_INTEGRATION", "REQUIRES_POLICY", "DEFERRED_STORAGE_DEPENDENCY", "UNKNOWN", "UNRESOLVED"] as const;
export const BACKFILLS = ["BACKFILLABLE", "PARTIALLY_BACKFILLABLE", "NOT_BACKFILLABLE", "NOT_APPLICABLE", "UNKNOWN"] as const;
export const DEPENDENCIES = ["PROPERTY_CURRENT", "IMAGE_METADATA", "PROFILE_CURRENT", "FAVORITE_CURRENT", "LEGACY_VIEWS", "LEGACY_LEADS", "ANALYTICS_EVENTS", "CONTACT_EVENTS", "SEARCH_EVENTS", "PROPERTY_HISTORY", "SEARCH_CONSOLE", "RULE_POLICY", "QUERY_LAYER", "BENCHMARK_POLICY", "STORAGE_PUBLICATION_INTERNALS"] as const;
export const STATUSES = ["ACTIVE", "PROPOSED", "DEFERRED", "UNRESOLVED", "DEPRECATED"] as const;
export const PRIVACY_CLASSES = ["PLATFORM_INTERNAL", "USER_PRIVATE", "PRIVACY_SAFE_BENCHMARK", "SENSITIVE_INTERNAL"] as const;
export type MetricId = typeof METRIC_IDS[number];
export type DimensionId = typeof DIMENSION_IDS[number];
export type Role = typeof ROLES[number];
export type Scope = typeof SCOPES[number];
export type Dependency = typeof DEPENDENCIES[number];
export type Grant = Readonly<{ role: Role; scopes: readonly Scope[] }>;
export type Readiness = "READY_NOW" | "READY_AFTER_QUERY_LAYER" | "REQUIRES_INSTRUMENTATION" | "REQUIRES_EXTERNAL_INTEGRATION" | "DEFERRED" | "UNKNOWN" | "UNRESOLVED";
export type Formula = Readonly<{ kind: "COUNT" | "DISTINCT" | "MEAN" | "QUANTILE" | "MEDIAN_OF_VALID_RATIOS" | "PERCENTAGE" | "RATIO" | "DIFFERENCE" | "ELAPSED_DAYS" | "SUM_COUNTS" | "PROPOSED_RULE" | "UNRESOLVED"; definition?: string; quantile?: number; scale?: 1 | 100 }>;
export type UnresolvedContract = Readonly<{ ambiguity: string; missingDecision: string; numerator: "UNCERTIFIED"; denominator: "UNCERTIFIED"; calculationEnabled: false; excludedConsumers: readonly ["AGGREGATION", "BENCHMARKING", "SCORES", "REPORT_BUILDER", "RECOMMENDATIONS"] }>;
export type Metric = Readonly<{
 id: MetricId; label: string; description: string; category: typeof CATEGORIES[number];
 unit: typeof UNITS[number]; valueType: "NUMBER"; aggregation: typeof AGGREGATIONS[number];
 additive: false | "DISJOINT_POPULATIONS" | "DISJOINT_EVENTS"; temporalAdditive: boolean;
 formula: Formula; availability: typeof AVAILABILITIES[number]; backfill: typeof BACKFILLS[number];
 grants: readonly Grant[]; dimensions: readonly DimensionId[]; dependencies: readonly Dependency[];
 time: "CURRENT_SNAPSHOT" | "SURVIVING_COHORT" | "EVENT_PERIOD" | "HISTORICAL_PERIOD";
 nullBehavior: "NO_DATA"; zeroBehavior: "ONLY_OBSERVED_VALID_ZERO";
 privacyByScope: Readonly<Record<Scope, typeof PRIVACY_CLASSES[number]>>; privacy: typeof PRIVACY_CLASSES[number]; storageDependent: boolean; instrumentationDependent: boolean; externalDependent: boolean;
 monetaryPolicy: "SEPARATE_CURRENCY_OPERATION" | "NOT_MONETARY";
 benchmark: Readonly<{ aggregateOnly: true; excludeOwn: true; minimumPropertiesProposal: 10; minimumPublishersProposal: 5; policy: "REQUIRES_VALIDATION"; complementarySuppression: true }> | null;
 status: typeof STATUSES[number]; caveats: readonly string[]; unresolved: UnresolvedContract | null;
}>;
export type Dimension = Readonly<{ id: DimensionId; label: string; description: string; dataType: "identifier" | "category" | "date"; privacy: typeof PRIVACY_CLASSES[number]; cardinality: "LOW" | "MEDIUM" | "HIGH"; grants: readonly Grant[]; instrumentationDependent: boolean; storageDependent: false; families: readonly (typeof CATEGORIES[number])[] }>;

export function freeze<T>(value: T): T {
 if (value && typeof value === "object") {
  Object.values(value).forEach(freeze);
  Object.freeze(value);
 }
 return value;
}
