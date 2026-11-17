// @vitest-environment node
import { describe, expect, it } from "vitest";
import { roundCoordinate, validatePublication } from "../app/lib/publication";

function form(latitude: string, longitude: string) {
  const f = new FormData();
  Object.entries({ title: "Terreno", description: "Prueba", address: "Calle 1", city: "Piura", region: "Piura", contact_phone: "900000001",
    operation: "Vender", type: "Terrenos", price: "65000", currency: "USD", latitude, longitude, coordinatesConfirmed: "true" })
    .forEach(([k, v]) => f.set(k, v));
  f.append("images", new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" }));
  return f;
}

describe("coordenadas con muchas cifras (clic en el mapa)", () => {
  it("se aceptan y se redondean a 6 decimales", () => {
    const input = validatePublication(form("-5.176585364261654", "-80.61069405048632"));
    expect(input.lat).toBe(-5.176585);
    expect(input.lng).toBe(-80.610694);
  });
  it("lo guardado sobrevive a la salida de Postgres con 15 cifras (extra_float_digits=0)", () => {
    for (const raw of [-5.176585364261654, -80.61069405048632, -18.999999999999996, -0.5000004, -12.0464, -77.042793]) {
      const v = roundCoordinate(raw);
      expect(Number(v.toPrecision(15))).toBe(v);
    }
  });
  it("las coordenadas cortas no cambian y las de fuera de Perú se siguen rechazando", () => {
    expect(validatePublication(form("-5.18282", "-80.60956"))).toMatchObject({ lat: -5.18282, lng: -80.60956 });
    expect(() => validatePublication(form("40.4168", "-3.7038"))).toThrow(/dentro del área de Perú/);
  });
});
