import { readAdminSummary } from "../lib/admin-data";
import { adminBoundary, Overview } from "./components";
import { requireDashboardAdmin, DashboardAuthorizationError } from "../lib/admin-auth-server";
import { loadPlatformInventoryOverview } from "../lib/analytics/inventory-dashboard-server";
import InventoryOverview from "../components/analytics/InventoryOverview";
import { InventoryFilterError, parseInventoryDashboardFilters, type InventoryAnalyticsFilters } from "../lib/analytics/inventory-dashboard-view";

export default async function AdminOverviewPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
 return adminBoundary(async () => {
  await requireDashboardAdmin();
  let filters: InventoryAnalyticsFilters;
  try { filters = parseInventoryDashboardFilters(await searchParams ?? {}); }
  catch (error) {
   if (error instanceof InventoryFilterError) return <section className="admin-empty"><h1>Revisa los filtros</h1><p role="alert">{error.message}</p><a href="/admin">Limpiar filtros</a></section>;
   throw error;
  }
  const [legacy, analytics] = await Promise.allSettled([readAdminSummary(), loadPlatformInventoryOverview(filters)]);
  if (analytics.status === "rejected") throw analytics.reason;
  if (legacy.status === "rejected" && legacy.reason instanceof DashboardAuthorizationError) throw legacy.reason;
  return <Overview summary={legacy.status === "fulfilled" ? legacy.value : null}
   inventoryOverview={<InventoryOverview view={analytics.value} />} />;
 });
}
