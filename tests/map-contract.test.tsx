import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { normalizeListing, MappableListing } from "../app/lib/inventory";
import { properties } from "./fixtures/properties";
import PiuraMap from "../app/PiuraMap";

const mapView = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <section>{children}</section>,
  TileLayer: () => null,
  Marker: ({ children, icon, eventHandlers }) => <div><button onClick={eventHandlers.click} dangerouslySetInnerHTML={{ __html: icon.options.html }} />{children}</div>,
  Popup: ({ children }) => <aside>{children}</aside>,
  useMap: () => mapView.current ?? ({ locate: vi.fn(), closePopup: vi.fn(), setView: vi.fn() }),
}));

it.each(["PEN", "USD"])("actual map component preserves %s office semantics and selection", currency => {
  const listing = normalizeListing({ ...properties[0], currency, price: 250000, property_type: "office" }) as MappableListing;
  const select = vi.fn(); render(<PiuraMap properties={[listing]} onSelect={select} />);
  const price = currency === "PEN" ? "S/ 250,000" : "US$ 250,000";
  const marker = screen.getByRole("button", { name: new RegExp(price.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  expect(screen.getByRole("complementary").textContent).toContain(`Comprar · Oficinas · ${price}`);
  fireEvent.click(marker); expect(select).toHaveBeenCalledWith(listing);
  expect(screen.queryByText(/\/mes/)).toBeNull();
});

it("al cambiar los resultados lleva el mapa hasta el pin que quedó fuera de la vista, pero no en la primera carga", async () => {
  const view = { setView: vi.fn(), fitBounds: vi.fn(), getZoom: () => 13, getBounds: () => ({ pad: () => ({ contains: () => false }) }),
    locate: vi.fn(), closePopup: vi.fn(), getContainer: () => null, invalidateSize: vi.fn() };
  mapView.current = view;
  const all = properties.map(p => normalizeListing(p)).filter((p): p is MappableListing => !!p && !!p.coords);
  const { rerender } = render(<PiuraMap properties={all} />);
  expect(view.setView).not.toHaveBeenCalled(); expect(view.fitBounds).not.toHaveBeenCalled();
  vi.useFakeTimers();
  rerender(<PiuraMap properties={[all[0]]} />);
  rerender(<PiuraMap properties={all.slice(0, 2)} />); // escribiendo: el primer cambio se descarta
  rerender(<PiuraMap properties={[all[0]]} />);
  expect(view.setView).not.toHaveBeenCalled();
  vi.advanceTimersByTime(500);
  expect(view.setView).toHaveBeenCalledOnce();
  expect(view.setView).toHaveBeenCalledWith(all[0].coords, 15, { animate: true });
  rerender(<PiuraMap properties={all.slice(0, 2)} />);
  vi.advanceTimersByTime(500);
  expect(view.fitBounds).toHaveBeenCalledOnce();
  vi.useRealTimers();
  mapView.current = null;
});
