import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { METRIC_IDS, DIMENSION_IDS, TIME_POLICY, type Metric } from "../app/lib/analytics/contract";
import { METRICS, DIMENSIONS } from "../app/lib/analytics/registry";
import { SCREEN_TRACEABILITY } from "../app/lib/analytics/screens";
import { getMetric, getDimension, getMetricsForRole, getDimensionsForRole, getMetricReadiness, isMetricAllowedForRole, isDimensionAllowedForMetric, canRequestMetric, metricResult, ratioResult, pricePerSqmResult, unavailableResult, serializeRegistry, validateRegistry } from "../app/lib/analytics/semantics";

const unresolved = ["detail_ctr","demand_supply","return_sessions"] as const;
// Independent discovery manifest, not derived from registry under test.
const discovery = ["inventory_total","inventory_published","inventory_draft","inventory_archived","inventory_reserved","inventory_sold","inventory_rented","listing_creations","publication_records","publication_share","type_mix","operation_mix","currency_mix","location_mix","ask_median","ask_mean","ask_p25","ask_p75","ask_total_m2","ask_built_m2","age_published","image_coverage","area_coverage","contact_coverage","completeness","active_publishers","profile_stock","favorite_stock","legacy_view_rows","legacy_session_rows","legacy_leads","impressions","drawer_opens","detail_views","phone_clicks","whatsapp_clicks","contact_clicks","detail_ctr","contact_rate","zero_results","demand_supply","price_change","time_to_declared_close","seo_clicks","return_sessions","recommendation_count"];

describe("analytics semantic foundation", () => {
 it("reconciles exactly the 46 authoritative IDs", () => {
  expect([...METRIC_IDS].sort()).toEqual([...discovery].sort());
  expect(METRICS.map(m=>m.id).sort()).toEqual([...discovery].sort());
  expect(new Set(METRICS.map(m=>m.id)).size).toBe(46);
  expect(validateRegistry()).toEqual([]);
 });
 it("has unique dimensions and complete 14-screen traceability", () => {
  expect(DIMENSIONS).toHaveLength(18);
  expect(new Set(DIMENSION_IDS).size).toBe(18);
  expect(SCREEN_TRACEABILITY).toHaveLength(14);
  expect(new Set(SCREEN_TRACEABILITY.map(s=>s.id)).size).toBe(14);
  for(const s of SCREEN_TRACEABILITY) {
   for(const id of [...s.requiredMetrics,...s.blockedMetrics]) expect(getMetric(id)).toBeDefined();
   for(const id of s.requiredMetrics) expect(isMetricAllowedForRole(id,s.role)).toBe(true);
   for(const id of s.blockedMetrics) expect(getMetric(id).status).toBe("UNRESOLVED");
  }
 });
 it.each(unresolved)("retains %s while excluding all calculation consumers", id => {
  const m=getMetric(id);
  expect(m.status).toBe("UNRESOLVED");
  expect(m.availability).toBe("UNRESOLVED");
  expect(m.formula).toEqual({kind:"UNRESOLVED"});
  expect(m.unresolved).toMatchObject({calculationEnabled:false,numerator:"UNCERTIFIED",denominator:"UNCERTIFIED"});
  expect(m.unresolved.excludedConsumers).toEqual(["AGGREGATION","BENCHMARKING","SCORES","REPORT_BUILDER","RECOMMENDATIONS"]);
  expect(m.unresolved.ambiguity.length).toBeGreaterThan(20);
  expect(m.dimensions).toEqual([]);
  expect(getMetricReadiness(id)).toBe("UNRESOLVED");
  expect(canRequestMetric(id,"SUPER_ADMIN","PLATFORM_AGGREGATE")).toBe(false);
  expect(metricResult(id,0)).toEqual({state:"UNRESOLVED"});
  expect(metricResult(id,12)).not.toHaveProperty("value");
  expect(isDimensionAllowedForMetric("date",id,"SUPER_ADMIN","PLATFORM_AGGREGATE")).toBe(false);
 });
 it.each(["unknown","constructor","toString","__proto__",null,42,{}])("fails closed on unknown IDs/roles %s", value => {
  expect(getMetric(value)).toBeUndefined(); expect(getDimension(value)).toBeUndefined();
  expect(getMetricReadiness(value)).toBe("UNKNOWN");
  expect(canRequestMetric(value,"SUPER_ADMIN","PLATFORM_AGGREGATE")).toBe(false);
  expect(getMetricsForRole(value)).toEqual([]); expect(getDimensionsForRole(value)).toEqual([]);
  expect(metricResult(value,0)).toEqual({state:"UNAVAILABLE"});
 });
 it("standard metadata never advertises private platform scope", () => {
  for(const m of getMetricsForRole("STANDARD_USER")) {
   expect(m.grants.every(g=>g.role==="STANDARD_USER")).toBe(true);
   expect(m.grants.flatMap(g=>g.scopes)).not.toContain("PLATFORM_AGGREGATE");
  }
  expect(isMetricAllowedForRole("profile_stock","STANDARD_USER")).toBe(false);
  expect(isMetricAllowedForRole("active_publishers","STANDARD_USER")).toBe(false);
  expect(isMetricAllowedForRole("inventory_total","STANDARD_USER","PLATFORM_AGGREGATE")).toBe(false);
  expect(isMetricAllowedForRole("inventory_total","STANDARD_USER","OWN_PROPERTY")).toBe(true);
  expect(isMetricAllowedForRole("location_mix","STANDARD_USER","OWN_PROPERTY")).toBe(false);
  expect(isMetricAllowedForRole("location_mix","STANDARD_USER","PRIVACY_SAFE_BENCHMARK")).toBe(true);
 });
 it("benchmark semantics are aggregate-only and not yet ready", () => {
  expect(getMetric("ask_p25").benchmark).toMatchObject({policy:"REQUIRES_VALIDATION",minimumPropertiesProposal:10,minimumPublishersProposal:5,excludeOwn:true,aggregateOnly:true,complementarySuppression:true});
  expect(getMetricReadiness("ask_median","STANDARD_USER","PRIVACY_SAFE_BENCHMARK")).toBe("DEFERRED");
  expect(isDimensionAllowedForMetric("property","ask_median","STANDARD_USER","PRIVACY_SAFE_BENCHMARK")).toBe(false);
  expect(isDimensionAllowedForMetric("publisher","ask_median","STANDARD_USER","OWN_PROPERTY")).toBe(false);
 });
 it("only registered compatible metric/dimension/scope combinations pass", () => {
  expect(isDimensionAllowedForMetric("currency","ask_median","STANDARD_USER","OWN_PROPERTY")).toBe(true);
  expect(isDimensionAllowedForMetric("traffic_source","inventory_total","SUPER_ADMIN","PLATFORM_AGGREGATE")).toBe(false);
  expect(isDimensionAllowedForMetric("missing","inventory_total","SUPER_ADMIN","PLATFORM_AGGREGATE")).toBe(false);
  expect(isDimensionAllowedForMetric("currency","profile_stock","STANDARD_USER","OWN_PROPERTY")).toBe(false);
 });
 it("readiness does not confuse data sources with a deployed query layer", () => {
  expect(getMetricReadiness("inventory_total")).toBe("READY_AFTER_QUERY_LAYER");
  expect(getMetricReadiness("impressions")).toBe("REQUIRES_INSTRUMENTATION");
  expect(getMetricReadiness("seo_clicks")).toBe("REQUIRES_EXTERNAL_INTEGRATION");
  expect(getMetricReadiness("price_change")).toBe("DEFERRED");
  expect(getMetricReadiness("completeness")).toBe("DEFERRED");
  expect(METRICS.every(m=>getMetricReadiness(m.id)!=="READY_NOW")).toBe(true);
 });
 it("retains legacy uncertainty and prevents fabricated backfill", () => {
  expect(getMetric("legacy_view_rows")).toMatchObject({availability:"PARTIAL",backfill:"PARTIALLY_BACKFILLABLE"});
  expect(getMetric("listing_creations").backfill).toBe("PARTIALLY_BACKFILLABLE");
  expect(getMetric("impressions").backfill).toBe("NOT_BACKFILLABLE");
  expect(getMetric("price_change").backfill).toBe("NOT_BACKFILLABLE");
 });
 it("represents real zero separately from missing/untracked/unavailable/insufficient", () => {
  expect(metricResult("inventory_total",0)).toEqual({state:"ZERO",value:0});
  expect(metricResult("inventory_total",null)).toEqual({state:"NO_DATA"});
  expect(metricResult("impressions",0)).toEqual({state:"NOT_TRACKED"});
  expect(metricResult("seo_clicks",0)).toEqual({state:"UNAVAILABLE"});
  expect(unavailableResult("INSUFFICIENT_SAMPLE")).toEqual({state:"INSUFFICIENT_SAMPLE"});
  expect(unavailableResult("ZERO" as never)).toEqual({state:"UNAVAILABLE"});
 });
 it.each([NaN,Infinity,-1,0.5])("rejects invalid count readings %s", value => {
  expect(metricResult("inventory_total",value)).toEqual({state:"UNAVAILABLE"});
 });
 it("defines percentage points and unit ratios independently", () => {
  expect(ratioResult(42,100,100)).toEqual({state:"VALUE",value:42});
  expect(ratioResult(42,100,1)).toEqual({state:"VALUE",value:0.42});
  expect(getMetric("publication_share").formula.scale).toBe(100);
  expect(getMetric("contact_rate").formula.scale).toBe(1);
 });
 it.each([[1,0],[null,2],[2,null],[2,-1],[NaN,2],[1,Infinity]])("does not default invalid/missing ratios to zero (%s/%s)", (n,d) => {
  expect(ratioResult(n,d)).toEqual({state:"NO_DATA"});
 });
 it.each([[100,null],[100,0],[100,-2],[null,20],[-1,20],[Infinity,20]])("rejects unsafe price/area inputs (%s/%s)", (p,a) => {
  expect(pricePerSqmResult(p,a)).toEqual({state:"NO_DATA"});
 });
 it("preserves a valid zero price and differentiates total vs built area definitions", () => {
  expect(pricePerSqmResult(0,20)).toEqual({state:"ZERO",value:0});
  expect(pricePerSqmResult(100,20)).toEqual({state:"VALUE",value:5});
  expect(getMetric("ask_total_m2").formula.definition).not.toEqual(getMetric("ask_built_m2").formula.definition);
  expect(getMetric("ask_total_m2").monetaryPolicy).toBe("SEPARATE_CURRENCY_OPERATION");
 });
 it("does not add nonadditive aggregates or snapshots across time", () => {
  for(const id of ["ask_median","ask_mean","ask_p25","ask_p75","ask_total_m2","publication_share","legacy_session_rows","completeness"]) expect(getMetric(id).additive).toBe(false);
  expect(getMetric("inventory_total").temporalAdditive).toBe(false);
  expect(getMetric("listing_creations").temporalAdditive).toBe(true);
  expect(getMetric("ask_median").formula.quantile).toBe(.5);
  expect(TIME_POLICY).toMatchObject({storage:"UTC",display:"America/Lima",interval:"HALF_OPEN"});
 });
 it.each([
  ["duplicate ID",{id:"inventory_published"},"DUPLICATE_METRIC"],
  ["unknown dependency",{dependencies:["UNKNOWN_SOURCE"]},"INVALID_DEPENDENCY"],
  ["standard platform leakage",{grants:[{role:"STANDARD_USER",scopes:["PLATFORM_AGGREGATE"]}]},"INVALID_GRANT"],
  ["unknown dimension",{dimensions:["missing"]},"UNKNOWN_DIMENSION"],
  ["snapshot sum",{temporalAdditive:true},"SNAPSHOT_SUM"],
  ["storage incorrectly ready",{storageDependent:true},"STORAGE_AVAILABILITY"],
  ["external incorrectly ready",{externalDependent:true},"EXTERNAL_AVAILABILITY"],
  ["invalid category",{category:"BAD"},"INVALID_ENUM"],
  ["invalid backfill",{backfill:"BAD"},"INVALID_ENUM"]
 ])("validates malformed definitions: %s", (_name,patch,code) => {
  const changed=[{...METRICS[0],...patch} as Metric,...METRICS.slice(1)];
  expect(validateRegistry(changed)).toContain(code);
 });
 it("rejects a fabricated unresolved formula or reactivation", () => {
  const id=METRICS.findIndex(m=>m.id==="detail_ctr");
  const copy=[...METRICS];
  copy[id]={...copy[id],formula:{kind:"RATIO",definition:"synthetic unsupported"},status:"ACTIVE"};
  expect(validateRegistry(copy)).toContain("UNRESOLVED_ACCOUNTING");
 });
 it("rejects additive median, invented instrumentation history and duplicate dimension", () => {
  const median={...getMetric("ask_median"),additive:"DISJOINT_POPULATIONS"} as Metric;
  expect(validateRegistry(METRICS.map(m=>m.id===median.id?median:m))).toContain("NON_ADDITIVE");
  const impression={...getMetric("impressions"),backfill:"BACKFILLABLE"} as Metric;
  expect(validateRegistry(METRICS.map(m=>m.id===impression.id?impression:m))).toContain("FABRICATED_BACKFILL");
  expect(validateRegistry(METRICS,[...DIMENSIONS,DIMENSIONS[0]])).toContain("DUPLICATE_DIMENSION");
 });
 it("protects nested canonical metadata from mutation", () => {
  expect(Object.isFrozen(METRICS)).toBe(true);
  expect(Object.isFrozen(getMetric("inventory_total").grants[0].scopes)).toBe(true);
  expect(()=>{(getMetric("inventory_total").dimensions as unknown as string[]).push("bad");}).toThrow();
  expect(getMetric("inventory_total").dimensions).not.toContain("bad");
 });
 it("serializes deterministic inert metadata without side effects or secrets", () => {
  expect(serializeRegistry()).toBe(serializeRegistry());
  const parsed=JSON.parse(serializeRegistry());
  expect(parsed.metrics).toHaveLength(46);
  expect(serializeRegistry()).not.toMatch(/service_role|access_token|postgres:\/\/|eyJ/);
  for(const name of ["contract","registry","semantics","screens"]) {
   const text=readFileSync(resolve(process.cwd(),"app/lib/analytics",`${name}.ts`),"utf8");
   expect(text).not.toMatch(/from ["'].*(?:supabase|storage|publication|vault|auth-server)/i);
   expect(text).not.toMatch(/\bfetch\s*\(|\beval\s*\(|new Function\s*\(|\.from\s*\(|\.rpc\s*\(/);
  }
 });
});
