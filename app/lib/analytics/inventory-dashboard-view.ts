import type { InventoryResponse, InventoryQueryResult } from "./inventory-query-contract";

export type DashboardAudience = "own" | "platform";
export type DashboardMetric = "publication_share" | "inventory_total" | "type_mix" | "operation_mix" | "currency_mix" | "image_coverage";
export type DashboardResponses = Partial<Record<DashboardMetric, InventoryResponse>>;
export type WidgetId = "KPI_TOTAL" | "KPI_PUBLICATION_SHARE" | "IMAGE_COVERAGE" | "STATUS_BREAKDOWN" | "TYPE_BREAKDOWN" | "OPERATION_BREAKDOWN" | "CURRENCY_BREAKDOWN";
export type WidgetState = "value" | "zero" | "no-data" | "error";
export type DashboardRow = Readonly<{ key: string; label: string; count: number; text: string; href?: string }>;
export type DashboardWidget = Readonly<{ id: WidgetId; title: string; state: WidgetState; valueText: string; help: string; ratioText?: string; percentage?: number; rows?: readonly DashboardRow[] }>;
export type InventoryDashboardView = Readonly<{ audience: DashboardAudience; empty: boolean; title: string; queriedText: string | null; widgets: readonly DashboardWidget[] }>;

const integer = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("es-PE", { style: "percent", maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Lima" });
const statusLabels = { published: "Publicadas", draft: "Borradores", reserved: "Reservadas", sold: "Vendidas", rented: "Alquiladas", archived: "Archivadas" } as const;
const typeLabels = { house: "Casas", apartment: "Departamentos", land: "Terrenos", office: "Oficinas", commercial: "Locales comerciales" } as const;
const operationLabels = { sale: "Venta", rent: "Alquiler" } as const;
const currencyLabels = { PEN: "Soles (PEN)", USD: "Dólares (USD)" } as const;
const errorText = "No pudimos cargar este indicador. Vuelve a consultar.";
const noDataText = "Sin propiedades para calcular este porcentaje.";
function count(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function result(response?: InventoryResponse): InventoryQueryResult | undefined { return response?.ok === true ? response.result : undefined; }
/** Ratios stay backend values; only validate the returned shape and format at the UI boundary. */
function ratioShape(r?: InventoryQueryResult): r is InventoryQueryResult & { numerator: number; denominator: number } {
 return !!r && count(r.numerator) && count(r.denominator) && r.numerator <= r.denominator
  && (r.denominator === 0 ? r.status === "NO_DATA" && r.value === null
   : r.status === "AVAILABLE" && typeof r.value === "number" && Number.isFinite(r.value) && r.value >= 0 && r.value <= 100);
}
function widgetError(id: WidgetId, title: string, help: string): DashboardWidget {
 return { id, title, help, state: "error", valueText: errorText };
}
function percentageWidget(id: WidgetId, title: string, help: string, response?: InventoryResponse): DashboardWidget {
 const r = result(response);
 if (!ratioShape(r)) return widgetError(id, title, help);
 const ratioText = integer.format(r.numerator) + " de " + integer.format(r.denominator) + " propiedades";
 if (r.denominator === 0) return { id, title, help, state: "no-data", valueText: noDataText, ratioText };
 return { id, title, help, state: r.value === 0 ? "zero" : "value", valueText: percent.format(r.value! / 100), percentage: r.value!, ratioText };
}
function distribution(id: WidgetId, title: string, help: string, labels: Readonly<Record<string, string>>, response: InventoryResponse | undefined, audience: DashboardAudience): DashboardWidget {
 const r = result(response), keys = Object.keys(labels);
 if (!r || r.status !== "AVAILABLE" || !Array.isArray(r.groups) || r.groups.length !== keys.length
  || new Set(r.groups.map(g => g.key)).size !== keys.length) return widgetError(id, title, help);
 const rows: DashboardRow[] = [];
 for (const key of keys) {
  const g = r.groups.find(group => group.key === key);
  if (!g || g.reading.status !== "AVAILABLE" || !count(g.reading.value)) return widgetError(id, title, help);
  rows.push({ key, label: labels[key], count: g.reading.value, text: integer.format(g.reading.value),
   ...(id === "STATUS_BREAKDOWN" && audience === "platform" ? { href: "/admin/propiedades?status=" + key } : {}) });
 }
 return { id, title, help, state: rows.every(row => row.count === 0) ? "zero" : "value", valueText: "", rows };
}
export function buildInventoryDashboardView(audience: DashboardAudience, responses: DashboardResponses): InventoryDashboardView {
 const own = audience === "own", share = result(responses.publication_share);
 const totalTitle = own ? "Tus propiedades actuales" : "Propiedades de la plataforma";
 const total: DashboardWidget = ratioShape(share)
  ? { id: "KPI_TOTAL", title: totalTitle, state: share.denominator === 0 ? "zero" : "value", valueText: integer.format(share.denominator), help: "Incluye propiedades en todos los estados." }
  : widgetError("KPI_TOTAL", totalTitle, "Incluye propiedades en todos los estados.");
 const empty = ratioShape(share) && share.denominator === 0;
 const widgets: DashboardWidget[] = [
  total,
  percentageWidget("KPI_PUBLICATION_SHARE", own ? "Proporción de tus propiedades publicadas" : "Proporción del inventario publicado",
   "Publicadas entre todas las propiedades actuales.", responses.publication_share),
 ];
 if (!empty) widgets.push(
  percentageWidget("IMAGE_COVERAGE", own ? "Tus propiedades con imágenes registradas" : "Inventario con imágenes registradas",
   "Cuenta propiedades con al menos un registro de imagen. No evalúa la calidad ni comprueba si las fotos están disponibles.", responses.image_coverage),
  distribution("STATUS_BREAKDOWN", own ? "Estado de tus propiedades" : "Estado del inventario de la plataforma", "", statusLabels, responses.inventory_total, audience),
  distribution("TYPE_BREAKDOWN", own ? "Tipos de tus propiedades" : "Inventario por tipo", "Cantidad de propiedades por tipo.", typeLabels, responses.type_mix, audience),
  distribution("OPERATION_BREAKDOWN", own ? "Venta y alquiler" : "Inventario por operación", "", operationLabels, responses.operation_mix, audience),
  distribution("CURRENCY_BREAKDOWN", own ? "Monedas de tus anuncios" : "Monedas de los anuncios", "Cantidad de anuncios por moneda; no es el valor de las propiedades.", currencyLabels, responses.currency_mix, audience),
 );
 const readings = Object.values(responses).map(result).filter((r): r is InventoryQueryResult => !!r);
 const from = readings.map(r => Date.parse(r.observedFrom)), to = readings.map(r => Date.parse(r.observedTo));
 const validTimes = from.length > 0 && [...from, ...to].every(Number.isFinite) && readings.every(r => Date.parse(r.observedFrom) <= Date.parse(r.observedTo));
 let queriedText: string | null = null;
 if (validTimes) {
  const first = date.format(new Date(Math.min(...from))), last = date.format(new Date(Math.max(...to)));
  queriedText = "Consulta realizada el " + first + (first === last ? "" : " – " + last);
 }
 return { audience, empty, title: own ? "Tus propiedades" : "Inventario de la plataforma", queriedText, widgets };
}
