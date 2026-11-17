import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import EditListingForm, { type EditListingInitial } from "../app/components/account/EditListingForm";

const base: EditListingInitial = { id: "34da4627-df58-4b7d-bff8-e51f1fd7190b", title: "Excelente casa en Piura", property_type: "house", listing_type: "sale",
  price: 250000, currency: "USD", contact_phone: "+51987654321", maintenance_fee: null, area_total_m2: 450, area_built_m2: 350, bedrooms: 4, bathrooms: 3,
  parking_spaces: 2, floors: 2, description: "Casa amplia", address: "Urb. Miraflores", district: "Castilla", city: "Piura", region: "Piura", lat: -5.13022, lng: -80.64051 };
const sent = () => JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body)).fields;
const save = () => fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))); });

describe("ubicación al editar un anuncio", () => {
  it("muestra el mapa con el pin en la ubicación guardada, sin campos de latitud y longitud", () => {
    render(<EditListingForm initial={base} />);
    expect(screen.getByText("Arrastra el puntero para fijar el punto en el mapa.")).toBeTruthy();
    expect(screen.getByTestId("pin-del-mapa").textContent).toBe("-5.13022,-80.64051");
    expect(screen.getByText("✓ Ubicación fijada: -5.13022, -80.64051")).toBeTruthy();
    expect(screen.queryByLabelText("Latitud")).toBeNull();
    expect((screen.getByLabelText("Coordenadas") as HTMLInputElement).value).toBe("-5.13022, -80.64051");
  });
  it("guardar sin tocar el mapa conserva la ubicación", async () => {
    render(<EditListingForm initial={base} />); save();
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(sent()).toMatchObject({ lat: -5.13022, lng: -80.64051 });
  });
  it("mover el pin cambia la ubicación que se guarda, redondeada a 6 decimales", async () => {
    render(<EditListingForm initial={base} />);
    fireEvent.click(screen.getByRole("button", { name: "Soltar pin de prueba" }));
    expect(screen.getByText("✓ Ubicación fijada: -5.176585, -80.610694")).toBeTruthy();
    save(); await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(sent()).toMatchObject({ lat: -5.176585, lng: -80.610694 });
  });
  it("pegar coordenadas de Google Maps mueve el pin", async () => {
    render(<EditListingForm initial={base} />);
    fireEvent.change(screen.getByLabelText("Coordenadas"), { target: { value: "-5.1945, -80.6328" } });
    expect(screen.getByTestId("pin-del-mapa").textContent).toBe("-5.1945,-80.6328");
    save(); await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(sent()).toMatchObject({ lat: -5.1945, lng: -80.6328 });
  });
  it("un punto fuera de Perú no reemplaza la ubicación guardada", () => {
    render(<EditListingForm initial={base} />);
    fireEvent.click(screen.getByRole("button", { name: "Soltar pin fuera de Perú" }));
    expect(screen.getByRole("alert").textContent).toContain("fuera del área permitida");
    expect(screen.getByTestId("pin-del-mapa").textContent).toBe("-5.13022,-80.64051");
  });
  it("sin ubicación válida no se envía nada", () => {
    render(<EditListingForm initial={{ ...base, lat: null, lng: null }} />);
    expect(screen.getByText(/Ubicación sin fijar/)).toBeTruthy();
    save(); expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Fija la ubicación del inmueble en el mapa.");
  });
  it("«Ir a mi ubicación» mueve el pin a la posición del dispositivo", () => {
    const getCurrentPosition = vi.fn((ok: (p: { coords: { latitude: number; longitude: number } }) => void) => ok({ coords: { latitude: -5.2, longitude: -80.6 } }));
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    render(<EditListingForm initial={base} />);
    fireEvent.click(screen.getByRole("button", { name: "Ir a mi ubicación" }));
    expect(screen.getByTestId("pin-del-mapa").textContent).toBe("-5.2,-80.6");
  });
});
