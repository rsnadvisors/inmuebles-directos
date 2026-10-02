import { readAdminUsers, type AdminParams } from "../../lib/admin-data";
import { adminBoundary, AdminFilters, UserList, AdminPagination } from "../components";
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<AdminParams> }) {
  return adminBoundary(async () => { const params = await searchParams; const page = await readAdminUsers(params); return <><header className="admin-heading"><p className="admin-eyebrow">Cuentas · Solo lectura</p><h1>Usuarios</h1><p>Consulta perfiles y su inventario. No se permiten cambios de cuenta ni de rol.</p></header><AdminFilters kind="users" params={params} /><UserList rows={page.rows} /><AdminPagination path="/admin/usuarios" params={params} next={page.next} /></>; }, "/admin/usuarios");
}
