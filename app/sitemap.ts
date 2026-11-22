import type { MetadataRoute } from "next";
import { siteOrigin } from "./lib/auth-origin";
import { supabase } from "./lib/supabase";
import { allLandings } from "./lib/landing";
import { readHomeListings } from "./lib/property";

export const revalidate = 3600; // se regenera como máximo cada hora

/** Mapa del sitio para Google: portada, textos legales y cada anuncio publicado. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const base: MetadataRoute.Sitemap = [
    { url: `${origin}/`, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/terminos`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${origin}/privacidad`, changeFrequency: "yearly", priority: 0.2 },
  ];
  if (!supabase) return base;
  // Páginas por operación, ciudad y tipo con anuncios suficientes para indexarse (las demás llevan noindex).
  let landings: MetadataRoute.Sitemap = [];
  try {
    const listings = await readHomeListings();
    if (listings) landings = allLandings(listings).filter(page => page.indexable).map(page => ({
      url: `${origin}${page.path}`, changeFrequency: "daily" as const, priority: page.type ? 0.6 : page.city ? 0.8 : 0.7,
    }));
  } catch { landings = []; }
  try {
    const { data, error } = await supabase.from("properties").select("slug,published_at,updated_at")
      .eq("status", "published").order("published_at", { ascending: false }).limit(5000);
    if (error || !data) return [...base, ...landings];
    return [...base, ...landings, ...data.filter(p => typeof p.slug === "string" && p.slug).map(p => ({
      url: `${origin}/inmueble/${encodeURIComponent(p.slug as string)}`,
      lastModified: (p.updated_at ?? p.published_at ?? undefined) as string | undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }))];
  } catch {
    return [...base, ...landings]; // si la base no responde, el mapa del sitio sigue siendo válido
  }
}
