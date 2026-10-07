import Link from "next/link";
import { redirect } from "next/navigation";
import SignOutButton from "../components/SignOutButton";
import { getVerifiedUser } from "../lib/auth-server";
import { DashboardAuthorizationError } from "../lib/admin-auth-server";
import { loadOwnInventoryOverview } from "../lib/analytics/inventory-dashboard-server";
import InventoryOverview from "../components/analytics/InventoryOverview";
import type { InventoryDashboardView } from "../lib/analytics/inventory-dashboard-view";
import { InventoryFilterError, parseInventoryDashboardFilters } from "../lib/analytics/inventory-dashboard-view";

export const dynamic = "force-dynamic";

export default async function Account({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const { client, user } = await getVerifiedUser();
  if (!client || !user) redirect("/login?returnTo=/cuenta");
  const { data: profile } = await client.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const display = typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name.trim() : user.email || "Mi cuenta";
  let analytics: InventoryDashboardView;
  try { analytics = await loadOwnInventoryOverview(parseInventoryDashboardFilters(await searchParams ?? {})); }
  catch (error) {
   if (error instanceof InventoryFilterError) return <main className="account-page"><h1>Revisa los filtros</h1><p role="alert">{error.message}</p><Link href="/cuenta">Limpiar filtros</Link></main>;
   if (error instanceof DashboardAuthorizationError && error.status === 401) redirect("/login?returnTo=/cuenta");
   return <main className="account-page"><h1>Mi cuenta</h1><p role="alert">No pudimos verificar o cargar tu inventario. Vuelve a intentarlo.</p><Link href="/mis-propiedades">Mis propiedades</Link><SignOutButton /><a href="/cuenta">Volver a consultar</a></main>;
  }
  return <main className="account-page"><Link className="geo-logo" href="/" aria-label="Inmuebles Directos Perú, inicio">Inmuebles<span> Directos</span><small>Perú</small></Link><h1>Mi cuenta</h1><p>{display}</p>{user.email && <p>{user.email}</p>}<Link href="/mis-propiedades">Mis propiedades</Link><SignOutButton /><InventoryOverview view={analytics} /></main>;
}
