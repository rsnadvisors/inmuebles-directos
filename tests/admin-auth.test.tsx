import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireDashboardAdmin } from "../app/lib/admin-auth-server";

const stub = vi.hoisted(() => ({ verified: vi.fn(), rpc: vi.fn() }));
vi.mock("../app/lib/auth-server", () => ({ getVerifiedUser: stub.verified }));
const client = { rpc: stub.rpc };

beforeEach(() => {
  stub.verified.mockReset();
  stub.rpc.mockReset();
  stub.verified.mockResolvedValue({ client, user: { id: "synthetic-actor" } });
  stub.rpc.mockResolvedValue({ data: false, error: null });
});

describe("server dashboard authorization", () => {
  it.each(["FREE", "AGENT", "HISTORICAL_ADMIN_NOT_APPROVED"])("denies %s using the DB capability", async (actor) => {
    stub.verified.mockResolvedValue({ client, user: { id: actor, user_metadata: { role: "admin", isAdmin: true } } });
    await expect(requireDashboardAdmin()).rejects.toMatchObject({ status: 403 });
    expect(stub.rpc).toHaveBeenCalledWith("dashboard_access");
  });
  it("denies unauthenticated callers before querying administrative state", async () => {
    stub.verified.mockResolvedValue({ client, user: null });
    await expect(requireDashboardAdmin()).rejects.toMatchObject({ status: 401 });
    expect(stub.rpc).not.toHaveBeenCalled();
  });
  it("denies missing configuration", async () => {
    stub.verified.mockResolvedValue({ client: null, user: null });
    await expect(requireDashboardAdmin()).rejects.toMatchObject({ status: 401 });
  });
  it("fails closed without exposing a session verification failure", async () => {
    stub.verified.mockRejectedValue(new Error("synthetic private auth detail"));
    await expect(requireDashboardAdmin()).rejects.toMatchObject({ status: 503, message: "Dashboard authorization unavailable" });
    expect(stub.rpc).not.toHaveBeenCalled();
  });
  it("returns only the verified session context when the DB approves", async () => {
    stub.rpc.mockResolvedValue({ data: true, error: null });
    const result = await requireDashboardAdmin();
    expect(result).toEqual({ client, user: { id: "synthetic-actor" } });
    expect(stub.rpc).toHaveBeenCalledWith("dashboard_access");
  });
  it.each([null, "true", 1, {}])("fails closed on malformed predicate result %j", async (data) => {
    stub.rpc.mockResolvedValue({ data, error: null });
    await expect(requireDashboardAdmin()).rejects.toMatchObject({ status: 503 });
  });
  it("does not accept a true result accompanied by an infrastructure error", async () => {
    stub.rpc.mockResolvedValue({ data: true, error: { message: "synthetic internal detail" } });
    await expect(requireDashboardAdmin()).rejects.toMatchObject({ status: 503, message: "Dashboard authorization unavailable" });
  });
  it("does not expose a thrown RPC failure", async () => {
    stub.rpc.mockRejectedValue(new Error("synthetic internal detail"));
    await expect(requireDashboardAdmin()).rejects.toMatchObject({ status: 503, message: "Dashboard authorization unavailable" });
  });
  it("rechecks capability after revocation with the same verified user", async () => {
    stub.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    await requireDashboardAdmin();
    await expect(requireDashboardAdmin()).rejects.toMatchObject({ status: 403 });
    expect(stub.rpc).toHaveBeenCalledTimes(2);
  });
});
