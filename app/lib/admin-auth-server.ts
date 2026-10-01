import "server-only";
import { getVerifiedUser } from "./auth-server";

export class DashboardAuthorizationError extends Error {
  constructor(public readonly status: 401 | 403 | 503) {
    super(status === 401 ? "Authentication required" : status === 403 ? "Dashboard access denied" : "Dashboard authorization unavailable");
    this.name = "DashboardAuthorizationError";
  }
}

/** Request-scoped authorization. Never cache this decision between requests. */
export async function requireDashboardAdmin() {
  let verified;
  try {
    verified = await getVerifiedUser();
  } catch {
    throw new DashboardAuthorizationError(503);
  }
  const { client, user } = verified;
  if (!client || !user) throw new DashboardAuthorizationError(401);

  let result;
  try {
    result = await client.rpc("dashboard_access");
  } catch {
    throw new DashboardAuthorizationError(503);
  }
  if (result.error || typeof result.data !== "boolean") throw new DashboardAuthorizationError(503);
  if (!result.data) throw new DashboardAuthorizationError(403);
  return { client, user };
}
