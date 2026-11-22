import { render, screen } from "@testing-library/react";
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import HomePage from "../app/page";

vi.mock("../app/lib/auth-client", async () => {
  const { supabase } = await import("./mocks/supabase");
  return { getBrowserClient: () => ({ ...supabase, auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  } }) };
});

describe("rendimiento P3", () => {
  it("P3a: la fuente principal es la variable (sin lista de pesos)", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toMatch(/Plus_Jakarta_Sans\(\{ subsets: \["latin"\], variable: "--font-ui", display: "swap" \}\)/);
  });

  it("P3b: el CSS va incrustado en el HTML", () => {
    expect(readFileSync("next.config.js", "utf8")).toMatch(/experimental: \{ inlineCss: true \}/);
  });

  it("P3c: la portada pinta una imagen fija del mapa (móvil y escritorio) con prioridad alta", async () => {
    const { container } = render(await HomePage());
    const img = container.querySelector("img.map-placeholder")!;
    expect(img.getAttribute("src")).toBe("/mapa-piura.webp");
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(img.getAttribute("alt")).toBe("");
    expect(container.querySelector('source[media="(max-width: 800px)"]')!.getAttribute("srcset")).toBe("/mapa-piura-movil.webp");
    for (const file of ["public/mapa-piura.webp", "public/mapa-piura-movil.webp"]) {
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeLessThan(130_000);
    }
    expect(screen.getAllByRole("article").length).toBeGreaterThan(0);
  });

  it("P3c: la imagen fija se alinea con el mapa (sin escalar, centrada) y el mapa queda encima", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.map-placeholder\{position:absolute;inset:0;width:100%;height:100%;max-width:none;object-fit:none;object-position:50% 50%/);
    expect(css).toMatch(/\.map-panel \.leaflet-container\{background:transparent\}/);
    expect(readFileSync("app/PiuraMap.tsx", "utf8")).toMatch(/eventHandlers=\{\{ load: \(\) => onReady\?\.\(\) \}\}/);
    expect(readFileSync("app/PiuraMap.tsx", "utf8")).toMatch(/zoom=\{13\}/);
    expect(readFileSync("app/PiuraMap.tsx", "utf8")).toMatch(/const piura: \[number, number\] = \[-5\.1945, -80\.6328\]/);
  });
});
