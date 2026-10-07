import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardAuthorizationError } from "../lib/admin-auth-server";
import { AdminInputError, type AdminParams } from "../lib/admin-data";
import { adminStatuses, adminTypes, adminOperations, adminRoles, adminDate, type AdminProperty, type AdminUser, type AdminSummary } from "../lib/admin-display";
import { formatPrice } from "../lib/inventory";

export function AdminNotice({ status }: { status: 403 | 503 }) {
  return <main className="admin-notice"><p className="admin-eyebrow">Panel administrativo</p><h1>{status === 403 ? "Acceso restringido" : "Panel temporalmente no disponible"}</h1><p role="alert">{status === 403 ? "Tu cuenta no tiene acceso al panel administrativo." : "No pudimos verificar o cargar el panel. Inténtalo más tarde."}</p><Link href="/cuenta">Ir a Mi cuenta</Link><Link href="/">Volver al sitio</Link></main>;
}
export async function adminBoundary(load: () => Promise<React.ReactNode>, destination = "/admin"): Promise<React.ReactNode> {
  try { return await load(); }
  catch (error) {
    if (error instanceof DashboardAuthorizationError && error.status === 401) redirect(`/login?returnTo=${encodeURIComponent(destination)}`);
    if (error instanceof DashboardAuthorizationError && error.status === 403) return <AdminNotice status={403} />;
    if (error instanceof AdminInputError) return <section className="admin-empty"><h1>Revisa los filtros</h1><p role="alert">{error.message}</p><Link href={destination}>Limpiar filtros</Link></section>;
    return <AdminNotice status={503} />;
  }
}
export function Overview({ summary, inventoryOverview }: { summary: AdminSummary | null; inventoryOverview?: React.ReactNode }) {
  if (inventoryOverview !== undefined) return <><header className="admin-heading"><p className="admin-eyebrow">Vista general · Solo lectura</p><h1>Resumen</h1><p>Consulta el inventario y las cuentas sin modificar sus datos.</p></header>
   {inventoryOverview}
   <details className="admin-panel inventory-bi-legacy"><summary>Registros administrativos existentes</summary><p className="admin-muted">Estos registros operativos están separados del inventario BI.</p>
    {summary ? <><h2>Perfiles</h2><p>{summary.counts.profiles_total.toLocaleString("es-PE")}</p><h2>Actividad registrada</h2><dl className="admin-breakdown">
     {[["Creadas hoy (Lima)", "today"], ["Creadas en 7 días", "7d"], ["Creadas en 30 días", "30d"], ["Registros de vistas", "views_raw_count"], ["Registros de consultas", "leads_raw_count"], ["Favoritos", "favorites_count"]].map(([label,key]) => <div key={key}><dt>{label}</dt><dd>{summary.counts[key]}</dd></div>)}
    </dl><p className="admin-muted">Vistas y consultas son conteos de registros, no personas únicas.</p></>
     : <p role="alert">No pudimos cargar los registros administrativos. Inténtalo más tarde.</p>}
   </details></>;
  if (!summary) return <AdminNotice status={503} />;
  const c = summary.counts;
  const metrics = [["Propiedades", "properties_total"], ["Publicadas", "published"], ["Borradores", "draft"], ["Perfiles", "profiles_total"]];
  return <><header className="admin-heading"><p className="admin-eyebrow">Vista general · Solo lectura</p><h1>Resumen</h1><p>Consulta el inventario y las cuentas sin modificar sus datos.</p></header><section className="admin-metrics" aria-label="Indicadores principales">{metrics.map(([label, key]) => <article key={key}><span>{label}</span><strong>{c[key].toLocaleString("es-PE")}</strong></article>)}</section>
    <div className="admin-overview-grid"><section className="admin-panel"><h2>Estado del inventario</h2><dl className="admin-breakdown">{Object.entries(adminStatuses).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{c[key]}</dd></div>)}</dl><Link href="/admin/propiedades">Consultar propiedades →</Link></section>
    <section className="admin-panel"><h2>Actividad registrada</h2><dl className="admin-breakdown">{[["Creadas hoy (Lima)", "today"], ["Creadas en 7 días", "7d"], ["Creadas en 30 días", "30d"], ["Registros de vistas", "views_raw_count"], ["Registros de consultas", "leads_raw_count"], ["Favoritos", "favorites_count"]].map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{c[key]}</dd></div>)}</dl><p className="admin-muted">Vistas y consultas son conteos de registros, no personas únicas.</p></section></div>
    <section className="admin-panel"><h2>Inventario por mercado</h2>{summary.markets.length ? <ul className="admin-market-list">{summary.markets.map((m, index) => <li key={index}><span>{m.type ? adminTypes[m.type] : "Tipo no registrado"} · {m.listing ? adminOperations[m.listing] : "Operación no registrada"} · {m.currency ?? "Moneda no registrada"}</span><strong>{m.count}</strong></li>)}</ul> : <p>No hay inventario para mostrar.</p>}</section></>;
}
export function AdminFilters({ kind, params }: { kind: "properties" | "users"; params: AdminParams }) {
  const value = (key: string) => typeof params[key] === "string" ? params[key] : "";
  const path = kind === "properties" ? "/admin/propiedades" : "/admin/usuarios";
  return <form className="admin-filters" action={path} method="get"><label>Buscar<input name="q" type="search" maxLength={80} defaultValue={value("q")} placeholder={kind === "properties" ? "Título, código o slug" : "Nombre o correo"} /></label>
    {kind === "properties" && <><label>Estado<select name="status" defaultValue={value("status")}><option value="">Todos</option>{Object.entries(adminStatuses).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label>Operación<select name="listing" defaultValue={value("listing")}><option value="">Todas</option>{Object.entries(adminOperations).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label>Tipo<select name="type" defaultValue={value("type")}><option value="">Todos</option>{Object.entries(adminTypes).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label>Ciudad<input name="city" maxLength={120} defaultValue={value("city")} /></label><label>Distrito<input name="district" maxLength={120} defaultValue={value("district")} /></label><label className="admin-check"><input type="checkbox" name="ownerless" value="true" defaultChecked={value("ownerless") === "true"} />Sin propietario asignado</label></>}
    <button type="submit">Aplicar filtros</button><Link className="admin-secondary" href={path}>Limpiar</Link></form>;
}
export function PropertyList({ rows }: { rows: AdminProperty[] }) {
  if (!rows.length) return <section className="admin-empty"><h2>No se encontraron propiedades</h2><p>Prueba otros filtros o limpia la búsqueda.</p></section>;
  return <div className="admin-records">{rows.map(p => <article className="admin-record" key={p.id}><div className="admin-record-heading"><div><p className="admin-eyebrow">{p.code || "Sin código"}</p><h2>{p.title}</h2></div><span className="admin-badge">{adminStatuses[p.status]}</span></div><strong className="admin-price">{formatPrice(p.price, p.currency)}</strong><dl className="admin-record-grid"><div><dt>Tipo / operación</dt><dd>{p.type ? adminTypes[p.type] : "No registrado"} · {p.listing ? adminOperations[p.listing] : "No registrada"}</dd></div><div><dt>Ubicación</dt><dd>{[p.district, p.city].filter(Boolean).join(", ") || "No registrada"}</dd></div><div><dt>Propietario</dt><dd>{p.owner ? "Propietario asignado" : "Sin propietario asignado"}</dd></div><div><dt>Agente</dt><dd>{p.agent ? "Agente asignado" : "Sin agente asignado"}</dd></div><div><dt>Creación</dt><dd>{adminDate(p.createdAt)}</dd></div><div><dt>Publicación</dt><dd>{adminDate(p.publishedAt)}</dd></div></dl><Link href={`/admin/propiedades/${p.id}`}>Inspeccionar registro →</Link></article>)}</div>;
}
export function UserList({ rows }: { rows: AdminUser[] }) {
  return <><p className="admin-callout">El rol Administrador no implica aprobación para el Dashboard. Este listado no expone el estado de aprobación.</p>{!rows.length ? <section className="admin-empty"><h2>No se encontraron usuarios</h2><p>Prueba otro nombre o correo.</p></section> : <div className="admin-records">{rows.map(u => <article className="admin-record" key={u.id}><div className="admin-record-heading"><h2>{u.name || "Nombre no registrado"}</h2><span className="admin-badge">{adminRoles[u.role]}</span></div><p className="admin-email">{u.email || "Correo no registrado"}</p><dl className="admin-record-grid"><div><dt>Perfil creado</dt><dd>{adminDate(u.createdAt)}</dd></div><div><dt>Propiedades</dt><dd>{u.properties}</dd></div><div><dt>Publicadas</dt><dd>{u.published}</dd></div><div><dt>Borradores</dt><dd>{u.drafts}</dd></div></dl></article>)}</div>}</>;
}
export function AdminPagination({ params, path, next }: { params: AdminParams; path: string; next: { before: string; beforeId: string } | null }) {
  const query = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (typeof value === "string" && !["before", "beforeId"].includes(key)) query.set(key, value);
  const start = query.size ? `${path}?${query}` : path;
  if (next) { query.set("before", next.before); query.set("beforeId", next.beforeId); }
  return <nav className="admin-pagination" aria-label="Paginación"><Link href={start}>Primera página</Link>{next ? <Link href={`${path}?${query}`} rel="next">Siguiente página →</Link> : <span>Fin de los resultados</span>}</nav>;
}
