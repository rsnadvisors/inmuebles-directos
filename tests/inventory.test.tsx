import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import Home from "../app/page";
import { coordinates, formatPrice, normalizeListing, optionalNumber } from "../app/lib/inventory";
import { properties } from "./fixtures/properties";
import { refreshInventory, setInventory, setResponse } from "./mocks/supabase";

const row = (extra = {}) => ({ ...properties[0], ...extra });
describe("inventory normalization", () => {
  it.each([["house", "Casas"], ["apartment", "Departamentos"], ["land", "Terrenos"], ["office", "Oficinas"], ["commercial", "Locales comerciales"]])("maps %s", (raw, label) => {
    expect(normalizeListing(row({ property_type: raw }))?.type).toBe(label);
  });
  it.each([null, undefined, "", "unknown", "toString"])("preserves unknown domains: %s", value => {
    const item = normalizeListing(row({ currency: value, listing_type: value, property_type: value }))!;
    expect(item.currency).toBeNull();
    expect(item.operation).toBe("Operación no especificada");
    expect(item.type).toBe("Tipo no especificado");
    expect(formatPrice(item.price, item.currency)).toContain("Moneda no especificada");
  });
  it.each([["PEN", "sale", "S/", "Comprar"], ["USD", "sale", "US$", "Comprar"], ["PEN", "rent", "S/", "Alquilar"], ["USD", "rent", "US$", "Alquilar"]])("preserves %s / %s", (currency, operation, symbol, label) => {
    const item = normalizeListing(row({ currency, listing_type: operation, price: 9999 }))!;
    expect(item.operation).toBe(label);
    expect(formatPrice(item.price, item.currency)).toBe(`${symbol} 9,999`);
  });
  it.each([null, undefined, "", "  ", "invalid", NaN, Infinity, true, {}])("rejects absent/invalid numeric %s", value => {
    expect(optionalNumber(value)).toBeNull();
    expect(formatPrice(normalizeListing(row({ price: value }))!.price, "USD")).toBe("Precio no disponible");
  });
  it("preserves zero, decimals and numeric strings", () => {
    expect(optionalNumber(0)).toBe(0);
    expect(optionalNumber("0")).toBe(0);
    expect(optionalNumber("125.375")).toBe(125.375);
    expect(formatPrice(0, "PEN")).toBe("S/ 0");
    expect(formatPrice(125.375, "USD")).toBe("US$ 125.375");
    expect(formatPrice(10000, "USD")).toBe("US$ 10,000");
  });
  it.each([null, 0])("preserves optional numeric %s", value => {
    const item = normalizeListing(row({ area_total_m2: value, bedrooms: value, bathrooms: value, parking_spaces: value }))!;
    expect([item.area, item.bedrooms, item.bathrooms, item.parkingSpaces]).toEqual([value, value, value, value]);
  });
  it.each([[null, 0], [0, null], [NaN, 0], [0, Infinity], [91, 0], [-91, 0], [0, 181], [0, -181], ["", ""]])("rejects invalid coordinates %s,%s", (lat, lng) => {
    expect(coordinates(lat, lng)).toBeNull();
  });
  it.each([[0, 0], [-90, -180], [90, 180], [-5.19, -80.63]])("retains valid coordinates %s,%s", (lat, lng) => {
    expect(coordinates(lat, lng)).toEqual([lat, lng]);
  });
  it("uses neutral location, preserves images without claiming cover support", () => {
    const item = normalizeListing(row({ address: null, district: " ", city: undefined, property_images: [] }))!;
    expect(item.zone).toBe("Ubicación no especificada");
    expect(item.images).toEqual([]);
    const images = [{ public_url: "second", sort_order: 2, is_cover: true }, { public_url: "first", sort_order: 0, is_cover: false }];
    expect(normalizeListing(row({ property_images: images }))!.images).toEqual(["first", "second"]);
    expect(images[0].public_url).toBe("second");
  });
});

function deferred() {
  let resolve!: (response: { data: unknown; error: unknown }) => void;
  const promise = new Promise<{ data: unknown; error: unknown }>(done => { resolve = done; });
  return { promise, resolve };
}
describe("inventory state and surfaces", () => {
  it("shows loading without demo inventory", async () => {
    const pending = deferred(); setResponse(() => pending.promise);
    render(<Home />);
    expect(screen.getByText("Cargando propiedades…")).toBeTruthy();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    await act(async () => pending.resolve({ data: [], error: null }));
    expect(screen.getByText("No hay propiedades disponibles en este momento.")).toBeTruthy();
  });
  it.each(["empty", "error", "throw"])("clears previous inventory on %s", async mode => {
    render(<Home />);
    await screen.findByRole("heading", { name: "Casa de prueba" });
    setResponse(async () => { if (mode === "throw") throw new Error("internal secret"); return { data: mode === "empty" ? [] : null, error: mode === "error" ? { message: "internal secret" } : null }; });
    await act(async () => { await refreshInventory(); });
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getByText(mode === "empty" ? "No hay propiedades disponibles en este momento." : "No pudimos cargar las propiedades en este momento.")).toBeTruthy();
    expect(screen.queryByText(/internal secret/)).toBeNull();
  });
  it("handles initial error without demo or empty-success message", async () => {
    setResponse(async () => ({ data: null, error: {} })); render(<Home />);
    await screen.findByRole("alert");
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.queryByText("No hay propiedades disponibles en este momento.")).toBeNull();
  });
  it("ignores obsolete responses and safely unmounts pending requests", async () => {
    const old = deferred(), latest = deferred();
    setResponse(() => old.promise); const view = render(<Home />);
    setResponse(() => latest.promise);
    let refresh: Promise<void> | undefined;
    act(() => { refresh = refreshInventory(); });
    await act(async () => { latest.resolve({ data: [], error: null }); await refresh; });
    await act(async () => old.resolve({ data: properties, error: null }));
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getByText("No hay propiedades disponibles en este momento.")).toBeTruthy();
    const pending = deferred(); setResponse(() => pending.promise);
    act(() => { refresh = refreshInventory(); }); view.unmount();
    await act(async () => { pending.resolve({ data: properties, error: null }); await refresh; });
  });
  it("keeps a coordinate-less listing and drawer but omits its marker", async () => {
    setInventory([row({ lat: null })]); render(<Home />);
    await screen.findByRole("heading", { name: "Casa de prueba" });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByLabelText("Número de marcadores").textContent).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: /Ver ficha y contacto/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("keeps office and commercial distinct in filters", async () => {
    setInventory([row({ id: "office", property_type: "office" }), row({ id: "commercial", property_type: "commercial" }), row({ id: "land", property_type: "land" })]);
    render(<Home />); await screen.findAllByRole("article");
    for (const type of ["Terrenos", "Oficinas", "Locales comerciales"]) {
      fireEvent.click(screen.getByRole("button", { name: type }));
      expect(screen.getAllByRole("article")).toHaveLength(1);
      expect(within(screen.getByRole("article")).getByText(new RegExp(type))).toBeTruthy();
    }
  });
  it("does not include unknown operation under Comprar", async () => {
    setInventory([row({ listing_type: "unknown" })]); render(<Home />);
    await screen.findByRole("article");
    fireEvent.click(screen.getByRole("button", { name: "Comprar" }));
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });
  it("shares PEN office semantics between card, map input and drawer", async () => {
    setInventory([row({ currency: "PEN", price: 250000, property_type: "office" })]); render(<Home />);
    const card = await screen.findByRole("article");
    expect(within(card).getByText("S/ 250,000")).toBeTruthy();
    expect(within(card).getByText("Comprar")).toBeTruthy();
    expect(within(card).getByText(/Oficinas/)).toBeTruthy();
    const marker = JSON.parse(screen.getByLabelText("Semántica de marcadores").textContent!)[0];
    expect(marker).toMatchObject({ price: "S/ 250,000", operation: "Comprar", type: "Oficinas" });
    fireEvent.click(within(card).getByRole("button"));
    expect(within(screen.getByRole("dialog")).getByText("S/ 250,000")).toBeTruthy();
    expect(screen.queryByText(/\/mes/)).toBeNull();
  });
});

