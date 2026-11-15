import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Privacidad from "../app/privacidad/page";
import Terminos from "../app/terminos/page";
import { LEGAL_VERSION, TITULAR } from "../app/lib/legal";

describe("textos legales (Ley N.º 29733)", () => {
  it("la política de privacidad identifica al titular, finalidades, transferencias y derechos ARCO", () => {
    render(<Privacidad />);
    expect(screen.getByRole("heading", { level: 1, name: "Política de privacidad" })).toBeTruthy();
    const text = document.body.textContent ?? "";
    for (const value of [TITULAR.nombre, TITULAR.ruc, TITULAR.direccion, "Ley N.º 29733", "Derechos ARCO",
      "Autoridad Nacional de Protección de Datos Personales", "flujo transfronterizo", "teléfono de contacto"]) {
      expect(text).toContain(value);
    }
    expect(screen.getAllByRole("link", { name: TITULAR.correo }).length).toBeGreaterThan(0);
  });

  it("los términos aclaran que el portal no es intermediario ni cobra comisiones", () => {
    render(<Terminos />);
    const text = document.body.textContent ?? "";
    for (const value of ["no es una inmobiliaria", "no cobra comisiones", TITULAR.ruc, "Piura", "SUNARP"]) {
      expect(text).toContain(value);
    }
    expect(screen.getAllByRole("link", { name: "Política de privacidad" }).every(l => l.getAttribute("href") === "/privacidad")).toBe(true);
  });

  it("la versión legal es una fecha ISO", () => {
    expect(LEGAL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
