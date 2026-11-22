import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import PropertyPage from "../app/inmueble/[slug]/page";
import Home from "../app/HomeClient";
import { listingCity, matchesCity, normalizeInventory } from "../app/lib/inventory";
import { properties } from "./fixtures/properties";
import { setInventory } from "./mocks/supabase";

vi.mock("../app/lib/auth-client", async () => {
  const { supabase } = await import("./mocks/supabase");
  return { getBrowserClient: () => ({ ...supabase, auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  } }) };
});

async function renderPage(row: Record<string, unknown>) {
  setInventory([{ ...properties[0], ...row }]);
  render(await PropertyPage({ params: Promise.resolve({ slug: "fixture-house" }) }));
  return screen.getByRole("navigation", { name: "Ruta de navegación" });
}

describe("ruta de navegación de la ficha", () => {
  it("muestra Inicio > Operación > Ciudad > Título con enlaces filtrados", async () => {
    const nav = await renderPage({ city: "Piura" });
    const items = within(nav).getAllByRole("listitem").map(item => item.textContent);
    expect(items).toEqual(["Inicio", "Comprar", "Piura", "Casa de prueba"]);
    expect(within(nav).getByRole("link", { name: "Inicio" }).getAttribute("href")).toBe("/");
    expect(within(nav).getByRole("link", { name: "Comprar" }).getAttribute("href")).toBe("/?operacion=Comprar");
    expect(within(nav).getByRole("link", { name: "Piura" }).getAttribute("href")).toBe("/?operacion=Comprar&ciudad=Piura");
    const current = within(nav).getByText("Casa de prueba");
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.closest("a")).toBeNull();
    // Va entre el encabezado y la galería.
    expect(nav.nextElementSibling?.className).toBe("property-full-shell");
  });

  it("usa el departamento si falta la ciudad y codifica nombres con espacios", async () => {
    const nav = await renderPage({ city: null, region: "La Libertad", listing_type: "rent" });
    expect(within(nav).getByRole("link", { name: "La Libertad" }).getAttribute("href")).toBe("/?operacion=Alquilar&ciudad=La+Libertad");
  });

  it("omite los niveles sin dato", async () => {
    const nav = await renderPage({ city: null, region: null, listing_type: null });
    expect(within(nav).getAllByRole("listitem").map(item => item.textContent)).toEqual(["Inicio", "Casa de prueba"]);
  });

  it("se mantiene en una sola línea y trunca el título en móvil", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.breadcrumb ol\{[^}]*flex-wrap:nowrap[^}]*overflow-x:auto[^}]*white-space:nowrap/);
    expect(css).toMatch(/\.breadcrumb-current span\{[^}]*overflow:hidden;text-overflow:ellipsis/);
  });
});

describe("filtro por ciudad", () => {
  it("compara la ciudad sin mayúsculas ni tildes, con el departamento como respaldo", () => {
    const [house] = normalizeInventory([{ ...properties[0], city: "Chulucanas" }]);
    const [noCity] = normalizeInventory([{ ...properties[0], city: null, region: "Piura" }]);
    expect(listingCity(house)).toBe("Chulucanas");
    expect(matchesCity(house, "chulucanas")).toBe(true);
    expect(matchesCity(house, "Piura")).toBe(false);
    expect(matchesCity(noCity, "PIURA")).toBe(true);
    expect(matchesCity(house, "")).toBe(true);
  });

  it("el inicio aplica ?operacion y ?ciudad, muestra el chip y limpia la URL", async () => {
    setInventory([
      { ...properties[0], city: "Piura" },
      { ...properties[1], city: "Piura" },
      { ...properties[2], city: "Sullana" },
    ]);
    window.history.replaceState(null, "", "/?operacion=Comprar&ciudad=piura");
    render(<Home />);
    await screen.findByRole("heading", { name: "Casa de prueba" });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("status", { name: "" }).textContent).toContain("Propiedades en piura");
    expect(window.location.search).toBe("");
    act(() => screen.getByRole("button", { name: "Quitar el filtro de ciudad piura" }).click());
    expect(screen.getAllByRole("article")).toHaveLength(2); // sigue en Comprar
  });
});
