import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resultsBucket, searchZone, trackSearch } from "../app/lib/listing-events";

const stubs = vi.hoisted(() => ({ rpc: vi.fn(), server: vi.fn(), verified: vi.fn(), refresh: vi.fn() }));
vi.mock("../app/lib/auth-server", () => ({ getServerClient: stubs.server, getVerifiedUser: stubs.verified }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: stubs.refresh, push: vi.fn(), replace: vi.fn() }) }));

import { POST as recordSearch } from "../app/api/busquedas/route";
import { POST as manage } from "../app/api/mis-propiedades/route";
import ListingActions from "../app/components/account/ListingActions";

const ORIGIN = "http://localhost:3103";
const ID = "34da4627-df58-4b7d-bff8-e51f1fd7190b";
const post = (url: string, body: unknown, origin = ORIGIN) => new Request(`${ORIGIN}${url}`, { method: "POST", body: JSON.stringify(body), headers: { origin, "content-type": "application/json" } });

beforeEach(() => {
  stubs.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  stubs.server.mockReset().mockResolvedValue({ rpc: stubs.rpc });
  stubs.verified.mockReset().mockResolvedValue({ client: { rpc: stubs.rpc }, user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } });
  stubs.refresh.mockReset();
  window.sessionStorage.clear();
});

describe("zona de búsqueda sin texto libre", () => {
  it("reconoce distritos de Piura con o sin tildes y prioriza el nombre más largo", () => {
    expect(searchZone("Casa en Castilla")).toBe("castilla");
    expect(searchZone("terreno veintiséis de octubre, Piura")).toBe("veintiseis-de-octubre");
    expect(searchZone("depa en Máncora")).toBe("mancora");
    expect(searchZone("")).toBe("ninguna");
    expect(searchZone("mi DNI 12345678 y mi celular")).toBe("otra");
  });
  it("agrupa el número de resultados", () => {
    expect([0, 3, 12, 40].map(resultsBucket)).toEqual(["0", "1-5", "6-20", "21+"]);
  });
  it("envía solo códigos, una vez por combinación, y nada si no hay filtros", () => {
    const beacon = vi.fn((_url: string, _data?: BodyInit | null) => true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    trackSearch("Todo", "Todo", "", 4);
    trackSearch("Comprar", "Casas", "casa barata en castilla cerca a mi trabajo", 0);
    trackSearch("Comprar", "Casas", "castilla", 0);
    expect(beacon).toHaveBeenCalledTimes(1);
    return (beacon.mock.calls[0][1] as Blob).text().then(text => {
      expect(JSON.parse(text)).toEqual({ operation: "Comprar", type: "Casas", zone: "castilla", results: "0" });
      expect(text).not.toContain("trabajo");
    });
  });
});

describe("ruta /api/busquedas", () => {
  it("acepta combinaciones válidas", async () => {
    expect((await recordSearch(post("/api/busquedas", { operation: "Alquilar", type: "Departamentos", zone: "piura", results: "1-5" }))).status).toBe(204);
    expect(stubs.rpc).toHaveBeenCalledWith("record_search", { p_operation: "Alquilar", p_type: "Departamentos", p_zone: "piura", p_results: "1-5" });
  });
  it("rechaza texto libre, valores desconocidos y otro origen", async () => {
    for (const body of [{ operation: "Comprar", type: "Casas", zone: "mi casa", results: "0" }, { operation: "Comprar", type: "Casas", zone: "piura", results: "0", q: "x" },
      { operation: "Vender", type: "Casas", zone: "piura", results: "0" }]) {
      expect((await recordSearch(post("/api/busquedas", body))).status).toBe(400);
    }
    expect((await recordSearch(post("/api/busquedas", { operation: "Comprar", type: "Casas", zone: "piura", results: "0" }, "https://evil.example"))).status).toBe(403);
    expect(stubs.rpc).not.toHaveBeenCalled();
  });
});

describe("¿se cerró gracias al portal?", () => {
  const props = { id: ID, title: "Casa", slug: "casa", listingType: "sale", isReserved: false, ownerPaused: false, deletionRequestedAt: null, publishedAt: "2026-10-01" };
  it("pregunta al dueño de un anuncio vendido y envía la respuesta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    render(<ListingActions {...props} status="sold" closedViaPortal={null} />);
    expect(screen.getByText("¿Lo vendiste gracias a Inmuebles Directos?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sí" }));
    await waitFor(() => expect(stubs.refresh).toHaveBeenCalled());
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body))).toEqual({ op: "close-feedback", id: ID, viaPortal: true });
  });
  it("no vuelve a preguntar si ya respondió ni a anuncios publicados", () => {
    const { unmount } = render(<ListingActions {...props} status="rented" listingType="rent" closedViaPortal={false} />);
    expect(screen.queryByText(/gracias a Inmuebles Directos/)).toBeNull();
    unmount();
    render(<ListingActions {...props} status="published" closedViaPortal={null} />);
    expect(screen.queryByText(/gracias a Inmuebles Directos/)).toBeNull();
  });
  it("la ruta exige un booleano y llama a la función controlada", async () => {
    expect((await manage(post("/api/mis-propiedades", { op: "close-feedback", id: ID, viaPortal: "si" }))).status).toBe(400);
    expect((await manage(post("/api/mis-propiedades", { op: "close-feedback", id: ID, viaPortal: false }))).status).toBe(200);
    expect(stubs.rpc).toHaveBeenCalledWith("owner_set_close_feedback", { p_id: ID, p_via_portal: false });
  });
});

describe("migración de captura de datos", () => {
  const sql = readFileSync("supabase/migrations/20261116050000_market_data_capture.sql", "utf8");
  it("historial de precios y de estados por disparador, en tablas privadas", () => {
    expect(sql).toMatch(/create trigger zz_capture_listing_history after insert or update on public\.properties/);
    expect(sql).toMatch(/revoke all on private\.listing_price_history, private\.listing_status_events from public, anon, authenticated/);
  });
  it("las búsquedas no guardan texto libre ni datos del visitante", () => {
    const table = sql.slice(sql.indexOf("create table if not exists private.search_counts"), sql.indexOf(");", sql.indexOf("create table if not exists private.search_counts")));
    expect(table).not.toMatch(/query|text_|ip|user|agent|session/i);
    expect(sql).toMatch(/where c\.count < 5000/);
  });
});
