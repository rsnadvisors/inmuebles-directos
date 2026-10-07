import Link from "next/link";
import type { InventoryDashboardView, DashboardWidget } from "../../lib/analytics/inventory-dashboard-view";
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
 const cards = view.widgets.filter(widget => ["KPI_TOTAL", "KPI_PUBLICATION_SHARE", "IMAGE_COVERAGE"].includes(widget.id));
 const panels = view.widgets.filter(widget => !cards.includes(widget));
 return <section className="inventory-bi" aria-label={view.title}>
  <header className="inventory-bi-heading"><p className="inventory-bi-eyebrow">Estado actual</p><h2>{view.title}</h2>
   <p>Incluye propiedades en todos los estados.</p>{view.queriedText && <p className="inventory-bi-muted">{view.queriedText}</p>}
   <p className="inventory-bi-muted">Los indicadores pueden reflejar momentos ligeramente distintos.</p>
  </header>
  <div className="inventory-bi-cards">{cards.map(widget => <article key={widget.id} className="inventory-bi-card"><h3>{widget.title}</h3><Reading widget={widget} /><p className="inventory-bi-muted">{widget.help}</p></article>)}</div>
  {view.empty ? <div className="inventory-bi-empty"><h3>{own ? "Aún no tienes propiedades" : "No hay propiedades en la plataforma"}</h3>{own && <Link href="/publicar">Publicar una propiedad</Link>}</div>
   : <div className="inventory-bi-panels">{panels.map(widget => <section key={widget.id} className="inventory-bi-panel" aria-label={widget.title}><h3>{widget.title}</h3><Breakdown widget={widget} />{widget.help && <p className="inventory-bi-muted">{widget.help}</p>}</section>)}</div>}
  <nav className="inventory-bi-actions" aria-label="Acciones del inventario"><Link href={own ? "/mis-propiedades" : "/admin/propiedades"}>Consultar propiedades</Link><a href={destination}>Volver a consultar</a></nav>
 </section>;
}
