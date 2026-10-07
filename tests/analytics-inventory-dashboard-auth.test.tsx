import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { loadOwnInventoryOverview, loadPlatformInventoryOverview } from "../app/lib/analytics/inventory-dashboard-server";
import { DashboardAuthorizationError, requireDashboardAdmin } from "../app/lib/admin-auth-server";
import { AdminReadError } from "../app/lib/admin-data";
import Account from "../app/cuenta/page";
import AdminPage from "../app/admin/page";
import type { InventoryQueryResult, InventoryScope, InventoryResponse } from "../app/lib/analytics/inventory-query-contract";
import type { DashboardMetric } from "../app/lib/analytics/inventory-dashboard-view";
import { readFileSync } from "node:fs";

const stubs=vi.hoisted(()=>({verified:vi.fn(),query:vi.fn(),rpc:vi.fn(),profile:vi.fn(),legacy:vi.fn(),redirect:vi.fn()}));
vi.mock("../app/lib/auth-server",()=>({getVerifiedUser:stubs.verified}));
vi.mock("../app/lib/analytics/inventory-query-server",()=>({queryInventory:stubs.query}));
vi.mock("../app/lib/admin-data",async original=>({...await original<typeof import("../app/lib/admin-data")>(),readAdminSummary:stubs.legacy}));
vi.mock("next/navigation",()=>({redirect:stubs.redirect,useRouter:()=>({replace:vi.fn(),refresh:vi.fn()})}));

let approved:boolean,total:number,active:number,peak:number;
function response(metric:DashboardMetric,scope:InventoryScope):InventoryResponse {
 const ratio=metric==="publication_share"||metric==="image_coverage";
 const dimension=metric==="inventory_total"?"property_status":metric==="type_mix"?"property_type":metric==="operation_mix"?"operation":metric==="currency_mix"?"currency":undefined;
 const keys=metric==="inventory_total"?["published","draft","reserved","sold","rented","archived"]:metric==="type_mix"?["house","apartment","land","office","commercial"]:metric==="operation_mix"?["sale","rent"]:metric==="currency_mix"?["PEN","USD"]:[];
 const result:InventoryQueryResult={contractVersion:"1.0.0",metric,dimension,scope,filters:{},unit:ratio?"percentage":"count",
 status:ratio&&total===0?"NO_DATA":"AVAILABLE",value:ratio?(total?50:null):null,
 ...(ratio?{numerator:total/2,denominator:total}:{}),
 groups:keys.map((key,i)=>({key,reading:{status:"AVAILABLE",value:i===0?total:0}})),
 observedFrom:"2026-10-07T14:00:00Z",observedTo:"2026-10-07T14:00:03Z",consistency:"READ_INTERVAL"};
 return {ok:true,result};
}
function installSource(failure?:{metric:DashboardMetric;code:"QUERY_FAILED"|"UNAUTHORIZED"|"FORBIDDEN"|"DATA_UNAVAILABLE"|"UNSUPPORTED_METRIC"}) {
 stubs.query.mockImplementation(async (request:{metric:DashboardMetric},scope:InventoryScope)=>{
  active++;peak=Math.max(peak,active);
  try {
   if(scope==="PLATFORM_AGGREGATE")await requireDashboardAdmin();
   await Promise.resolve();
   if(failure?.metric===request.metric)return {ok:false,code:failure.code};
   return response(request.metric,scope);
  } finally {active--;}
 });
}
beforeEach(()=>{
 approved=false;total=20;active=0;peak=0;
 stubs.verified.mockReset();stubs.query.mockReset();stubs.rpc.mockReset();stubs.profile.mockReset();stubs.legacy.mockReset();stubs.redirect.mockReset();
 const client={rpc:stubs.rpc,from:vi.fn(()=>({select:vi.fn(()=>({eq:stubs.profile}))}))};
 stubs.profile.mockReturnValue({maybeSingle:async()=>({data:{full_name:"Fixture propia"}})});
 stubs.verified.mockResolvedValue({client,user:{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",email:"fixture@example.invalid",user_metadata:{role:"admin"}}});
 stubs.rpc.mockImplementation(async()=>({data:approved,error:null}));
 stubs.legacy.mockResolvedValue({counts:Object.fromEntries(["profiles_total","today","7d","30d","views_raw_count","leads_raw_count","favorites_count"].map(k=>[k,2])),markets:[]});
 stubs.redirect.mockImplementation((url:string)=>{throw new Error("REDIRECT:"+url);});
 installSource();
});

describe("server-only UI composition",()=>{
 it("own wrapper requests fixed capabilities and enforces bounded concurrency",async()=>{
  const view=await loadOwnInventoryOverview();expect(view.audience).toBe("own");expect(view.widgets).toHaveLength(7);
  expect(stubs.query).toHaveBeenCalledTimes(6);expect(stubs.query.mock.calls[0]).toEqual([{metric:"publication_share"},"OWN_PROPERTY"]);
  expect(stubs.query.mock.calls.every(([r,scope])=>scope==="OWN_PROPERTY"&&!Object.hasOwn(r,"owner_id")&&!Object.hasOwn(r,"filters"))).toBe(true);
  expect(stubs.query.mock.calls.map(([r])=>r.metric).sort()).toEqual(["publication_share","inventory_total","type_mix","operation_mix","currency_mix","image_coverage"].sort());
  expect(peak).toBeLessThanOrEqual(2);expect(peak).toBe(2);
 });
 it("client arguments cannot choose role or owner",async()=>{
  await Reflect.apply(loadOwnInventoryOverview,null,[{scope:"PLATFORM_AGGREGATE",owner_id:"B"}]);
  expect(stubs.query.mock.calls.every(([,scope])=>scope==="OWN_PROPERTY")).toBe(true);
 });
 it("zero cohort skips five additional requests without fabricated readings",async()=>{
  total=0;const view=await loadOwnInventoryOverview();
  expect(stubs.query).toHaveBeenCalledTimes(1);expect(view.empty).toBe(true);expect(view.widgets).toHaveLength(2);
  expect(view.widgets[0]).toMatchObject({state:"zero",valueText:"0"});expect(view.widgets[1].state).toBe("no-data");
 });
 it("platform wrapper retains existing effective approval mechanism",async()=>{
  approved=true;const view=await loadPlatformInventoryOverview();expect(view.audience).toBe("platform");
  expect(stubs.rpc).toHaveBeenCalledWith("dashboard_access");expect(stubs.query.mock.calls.every(([,s])=>s==="PLATFORM_AGGREGATE")).toBe(true);
 });
 it("platform wrapper refuses a role claim without membership",async()=>{
  await expect(loadPlatformInventoryOverview()).rejects.toMatchObject({status:403});expect(stubs.rpc).toHaveBeenCalledWith("dashboard_access");
 });
 it.each([["UNAUTHORIZED",401],["FORBIDDEN",403],["DATA_UNAVAILABLE",503],["UNSUPPORTED_METRIC",503]] as const)("late %s discards all successful private readings",async(code,status)=>{
  installSource({metric:"currency_mix",code});await expect(loadOwnInventoryOverview()).rejects.toMatchObject({status});
 });
 it("source failure is localized and total does not become zero",async()=>{
  installSource({metric:"type_mix",code:"QUERY_FAILED"});const view=await loadOwnInventoryOverview();
  expect(view.widgets.find(w=>w.id==="TYPE_BREAKDOWN")?.state).toBe("error");expect(view.widgets[0].valueText).toBe("20");
 });
 it("initial source failure cannot be mistaken for an empty cohort",async()=>{
  installSource({metric:"publication_share",code:"QUERY_FAILED"});const view=await loadOwnInventoryOverview();
  expect(view.empty).toBe(false);expect(view.widgets[0].state).toBe("error");expect(stubs.query).toHaveBeenCalledTimes(6);
 });
 it("sanitizes thrown backend failures instead of exposing private text",async()=>{
  stubs.query.mockRejectedValue(new Error("PRIVATE_SQL_TOKEN"));
  const view=await loadOwnInventoryOverview();expect(JSON.stringify(view)).not.toContain("PRIVATE_SQL_TOKEN");expect(view.widgets.every(w=>w.state==="error")).toBe(true);
 });
 it("rejects mismatched scope in a returned result before UI mapping",async()=>{
  stubs.query.mockResolvedValue(response("publication_share","PLATFORM_AGGREGATE"));
  await expect(loadOwnInventoryOverview()).rejects.toMatchObject({status:403});
 });
 it.each(["unit","metric","filters","dimension","version"] as const)("fails closed on unexpected %s metadata",async field=>{
  const r=response("publication_share","OWN_PROPERTY");if(r.ok){
   const result={...r.result};
   if(field==="unit")result.unit="count";
   if(field==="metric")result.metric="inventory_total";
   if(field==="filters")result.filters={currency:"USD"};
   if(field==="dimension")result.dimension="currency";
   if(field==="version")result.contractVersion="bad" as "1.0.0";
   stubs.query.mockResolvedValue({ok:true,result});
  }
  await expect(loadOwnInventoryOverview()).rejects.toMatchObject({status:503});
 });
 it("does not cache identity or results between requests",async()=>{
  expect((await loadOwnInventoryOverview()).widgets[0].valueText).toBe("20");
  total=8;expect((await loadOwnInventoryOverview()).widgets[0].valueText).toBe("8");expect(stubs.query).toHaveBeenCalledTimes(12);
 });
 it("does not add a client/query/Storage/analytics API",()=>{
  const server=readFileSync("app/lib/analytics/inventory-dashboard-server.ts","utf8");
  expect(server).toContain('import "server-only"');expect(server).not.toMatch(/\.from\(|\.rpc\(|\.storage|createClient|process\.env|eval\(/);
  const presentation=readFileSync("app/components/analytics/InventoryOverview.tsx","utf8");
  expect(presentation).not.toContain('"use client"');expect(presentation).not.toContain("supabase");
 });
});

describe("existing routes and effective guards",()=>{
 it("account preserves identity, management, signout and own inventory",async()=>{
  render(await Account());expect(screen.getByRole("heading",{name:"Mi cuenta",level:1})).toBeTruthy();
  expect(screen.getByText("Fixture propia")).toBeTruthy();expect(screen.getByRole("link",{name:"Mis propiedades"}).getAttribute("href")).toBe("/mis-propiedades");
  expect(screen.getByRole("region",{name:"Tus propiedades"})).toBeTruthy();expect(screen.getAllByText("50%")).toHaveLength(2);
  expect(stubs.profile).toHaveBeenCalledWith("id","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  expect(stubs.query.mock.calls.every(([,scope])=>scope==="OWN_PROPERTY")).toBe(true);
 });
 it("missing account session redirects before any BI source",async()=>{
  stubs.verified.mockResolvedValue({client:null,user:null});await expect(Account()).rejects.toThrow("REDIRECT:/login?returnTo=/cuenta");
  expect(stubs.query).not.toHaveBeenCalled();
 });
 it("late account authorization failure hides every figure",async()=>{
  installSource({metric:"type_mix",code:"FORBIDDEN"});render(await Account());
  expect(screen.getByRole("alert")).toBeTruthy();expect(screen.queryByText("20")).toBeNull();expect(screen.queryByRole("region",{name:"Tus propiedades"})).toBeNull();
 });
 it("late account 401 uses existing login return path",async()=>{
  installSource({metric:"type_mix",code:"UNAUTHORIZED"});await expect(Account()).rejects.toThrow("REDIRECT:/login?returnTo=/cuenta");
 });
 it("non-member admin never obtains BI or legacy summary",async()=>{
  render(await AdminPage());expect(screen.getByRole("heading",{name:"Acceso restringido"})).toBeTruthy();expect(stubs.query).not.toHaveBeenCalled();expect(stubs.legacy).not.toHaveBeenCalled();
 });
 it("admin without identity redirects using current adminBoundary",async()=>{
  stubs.verified.mockResolvedValue({client:null,user:null});await expect(AdminPage()).rejects.toThrow("REDIRECT:/login?returnTo=%2Fadmin");
 });
 it("approved admin receives platform UI and separated P0 data",async()=>{
  approved=true;render(await AdminPage());
  expect(screen.getByRole("region",{name:"Inventario de la plataforma"})).toBeTruthy();expect(screen.getByText("Registros administrativos existentes")).toBeTruthy();
  expect(screen.getByRole("heading",{name:"Resumen",level:1})).toBeTruthy();expect(stubs.query.mock.calls.every(([,s])=>s==="PLATFORM_AGGREGATE")).toBe(true);
 });
 it("approved platform zero is empty rather than unavailable",async()=>{
  approved=true;total=0;render(await AdminPage());expect(screen.getByText("No hay propiedades en la plataforma")).toBeTruthy();expect(stubs.query).toHaveBeenCalledTimes(1);
 });
 it("legacy source failure stays local while valid BI remains",async()=>{
  approved=true;stubs.legacy.mockRejectedValue(new AdminReadError());render(await AdminPage());
  expect(screen.getByText(/No pudimos cargar los registros administrativos/)).toBeTruthy();expect(screen.getByRole("region",{name:"Inventario de la plataforma"})).toBeTruthy();
 });
 it("legacy authorization failure hides BI and every operational figure",async()=>{
  approved=true;stubs.legacy.mockRejectedValue(new DashboardAuthorizationError(403));render(await AdminPage());
  expect(screen.getByText("Acceso restringido")).toBeTruthy();expect(screen.queryByRole("region",{name:"Inventario de la plataforma"})).toBeNull();
 });
 it("late platform authorization failure cannot render partial successful figures",async()=>{
  approved=true;installSource({metric:"image_coverage",code:"FORBIDDEN"});render(await AdminPage());
  expect(screen.getByText("Acceso restringido")).toBeTruthy();expect(screen.queryByText("20")).toBeNull();expect(screen.queryByText("Registros administrativos existentes")).toBeNull();
 });
});
