import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HomePage, { metadata } from "../app/page";
import { readHomeListings } from "../app/lib/property";
import { setResponse } from "./mocks/supabase";

vi.mock("../app/lib/auth-client", async () => {
  const { supabase } = await import("./mocks/supabase");
  return { getBrowserClient: () => ({ ...supabase, auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  } }) };
});

describe("inicio generado en el servidor (SEO C2)", () => {
  it("entrega el listado, sus enlaces a las fichas y un H1 sin esperar al navegador", async () => {
    render(await HomePage());
    // Sin esperar efectos: ya está en el primer render, como lo recibe Googlebot.
    expect(screen.getByRole("heading", { level: 1, name: "Inmuebles en venta y alquiler en Piura" })).toBeTruthy();
    expect(screen.queryByText("Cargando propiedades…")).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    const link = screen.getByRole("link", { name: "Casa de prueba" });
    expect(link.getAttribute("href")).toBe("/inmueble/fixture-house");
    expect(link.closest("h2")).toBeTruthy();
  });

  it("un clic normal en el título abre el panel; con Ctrl deja seguir el enlace", async () => {
    render(await HomePage());
    const link = screen.getByRole("link", { name: "Casa de prueba" });
    const ctrl = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    link.dispatchEvent(ctrl);
    expect(ctrl.defaultPrevented).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(link);
    const dialog = screen.getByRole("dialog", { name: "Ficha de Casa de prueba" });
    expect(within(dialog).getByRole("link", { name: "Ficha completa" }).getAttribute("href")).toBe("/inmueble/fixture-house");
  });

  it("declara título, descripción y canonical propios", () => {
    expect(metadata.title).toBe("Inmuebles en venta y alquiler en Piura | Inmuebles Directos");
    expect(String(metadata.title).length).toBeLessThanOrEqual(60);
    expect(metadata.description).toMatch(/Piura/);
    expect(metadata.alternates?.canonical).toBe("/");
  });

  it("si la base falla en el servidor, el mapa vuelve a cargar en el navegador", async () => {
    setResponse(async () => ({ data: null, error: { message: "boom" } }));
    expect(await readHomeListings()).toBeUndefined();
    render(await HomePage());
    expect(screen.getByText("Cargando propiedades…")).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toBe("No pudimos cargar las propiedades en este momento.");
  });
});

describe("SEO A5–A6", () => {
  it("el inicio tiene imagen para compartir 1200×630 y tarjeta grande", async () => {
    const { existsSync } = await import("node:fs");
    const og = metadata.openGraph as { images: Array<{ url: string; width: number; height: number; alt: string }> };
    expect(og.images[0]).toMatchObject({ url: "/og-inicio.jpg", width: 1200, height: 630 });
    expect(og.images[0].alt).toMatch(/Piura/);
    expect(existsSync("public/og-inicio.jpg")).toBe(true);
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", images: ["/og-inicio.jpg"] });
  });

  it("login y registro no se indexan pero sus enlaces se siguen", async () => {
    const login = (await import("../app/login/page")).metadata;
    const register = (await import("../app/registro/page")).metadata;
    expect(login).toMatchObject({ title: "Iniciar sesión | Inmuebles Directos", robots: { index: false, follow: true } });
    expect(register).toMatchObject({ title: "Crear cuenta | Inmuebles Directos", robots: { index: false, follow: true } });
  });
});
