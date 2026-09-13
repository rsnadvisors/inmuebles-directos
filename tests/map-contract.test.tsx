import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { normalizeListing, MappableListing } from "../app/lib/inventory";
import { properties } from "./fixtures/properties";
import PiuraMap from "../app/PiuraMap";

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <section>{children}</section>,
  TileLayer: () => null,
  Marker: ({ children, icon, eventHandlers }) => <div><button onClick={eventHandlers.click} dangerouslySetInnerHTML={{ __html: icon.options.html }} />{children}</div>,
  Popup: ({ children }) => <aside>{children}</aside>,
  useMap: () => ({ locate: vi.fn(), closePopup: vi.fn(), setView: vi.fn() }),
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
