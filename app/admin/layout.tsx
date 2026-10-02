import Link from "next/link";
import SignOutButton from "../components/SignOutButton";
import { requireDashboardAdmin } from "../lib/admin-auth-server";
import { adminBoundary } from "./components";
import "./admin.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Panel administrativo | Inmuebles Directos", robots: { index: false, follow: false } };
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  return adminBoundary(async () => {
    await requireDashboardAdmin();
    return <div className="admin-shell"><a className="admin-skip" href="#admin-content">Ir al contenido</a><header className="admin-header"><Link href="/admin" className="geo-logo">Inmuebles<span> Directos</span><small>Panel administrativo</small></Link><div><Link href="/cuenta">Mi cuenta</Link><SignOutButton /></div></header><div className="admin-workspace"><nav className="admin-nav" aria-label="Panel administrativo"><p className="admin-eyebrow">Solo lectura</p><Link href="/admin">Resumen</Link><Link href="/admin/propiedades">Propiedades</Link><Link href="/admin/usuarios">Usuarios</Link><Link href="/">Volver al sitio ↗</Link></nav><main id="admin-content" className="admin-content">{children}</main></div></div>;
  });
}
