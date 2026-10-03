import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { normalizeContactPhone, propertyContactLinks } from "../app/lib/contact-phone";
import { normalizeListing } from "../app/lib/inventory";
import PropertyContactActions from "../app/components/PropertyContactActions";
import PropertyPage from "../app/inmueble/[slug]/page";
import Home from "../app/page";
import { properties } from "./fixtures/properties";
import { setInventory } from "./mocks/supabase";

vi.mock("../app/lib/auth-client", async () => {
  const { supabase } = await import("./mocks/supabase");
  return { getBrowserClient: () => ({ ...supabase, auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } }) };
});

describe("listing contact contract", () => {
  it.each(["900000001", "900 000 001", "900-000-001", "51900000001", "+51 900 000 001", "+51900000001"])("normalizes Peru mobile %s", value => {
    expect(normalizeContactPhone(value)).toBe("+51900000001");
  });
  it("accepts explicit international format without adding Peru twice", () => {
    expect(normalizeContactPhone("+1 (202) 555-0100")).toBe("+12025550100");
  });
  it.each([null, undefined, 900000001, "", " ", "123", "123456789", "+012345678", "+1234567890123456", "900abc001", "javascript:alert(1)", "+51900000001?x=1", "<script>", "+51/900000001", "++51900000001"])("rejects unsafe/invalid phone %s", value => {
    expect(normalizeContactPhone(value)).toBeNull();
    expect(propertyContactLinks(value, "Dummy")).toBeNull();
  });
  it("builds safe tel and encoded contextual WhatsApp links", () => {
    const title = 'Casa & jardín? "Piura" ñ';
    const links = propertyContactLinks("900000001", title)!;
    expect(links.tel).toBe("tel:+51900000001");
    const url = new URL(links.whatsapp);
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/51900000001");
    expect([...url.searchParams.keys()]).toEqual(["text"]);
    expect(url.searchParams.get("text")).toBe(`Hola, vi tu propiedad "${title}" en Inmuebles Directos y quisiera más información.`);
  });
  it("uses only listing contact, never profile or Auth phone", () => {
    expect(normalizeListing({ ...properties[0], phone: "900000001", profiles: { phone: "900000002" } })!.contactPhone).toBeNull();
    expect(normalizeListing({ ...properties[0], contact_phone: "+51900000001" })!.contactPhone).toBe("+51900000001");
  });
  it.each([null, "", "unsafe"])("hides unavailable legacy contact %s", phone => {
    render(<PropertyContactActions phone={phone} title="Dummy" status="published" />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
  it.each(["draft", "archived", undefined])("does not expose unpublished contact %s", status => {
    render(<PropertyContactActions phone="900000001" title="Private" status={status} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("updates contact links when the selected property changes", () => {
    const view = render(<PropertyContactActions phone="900000001" title="A" status="published" />);
    expect(screen.getByRole("link", { name: "Llamar al anunciante" }).getAttribute("href")).toBe("tel:+51900000001");
    view.rerender(<PropertyContactActions phone="900000002" title="B" status="published" />);
    expect(screen.getByRole("link", { name: "Llamar al anunciante" }).getAttribute("href")).toBe("tel:+51900000002");
    const chat = screen.getByRole("link", { name: "Contactar al anunciante por WhatsApp" });
    expect(chat.getAttribute("href")).toContain("wa.me/51900000002");
    expect(chat.getAttribute("rel")).toBe("noopener noreferrer");
    view.rerender(<PropertyContactActions phone={null} title="Legacy" status="published" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("renders actions on the canonical published page and returns 404 for draft", async () => {
    setInventory([{ ...properties[0], contact_phone: "900000001" }]);
    render(await PropertyPage({ params: Promise.resolve({ slug: "fixture-house" }) }));
    expect(screen.getByRole("link", { name: "Llamar al anunciante" }).getAttribute("href")).toBe("tel:+51900000001");
    setInventory([{ ...properties[0], status: "draft", contact_phone: "900000001" }]);
    await expect(PropertyPage({ params: Promise.resolve({ slug: "fixture-house" }) })).rejects.toThrow();
  });
  it("opens A, closes it and opens B with the correct drawer phone", async () => {
    setInventory(properties.map((p, i) => ({ ...p, contact_phone: i === 0 ? "900000001" : "900000002" })));
    render(<Home />);
    await screen.findByRole("heading", { name: "Casa de prueba" });
    for (const [title, phone] of [["Casa de prueba", "+51900000001"], ["Departamento de prueba", "+51900000002"]]) {
      const card = screen.getByRole("heading", { name: title }).closest("article")!;
      fireEvent.click(within(card).getByRole("button", { name: "Ver detalles" }));
      expect(screen.getByRole("link", { name: "Llamar al anunciante" }).getAttribute("href")).toBe(`tel:${phone}`);
      fireEvent.click(screen.getByRole("button", { name: "Cerrar detalle de propiedad" }));
      expect(screen.queryByRole("link", { name: "Llamar al anunciante" })).toBeNull();
    }
  });
});
