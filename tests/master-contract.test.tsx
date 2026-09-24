import { describe, expect, it } from "vitest";
import { filterAndSortListings, normalizeInventory } from "../app/lib/inventory";
import { safeReturnTo } from "../app/lib/safe-return";
import { validatePublication } from "../app/lib/publication";
import { properties } from "./fixtures/properties";

const listings = normalizeInventory(properties.map((row, index) => ({
  ...row,
  region: index === 0 ? "Piura" : "Lima",
  published_at: index === 0 ? "2026-09-01T00:00:00Z" : index === 1 ? "2026-09-10T00:00:00Z" : null,
})));

function publication(type = "Casas") {
  const form = new FormData();
  Object.entries({ title: "Casa", description: "Descripción", address: "Calle pública", city: "Piura", region: "Piura", operation: "Vender", type, price: "120000", currency: "PEN", latitude: "-5.1", longitude: "-80.6", coordinatesConfirmed: "true" }).forEach(([key, value]) => form.set(key, value));
  form.append("images", new File(["synthetic"], "fixture.png", { type: "image/png" }));
  return form;
}

describe("master search and filtering contract", () => {
  it("combines text, operation and type without resetting another criterion", () => {
    const house = listings.find(item => item.type === "Casas")!;
    expect(filterAndSortListings(listings, house.title.toUpperCase(), house.operation, house.type, "recommended")).toEqual([house]);
    expect(filterAndSortListings(listings, house.title, "Alquilar", house.type, "recommended")).toEqual([]);
  });
  it("matches geography without accents and sorts by published date, null last", () => {
    expect(filterAndSortListings(listings, "piura", "Todo", "Todo", "recommended").length).toBeGreaterThan(0);
    const recent = filterAndSortListings(listings, "", "Todo", "Todo", "recent");
    expect(recent[0].id).toBe(listings[1].id);
    expect(recent.at(-1)?.publishedAt).toBeNull();
  });
  it("does not compare nominal prices across currencies", () => {
    const mixed = listings.map((item, index) => ({ ...item, currency: index === 1 ? "USD" as const : "PEN" as const }));
    const sorted = filterAndSortListings(mixed, "", "Todo", "Todo", "priceAsc");
    expect(sorted.map(item => item.currency)).toEqual(["PEN", "PEN", "USD"]);
  });
});

describe("publication parity and ownership boundaries", () => {
  it.each(["Casas", "Departamentos", "Terrenos", "Oficinas", "Locales comerciales"])("accepts %s", type => {
    const result = validatePublication(publication(type));
    expect(result.property_type).toBeTruthy();
    expect(result.currency).toBe("PEN");
  });
  it("retains zero separately from omitted attributes", () => {
    const form = publication(); form.set("bedrooms", "0");
    const result = validatePublication(form);
    expect(result.bedrooms).toBe(0);
    expect(result.bathrooms).toBeNull();
  });
  it("rejects residential fields on land and client-supplied ownership", () => {
    const land = publication("Terrenos"); land.set("bedrooms", "2");
    expect(() => validatePublication(land)).toThrow();
    const owner = publication(); owner.set("owner_id", "another-user");
    expect(() => validatePublication(owner)).toThrow();
  });
  it("accepts coordinates elsewhere in Peru but rejects outside the bounding box", () => {
    const lima = publication(); lima.set("latitude", "-12.05"); lima.set("longitude", "-77.04");
    expect(validatePublication(lima).lat).toBe(-12.05);
    lima.set("latitude", "5");
    expect(() => validatePublication(lima)).toThrow();
  });
});

describe("returnTo safety", () => {
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "/login", "/registro"])("rejects %s", value => {
    expect(safeReturnTo(value)).toBe("/cuenta");
  });
  it("retains a safe internal publication route", () => {
    expect(safeReturnTo("/publicar")).toBe("/publicar");
  });
});
