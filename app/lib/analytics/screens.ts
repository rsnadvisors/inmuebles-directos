import { freeze, type MetricId, type Role } from "./contract";
export type ScreenTrace = Readonly<{ id: string; role: Role; requiredMetrics: readonly MetricId[]; publisherBreakdownMetrics?: readonly MetricId[]; blockedMetrics: readonly MetricId[]; nonMetricDependencies: readonly ("ALLOWLISTED_QUERY_LAYER" | "SAVED_REPORT_DEFINITIONS")[] }>;
/** Discovery traceability, NOT rendered screens or an executable report definition.
 * Readiness for every metric must be checked; blockedMetrics are never usable.
 */
export const SCREEN_TRACEABILITY: readonly ScreenTrace[] = freeze([
 {
  "id": "executive",
  "role": "SUPER_ADMIN",
  "requiredMetrics": [
   "inventory_total",
   "inventory_published",
   "listing_creations",
   "image_coverage"
  ],
  "blockedMetrics": [],
  "nonMetricDependencies": []
 },
 {
  "id": "properties_intelligence",
  "role": "SUPER_ADMIN",
  "requiredMetrics": [
   "inventory_published",
   "inventory_draft",
   "age_published",
   "area_coverage"
  ],
  "blockedMetrics": [],
  "nonMetricDependencies": []
 },
 {
  "id": "demand_intelligence",
  "role": "SUPER_ADMIN",
  "requiredMetrics": [
   "impressions",
   "detail_views",
   "contact_rate"
  ],
  "blockedMetrics": [
   "detail_ctr",
   "demand_supply"
  ],
  "nonMetricDependencies": []
 },
 {
  "id": "pricing_intelligence",
  "role": "SUPER_ADMIN",
  "requiredMetrics": [
   "ask_median",
   "ask_mean",
   "ask_p25",
   "ask_p75",
   "ask_total_m2",
   "ask_built_m2",
   "price_change"
  ],
  "blockedMetrics": [],
  "nonMetricDependencies": []
 },
 {
  "id": "geographic_intelligence",
  "role": "SUPER_ADMIN",
  "requiredMetrics": [
   "location_mix"
  ],
  "blockedMetrics": [
   "demand_supply"
  ],
  "nonMetricDependencies": []
 },
 {
  "id": "publishers",
  "role": "SUPER_ADMIN",
  "requiredMetrics": [
   "active_publishers",
   "inventory_total",
   "image_coverage"
  ],
  // Distinct-owner KPI is an aggregate; stock/coverage are publisher breakdowns.
  "publisherBreakdownMetrics": ["inventory_total", "image_coverage"],
  "blockedMetrics": [],
  "nonMetricDependencies": []
 },
 {
  "id": "report_builder",
  "role": "SUPER_ADMIN",
  "requiredMetrics": [],
  "blockedMetrics": [
   "detail_ctr",
   "demand_supply",
   "return_sessions"
  ],
  "nonMetricDependencies": [
   "ALLOWLISTED_QUERY_LAYER"
  ]
 },
 {
  "id": "saved_reports",
  "role": "SUPER_ADMIN",
  "requiredMetrics": [],
  "blockedMetrics": [],
  "nonMetricDependencies": [
   "SAVED_REPORT_DEFINITIONS"
  ]
 },
 {
  "id": "overview",
  "role": "STANDARD_USER",
  "requiredMetrics": [
   "inventory_total",
   "inventory_published",
   "image_coverage"
  ],
  "blockedMetrics": [],
  "nonMetricDependencies": []
 },
 {
  "id": "my_properties",
  "role": "STANDARD_USER",
  "requiredMetrics": [
   "inventory_total",
   "age_published"
  ],
  "blockedMetrics": [],
  "nonMetricDependencies": []
 },
 {
  "id": "property_analytics",
  "role": "STANDARD_USER",
  "requiredMetrics": [
   "age_published",
   "detail_views",
   "contact_rate"
  ],
  "blockedMetrics": [
   "detail_ctr"
  ],
  "nonMetricDependencies": []
 },
 {
  "id": "benchmarking",
  "role": "STANDARD_USER",
  "requiredMetrics": [
   "ask_median",
   "ask_total_m2"
  ],
  "blockedMetrics": [
   "demand_supply"
  ],
  "nonMetricDependencies": []
 },
 {
  "id": "recommendations",
  "role": "STANDARD_USER",
  "requiredMetrics": [
   "completeness",
   "recommendation_count"
  ],
  "blockedMetrics": [],
  "nonMetricDependencies": []
 },
 {
  "id": "my_reports",
  "role": "STANDARD_USER",
  "requiredMetrics": [],
  "blockedMetrics": [],
  "nonMetricDependencies": [
   "SAVED_REPORT_DEFINITIONS"
  ]
 }
]);
