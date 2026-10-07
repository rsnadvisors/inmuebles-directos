import "server-only";
import { CONTRACT_VERSION } from "./contract";
import {
 INVENTORY_VALUES, InventoryQueryError, parseInventoryQuery, assertInventorySemantics,
 type InventoryQuery, type InventoryDimension, type InventoryFilters, type InventoryScope,
 type InventoryResponse, type InventoryReading, type InventoryQueryResult,
} from "./inventory-query-contract";
import { createInventoryQueryContext, assertVerifiedInventoryContext, type InventoryQueryContext } from "./inventory-query-context";
import { exactInventoryCount, inventoryCountReading, inventoryPercentage } from "./inventory-results";

const COLUMNS = Object.freeze({ property_type: "property_type", operation: "listing_type", property_status: "status", currency: "currency" } as const);
const STATUS_METRICS = Object.freeze({
 inventory_published: "published", inventory_draft: "draft", inventory_archived: "archived",
 inventory_reserved: "reserved", inventory_sold: "sold", inventory_rented: "rented",
} as const);

/** Exact parent count; empty image embed filters parents without returning image rows. */
async function countProperties(context: InventoryQueryContext, filters: InventoryFilters, options: { status?: string; hasImage?: boolean } = {}) {
 assertVerifiedInventoryContext(context);
 if (options.status && filters.property_status && options.status !== filters.property_status) return 0;
 let query = context.client.from("properties").select(options.hasImage ? "id,property_images()" : "id", { count: "exact", head: true });
 if (context.scope === "OWN_PROPERTY") query = query.eq("owner_id", context.userId);
 for (const dimension of Object.keys(filters) as InventoryDimension[]) query = query.eq(COLUMNS[dimension], filters[dimension]!);
 if (options.status && !filters.property_status) query = query.eq("status", options.status);
 if (options.hasImage) query = query.not("property_images", "is", null);
 const response = await query.abortSignal(AbortSignal.timeout(8000));
 if (response.error) throw new InventoryQueryError("QUERY_FAILED");
 return exactInventoryCount(response.count);
}
async function reading(context: InventoryQueryContext, query: InventoryQuery, filters: InventoryFilters): Promise<InventoryReading> {
 if (query.metric === "publication_share" || query.metric === "image_coverage") {
  const denominator = await countProperties(context, filters);
  const numerator = await countProperties(context, filters, query.metric === "image_coverage" ? { hasImage: true } : { status: "published" });
  return inventoryPercentage(numerator, denominator);
 }
 const status = STATUS_METRICS[query.metric as keyof typeof STATUS_METRICS];
 return inventoryCountReading(await countProperties(context, filters, { status }));
}
function asFailure(error: unknown): InventoryResponse {
 return Object.freeze({ ok: false, code: error instanceof InventoryQueryError ? error.code : "QUERY_FAILED" });
}
/** Request-scoped entry point, no client, identity, context or role accepted from payload. */
export async function queryInventory(input: unknown, scope: InventoryScope): Promise<InventoryResponse> {
 try {
  const query = parseInventoryQuery(input);
  const context = await createInventoryQueryContext(scope);
  return await executeInventoryQuery(query, context);
 } catch (error) { return asFailure(error); }
}
/** Reject forged/cloned contexts even when TypeScript's structural type is bypassed. */
async function executeInventoryQuery(query: InventoryQuery, context: InventoryQueryContext): Promise<InventoryResponse> {
 try {
  assertVerifiedInventoryContext(context);
  const parsed = parseInventoryQuery(query);
  assertInventorySemantics(parsed, context.scope);
  const observedFrom = new Date().toISOString();
  let base: InventoryReading = Object.freeze({ status: "NO_DATA", value: null });
  const groups: { key: string; reading: InventoryReading }[] = [];
  if (parsed.dimension) {
   for (const key of INVENTORY_VALUES[parsed.dimension]) {
    // Do not override a client cohort filter while evaluating an enum bucket.
    const conflict = parsed.filters[parsed.dimension] && parsed.filters[parsed.dimension] !== key;
    const ratio = parsed.metric === "publication_share" || parsed.metric === "image_coverage";
    const groupReading = conflict ? (ratio ? inventoryPercentage(0, 0) : inventoryCountReading(0))
     : await reading(context, parsed, { ...parsed.filters, [parsed.dimension]: key });
    groups.push(Object.freeze({ key, reading: groupReading }));
   }
   // A distribution is represented by groups, never a fabricated scalar sum/percentage.
   base = Object.freeze({ status: groups.some(g => g.reading.status === "AVAILABLE") ? "AVAILABLE" : "NO_DATA", value: null });
  } else base = await reading(context, parsed, parsed.filters);
  const result: InventoryQueryResult = Object.freeze({
   contractVersion: CONTRACT_VERSION, metric: parsed.metric, dimension: parsed.dimension,
   scope: context.scope, filters: parsed.filters,
   unit: parsed.metric === "publication_share" || parsed.metric === "image_coverage" ? "percentage" : "count",
   ...base, groups: Object.freeze(groups), observedFrom, observedTo: new Date().toISOString(), consistency: "READ_INTERVAL",
  });
  return Object.freeze({ ok: true, result });
 } catch (error) { return asFailure(error); }
}
