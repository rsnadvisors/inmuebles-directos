import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../app/lib/auth-client", () => ({ getBrowserClient: () => null }));

import AccountMenu from "../app/components/account/AccountMenu";
import AccountShell from "../app/components/account/AccountShell";

describe("menú de cuenta en el móvil", () => {
  it("está cerrado y se abre desde el avatar con nombre, correo y Cerrar sesión", () => {
    render(<AccountMenu name="Ricardo Sancarranco" email="dueno@example.test" initials="RS" />);
    const trigger = screen.getByRole("button", { name: "Abrir el menú de tu cuenta" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Cerrar sesión")).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const panel = screen.getByRole("region", { name: "Menú de tu cuenta" });
    expect(panel.textContent).toContain("Ricardo Sancarranco");
    expect(panel.textContent).toContain("dueno@example.test");
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Descargar mis datos" }).getAttribute("href")).toBe("/api/mi-cuenta/datos");
    expect(screen.getByRole("link", { name: "Ayuda por WhatsApp" }).getAttribute("href")).toBe("https://wa.me/51979901267");
  });
  it("se cierra con Escape devolviendo el foco, al tocar fuera y al elegir una opción", () => {
    render(<><AccountMenu name="Ana" initials="AN" /><p>fuera</p></>);
    const trigger = screen.getByRole("button", { name: "Abrir el menú de tu cuenta" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByText("fuera"));
    expect(screen.queryByRole("region")).toBeNull();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("link", { name: "Política de privacidad" }));
    expect(screen.queryByRole("region")).toBeNull();
  });
  it("el panel de cuenta incluye el menú en la barra superior del móvil", () => {
    render(<AccountShell active="resumen" name="Ricardo Sancarranco" email="dueno@example.test" title="Mi cuenta"><p>contenido</p></AccountShell>);
    const topbar = document.querySelector(".acct-topbar")!;
    expect(topbar.querySelector("button.acct-menu-trigger")?.textContent).toBe("RS");
  });
});
