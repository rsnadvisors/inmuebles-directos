import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({ verified: vi.fn(), rows: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error("REDIRECT:" + to); }, useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../app/lib/auth-server", () => ({ getVerifiedUser: stubs.verified }));
vi.mock("../app/lib/auth-client", () => ({ getBrowserClient: () => null }));

import MyProperties from "../app/mis-propiedades/page";

const user = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "dueno@example.test" };
const img = (id: string, bucket = "property-images-private") => ({ id, storage_bucket: bucket, public_url: null, sort_order: 0, is_cover: true });
const base = { price: 750000, currency: "PEN", property_type: "land", listing_type: "sale", district: "Castilla", city: "Piura", created_at: "2026-11-14T21:57:33Z" };
const ROWS = [
  { ...base, id: "p1", title: "Terreno en Miraflores", slug: "terreno-1", status: "published", published_at: "2026-11-14T21:57:34Z", property_images: [img("11111111-1111-4111-8111-111111111111")] },
  { ...base, id: "p2", title: "Casa en borrador", slug: "casa-2", status: "draft", published_at: null, property_type: "house", property_images: [img("22222222-2222-4222-8222-222222222222")] },
  { ...base, id: "p3", title: "Local archivado", slug: "local-3", status: "archived", published_at: null, property_type: "commercial", listing_type: "rent", property_images: [] },
];

function client() {
  return { rpc: async () => ({ data: { p1: { view: 12, call: 2, whatsapp: 1 } }, error: null }),
    from: (table: string) => ({ select: () => ({ eq: () => table === "profiles"
    ? { maybeSingle: async () => ({ data: { full_name: "Ricardo Sancarranco" } }) }
    : { order: async () => stubs.rows() } }) }) };
}

beforeEach(() => { stubs.verified.mockResolvedValue({ client: client(), user }); stubs.rows.mockResolvedValue({ data: ROWS, error: null }); });

describe("Mis propiedades (panel)", () => {
  it("redirige sin sesión", async () => {
    stubs.verified.mockResolvedValue({ client: null, user: null });
    await expect(MyProperties()).rejects.toThrow("REDIRECT:/login?returnTo=/mis-propiedades");
  });

  it("muestra pestañas con contadores, estados, portada y solo la ficha de los publicados", async () => {
    render(await MyProperties());
    expect(screen.getByRole("heading", { level: 1, name: "Mis propiedades" })).toBeTruthy();
    const tabs = within(screen.getByRole("navigation", { name: "Filtrar por estado" }));
    expect(tabs.getByRole("link", { name: "Todas 3" }).getAttribute("aria-current")).toBe("page");
    expect(tabs.getByRole("link", { name: "Publicadas 1" })).toBeTruthy();
    expect(tabs.getByRole("link", { name: "Borradores 1" })).toBeTruthy();
    expect(tabs.getByRole("link", { name: "Cerradas 1" })).toBeTruthy();
    for (const label of ["Publicado", "Borrador", "Archivado por revisión"]) expect(screen.getByText(label)).toBeTruthy();
    const fichas = screen.getAllByRole("link", { name: "Ver ficha" });
    expect(fichas).toHaveLength(1);
    expect(fichas[0].getAttribute("href")).toBe("/inmueble/terreno-1");
    const srcs = Array.from(document.querySelectorAll(".acct-cover img")).map(i => i.getAttribute("src"));
    expect(srcs).toEqual(["/api/property-images/11111111-1111-4111-8111-111111111111",
      "/api/property-images/22222222-2222-4222-8222-222222222222/preview"]);
    expect(screen.getByText("Terreno en Venta · Castilla, Piura")).toBeTruthy();
    expect(screen.getByText("Últimos 30 días (aprox.): 12 visitas · 2 llamadas · 1 clic en WhatsApp")).toBeTruthy();
    expect(screen.getByText(/Vence el/)).toBeTruthy();
  });

  it("filtra por pestaña y explica una pestaña vacía", async () => {
    render(await MyProperties({ searchParams: Promise.resolve({ estado: "borradores" }) }));
    expect(screen.getByText("Casa en borrador")).toBeTruthy();
    expect(screen.queryByText("Terreno en Miraflores")).toBeNull();
    stubs.rows.mockResolvedValue({ data: [ROWS[0]], error: null });
    render(await MyProperties({ searchParams: Promise.resolve({ estado: "borradores" }) }));
    expect(screen.getByRole("heading", { name: "No hay anuncios en «Borradores»" })).toBeTruthy();
  });

  it("invita a publicar cuando no hay anuncios y avisa si falla la carga", async () => {
    stubs.rows.mockResolvedValue({ data: [], error: null });
    const { unmount } = render(await MyProperties());
    expect(screen.getByRole("heading", { name: "Aún no tienes anuncios" })).toBeTruthy();
    unmount();
    stubs.rows.mockResolvedValue({ data: null, error: { message: "x" } });
    render(await MyProperties());
    expect(screen.getByRole("alert").textContent).toContain("No pudimos cargar tus propiedades");
  });
});

describe("barra superior del móvil", () => {
  it("usa el verde de «Inmuebles» del sitio y el avatar no abre ningún menú", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("app/components/account/account.css", "utf8");
    expect(css).toMatch(/\.acct-topbar\{[^}]*background:#087f70/);
    expect(readFileSync("app/globals.css", "utf8")).toMatch(/--teal:#087f70/);
    render(await MyProperties());
    expect(document.querySelector(".acct-topbar button")).toBeNull();
    expect(document.querySelector(".acct-topbar .acct-avatar")?.getAttribute("aria-hidden")).toBe("true");
  });
});
