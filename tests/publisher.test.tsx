import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import PropertyPage from "../app/inmueble/[slug]/page";
import { queryPublisherName } from "../app/lib/property";
import { properties } from "./fixtures/properties";
import { setInventory, setPublisherName, supabase } from "./mocks/supabase";

async function renderPage(published_at: string | null = "2026-11-20T15:00:00Z") {
  setInventory([{ ...properties[0], published_at }]);
  render(await PropertyPage({ params: Promise.resolve({ slug: "fixture-house" }) }));
  return screen.getByRole("region", { name: "Publicación" });
}

describe("anunciante en la ficha", () => {
  it("muestra avatar con inicial, nombre, fecha y sello de confianza", async () => {
    setPublisherName("Ricardo S.");
    const section = await renderPage();
    expect(within(section).getByText("R").getAttribute("aria-hidden")).toBe("true");
    expect(within(section).getByText("Ricardo S.").className).toBe("publisher-name");
    expect(within(section).getByText("Publicado el 20 de noviembre de 2026")).toBeTruthy();
    expect(within(section).getByText("Publicada en Inmuebles Directos")).toBeTruthy();
    expect(supabase.rpc).toHaveBeenCalledWith("listing_publisher_name", { p_property_id: "fixture-house" });
  });

  it("usa «Anunciante» si no hay nombre o falla la consulta, y omite la fecha si falta", async () => {
    setPublisherName(new Error("boom"));
    const section = await renderPage(null);
    expect(within(section).getByText("Anunciante")).toBeTruthy();
    expect(within(section).getByText("A")).toBeTruthy();
    expect(within(section).queryByText(/Publicado el/)).toBeNull();
    expect(within(section).getByText("Publicada en Inmuebles Directos")).toBeTruthy();
  });

  it("limpia la respuesta y descarta tipos inesperados", async () => {
    setPublisherName("  Ana   P.  "); expect(await queryPublisherName("x")).toBe("Ana P.");
    setPublisherName(42); expect(await queryPublisherName("x")).toBeNull();
    setPublisherName(""); expect(await queryPublisherName("x")).toBeNull();
  });

  it("la migración solo expone el nombre abreviado de anuncios publicados", () => {
    const sql = readFileSync("supabase/migrations/20261121120000_listing_publisher_name.sql", "utf8");
    expect(sql).toMatch(/security definer set search_path = ''/);
    expect(sql).toMatch(/p\.status = 'published'/);
    expect(sql).toMatch(/revoke all on function public\.listing_publisher_name\(uuid\) from public;/);
    expect(sql).not.toMatch(/pr\.(phone|role|avatar_url)/);
    expect(sql).toMatch(/pr\.full_name ~ '\^\[\[:alpha:\]\[:space:\]''\.-\]\+\$'/);
    expect(sql).toMatch(/left\(initcap\(lower\(w\[1\]\)\), 20\)/);
  });

  it("la versión vigente no corta el primer nombre y el nombre largo hace salto de línea", () => {
    const sql = readFileSync("supabase/migrations/20261121130000_listing_publisher_name_full_word.sql", "utf8");
    expect(sql).toMatch(/left\(initcap\(lower\(w\[1\]\)\), 60\)/);
    expect(sql).toMatch(/p\.status = 'published'/);
    expect(sql).toMatch(/pr\.full_name ~ '\^\[\[:alpha:\]\[:space:\]''\.-\]\+\$'/);
    expect(sql).not.toMatch(/pr\.(phone|role|avatar_url)/);
    expect(readFileSync("app/globals.css", "utf8")).toMatch(/\.publisher-name\{[^}]*overflow-wrap:anywhere/);
  });

  it("la política de privacidad declara el nombre abreviado como público", () => {
    expect(readFileSync("app/privacidad/page.tsx", "utf8")).toMatch(/nombre abreviado/);
  });
});
