import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Home from "../app/page";
import PublishPage from "../app/publicar/page";
import RoutePage from "../app/[...slug]/page";

async function renderHome() {
  render(<Home />);
  await screen.findByRole("heading", { name: "Casa de prueba" });
}

describe("baseline smoke tests (offline)", () => {
  it("renders Home and adapts valid properties, numeric prices and known types", async () => {
    await renderHome();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(JSON.parse(screen.getByLabelText("Datos de marcadores").textContent!)).toEqual(expect.arrayContaining([
      { id: "fixture-house", price: 125000, type: "Casas" },
      { id: "fixture-apartment", price: 1800, type: "Departamentos" },
      { id: "fixture-land", price: 50000, type: "Terrenos" },
    ]));
  });

  it("opens a property drawer and its gallery, then closes them", async () => {
    await renderHome();
    const card = screen.getByRole("heading", { name: "Casa de prueba" }).closest("article")!;
    fireEvent.click(within(card).getByRole("button", { name: "Ver detalles" }));
    expect(screen.getByRole("dialog", { name: "Ficha de Casa de prueba" })).toBeTruthy();
    const canonicalLink = screen.getByRole("link", { name: "Ficha completa" });
    expect(canonicalLink.getAttribute("href")).toBe("/inmueble/fixture-house");
    expect(canonicalLink.className).toContain("drawer-primary-action");
    expect(screen.queryByText("Publicado")).toBeNull();
    expect(screen.queryByRole("button", { name: /Guardar/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ampliar galería" }));
    expect(screen.getByRole("dialog", { name: "Galería de Casa de prueba" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar galería" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar detalle de propiedad" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("changes an individual operation filter and clears it", async () => {
    await renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Alquilar" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Departamento de prueba" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("unmounts the mobile list button while a drawer is open and restores it after either close action", async () => {
    await renderHome();
    for (const closeAction of ["Cerrar detalle de propiedad", "Ver mapa"]) {
      const toggle = screen.getByRole("button", { name: "Mostrar lista de 3 propiedades" });
      fireEvent.click(toggle);
      expect(toggle.isConnected).toBe(true);
      const card = screen.getByRole("heading", { name: "Casa de prueba" }).closest("article")!;
      fireEvent.click(within(card).getByRole("button", { name: "Ver detalles" }));
      expect(screen.getByRole("dialog", { name: "Ficha de Casa de prueba" })).toBeTruthy();
      expect(toggle.isConnected).toBe(false);
      expect(screen.queryByRole("button", { name: /Mostrar lista de/, hidden: true })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: closeAction }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByRole("button", { name: "Mostrar lista de 3 propiedades" })).toBeTruthy();
    }
  });

  it("uses a native preview control, closes with Escape and restores focus", async () => {
    await renderHome();
    const card = screen.getByRole("heading", { name: "Casa de prueba" }).closest("article")!;
    const trigger = within(card).getByRole("button", { name: "Ver detalles" });
    trigger.focus();
    fireEvent.click(trigger);
    const close = screen.getByRole("button", { name: "Cerrar detalle de propiedad" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Ficha de Casa de prueba" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("shows consistent neutral media for a zero-image property", async () => {
    await renderHome();
    const card = screen.getByRole("heading", { name: "Departamento de prueba" }).closest("article")!;
    expect(within(card).getByText("Sin fotografía")).toBeTruthy();
    expect(within(card).queryByRole("img")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Ver detalles" }));
    const drawer = screen.getByRole("dialog", { name: "Ficha de Departamento de prueba" });
    expect(within(drawer).getByText("Sin fotografías disponibles")).toBeTruthy();
    expect(within(drawer).queryByRole("img")).toBeNull();
  });

  it("represents an empty filtered list without a fatal exception", async () => {
    await renderHome();
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar propiedad, ciudad o provincia" }), { target: { value: "no-match-fixture" } });
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getByText("No encontramos propiedades con esos filtros.")).toBeTruthy();
    expect(screen.getByLabelText("Número de marcadores").textContent).toBe("0");
  });

  it("renders /publicar and its required fields without submitting", () => {
    render(<PublishPage />);
    expect(screen.getByRole("heading", { name: "Publica tu propiedad" })).toBeTruthy();
    const title = screen.getByLabelText("Título del anuncio") as HTMLInputElement;
    expect(title.checkValidity()).toBe(false);
    fireEvent.change(title, { target: { value: "Anuncio ficticio" } });
    expect(title.value).toBe("Anuncio ficticio");
    expect(screen.getByRole("button", { name: "Publicar propiedad" })).toBeTruthy();
  });

  it("accepts one valid synthetic photo locally without uploading", () => {
    render(<PublishPage />);
    fireEvent.change(screen.getByLabelText(/Fotos de la propiedad/), {
      target: { files: [new File(["synthetic"], "fixture.png", { type: "image/png" })] },
    });
    expect(screen.getByText("1 foto(s) seleccionada(s).")).toBeTruthy();
  });

  it("resolves the current catch-all route without asserting placeholder content", async () => {
    render(await RoutePage({ params: Promise.resolve({ slug: ["fixture-house"] }) }));
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Volver al inicio" }).getAttribute("href")).toBe("/");
  });

  it("blocks browser fetch before any external request", () => {
    expect(() => fetch("https://example.invalid/pr0")).toThrow("Network access is forbidden");
  });
});
