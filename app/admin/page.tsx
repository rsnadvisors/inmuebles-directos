import { readAdminSummary } from "../lib/admin-data";
import { adminBoundary, Overview } from "./components";
import { requireDashboardAdmin, DashboardAuthorizationError } from "../lib/admin-auth-server";
import { loadPlatformInventoryOverview } from "../lib/analytics/inventory-dashboard-server";
import InventoryOverview from "../components/analytics/InventoryOverview";

export default async function AdminOverviewPage() {
 return adminBoundary(async () => {
  await requireDashboardAdmin();
  const [legacy, analytics] = await Promise.allSettled([readAdminSummary(), loadPlatformInventoryOverview()]);
  if (analytics.status === "rejected") throw analytics.reason;
  if (legacy.status === "rejected" && legacy.reason instanceof DashboardAuthorizationError) throw legacy.reason;
  return <Overview summary={legacy.status === "fulfilled" ? legacy.value : null}
   inventoryOverview={<InventoryOverview view={analytics.value} />} />;
 });
}
