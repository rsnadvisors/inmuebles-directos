import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const leaflet = vi.hoisted(() => ({ handlers: {} as Record<string, (e: unknown) => void>, marker: null as null | Record<string, unknown>, setView: vi.fn() }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  TileLayer: ({ url }: { url: string }) => <i data-testid="tiles" data-url={url} />,
  Marker: (props: Record<string, unknown>) => { leaflet.marker = props; return <b data-testid="pin" data-draggable={String(props.draggable)} />; },
  useMapEvents: (handlers: Record<string, (e: unknown) => void>) => { leaflet.handlers = handlers; return null; },
  useMap: () => ({ getBounds: () => ({ pad: () => ({ contains: () => false }) }), getZoom: () => 13, setView: leaflet.setView }),
}));
import LocationPicker from "../app/publicar/LocationPicker";

it("tocar el mapa y arrastrar el pin informan el punto elegido", () => {
  const onPick = vi.fn();
  render(<LocationPicker value={null} onPick={onPick} />);
  leaflet.handlers.click({ latlng: { lat: -5.2, lng: -80.6 } });
  expect(onPick).toHaveBeenLastCalledWith(-5.2, -80.6);
  const handlers = leaflet.marker!.eventHandlers as { dragend: (e: unknown) => void };
  handlers.dragend({ target: { getLatLng: () => ({ lat: -5.19, lng: -80.63 }) } });
  expect(onPick).toHaveBeenLastCalledWith(-5.19, -80.63);
  expect(screen.getByTestId("pin").dataset.draggable).toBe("true");
});
it("desactivado no mueve el pin; el selector alterna mapa y satélite", () => {
  const onPick = vi.fn();
  render(<LocationPicker value={{ lat: -5.19, lng: -80.63 }} onPick={onPick} disabled />);
  leaflet.handlers.click({ latlng: { lat: -5.2, lng: -80.6 } });
  expect(onPick).not.toHaveBeenCalled();
  expect(screen.getByTestId("pin").dataset.draggable).toBe("false");
  expect(screen.getByTestId("tiles").dataset.url).toContain("openstreetmap");
  fireEvent.click(screen.getByRole("button", { name: "Satélite" }));
  expect(screen.getByTestId("tiles").dataset.url).toContain("World_Imagery");
  expect(leaflet.setView).toHaveBeenCalled(); // lleva el mapa al punto recibido desde fuera
});
it("el botón «Ir a mi ubicación» vive dentro del mapa y se desactiva al enviar", () => {
  const onLocate = vi.fn();
  const view = render(<LocationPicker value={null} onPick={vi.fn()} onLocate={onLocate} />);
  fireEvent.click(screen.getByRole("button", { name: "Ir a mi ubicación" }));
  expect(onLocate).toHaveBeenCalledOnce();
  view.rerender(<LocationPicker value={null} onPick={vi.fn()} onLocate={onLocate} disabled />);
  expect((screen.getByRole("button", { name: "Ir a mi ubicación" }) as HTMLButtonElement).disabled).toBe(true);
});
