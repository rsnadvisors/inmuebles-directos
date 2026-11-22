import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "../app/page";

vi.mock("../app/lib/auth-client", async () => {
  const { supabase } = await import("./mocks/supabase");
  return { getBrowserClient: () => ({
    ...supabase,
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }) };
});

async function renderHome() {
  render(<Home />);
  await screen.findByRole("heading", { name: "Casa de prueba" });
}
const input = () => screen.getByRole("textbox", { name: "Buscar propiedad, ciudad o provincia" }) as HTMLInputElement;
const count = () => screen.getAllByRole("article").length;

describe("buscador principal: borrar y vaciar tras buscar", () => {
  it("muestra × solo con texto y lo borra de un toque devolviendo el foco", async () => {
    await renderHome();
    const total = count();
    expect(screen.queryByRole("button", { name: "Borrar búsqueda" })).toBeNull();
    fireEvent.change(input(), { target: { value: "Casa de prueba" } });
    expect(count()).toBeLessThan(total);
    fireEvent.click(screen.getByRole("button", { name: "Borrar búsqueda" }));
    expect(input().value).toBe("");
    expect(document.activeElement).toBe(input());
    expect(count()).toBe(total);
    expect(screen.queryByRole("button", { name: "Borrar búsqueda" })).toBeNull();
  });
  it("al buscar vacía el campo (vuelve el placeholder) pero mantiene el filtro y lo muestra como chip", async () => {
    await renderHome();
    const total = count();
    fireEvent.change(input(), { target: { value: "Casa de prueba" } });
    const filtered = count();
    expect(filtered).toBeLessThan(total);
    fireEvent.submit(input().form!);
    expect(input().value).toBe("");
    expect(input().placeholder).toBe("Buscar propiedad, ciudad o provincia");
    expect(count()).toBe(filtered);
    const chip = screen.getByText(/Resultados para/).closest(".search-chip") as HTMLElement;
    expect(chip.textContent).toContain("«Casa de prueba»");
    fireEvent.click(within(chip).getByRole("button", { name: "Quitar la búsqueda «Casa de prueba»" }));
    expect(count()).toBe(total);
    expect(screen.queryByText(/Resultados para/)).toBeNull();
  });
  it("escribir otra búsqueda reemplaza la anterior y «Limpiar filtros» quita ambas", async () => {
    await renderHome();
    const total = count();
    fireEvent.change(input(), { target: { value: "Casa de prueba" } });
    fireEvent.submit(input().form!);
    fireEvent.change(input(), { target: { value: "Departamento de prueba" } });
    expect(screen.queryByText(/Resultados para/)).toBeNull(); // mientras se escribe manda el texto nuevo
    expect(screen.getByRole("heading", { name: "Departamento de prueba" })).toBeTruthy();
    fireEvent.submit(input().form!);
    expect(screen.getByText(/Resultados para/).textContent).toContain("«Departamento de prueba»");
    fireEvent.click(screen.getAllByRole("button", { name: "Limpiar filtros" })[0]);
    expect(count()).toBe(total);
    expect(screen.queryByText(/Resultados para/)).toBeNull();
  });
  it("buscar con el campo vacío no cambia nada", async () => {
    await renderHome();
    const total = count();
    fireEvent.submit(input().form!);
    expect(count()).toBe(total);
    expect(screen.queryByText(/Resultados para/)).toBeNull();
  });
});
