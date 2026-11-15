import { getVerifiedUser } from "../../../lib/auth-server";
import { failure } from "../../../lib/owner-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Derecho de acceso (Ley N.º 29733): descarga en JSON de los datos personales que guarda la plataforma. */
export async function GET(): Promise<Response> {
  let auth: Awaited<ReturnType<typeof getVerifiedUser>>;
  try { auth = await getVerifiedUser(); } catch { return failure("UNAVAILABLE", "El servicio no está disponible.", 503); }
  const { client, user } = auth;
  if (!client || !user) return failure("AUTH_REQUIRED", "Inicia sesión para descargar tus datos.", 401);
  const [profile, properties, favorites] = await Promise.all([
    client.from("profiles").select("id,full_name,phone,role,avatar_url,created_at").eq("id", user.id).maybeSingle(),
    client.from("properties").select("*,property_images(id,storage_path,sort_order,is_cover,alt_text)").eq("owner_id", user.id).order("created_at"),
    client.from("favorites").select("property_id,created_at").eq("user_id", user.id),
  ]);
  if (profile.error || properties.error || favorites.error) return failure("UNAVAILABLE", "No pudimos reunir tus datos. Inténtalo más tarde.", 503);
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const body = {
    generado: new Date().toISOString(),
    responsable: "Inmuebles Directos · Ricardo Vicente Sancarranco Navarrete (RUC 10028050025)",
    cuenta: { id: user.id, correo: user.email ?? null, creada: user.created_at ?? null, ultimo_acceso: user.last_sign_in_at ?? null,
      correo_confirmado: user.email_confirmed_at ?? null, nombre_registrado: meta.full_name ?? null,
      textos_legales_aceptados: { version: meta.legal_version ?? null, fecha: meta.legal_accepted_at ?? null } },
    perfil: profile.data ?? null,
    anuncios: properties.data ?? [],
    favoritos: favorites.data ?? [],
    nota: "Las fotos se incluyen como referencias; puedes verlas desde cada anuncio. Para ejercer otros derechos ARCO escribe a casasyterrenosenpiura@gmail.com.",
  };
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(body, null, 2), { headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="inmuebles-directos-mis-datos-${date}.json"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
