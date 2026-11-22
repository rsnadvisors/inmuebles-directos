import { describe, expect, it } from "vitest";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { setInventory } from "./mocks/supabase";
import { properties } from "./fixtures/properties";

describe("SEO para Search Console", () => {
  it("robots permite el sitio público, bloquea lo privado y apunta al sitemap del dominio", () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.allow).toEqual(["/", "/api/property-images/"]);
    for (const path of ["/api/", "/admin", "/cuenta", "/mis-propiedades", "/publicar"]) expect(rule.disallow).toContain(path);
    expect(r.sitemap).toBe("https://inmueblesdirectosperu.com/sitemap.xml");
  });
  it("el sitemap lista la portada, los textos legales y solo los anuncios publicados", async () => {
    setInventory([{ ...properties[0], slug: "casa-publicada", status: "published", published_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-10T00:00:00Z" },
      { ...properties[0], id: "otro", slug: "borrador", status: "draft" }]);
    const urls = (await sitemap()).map(e => e.url);
    expect(urls).toContain("https://inmueblesdirectosperu.com/");
    expect(urls).toContain("https://inmueblesdirectosperu.com/privacidad");
    expect(urls).toContain("https://inmueblesdirectosperu.com/inmueble/casa-publicada");
    expect(urls.some(u => u.includes("borrador"))).toBe(false);
  });
});
