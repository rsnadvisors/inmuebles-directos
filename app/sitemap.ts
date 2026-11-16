import type { MetadataRoute } from "next";
import { siteOrigin } from "./lib/auth-origin";
import { supabase } from "./lib/supabase";

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
  try {
    const { data, error } = await supabase.from("properties").select("slug,published_at,updated_at")
      .eq("status", "published").order("published_at", { ascending: false }).limit(5000);
    if (error || !data) return base;
    return [...base, ...data.filter(p => typeof p.slug === "string" && p.slug).map(p => ({
      url: `${origin}/inmueble/${encodeURIComponent(p.slug as string)}`,
      lastModified: (p.updated_at ?? p.published_at ?? undefined) as string | undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }))];
  } catch {
    return base; // si la base no responde, el mapa del sitio sigue siendo válido
  }
}
