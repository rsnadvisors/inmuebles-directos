import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { availableActions, daysLeft, listingExpiry, listingStatusLabel } from "../app/lib/listing-management";
import { trackListingEvent } from "../app/lib/listing-events";

const stubs = vi.hoisted(() => ({ rpc: vi.fn(), server: vi.fn() }));
vi.mock("../app/lib/auth-server", () => ({ getServerClient: stubs.server }));

import { POST as recordEvent } from "../app/api/eventos/route";
import PropertyContactActions from "../app/components/PropertyContactActions";

const ID = "34da4627-df58-4b7d-bff8-e51f1fd7190b";
const ORIGIN = "http://localhost:3103";
const DAY = 86_400_000;
const event = (body: unknown, origin = ORIGIN) => new Request(`${ORIGIN}/api/eventos`, { method: "POST", body: JSON.stringify(body), headers: { origin, "content-type": "application/json" } });

beforeEach(() => {
  stubs.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  stubs.server.mockReset().mockResolvedValue({ rpc: stubs.rpc });
  window.sessionStorage.clear();
});

describe("vigencia de los anuncios", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  it("cuenta 90 días desde la publicación o la última renovación", () => {
    expect(listingExpiry({ published_at: "2026-10-03T17:00:00Z" })?.toISOString()).toBe("2027-01-01T17:00:00.000Z");
    expect(listingExpiry({ published_at: "2026-10-03T17:00:00Z", renewed_at: "2026-11-16T00:00:00Z" })?.toISOString()).toBe("2027-02-14T00:00:00.000Z");
    expect(listingExpiry({ published_at: null })).toBeNull();
  });
  it("ofrece Renovar solo en los últimos 15 días", () => {
    const base = { status: "published", listing_type: "sale" };
    expect(availableActions({ ...base, published_at: new Date(now - 80 * DAY).toISOString() }, now).actions).toContain("renew");
    expect(availableActions({ ...base, published_at: new Date(now - 20 * DAY).toISOString() }, now).actions).not.toContain("renew");
    expect(daysLeft(listingExpiry({ published_at: new Date(now - 80 * DAY).toISOString() }), now)).toBe(10);
  });
  it("un anuncio caducado se muestra como Caducado y se puede volver a publicar", () => {
    const row = { status: "archived", owner_paused: true, expired_at: "2026-11-16", listing_type: "sale", published_at: "2026-08-01" };
    expect(listingStatusLabel(row)).toBe("Caducado");
    expect(availableActions(row).actions).toEqual(["reactivate"]);
  });
});

describe("ruta de eventos", () => {
  it("suma visitas y clics válidos con la sesión del visitante", async () => {
    for (const kind of ["view", "call", "whatsapp"]) expect((await recordEvent(event({ id: ID, kind }))).status).toBe(204);
    expect(stubs.rpc.mock.calls).toEqual([["record_listing_event", { p_id: ID, p_kind: "view" }],
      ["record_listing_event", { p_id: ID, p_kind: "call" }], ["record_listing_event", { p_id: ID, p_kind: "whatsapp" }]]);
  });
  it("rechaza otro origen y datos raros sin tocar la base", async () => {
    expect((await recordEvent(event({ id: ID, kind: "view" }, "https://evil.example"))).status).toBe(403);
    for (const body of [{ id: ID, kind: "purchase" }, { id: "x", kind: "view" }, { id: ID, kind: "view", ip: "1.2.3.4" }]) {
      expect((await recordEvent(event(body))).status).toBe(400);
    }
    expect(stubs.rpc).not.toHaveBeenCalled();
  });
  it("un fallo de la base no rompe la página", async () => {
    stubs.rpc.mockRejectedValue(new Error("down"));
    expect((await recordEvent(event({ id: ID, kind: "view" }))).status).toBe(204);
  });
});

describe("envío desde el navegador", () => {
  it("una vez por pestaña, anuncio y tipo, sin cookies", () => {
    const beacon = vi.fn((_url: string, _data?: BodyInit | null) => true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    trackListingEvent(ID, "view"); trackListingEvent(ID, "view"); trackListingEvent(ID, "call");
    expect(beacon).toHaveBeenCalledTimes(2);
    expect(document.cookie).toBe("");
  });
  it("los botones de contacto cuentan el clic", () => {
    const beacon = vi.fn((_url: string, _data?: BodyInit | null) => true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    render(<PropertyContactActions phone="987654321" title="Casa" status="published" listingId={ID} />);
    fireEvent.click(screen.getByRole("link", { name: "Contactar al anunciante por WhatsApp" }));
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe("/api/eventos");
  });
});

describe("migración de la fase 3", () => {
  const sql = readFileSync("supabase/migrations/20261116030000_listing_expiry_and_stats.sql", "utf8");
  it("la caducidad solo la ejecuta service_role", () => {
    expect(sql).toMatch(/revoke all on function public\.expire_stale_listings\(\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.expire_stale_listings\(\) to service_role;/);
  });
  it("los contadores no guardan datos personales y excluyen al dueño", () => {
    const table = sql.slice(sql.indexOf("create table if not exists private.listing_event_counts"), sql.indexOf(");", sql.indexOf("create table if not exists private.listing_event_counts")));
    expect(table).not.toMatch(/ip|user|agent|session/i);
    expect(sql).toMatch(/v_owner is not distinct from auth\.uid\(\) then return/);
    expect(sql).toMatch(/where c.count < 1000;/);
  });
  it("reactivar reinicia la vigencia", () => {
    expect(sql).toMatch(/status = 'published', owner_paused = false, renewed_at = now\(\), expired_at = null/);
  });
});
