import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminPropertyPage from "../app/admin/propiedades/[id]/page";
import { DashboardAuthorizationError } from "../app/lib/admin-auth-server";

const stubs = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn(), redirect: vi.fn() }));
vi.mock("../app/lib/admin-auth-server", async original => ({ ...await original<typeof import("../app/lib/admin-auth-server")>(), requireDashboardAdmin: stubs.authorize }));
vi.mock("next/navigation", () => ({ redirect: stubs.redirect }));
const a = "10000000-0000-4000-8000-000000000001";
const b = "10000000-0000-4000-8000-000000000002";
const missing = "10000000-0000-4000-8000-000000000003";
const properties = [a, b].map((id, index) => ({ id, code: null, slug: `synthetic-${index}`, title: `Synthetic property ${index}`, status: "published", listing_type: "sale", property_type: "house", price: index, currency: "PEN", city: null, district: null, owner_id: null, agent_id: null, created_at: "2026-10-01T00:00:00Z", updated_at: null, published_at: null, contact_phone: "DO_NOT_RENDER_CONTACT", images: ["DO_NOT_RENDER_IMAGE"] }));

beforeEach(() => {
  stubs.authorize.mockReset().mockResolvedValue({ client: { rpc: stubs.rpc } });
  // Model the real RPC: null means unfiltered inventory, not an empty result.
  stubs.rpc.mockReset().mockImplementation(async (_name, args) => ({ data: args.p_id === null ? properties : properties.filter(p => p.id === args.p_id), error: null }));
  stubs.redirect.mockReset().mockImplementation(url => { throw new Error(`REDIRECT:${url}`); });
});
const detail = (id: string) => AdminPropertyPage({ params: Promise.resolve({ id }) });

it.each(["", " ", "   ", "\t", "\n", "arbitrary", "../../secret", "%20", "%20%20", "%09", "%0A", "%ZZ"])("rejects invalid detail ID %j without a property read", async id => {
  render(await detail(id));
  expect(screen.getByText("Registro no encontrado")).not.toBeNull();
  expect(stubs.authorize).toHaveBeenCalled();
  expect(stubs.rpc).not.toHaveBeenCalled();
  expect(screen.queryByText(properties[0].title)).toBeNull();
  expect(screen.queryByText(properties[1].title)).toBeNull();
  expect(screen.queryByRole("link", { name: /Ver ficha pública/ })).toBeNull();
});
it.each([a, b, ` ${a}`, `${a}   `, `\t${b}\n`])("selects only the requested valid UUID %j", async id => {
  render(await detail(id));
  const expected = properties.find(p => p.id === id.trim())!;
  expect(screen.getByText(expected.title)).not.toBeNull();
  expect(screen.queryByText(properties.find(p => p.id !== expected.id)!.title)).toBeNull();
  expect(stubs.rpc).toHaveBeenCalledWith("admin_properties", expect.objectContaining({ p_id: expected.id }));
  expect(screen.getByRole("link", { name: /Ver ficha pública/ }).getAttribute("href")).toBe(`/inmueble/${expected.slug}`);
  expect(screen.queryByText("DO_NOT_RENDER_CONTACT")).toBeNull();
  expect(document.querySelector("img")).toBeNull();
});
it("does not substitute the first property for a nonexistent UUID", async () => {
  render(await detail(missing));
  expect(screen.getByText("Registro no encontrado")).not.toBeNull();
  expect(stubs.rpc).toHaveBeenCalledWith("admin_properties", expect.objectContaining({ p_id: missing }));
});
it.each([401, 403, 503] as const)("keeps invalid IDs behind authorization %s", async status => {
  stubs.authorize.mockRejectedValue(new DashboardAuthorizationError(status));
  if (status === 401) await expect(detail(" ")).rejects.toThrow("REDIRECT:/login?returnTo=%2Fadmin%2Fpropiedades");
  else { render(await detail(" ")); expect(screen.getByRole("alert")).not.toBeNull(); }
  expect(stubs.rpc).not.toHaveBeenCalled();
  expect(screen.queryByText("Registro no encontrado")).toBeNull();
});
it.each([[properties[1]], properties])("fails closed if a detail RPC returns a mismatched or broad payload %#", async data => {
  stubs.rpc.mockResolvedValue({ data, error: null });
  render(await detail(a));
  expect(screen.getByRole("alert")).not.toBeNull();
  expect(screen.queryByText(properties[0].title)).toBeNull();
  expect(screen.queryByText(properties[1].title)).toBeNull();
});
it("does not retain property A when the next server render has an invalid ID", async () => {
  const view = render(await detail(a));
  expect(screen.getByText(properties[0].title)).not.toBeNull();
  view.rerender(await detail(" "));
  expect(screen.getByText("Registro no encontrado")).not.toBeNull();
  expect(screen.queryByText(properties[0].title)).toBeNull();
  expect(stubs.rpc).toHaveBeenCalledTimes(1);
});
