import "server-only";
import { DashboardAuthorizationError } from "../admin-auth-server";
import { CONTRACT_VERSION } from "./contract";
import { queryInventory } from "./inventory-query-server";
import type { InventoryResponse, InventoryScope, InventoryDimension } from "./inventory-query-contract";
import { buildInventoryDashboardView, parseInventoryDashboardFilters, type InventoryAnalyticsFilters, type DashboardResponses, type DashboardMetric, type InventoryDashboardView } from "./inventory-dashboard-view";

type Request = Readonly<{ metric: DashboardMetric; dimension?: InventoryDimension }>;
const requests: readonly Request[] = Object.freeze([
 { metric: "inventory_total", dimension: "property_status" },
 { metric: "type_mix", dimension: "property_type" },
 { metric: "operation_mix", dimension: "operation" },
 { metric: "currency_mix", dimension: "currency" },
 { metric: "image_coverage" },
]);
function assertAccess(response: InventoryResponse, request: Request, scope: InventoryScope, filters: InventoryAnalyticsFilters) {
 if (response.ok === false) {
  if (response.code === "UNAUTHORIZED") throw new DashboardAuthorizationError(401);
  if (response.code === "FORBIDDEN") throw new DashboardAuthorizationError(403);
  if (response.code !== "QUERY_FAILED") throw new DashboardAuthorizationError(503);
  return;
 }
 const r = response.result;
 if (r.scope !== scope) throw new DashboardAuthorizationError(403);
 const unit = request.metric === "publication_share" || request.metric === "image_coverage" ? "percentage" : "count";
 if (r.metric !== request.metric || r.dimension !== request.dimension || r.unit !== unit || !r.filters
  || Object.keys(r.filters).length !== Object.keys(filters).length || Object.entries(r.filters).some(([key, value]) => !Object.hasOwn(filters, key) || filters[key as keyof InventoryAnalyticsFilters] !== value)
  || r.contractVersion !== CONTRACT_VERSION || r.consistency !== "READ_INTERVAL") throw new DashboardAuthorizationError(503);
}
async function read(request: Request, scope: InventoryScope, filters: InventoryAnalyticsFilters): Promise<InventoryResponse> {
 try { return await queryInventory(Object.keys(filters).length ? { ...request, filters } : request, scope); }
 catch (error) {
  if (error instanceof DashboardAuthorizationError) throw error;
  return { ok: false, code: "QUERY_FAILED" };
 }
}
/** Composition only: fixed scope, closed cohort filters, no DB/client/context construction. */
async function load(scope: InventoryScope, input: InventoryAnalyticsFilters): Promise<InventoryDashboardView> {
 const filters = parseInventoryDashboardFilters(input);
 const audience = scope === "OWN_PROPERTY" ? "own" : "platform";
 const first: Request = { metric: "publication_share" };
 const response = await read(first, scope, filters);
 assertAccess(response, first, scope, filters);
 const responses: DashboardResponses = { publication_share: response };
 if (buildInventoryDashboardView(audience, responses, filters).empty) return buildInventoryDashboardView(audience, responses, filters);
 let next = 0;
 async function worker() {
  while (next < requests.length) {
   const request = requests[next++];
   const reading = await read(request, scope, filters);
   assertAccess(reading, request, scope, filters);
   responses[request.metric] = reading;
  }
 }
 // Buffer results; no numbers can stream before every authorization decision is known.
 const settled = await Promise.allSettled([worker(), worker()]);
 const failure = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
 if (failure) throw failure.reason;
 return buildInventoryDashboardView(audience, responses, filters);
}
export function loadOwnInventoryOverview(filters: InventoryAnalyticsFilters = {}) { return load("OWN_PROPERTY", filters); }
export function loadPlatformInventoryOverview(filters: InventoryAnalyticsFilters = {}) { return load("PLATFORM_AGGREGATE", filters); }
