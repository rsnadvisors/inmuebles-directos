import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { buildInventoryDashboardView, parseInventoryDashboardFilters, type DashboardResponses, type DashboardAudience, type DashboardMetric } from "../app/lib/analytics/inventory-dashboard-view";
import type { InventoryQueryResult, InventoryResponse } from "../app/lib/analytics/inventory-query-contract";
import InventoryOverview from "../app/components/analytics/InventoryOverview";
import AccountLoading from "../app/cuenta/loading";
import { Overview } from "../app/admin/components";
import type { AdminSummary } from "../app/lib/admin-display";

function base(metric: InventoryQueryResult["metric"]): InventoryQueryResult {
 return { contractVersion:"1.0.0",metric,scope:"OWN_PROPERTY",filters:{},unit:"count",status:"AVAILABLE",value:null,groups:[],
 observedFrom:"2026-10-07T14:00:00Z",observedTo:"2026-10-07T14:00:02Z",consistency:"READ_INTERVAL" };
}
function ratio(metric: "publication_share"|"image_coverage",n:number,d:number):InventoryResponse {
 return {ok:true,result:{...base(metric),unit:"percentage",status:d?"AVAILABLE":"NO_DATA",value:d?n/d*100:null,numerator:n,denominator:d}};
}
function group(metric:InventoryQueryResult["metric"],dimension:InventoryQueryResult["dimension"],keys:string[],values:number[]):InventoryResponse {
 return {ok:true,result:{...base(metric),dimension,groups:keys.map((key,i)=>({key,reading:{status:"AVAILABLE",value:values[i]}}))}};
}
function readings():DashboardResponses {
 return { publication_share:ratio("publication_share",15,20),image_coverage:ratio("image_coverage",13,20),
 inventory_total:group("inventory_total","property_status",["published","draft","reserved","sold","rented","archived"],[15,1,1,1,1,1]),
 type_mix:group("type_mix","property_type",["house","apartment","land","office","commercial"],[5,4,4,4,3]),
 operation_mix:group("operation_mix","operation",["sale","rent"],[16,4]),
 currency_mix:group("currency_mix","currency",["PEN","USD"],[18,2]) };
}
function show(audience:DashboardAudience="own",data=readings()) {
 const view=buildInventoryDashboardView(audience,data); render(<InventoryOverview view={view}/>);return view;
}
const summary:AdminSummary={counts:Object.fromEntries(["profiles_total","auth_users_total","properties_total","published","draft","archived","reserved","sold","rented","sale","rent","today","7d","30d","views_raw_count","leads_raw_count","favorites_count"].map(k=>[k,3])),markets:[{currency:"PEN",listing:"sale",type:"house",count:3}]};
beforeEach(()=>vi.clearAllMocks());

describe("Phase 1 inventory presentation",()=>{
 it.each(["own","platform"] as const)("renders seven approved categories for %s",audience=>{
  const view=show(audience);
  expect(view.widgets).toHaveLength(7);
  expect(screen.getByRole("region",{name:audience==="own"?"Tus propiedades":"Inventario de la plataforma"})).toBeTruthy();
  expect(screen.getAllByRole("heading",{level:3})).toHaveLength(7);
  expect(screen.getAllByRole("progressbar")).toHaveLength(2);
  expect(screen.getByText("Estado actual")).toBeTruthy();
  expect(screen.getByText("Publicadas")).toBeTruthy();expect(screen.getByText("Archivadas")).toBeTruthy();
  for(const label of ["Casas","Departamentos","Terrenos","Oficinas","Locales comerciales","Venta","Alquiler","Soles (PEN)","Dólares (USD)"])expect(screen.getAllByText(label).length).toBeGreaterThan(0);
 });
 it("reuses total denominator, not scalar null of a grouped result",()=>{
  const view=show();expect(view.widgets[0].valueText).toBe("20");
  expect(screen.getByText("75%")).toBeTruthy();expect(screen.getByText("65%")).toBeTruthy();
  expect(screen.getByText("15 de 20 propiedades")).toBeTruthy();expect(screen.getByText("13 de 20 propiedades")).toBeTruthy();
 });
 it.each(["inventory_published","inventory_draft","inventory_archived","inventory_reserved","inventory_sold","inventory_rented"])("represents %s as its certified status bucket",id=>{
  const view=buildInventoryDashboardView("own",readings()), key=id.replace("inventory_","");
  const status=view.widgets.find(w=>w.id==="STATUS_BREAKDOWN")!;
  expect(status.rows?.find(r=>r.key===key)?.count).toBe(key==="published"?15:1);
 });
 it("declares image metadata and currency counts without overclaiming",()=>{
  show();expect(screen.getByText(/No evalúa la calidad ni comprueba si las fotos están disponibles/)).toBeTruthy();
  expect(screen.getByText(/no es el valor de las propiedades/)).toBeTruthy();
  expect(screen.queryByText(/tasa de éxito|rendimiento|valor de cartera/i)).toBeNull();
 });
 it.each(["own","platform"] as const)("distinguishes legitimate empty %s from error",audience=>{
  const view=show(audience,{publication_share:ratio("publication_share",0,0)});
  expect(view.empty).toBe(true);expect(view.widgets[0]).toMatchObject({state:"zero",valueText:"0"});
  expect(screen.getByText("0")).toBeTruthy();expect(screen.getByText("Sin propiedades para calcular este porcentaje.")).toBeTruthy();
  expect(screen.queryByText("0%")).toBeNull();
  expect(screen.getByRole("heading",{name:audience==="own"?"Aún no tienes propiedades":"No hay propiedades en la plataforma"})).toBeTruthy();
  expect(screen.queryByRole("link",{name:"Publicar una propiedad"})?.getAttribute("href")??null).toBe(audience==="own"?"/publicar":null);
 });
 it("real zero counts and percentages remain zero",()=>{
  const data=readings();data.publication_share=ratio("publication_share",0,20);data.image_coverage=ratio("image_coverage",0,20);
  data.inventory_total=group("inventory_total","property_status",["published","draft","reserved","sold","rented","archived"],[0,20,0,0,0,0]);
  const view=show("own",data);expect(view.empty).toBe(false);
  expect(screen.getAllByText("0%")).toHaveLength(2);
  expect(view.widgets.find(w=>w.id==="STATUS_BREAKDOWN")?.rows?.find(r=>r.key==="archived")?.text).toBe("0");
 });
 it("formats returned percentage once, without modifying the response",()=>{
  const data=readings();data.publication_share=ratio("publication_share",1,3);const raw=data.publication_share.ok?data.publication_share.result.value:null;
  const view=buildInventoryDashboardView("own",data);
  expect(view.widgets[1].valueText).toBe(new Intl.NumberFormat("es-PE",{style:"percent",maximumFractionDigits:1}).format(1/3));
  expect(data.publication_share.ok&&data.publication_share.result.value).toBe(raw);
 });
 it("local source failure does not fabricate zero or hide valid independent data",()=>{
  const data=readings();data.type_mix={ok:false,code:"QUERY_FAILED"};const view=show("own",data);
  expect(view.widgets.find(w=>w.id==="TYPE_BREAKDOWN")?.state).toBe("error");
  expect(view.widgets[0].valueText).toBe("20");expect(screen.getByText("75%")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toBe("No pudimos cargar este indicador. Vuelve a consultar.");
 });
 it("unavailable ratio makes total unavailable rather than summing status buckets",()=>{
  const data=readings();data.publication_share={ok:false,code:"QUERY_FAILED"};const view=show("own",data);
  expect(view.empty).toBe(false);expect(view.widgets[0].state).toBe("error");expect(view.widgets[1].state).toBe("error");
  expect(view.widgets[0].valueText).not.toBe("0");expect(screen.queryByRole("link",{name:"Publicar una propiedad"})).toBeNull();
 });
 it.each(["missing","duplicate","unknown","null","fraction"] as const)("rejects malformed %s groups, never invented zeros",mode=>{
  const data=readings();if(data.type_mix?.ok){const groups=[...data.type_mix.result.groups];
   if(mode==="missing")groups.pop();
   if(mode==="duplicate")groups[1]=groups[0];
   if(mode==="unknown")groups[0]={...groups[0],key:"SECRET_UNKNOWN"};
   if(mode==="null")groups[0]={...groups[0],reading:{status:"NO_DATA",value:null}};
   if(mode==="fraction")groups[0]={...groups[0],reading:{status:"AVAILABLE",value:1.5}};
   data.type_mix={ok:true,result:{...data.type_mix.result,groups}};
  }
  const view=show("own",data);expect(view.widgets.find(w=>w.id==="TYPE_BREAKDOWN")?.state).toBe("error");
  expect(screen.queryByText("SECRET_UNKNOWN")).toBeNull();
 });
 it("only admin status rows get existing allowlisted drilldown links",()=>{
  const own=buildInventoryDashboardView("own",readings()), admin=buildInventoryDashboardView("platform",readings());
  expect(own.widgets.find(w=>w.id==="STATUS_BREAKDOWN")?.rows?.every(r=>!r.href)).toBe(true);
  expect(admin.widgets.find(w=>w.id==="STATUS_BREAKDOWN")?.rows?.find(r=>r.key==="draft")?.href).toBe("/admin/propiedades?status=draft");
 });
 it("never fakes a consultation timestamp",()=>{
  const view=show();expect(view.queriedText).toContain("Consulta realizada el");
  const data=readings();for(const key of Object.keys(data) as DashboardMetric[]){const r=data[key];if(r?.ok)data[key]={ok:true,result:{...r.result,observedFrom:"bad",observedTo:"bad"}};}
  expect(buildInventoryDashboardView("own",data).queriedText).toBeNull();
  expect(screen.queryByText(/Última actualización|vs. mes|Últimos 30 días/)).toBeNull();
 });
 it("does not render internal states or forbidden analytics",()=>{
  show();expect(document.querySelectorAll("select")).toHaveLength(2);expect(document.querySelector("input")).toBeNull();
  expect(document.body.textContent).not.toMatch(/OWN_PROPERTY|PLATFORM_AGGREGATE|QUERY_FAILED|NO_DATA|inventory_total|detail_ctr|demand_supply|return_sessions|publisher|CTR|benchmark|Report Builder|WhatsApp|7 días|30 días/);
  expect(screen.getByRole("link",{name:"Consultar propiedades"}).getAttribute("href")).toBe("/mis-propiedades");
 });
 it("loading is neutral, readable and reveals no figures or identity",()=>{
  render(<AccountLoading/>);expect(screen.getByRole("status")).toBeTruthy();
  expect(document.body.textContent).toContain("Cargando Mi cuenta");expect(document.body.textContent).not.toMatch(/[0-9]|@|platform/);
 });
 it("uses native semantic alternatives and scoped responsive styles",()=>{
  show();expect(document.querySelectorAll("dl")).toHaveLength(4);
  expect(document.querySelectorAll('[aria-hidden="true"]')).toHaveLength(5);
  const css=readFileSync("app/components/analytics/inventory-overview.css","utf8");
  expect(css).toContain("@media(max-width:1000px)");expect(css).toContain("@media(max-width:700px)");
  expect(css).toContain("minmax(0,1fr)");expect(css).toContain("focus-visible");
 });
 it("legacy default Overview remains available without a new slot",()=>{
  render(<Overview summary={summary}/>);expect(screen.getByText("Inventario por mercado")).toBeTruthy();
  expect(screen.getByText("Actividad registrada")).toBeTruthy();expect(screen.getByText("Perfiles")).toBeTruthy();
 });
 it("new admin mode keeps operational legacy separately without duplicated inventory",()=>{
  const view=buildInventoryDashboardView("platform",readings());
  render(<Overview summary={summary} inventoryOverview={<InventoryOverview view={view}/>}/>);
  expect(screen.getByText("Registros administrativos existentes")).toBeTruthy();
  expect(screen.queryByText("Inventario por mercado")).toBeNull();expect(screen.queryByText("Estado del inventario")).toBeNull();
  expect(screen.getByText("Registros de vistas")).toBeTruthy();
  const bi=screen.getByRole("region",{name:"Inventario de la plataforma"});
  expect(within(bi).queryByText("Registros de vistas")).toBeNull();
 });
 it("legacy source failure does not erase authorized BI",()=>{
  render(<Overview summary={null} inventoryOverview={<InventoryOverview view={buildInventoryDashboardView("platform",readings())}/>}/>);
  expect(screen.getByText(/No pudimos cargar los registros administrativos/)).toBeTruthy();expect(screen.getByText("75%")).toBeTruthy();
 });
});

describe("Phase 2 filter contract and presentation",()=>{
 it.each(["house","apartment","land","office","commercial"])("accepts certified type %s",property_type=>{
  expect(parseInventoryDashboardFilters({property_type})).toEqual({property_type});
 });
 it.each(["sale","rent"])("accepts certified operation %s",operation=>{
  expect(parseInventoryDashboardFilters({operation})).toEqual({operation});
 });
 it.each([{}, {property_type:"",operation:""}, {property_type:" \t ",operation:null}, {property_type:undefined}])("normalizes neutral input %j",input=>{
  expect(parseInventoryDashboardFilters(input)).toEqual({});
 });
 it.each([{property_type:"villa"},{operation:"lease"},{operation:"SALE"},{property_type:" house "},{operation:["sale","sale"]},{operation:"x".repeat(1000)},{operation:"sale' OR 1=1"},{property_type:"<script>alert(1)</script>"},{scope:"PLATFORM_AGGREGATE"},{owner_id:"B"},{currency:"USD"},{property_status:"published"},{date:"today"},[],null])("refuses tampering %j",input=>{
  expect(()=>parseInventoryDashboardFilters(input)).toThrow();
 });
 it.each(["own","platform"] as const)("unfiltered view remains Phase 1 equivalent for %s",audience=>{
  expect(buildInventoryDashboardView(audience,readings(),{})).toEqual(buildInventoryDashboardView(audience,readings()));
 });
 it.each(["own","platform"] as const)("native labeled controls preserve URL cohort for %s",audience=>{
  render(<InventoryOverview view={buildInventoryDashboardView(audience,readings(),{property_type:"office",operation:"rent"})}/>);
  expect((screen.getByLabelText("Tipo de inmueble") as HTMLSelectElement).value).toBe("office");
  expect((screen.getByLabelText("Operación") as HTMLSelectElement).value).toBe("rent");
  const path=audience==="own"?"/cuenta":"/admin";
  expect(screen.getByRole("form").getAttribute("action")).toBe(path);expect(screen.getByRole("form").getAttribute("method")).toBe("get");
  expect(screen.getByRole("link",{name:"Limpiar filtros"}).getAttribute("href")).toBe(path);
  expect(screen.getByRole("link",{name:"Volver a consultar"}).getAttribute("href")).toBe(path+"?property_type=office&operation=rent");
  expect(screen.getByText(/Las proporciones corresponden a este inventario filtrado/)).toBeTruthy();
 });
 it.each(["own","platform"] as const)("filtered no-match is not an empty-account assertion for %s",audience=>{
  render(<InventoryOverview view={buildInventoryDashboardView(audience,{publication_share:ratio("publication_share",0,0)},{property_type:"land",operation:"rent"})}/>);
  expect(screen.getByText("No hay propiedades con estos filtros")).toBeTruthy();expect(screen.queryByText("Aún no tienes propiedades")).toBeNull();
  expect(screen.queryByRole("link",{name:"Publicar una propiedad"})).toBeNull();expect(screen.queryByText("0%")).toBeNull();
 });
});
