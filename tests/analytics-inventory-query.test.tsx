import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { queryInventory } from "../app/lib/analytics/inventory-query-server";
import { createInventoryQueryContext, assertVerifiedInventoryContext } from "../app/lib/analytics/inventory-query-context";
import { parseInventoryQuery, INVENTORY_METRICS, INVENTORY_DIMENSIONS, type InventoryScope } from "../app/lib/analytics/inventory-query-contract";
import { inventoryPercentage } from "../app/lib/analytics/inventory-results";
import { METRICS, DIMENSIONS } from "../app/lib/analytics/registry";
import { getMetricReadiness, isDimensionAllowedForMetric } from "../app/lib/analytics/semantics";

const stubs = vi.hoisted(() => ({ verified: vi.fn(), rpc: vi.fn(), from: vi.fn(), storage: vi.fn() }));
vi.mock("../app/lib/auth-server", () => ({ getVerifiedUser: stubs.verified }));
type Row = { id: string; owner_id: string | null; status: string; property_type: string; listing_type: string; currency: string; images: number };
const seed: Row[] = [
 { id: "a1", owner_id: "A", status: "published", property_type: "house", listing_type: "sale", currency: "PEN", images: 3 },
 { id: "a2", owner_id: "A", status: "draft", property_type: "land", listing_type: "sale", currency: "USD", images: 0 },
 { id: "b1", owner_id: "B", status: "published", property_type: "office", listing_type: "rent", currency: "USD", images: 1 },
 { id: "legacy", owner_id: null, status: "published", property_type: "commercial", listing_type: "rent", currency: "USD", images: 1 },
];
let rows: Row[], actor: string, approved: boolean, error: unknown, badCount: unknown, injectedCounts: number[];
let calls: { fields: string; options: unknown; predicates: [string, unknown][]; image: boolean; signal?: AbortSignal }[];
function clientFor() {
 return {
  rpc: stubs.rpc,
  from: stubs.from,
  get storage(): never { stubs.storage(); throw new Error("Storage forbidden"); },
 };
}
beforeEach(() => {
 rows = seed.map(x => ({ ...x })); actor = "A"; approved = false; error = null; badCount = undefined; injectedCounts = []; calls = [];
 stubs.verified.mockReset().mockImplementation(async () => ({ client: clientFor(), user: { id: actor } }));
 stubs.rpc.mockReset().mockImplementation(async (name: string) => ({ data: name === "dashboard_access" && approved, error: null }));
 stubs.from.mockReset().mockImplementation((table: string) => {
  expect(table).toBe("properties");
  return { select: (fields: string, options: unknown) => {
   const call = { fields, options, predicates: [] as [string, unknown][], image: false, signal: undefined as AbortSignal | undefined }; calls.push(call);
   const q = {
    eq: (field: string, value: unknown) => { call.predicates.push([field, value]); return q; },
    not: (field: string, op: string, value: unknown) => { expect([field, op, value]).toEqual(["property_images", "is", null]); call.image = true; return q; },
    abortSignal: (signal: AbortSignal) => { call.signal = signal; return q; },
    then: (fulfilled: (value: unknown) => unknown, rejected?: (error: unknown) => unknown) => {
     // Published peers are RLS-visible: the adapter must STILL impose ownership.
     const visible = rows.filter(x => approved || x.status === "published" || x.owner_id === actor);
     const count = visible.filter(x => call.predicates.every(([f, v]) => x[f as keyof Row] === v) && (!call.image || x.images > 0)).length;
     return Promise.resolve({ error, count: injectedCounts.length ? injectedCounts.shift() : badCount === undefined ? count : badCount }).then(fulfilled, rejected);
    },
   };
   return q;
  } };
 });
 stubs.storage.mockReset();
});
const run = (metric: string, extra: object = {}, scope: InventoryScope = "OWN_PROPERTY") => queryInventory({ metric, ...extra }, scope);
function success(response: Awaited<ReturnType<typeof run>>) {
 expect(response.ok).toBe(true); if (response.ok === false) throw new Error(response.code); return response.result;
}

describe("inventory phase 1 closed semantic boundary", () => {
 it("reconciles exactly 12/4 without modifying 46/18 or readiness", () => {
  expect(INVENTORY_METRICS).toHaveLength(12); expect(INVENTORY_DIMENSIONS).toHaveLength(4);
  expect(METRICS).toHaveLength(46); expect(DIMENSIONS).toHaveLength(18);
  expect(METRICS.filter(m => m.status === "UNRESOLVED").map(m => m.id)).toEqual(["detail_ctr","demand_supply","return_sessions"]);
  expect(METRICS.filter(m => getMetricReadiness(m.id) === "READY_NOW")).toHaveLength(0);
 });
 it.each(["detail_ctr","demand_supply","return_sessions","contact_rate","active_publishers","ask_median","price_change","unknown"])("denies %s without IO", async metric => {
  expect(await run(metric)).toEqual({ ok: false, code: "UNSUPPORTED_METRIC" }); expect(stubs.from).not.toHaveBeenCalled(); expect(stubs.verified).not.toHaveBeenCalled();
 });
 it.each(["publisher","property","district","date","session","region","price_band"])("denies dimension %s even admin", async dimension => {
  approved = true; expect(await run("inventory_total", { dimension }, "PLATFORM_AGGREGATE")).toEqual({ ok:false, code:"UNSUPPORTED_DIMENSION" }); expect(stubs.from).not.toHaveBeenCalled();
 });
 it.each([["type_mix","currency"],["operation_mix","property_status"],["currency_mix","property_type"]])("denies %s × %s", async (metric,dimension) => {
  expect(await run(metric,{ dimension })).toEqual({ ok:false, code:"UNSUPPORTED_COMBINATION" });
 });
 it.each(["property_type","operation","property_status","currency"])("enforces certified compatibility of %s grouping", async dimension => {
  for (const metric of INVENTORY_METRICS) {
   const compatible = isDimensionAllowedForMetric(dimension,metric,"STANDARD_USER","OWN_PROPERTY");
   const result = await run(metric,{ dimension });
   expect(result.ok).toBe(compatible);
  }
 });
 it.each([null,[],{}, {metric:"inventory_total",owner_id:"B"}, {metric:"inventory_total",scope:"PLATFORM_AGGREGATE"},
  {metric:"inventory_total",filters:{owner_id:"B"}},{metric:"inventory_total",filters:{currency:"USD,or(owner_id.eq.B)"}},
  {metric:"inventory_total",filters:{property_type:"castle"}},{metric:"inventory_total",filters:{operation:"lease"}},
  {metric:"inventory_total",filters:{property_status:"removed"}},{metric:"inventory_total",filters:{currency:0}},
  {metric:"inventory_total",filters:[]}])("rejects malformed/injected input %j", async input => {
  expect((await queryInventory(input,"OWN_PROPERTY")).ok).toBe(false); expect(stubs.from).not.toHaveBeenCalled();
 });
 it("rejects non-plain objects", () => expect(() => parseInventoryQuery(new Date())).toThrow());
});

describe("verified request scope", () => {
 it("does not include published peers or ownerless in own inventory", async () => {
  expect(success(await run("inventory_total")).value).toBe(2);
  expect(calls.every(c => c.predicates.some(p => p[0] === "owner_id" && p[1] === "A"))).toBe(true);
 });
 it("does not leak identity between requests", async () => {
  expect(success(await run("inventory_total")).value).toBe(2); actor="B";
  expect(success(await run("inventory_total")).value).toBe(1);
  expect(calls.at(-1)?.predicates).toContainEqual(["owner_id","B"]);
 });
 it("denies anonymous before reads", async () => {
  stubs.verified.mockResolvedValue({client:clientFor(),user:null});
  expect(await run("inventory_total")).toEqual({ok:false,code:"UNAUTHORIZED"}); expect(stubs.from).not.toHaveBeenCalled();
 });
 it("denies anonymous Auth identities", async () => {
  stubs.verified.mockResolvedValue({client:clientFor(),user:{id:"anonymous",is_anonymous:true}});
  expect(await run("inventory_total")).toEqual({ok:false,code:"UNAUTHORIZED"});
 });
 it("denies unapproved admin even with editable admin metadata", async () => {
  stubs.verified.mockResolvedValue({client:clientFor(),user:{id:"A",user_metadata:{role:"admin"}}});
  expect(await run("inventory_total",{},"PLATFORM_AGGREGATE")).toEqual({ok:false,code:"FORBIDDEN"}); expect(stubs.from).not.toHaveBeenCalled();
 });
 it("approved dashboard path includes ownerless without assigning owner", async () => {
  approved=true; expect(success(await run("inventory_total",{},"PLATFORM_AGGREGATE")).value).toBe(4);
  expect(stubs.rpc).toHaveBeenCalledWith("dashboard_access");
  expect(calls.every(c=> !c.predicates.some(p=>p[0]==="owner_id"))).toBe(true);
  expect(rows.find(r=>r.id==="legacy")?.owner_id).toBeNull();
 });
 it("rejects scope forged at runtime", async () => {
  expect(await queryInventory({metric:"inventory_total"},"OTHER" as InventoryScope)).toEqual({ok:false,code:"FORBIDDEN"});
 });
 it("denies fabricated and cloned contexts", async () => {
  const real=await createInventoryQueryContext("OWN_PROPERTY");
  expect(() => assertVerifiedInventoryContext({...real,scope:"PLATFORM_AGGREGATE"})).toThrow("FORBIDDEN");
  expect(stubs.from).not.toHaveBeenCalled();
 });
 it("does not cache admin approval", async () => {
  approved=true; expect((await run("inventory_total",{},"PLATFORM_AGGREGATE")).ok).toBe(true);
  approved=false; expect(await run("inventory_total",{},"PLATFORM_AGGREGATE")).toEqual({ok:false,code:"FORBIDDEN"});
 });
 it("sanitizes auth verification failures", async () => {
  stubs.verified.mockRejectedValue(new Error("SECRET_AUTH_DETAIL"));
  expect(await run("inventory_total")).toEqual({ok:false,code:"DATA_UNAVAILABLE"});
 });
 it("sanitizes admin predicate failure", async () => {
  stubs.rpc.mockResolvedValue({data:true,error:{message:"SECRET"}});
  expect(await run("inventory_total",{},"PLATFORM_AGGREGATE")).toEqual({ok:false,code:"DATA_UNAVAILABLE"});
 });
});

describe("exact counts, ratios and finite groups", () => {
 it("real installed SDK emits HEAD/exact/owner rather than downloading rows", async () => {
  const {createClient}=await vi.importActual<typeof import("@supabase/supabase-js")>("@supabase/supabase-js");
  const requests:{url:URL;method:string;headers:Headers}[]=[];
  const transport=vi.fn(async (url:RequestInfo|URL,init?:RequestInit)=>{
   requests.push({url:new URL(String(url)),method:init?.method??"GET",headers:new Headers(init?.headers)});
   return new Response(null,{status:200,headers:{"content-range":"*/2"}});
  });
  const sdk=createClient("https://synthetic.example.invalid","synthetic-public-key",{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  stubs.verified.mockResolvedValue({client:sdk,user:{id:"A"}});
  expect(success(await run("inventory_total",{filters:{currency:"PEN"}})).value).toBe(2);
  expect(requests).toHaveLength(1); expect(requests[0].method).toBe("HEAD");
  expect(requests[0].headers.get("prefer")).toContain("count=exact");
  expect(requests[0].url.searchParams.get("owner_id")).toBe("eq.A");
  expect(requests[0].url.searchParams.get("currency")).toBe("eq.PEN");
  expect(requests[0].url.searchParams.get("select")).toBe("id");
 });
 it("real SDK builds image parent semijoin and normalizes exact headers", async () => {
  const {createClient}=await vi.importActual<typeof import("@supabase/supabase-js")>("@supabase/supabase-js");
  const requests:URL[]=[];
  const transport=vi.fn(async (url:RequestInfo|URL)=>{
   const u=new URL(String(url));requests.push(u);
   return new Response(null,{status:200,headers:{"content-range":u.searchParams.has("property_images")?"*/1":"*/2"}});
  });
  const sdk=createClient("https://synthetic.example.invalid","synthetic-public-key",{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  stubs.verified.mockResolvedValue({client:sdk,user:{id:"A"}});
  expect(success(await run("image_coverage")).value).toBe(50);
  expect(requests[1].searchParams.get("select")).toBe("id,property_images()");
  expect(requests[1].searchParams.get("property_images")).toBe("not.is.null");
  expect(requests.every(u=>u.searchParams.get("owner_id")==="eq.A")).toBe(true);
 });
 it.each(["published","draft","archived","reserved","sold","rented"])("counts status %s", async status => {
  rows = ["published","draft","archived","reserved","sold","rented"].map((s,i)=>({...seed[0],id:String(i),status:s}));
  expect(success(await run("inventory_"+status)).value).toBe(1);
  expect(calls[0].options).toEqual({count:"exact",head:true});
 });
 it("preserves client status cohort instead of overriding it", async () => {
  expect(success(await run("inventory_published",{filters:{property_status:"draft"}})).value).toBe(0); expect(stubs.from).not.toHaveBeenCalled();
 });
 it.each([[0,0,null],[0,2,0],[2,2,100],[1,2,50],[1,3,100/3]])("percentage %i/%i yields %s", (n,d,value) => {
  const r=inventoryPercentage(n,d); if(value===null) expect(r.value).toBeNull(); else expect(r.value).toBeCloseTo(value,12); expect(r.status).toBe(d===0?"NO_DATA":"AVAILABLE");
 });
 it("publication_share has normal mixed cohort", async () => { const r=success(await run("publication_share")); expect([r.numerator,r.denominator,r.value]).toEqual([1,2,50]); });
 it("publication_share is 100 when all published", async () => { rows=[seed[0]]; expect(success(await run("publication_share")).value).toBe(100); });
 it("publication_share is real zero when none published", async () => { rows=[seed[1]]; expect(success(await run("publication_share")).value).toBe(0); });
 it("empty count differs from empty ratio", async () => {
  rows=[]; expect(success(await run("inventory_total")).value).toBe(0);
  const r=success(await run("publication_share")); expect(r.status).toBe("NO_DATA"); expect(r.value).toBeNull();
 });
 it("image coverage counts parent properties, not 3 child images", async () => {
  const r=success(await run("image_coverage")); expect([r.numerator,r.denominator,r.value]).toEqual([1,2,50]);
  expect(calls[1].fields).toBe("id,property_images()"); expect(calls[1].image).toBe(true); expect(stubs.storage).not.toHaveBeenCalled();
 });
 it("image coverage includes ownerless globally", async () => {
  approved=true; const r=success(await run("image_coverage",{},"PLATFORM_AGGREGATE")); expect([r.numerator,r.denominator,r.value]).toEqual([3,4,75]);
 });
 it("zero images is observed zero, not query failure", async () => {
  rows.forEach(r=>r.images=0); expect(success(await run("image_coverage")).value).toBe(0);
 });
 it.each([["type_mix","property_type",5],["operation_mix","operation",2],["currency_mix","currency",2]] as const)("finite %s", async (metric,dimension,n) => {
  const r=success(await run(metric)); expect(r.dimension).toBe(dimension); expect(r.status).toBe("AVAILABLE"); expect(r.value).toBeNull();
  expect(r.groups).toHaveLength(n); expect(r.groups.reduce((sum,g)=>sum+(g.reading.value??0),0)).toBe(2);
 });
 it("group filters do not broaden cohort", async () => {
  const r=success(await run("type_mix",{filters:{property_type:"house"}})); expect(r.groups.find(g=>g.key==="house")?.reading.value).toBe(1);
  expect(r.groups.filter(g=>g.key!=="house").every(g=>g.reading.value===0)).toBe(true);
 });
 it("grouped percentage uses independent bucket denominator, no averaging", async () => {
  const r=success(await run("publication_share",{dimension:"property_type"}));
  expect(r.groups.find(g=>g.key==="house")?.reading.value).toBe(100);
  expect(r.groups.find(g=>g.key==="land")?.reading.value).toBe(0);
  expect(r.groups.find(g=>g.key==="office")?.reading.status).toBe("NO_DATA");
 });
 it.each([null,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1,"2"])("rejects invalid exact count %s", async count => {
  badCount=count; expect(await run("inventory_total")).toEqual({ok:false,code:"QUERY_FAILED"});
 });
 it("does not return zero after error", async () => {
  error={message:"SECRET_DATABASE"}; expect(await run("inventory_total")).toEqual({ok:false,code:"QUERY_FAILED"});
 });
 it("rejects inconsistent numerator greater than denominator", async () => {
  injectedCounts=[1,2]; expect(await run("image_coverage")).toEqual({ok:false,code:"QUERY_FAILED"});
 });
 it("reports no successful partial groups after later failure", async () => {
  injectedCounts=[1]; badCount=null; expect(await run("type_mix")).toEqual({ok:false,code:"QUERY_FAILED"});
 });
 it("result declares read interval, exposes no identities or rows", async () => {
  const r=success(await run("inventory_total")); expect(r.consistency).toBe("READ_INTERVAL");
  expect(Date.parse(r.observedTo)).toBeGreaterThanOrEqual(Date.parse(r.observedFrom));
  expect(Object.keys(r)).not.toContain("userId"); expect(JSON.stringify(r)).not.toContain("owner_id");
  expect(calls.every(c=>!!c.signal)).toBe(true);
 });
 it("query modules are server-only and no UI calls them", () => {
  for (const file of ["inventory-query-server.ts","inventory-query-context.ts"])
   expect(readFileSync(resolve("app/lib/analytics",file),"utf8")).toContain('import "server-only"');
  const source=readFileSync(resolve("app/lib/analytics/inventory-query-server.ts"),"utf8");
  expect(source).not.toMatch(/\.storage|createSignedUrl|process\.env|\.insert\(|\.update\(|\.delete\(/);
 });
});
