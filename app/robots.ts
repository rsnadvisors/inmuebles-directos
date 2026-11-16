import type { MetadataRoute } from "next";
import { siteOrigin } from "./lib/auth-origin";

/** Buscadores: indexar el mapa y las fichas; no las áreas privadas ni la API. */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/cuenta", "/mis-propiedades", "/publicar", "/auth/", "/restablecer-password", "/cuenta-eliminada"] }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
