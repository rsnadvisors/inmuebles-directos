import "server-only";
import { getVerifiedUser } from "../auth-server";
import { requireDashboardAdmin, DashboardAuthorizationError } from "../admin-auth-server";
import { InventoryQueryError, type InventoryScope } from "./inventory-query-contract";

type VerifiedClient = NonNullable<Awaited<ReturnType<typeof getVerifiedUser>>["client"]>;
export type InventoryQueryContext = Readonly<{ client: VerifiedClient; userId: string; scope: InventoryScope }>;
const verifiedContexts = new WeakSet<object>();
/** Only server callers choose own or admin intent. HTTP payloads never create contexts. */
export async function createInventoryQueryContext(scope: InventoryScope): Promise<InventoryQueryContext> {
 if (scope !== "OWN_PROPERTY" && scope !== "PLATFORM_AGGREGATE") throw new InventoryQueryError("FORBIDDEN");
 try {
  const { client, user } = scope === "PLATFORM_AGGREGATE" ? await requireDashboardAdmin() : await getVerifiedUser();
  if (!client || !user || !user.id || user.is_anonymous) throw new InventoryQueryError("UNAUTHORIZED");
  const context = Object.freeze({ client, userId: user.id, scope });
  verifiedContexts.add(context);
  return context;
 } catch (error) {
  if (error instanceof InventoryQueryError) throw error;
  if (error instanceof DashboardAuthorizationError)
   throw new InventoryQueryError(error.status === 401 ? "UNAUTHORIZED" : error.status === 403 ? "FORBIDDEN" : "DATA_UNAVAILABLE");
  throw new InventoryQueryError("DATA_UNAVAILABLE");
 }
}
export function assertVerifiedInventoryContext(context: InventoryQueryContext) {
 if (!context || !verifiedContexts.has(context)) throw new InventoryQueryError("FORBIDDEN");
}
