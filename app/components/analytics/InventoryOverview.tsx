import Link from "next/link";
import type { InventoryDashboardView, DashboardWidget } from "../../lib/analytics/inventory-dashboard-view";
import { typeLabels, operationLabels } from "../../lib/analytics/inventory-dashboard-view";
import "./inventory-overview.css";

function Reading({ widget }: { widget: DashboardWidget }) {
 if (widget.state === "error") return <p className="inventory-bi-error" role="alert">{widget.valueText}</p>;
 if (widget.state === "no-data") return <p className="inventory-bi-muted">{widget.valueText}</p>;
 return <><p className="inventory-bi-value">{widget.valueText}</p>{widget.ratioText && <p className="inventory-bi-muted">{widget.ratioText}</p>}
  {typeof widget.percentage === "number" && <progress max={100} value={widget.percentage} aria-label={widget.title} />}</>;
}
function Breakdown({ widget }: { widget: DashboardWidget }) {
 if (widget.state === "error") return <p className="inventory-bi-error" role="alert">{widget.valueText}</p>;
 const rows = widget.rows ?? [], largest = Math.max(0, ...rows.map(row => row.count));
 return <dl className="inventory-bi-breakdown">{rows.map(row => <div key={row.key}><dt>{row.href ? <Link href={row.href}>{row.label}</Link> : row.label}</dt><dd>{row.text}</dd>
  {widget.id === "TYPE_BREAKDOWN" && <span className="inventory-bi-track" aria-hidden="true"><span style={{ width: largest ? row.count / largest * 100 + "%" : "0%" }} /></span>}
 </div>)}</dl>;
}
export default function InventoryOverview({ view }: { view: InventoryDashboardView }) {
 const own = view.audience === "own", destination = own ? "/cuenta" : "/admin";
 const filters = view.filters ?? {}, filtered = Object.keys(filters).length > 0;
 const query = new URLSearchParams();
 if (filters.property_type) query.set("property_type", filters.property_type);
 if (filters.operation) query.set("operation", filters.operation);
 const cards = view.widgets.filter(widget => ["KPI_TOTAL", "KPI_PUBLICATION_SHARE", "IMAGE_COVERAGE"].includes(widget.id));
 const panels = view.widgets.filter(widget => !cards.includes(widget));
 return <section className="inventory-bi" aria-label={view.title}>
  <header className="inventory-bi-heading"><p className="inventory-bi-eyebrow">Estado actual</p><h2>{view.title}</h2>
   <p>Incluye propiedades en todos los estados.</p>{view.queriedText && <p className="inventory-bi-muted">{view.queriedText}</p>}
   <p className="inventory-bi-muted">Los indicadores pueden reflejar momentos ligeramente distintos.</p>
  </header>
  <form className="inventory-bi-filters" method="get" action={destination} aria-label="Filtrar indicadores del inventario">
   <div><label htmlFor="inventory-bi-type">Tipo de inmueble</label><select id="inventory-bi-type" name="property_type" defaultValue={filters.property_type ?? ""}><option value="">Todos los tipos</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
   <div><label htmlFor="inventory-bi-operation">Operación</label><select id="inventory-bi-operation" name="operation" defaultValue={filters.operation ?? ""}><option value="">Todas las operaciones</option>{Object.entries(operationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
   <button type="submit">Aplicar filtros</button><a href={destination}>Limpiar filtros</a>
  </form>
  {filtered && <p className="inventory-bi-cohort">Indicadores dentro de los filtros aplicados a {own ? "tus propiedades" : "las propiedades de la plataforma"}: {filters.property_type ? typeLabels[filters.property_type] : "Todos los tipos"} · {filters.operation ? operationLabels[filters.operation] : "Todas las operaciones"}. Las proporciones corresponden a este inventario filtrado.</p>}
  <div className="inventory-bi-cards">{cards.map(widget => <article key={widget.id} className="inventory-bi-card"><h3>{widget.title}</h3><Reading widget={widget} /><p className="inventory-bi-muted">{widget.help}</p></article>)}</div>
  {view.empty ? <div className="inventory-bi-empty"><h3>{filtered ? "No hay propiedades con estos filtros" : own ? "Aún no tienes propiedades" : "No hay propiedades en la plataforma"}</h3>{!filtered && own && <Link href="/publicar">Publicar una propiedad</Link>}</div>
   : <div className="inventory-bi-panels">{panels.map(widget => <section key={widget.id} className="inventory-bi-panel" aria-label={widget.title}><h3>{widget.title}</h3><Breakdown widget={widget} />{widget.help && <p className="inventory-bi-muted">{widget.help}</p>}</section>)}</div>}
  {filtered && view.audience === "platform" && <p className="inventory-bi-muted">Los enlaces de gestión de propiedades conservan sus filtros propios; no incluyen estos filtros de indicadores.</p>}
  <nav className="inventory-bi-actions" aria-label="Acciones del inventario"><Link href={own ? "/mis-propiedades" : "/admin/propiedades"}>Consultar propiedades</Link><a href={destination + (filtered ? "?" + query.toString() : "")}>Volver a consultar</a></nav>
 </section>;
}
