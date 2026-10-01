import { readAdminProperties, type AdminParams } from "../../lib/admin-data";
import { adminBoundary, AdminFilters, PropertyList, AdminPagination } from "../components";
export default async function AdminPropertiesPage({ searchParams }: { searchParams: Promise<AdminParams> }) {
  return adminBoundary(async () => { const params = await searchParams; const page = await readAdminProperties(params); return <><header className="admin-heading"><p className="admin-eyebrow">Inventario · Solo lectura</p><h1>Propiedades</h1><p>Filtra e inspecciona registros. No se pueden editar desde este panel.</p></header><AdminFilters kind="properties" params={params} /><PropertyList rows={page.rows} /><AdminPagination path="/admin/propiedades" params={params} next={page.next} /></>; }, "/admin/propiedades");
}
