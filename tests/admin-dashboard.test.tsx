import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminInputError, AdminReadError, parseAdminParams, readAdminProperties, readAdminUsers, readAdminSummary, normalizeAdminUser } from "../app/lib/admin-data";
import { DashboardAuthorizationError } from "../app/lib/admin-auth-server";
import { adminBoundary, Overview, PropertyList, UserList, AdminPagination } from "../app/admin/components";
import AdminLayout from "../app/admin/layout";
import PropertiesPage from "../app/admin/propiedades/page";
import UsersPage from "../app/admin/usuarios/page";

const stubs = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn(), redirect: vi.fn() }));
vi.mock("../app/lib/admin-auth-server", async (original) => ({ ...await original<typeof import("../app/lib/admin-auth-server")>(), requireDashboardAdmin: stubs.authorize }));
vi.mock("next/navigation", () => ({ redirect: stubs.redirect, useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
const id = "10000000-0000-4000-8000-000000000001";
const time = "2026-09-30T10:20:30.123456+00:00";
const property = { id, code: null, slug: "casa-sintetica", title: "Casa sintética <script>no</script>", status: "published", listing_type: "sale", property_type: "house", price: 0, currency: "PEN", city: "Piura", district: null, owner_id: null, agent_id: null, created_at: time, updated_at: null, published_at: null };
const user = { profile_id: id, full_name: "Sintético", email: "synthetic@example.test", phone: "DO_NOT_RENDER", role: "admin", profile_created_at: time, property_count: 0, published_count: 0, draft_count: 0, last_sign_in_at: "DO_NOT_RENDER", auth_created_at: time };
const summary = Object.fromEntries(["profiles_total", "auth_users_total", "properties_total", "published", "draft", "archived", "reserved", "sold", "rented", "sale", "rent", "today", "7d", "30d", "views_raw_count", "leads_raw_count", "favorites_count"].map(key => [key, 0]));

beforeEach(() => { stubs.authorize.mockReset().mockResolvedValue({ client: { rpc: stubs.rpc }, user: { id } }); stubs.rpc.mockReset().mockResolvedValue({ data: [property], error: null }); stubs.redirect.mockReset().mockImplementation((url) => { throw new Error(`REDIRECT:${url}`); }); });

describe("protected admin reads", () => {
  it.each([401, 403, 503] as const)("never calls a read RPC after authorization %s", async status => {
    stubs.authorize.mockRejectedValue(new DashboardAuthorizationError(status));
    await expect(readAdminProperties({})).rejects.toMatchObject({ status });
    expect(stubs.rpc).not.toHaveBeenCalled();
    if (status === 401) await expect(AdminLayout({ children: <p>SECRET</p> })).rejects.toThrow("REDIRECT:/login?returnTo=%2Fadmin");
    else { render(await AdminLayout({ children: <p>SECRET</p> })); expect(screen.queryByText("SECRET")).toBeNull(); expect(screen.getByRole("alert")).not.toBeNull(); }
  });
  it("checks the page read independently of layout", async () => { stubs.authorize.mockRejectedValue(new DashboardAuthorizationError(403)); render(await PropertiesPage({ searchParams: Promise.resolve({}) })); expect(screen.queryByText(property.title)).toBeNull(); expect(stubs.rpc).not.toHaveBeenCalled(); });
  it("reuses only the authorized client and the exact certified signature", async () => {
    const result = await readAdminProperties({ q: "casa", status: "published", type: "house", listing: "sale", city: "Piura", ownerless: "true" });
    expect(result.rows[0]).toMatchObject({ owner: null, price: 0, publishedAt: null });
    expect(stubs.rpc).toHaveBeenCalledWith("admin_properties", { p_limit: 21, p_before: null, p_before_id: null, p_search: "casa", p_status: "published", p_listing: "sale", p_type: "house", p_city: "Piura", p_district: null, p_owner: null, p_ownerless: true, p_from: null, p_to: null, p_id: null });
  });
  it.each(["draft", "published", "reserved", "sold", "rented", "archived"])("supports stored status %s", async status => { stubs.rpc.mockResolvedValue({ data: [{ ...property, status }], error: null }); expect((await readAdminProperties({ status })).rows[0].status).toBe(status); });
  it.each(["house", "apartment", "land", "office", "commercial"])("preserves type %s", async type => { stubs.rpc.mockResolvedValue({ data: [{ ...property, property_type: type }], error: null }); expect((await readAdminProperties({ type })).rows[0].type).toBe(type); });
  it("supports USD/rent and nullable price", async () => { stubs.rpc.mockResolvedValue({ data: [{ ...property, listing_type: "rent", price: null, currency: "USD" }], error: null }); expect((await readAdminProperties({ listing: "rent" })).rows[0]).toMatchObject({ listing: "rent", price: null, currency: "USD" }); });
  it("detects an extra row and preserves microsecond keyset precision", async () => { const rows = Array.from({ length: 21 }, (_, index) => ({ ...property, id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}` })); stubs.rpc.mockResolvedValue({ data: rows, error: null }); const result = await readAdminProperties({}); expect(result.rows).toHaveLength(20); expect(result.next).toEqual({ before: time, beforeId: rows[19].id }); await readAdminProperties({ before: time, beforeId: rows[19].id }); expect(stubs.rpc.mock.lastCall?.[1]).toMatchObject({ p_before: time, p_before_id: rows[19].id }); });
  it("has no next cursor on a full page with no extra row", async () => { stubs.rpc.mockResolvedValue({ data: Array.from({ length: 20 }, (_, i) => ({ ...property, id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}` })), error: null }); expect((await readAdminProperties({})).next).toBeNull(); });
  it.each([null, {}, [null], [{ ...property, status: "unexpected" }], [{ ...property, currency: "EUR" }], [{ ...property, created_at: "bad" }], [property, property]])("rejects malformed payload %#", async data => { stubs.rpc.mockResolvedValue({ data, error: null }); await expect(readAdminProperties({})).rejects.toBeInstanceOf(AdminReadError); });
  it("never leaks a database error", async () => { stubs.rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE_DATABASE_PASSWORD", code: "XX000" } }); const ui = await adminBoundary(async () => { await readAdminProperties({}); return null; }); render(ui); expect(screen.getByRole("alert").textContent).not.toContain("PRIVATE_DATABASE_PASSWORD"); });
  it("denies a capability revoked between helper and read", async () => { stubs.rpc.mockResolvedValue({ data: null, error: { code: "42501" } }); await expect(readAdminUsers({})).rejects.toMatchObject({ status: 403 }); });
  it("normalizes only minimal user fields", async () => { stubs.rpc.mockResolvedValue({ data: [user], error: null }); const result = await readAdminUsers({ q: "synthetic" }); expect(result.rows[0]).not.toHaveProperty("phone"); expect(result.rows[0]).not.toHaveProperty("last_sign_in_at"); expect(result.rows[0]).not.toHaveProperty("approved"); expect(stubs.rpc).toHaveBeenCalledWith("admin_users", { p_limit: 21, p_before: null, p_before_id: null, p_search: "synthetic", p_user: null }); });
  it.each(["admin", "agent", "owner", "viewer"])("displays legitimate role %s", role => expect(normalizeAdminUser({ ...user, role }).role).toBe(role));
  it("rejects malformed summary rather than showing fake zeros", async () => { stubs.rpc.mockResolvedValue({ data: {}, error: null }); await expect(readAdminSummary()).rejects.toBeInstanceOf(AdminReadError); });
  it("loads only certified summary counts", async () => { stubs.rpc.mockResolvedValue({ data: { ...summary, by_market: [] }, error: null }); expect((await readAdminSummary()).counts.properties_total).toBe(0); expect(stubs.rpc).toHaveBeenCalledWith("admin_dashboard_summary"); });
});

describe("admin parameter and UI contracts", () => {
  it.each([{ status: "all" }, { q: ["a", "b"] }, { q: "x".repeat(81) }, { before: time }, { beforeId: id }, { before: "bad", beforeId: id }, { ownerless: "false" }, { id: "../../secret" }, { unknown: "yes" }])("rejects unsafe/unknown params %#", params => expect(() => parseAdminParams(params, "properties")).toThrow(AdminInputError));
  it("rejects filters unsupported by users RPC", () => expect(() => parseAdminParams({ role: "admin" }, "users")).toThrow(AdminInputError));
  it("renders real zero, ownerless and missing publication date neutrally", async () => { const { rows } = await readAdminProperties({}); render(<PropertyList rows={rows} />); expect(screen.getByText("Sin propietario asignado")).not.toBeNull(); expect(screen.getByText("S/ 0")).not.toBeNull(); expect(screen.getByText("No registrada")).not.toBeNull(); expect(screen.getByText(property.title)).not.toBeNull(); expect(document.querySelector("script")).toBeNull(); });
  it("renders empty property list", () => { render(<PropertyList rows={[]} />); expect(screen.getByText("No se encontraron propiedades")).not.toBeNull(); });
  it("makes historical role distinct from approval and discards raw Auth data", () => { render(<UserList rows={[normalizeAdminUser(user)]} />); expect(screen.getByText("Administrador")).not.toBeNull(); expect(screen.getByText(/no implica aprobación/)).not.toBeNull(); expect(screen.queryByText("DO_NOT_RENDER")).toBeNull(); });
  it("renders empty users and the reset control", async () => { stubs.rpc.mockResolvedValue({ data: [], error: null }); render(await UsersPage({ searchParams: Promise.resolve({ q: "none" }) })); expect(screen.getByText("No se encontraron usuarios")).not.toBeNull(); expect(screen.getByRole("link", { name: "Limpiar" }).getAttribute("href")).toBe("/admin/usuarios"); });
  it("renders summary with honest empty market state", () => { render(<Overview summary={{ counts: Object.fromEntries(Object.entries(summary).map(([k]) => [k, 0])), markets: [] }} />); expect(screen.getByRole("heading", { name: "Resumen" })).not.toBeNull(); expect(screen.getByText("No hay inventario para mostrar.")).not.toBeNull(); });
  it("preserves filters when advancing and clears cursor at first page", () => { render(<AdminPagination path="/admin/propiedades" params={{ status: "draft", before: time, beforeId: id }} next={{ before: time, beforeId: id }} />); const link = screen.getByRole("link", { name: /Siguiente/ }); expect(link.getAttribute("href")).toContain("status=draft"); expect(screen.getByRole("link", { name: "Primera página" }).getAttribute("href")).toBe("/admin/propiedades?status=draft"); });
});
