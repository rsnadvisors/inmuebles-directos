import type { MetadataRoute } from "next";
import { siteOrigin } from "./lib/auth-origin";

/** Buscadores: indexar el mapa y las fichas; no las áreas privadas ni la API. */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    // Las fotos públicas se sirven desde /api/property-images/: Google debe poder descargarlas (Imágenes, vista previa).
    rules: [{ userAgent: "*", allow: ["/", "/api/property-images/"], disallow: ["/api/", "/admin", "/cuenta", "/mis-propiedades", "/publicar", "/auth/", "/restablecer-password", "/cuenta-eliminada"] }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
