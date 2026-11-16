import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attentionItems, contactRate, counts, trend, type OwnerListing } from "../app/lib/owner-dashboard";

const stubs = vi.hoisted(() => ({ verified: vi.fn(), rpc: vi.fn(), rows: vi.fn() }));
vi.mock("../app/lib/auth-server", () => ({ getVerifiedUser: stubs.verified }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error("REDIRECT:" + to); }, useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../app/lib/auth-client", () => ({ getBrowserClient: () => null }));

import Account from "../app/cuenta/page";

const NOW = Date.parse("2026-11-16T12:00:00Z");
const DAY = 86_400_000;
const base: OwnerListing = { id: "11111111-1111-4111-8111-111111111111", title: "Casa en Castilla", slug: "casa", status: "published", listing_type: "sale",
  published_at: new Date(NOW - 30 * DAY).toISOString(), renewed_at: null, expired_at: null, deletion_requested_at: null, is_reserved: false,
  closed_via_portal: null, photos: 3 };

describe("pendientes del anunciante", () => {
  it("prioriza el vencimiento y ofrece Renovar en el momento", () => {
    const soon = { ...base, published_at: new Date(NOW - 84 * DAY).toISOString() };
    const items = attentionItems([soon], { [soon.id]: counts({ view: 10, call: 1, whatsapp: 0 }) }, NOW);
    expect(items[0]).toMatchObject({ tone: "warn", title: "Vence en 6 días", action: { kind: "status", status: "renew" } });
  });
  it("detecta caducados, una sola foto, cero contactos, reservados y cierres sin respuesta", () => {
    const list: OwnerListing[] = [
      { ...base, id: "a", status: "archived", owner_paused: true, expired_at: "2026-11-10" },
      { ...base, id: "b", photos: 1 },
      { ...base, id: "c", title: "Terreno" },
      { ...base, id: "d", status: "sold" },
    ];
    const items = attentionItems(list, { b: counts({ call: 2 }), c: counts({ view: 40 }) }, NOW);
    expect(items.map(i => i.key)).toEqual(["expired-a", "quiet-c", "photos-b", "feedback-d"]);
  });
  it("muestra como máximo 4 pendientes y nada si todo está en orden", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...base, id: `x${i}`, photos: 0 }));
    expect(attentionItems(many, Object.fromEntries(many.map(l => [l.id, counts({ call: 1 })])), NOW)).toHaveLength(4);
    expect(attentionItems([base], { [base.id]: counts({ call: 3 }) }, NOW)).toEqual([]);
  });
  it("tendencias y tasa de contacto honestas", () => {
    expect(trend(27, 18).delta).toBe(50);
    expect(trend(5, 0).delta).toBeNull();
    expect(contactRate(counts({ view: 10, call: 5 }))).toBeNull();
    expect(contactRate(counts({ view: 412, call: 8, whatsapp: 19 }))).toBe(6.6);
  });
});

describe("pantalla Mi cuenta", () => {
  const rows = [
    { ...base, owner_paused: false, property_images: [{ id: "i1" }] },
    { ...base, id: "22222222-2222-4222-8222-222222222222", title: "Depto. Country Club", property_images: [{ id: "i2" }, { id: "i3" }] },
  ];
  beforeEach(() => {
    const client = {
      rpc: stubs.rpc,
      from: (table: string) => ({ select: () => ({ eq: () => table === "profiles"
        ? { maybeSingle: async () => ({ data: { full_name: "Ricardo Sancarranco" } }) }
        : { order: async () => stubs.rows() } }) }),
    };
    stubs.verified.mockResolvedValue({ client, user: { id: "u1", email: "r@example.test", email_confirmed_at: "2026-11-01", created_at: "2026-11-01" } });
    stubs.rows.mockResolvedValue({ data: rows, error: null });
    stubs.rpc.mockImplementation(async (name: string, args: { p_days?: number }) => {
      if (name === "owner_listing_weekly") return { data: [{ week: "2026-11-09", view: 30, call: 1, whatsapp: 2 }, { week: "2026-11-16", view: 50, call: 2, whatsapp: 5 }], error: null };
      if (args.p_days === 30) return { data: { [rows[1].id]: { view: 80, call: 3, whatsapp: 7 } }, error: null };
      return { data: { [rows[1].id]: { view: 120, call: 4, whatsapp: 9 } }, error: null };
    });
  });
  it("saluda, muestra pendientes, 3 cifras y los 2 gráficos con datos propios", async () => {
    render(await Account());
    expect(screen.getByRole("heading", { level: 1, name: "Hola, Ricardo" })).toBeTruthy();
    expect(screen.getByText(/2 anuncios publicados · 10 contactos en 30 días/)).toBeTruthy();
    const kpis = within(screen.getByRole("region", { name: "Resultados de los últimos 30 días" }));
    expect(kpis.getByText("10")).toBeTruthy();                       // contactos 30 días
    expect(kpis.getByText("+233 % vs. 30 días anteriores")).toBeTruthy(); // 10 frente a 3
    expect(kpis.getByText((12.5).toLocaleString("es-PE"))).toBeTruthy(); // 10 de 80 visitas
    expect(screen.getByRole("img", { name: /Contactos por semana/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /por anuncio/ }).textContent).toContain("0 · revisar");
    expect(screen.getByText("Solo 1 foto")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Cerrar sesión" }).length).toBe(2); // barra lateral (escritorio) y «Tu cuenta» (móvil)
  });
  it("si fallan las estadísticas, avisa sin ocultar la cuenta", async () => {
    stubs.rpc.mockResolvedValue({ data: null, error: { message: "x" } });
    render(await Account());
    expect(screen.getByText(/No pudimos cargar tus estadísticas/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tu cuenta" })).toBeTruthy();
  });
});

describe("migración de estadísticas semanales", () => {
  const sql = readFileSync("supabase/migrations/20261116070000_owner_weekly_stats.sql", "utf8");
  it("solo lee anuncios propios y no se concede a anon", () => {
    expect(sql).toMatch(/where p\.owner_id = uid/);
    expect(sql).toMatch(/revoke all on function public\.owner_listing_weekly\(integer\) from public, anon;/);
    expect(sql).not.toMatch(/grant [^;]* to [^;]*anon/);
  });
});
