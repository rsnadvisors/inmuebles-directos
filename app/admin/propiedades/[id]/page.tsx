import Link from "next/link";
import { readAdminProperty } from "../../../lib/admin-data";
import { adminBoundary, PropertyList } from "../../components";
import { adminDate } from "../../../lib/admin-display";
export default async function AdminPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  return adminBoundary(async () => { const { id } = await params; const p = await readAdminProperty(id); return <><header className="admin-heading"><p className="admin-eyebrow">Inspección · Solo lectura</p><h1>Registro de propiedad</h1><Link href="/admin/propiedades">← Volver al inventario</Link></header>{p ? <><PropertyList rows={[p]} /><section className="admin-panel"><h2>Identificación y fechas</h2><dl className="admin-breakdown"><div><dt>ID</dt><dd>{p.id}</dd></div><div><dt>Última actualización</dt><dd>{adminDate(p.updatedAt)}</dd></div></dl><p className="admin-muted">El contrato P0 incluye metadata. No expone galería, descripción ni atributos completos.</p>{p.status === "published" && p.slug && <Link href={`/inmueble/${encodeURIComponent(p.slug)}`}>Ver ficha pública →</Link>}</section></> : <section className="admin-empty"><h2>Registro no encontrado</h2><p>La propiedad solicitada no está disponible.</p></section>}</>; }, "/admin/propiedades");
}
