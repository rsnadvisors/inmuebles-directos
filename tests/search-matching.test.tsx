import { describe, expect, it } from "vitest";
import { filterAndSortListings, matchesSearch, normalizeListing, type Listing } from "../app/lib/inventory";

const make = (over: Record<string, unknown>) => normalizeListing({ id: String(Math.random()), title: "Inmueble", status: "published", listing_type: "rent",
  property_type: "commercial", price: 12000, currency: "PEN", address: "", district: "", city: "Piura", region: "Piura", lat: -5.17, lng: -80.67, ...over }) as Listing;
const local = make({ title: "Local en Alquiler Veintiseis de Octubre Piura", property_type: "commercial", listing_type: "rent",
  address: "Av Justino Ramírez Peña, a una cuadra de Av Grau", district: "Veintiseis de Octubre" });
const terreno = make({ title: "Excelente Terreno en Urb. Miraflores Country Club", property_type: "land", listing_type: "sale", district: "Castilla", price: 75000, currency: "USD" });
const depa = make({ title: "Alquiler de departamento en Piura, Urb. Miraflores Country Club (3er piso)", property_type: "apartment", listing_type: "rent", district: "Castilla" });
const all = [local, terreno, depa];
const find = (q: string) => filterAndSortListings(all, q, "Todo", "Todo", "recommended").map(l => l.title);

describe("buscador principal", () => {
  it("«Local comercial» encuentra el local aunque el título diga «Local en Alquiler» y el tipo «Locales comerciales»", () => {
    expect(local.type).toBe("Locales comerciales");
    expect(find("Local comercial")).toEqual([local.title]);
  });
  it.each(["local comercial", "LOCAL COMERCIAL", "locales comerciales", "Locales", "comercial", "comer", "tienda", "local en alquiler", "local alquiler Piura"])(
    "variantes de escritura: %s", q => expect(find(q)).toContain(local.title));
  it("las palabras se buscan en cualquier orden, con o sin tildes, y en la dirección", () => {
    expect(find("comercial local")).toEqual([local.title]);
    expect(find("veintiséis")).toEqual([local.title]);
    expect(find("av grau")).toEqual([local.title]);
    expect(find("ramirez peña")).toEqual([local.title]);
  });
  it("tipos y operaciones por sinónimo, singular o plural", () => {
    expect(find("terrenos")).toEqual([terreno.title]);
    expect(find("lote")).toEqual([terreno.title]);
    expect(find("lotes castilla")).toEqual([terreno.title]);
    expect(find("depa")).toEqual([depa.title]);
    expect(find("departamentos en alquiler")).toEqual([depa.title]);
    expect(find("venta")).toEqual([terreno.title]);
    expect(find("renta")).toEqual(expect.arrayContaining([local.title, depa.title]));
    expect(find("Miraflores Country")).toEqual(expect.arrayContaining([terreno.title, depa.title]));
  });
  it("exige todas las palabras con contenido y no inventa resultados", () => {
    expect(find("local castilla")).toEqual([]);
    expect(find("casa")).toEqual([]);
    expect(find("oficina")).toEqual([]);
    expect(find("")).toHaveLength(3);
    expect(find("  de  en ")).toHaveLength(3); // solo palabras vacías: no filtra
  });
  it("sigue combinándose con los filtros de operación y tipo", () => {
    expect(filterAndSortListings(all, "Miraflores", "Comprar", "Todo", "recommended")).toEqual([terreno]);
    expect(filterAndSortListings(all, "local", "Todo", "Terrenos", "recommended")).toEqual([]);
    expect(matchesSearch(local, "local comercial")).toBe(true);
  });
});
