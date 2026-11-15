import Link from "next/link";
import { redirect } from "next/navigation";
import { getVerifiedUser } from "../lib/auth-server";
import { DashboardAuthorizationError } from "../lib/admin-auth-server";
import { loadOwnInventoryOverview } from "../lib/analytics/inventory-dashboard-server";
import InventoryOverview from "../components/analytics/InventoryOverview";
import AccountShell, { initials } from "../components/account/AccountShell";
import type { InventoryDashboardView } from "../lib/analytics/inventory-dashboard-view";
import { InventoryFilterError, parseInventoryDashboardFilters } from "../lib/analytics/inventory-dashboard-view";

export const dynamic = "force-dynamic";

const memberSince = new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "America/Lima" });

export default async function Account({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const { client, user } = await getVerifiedUser();
  if (!client || !user) redirect("/login?returnTo=/cuenta");
  const { data: profile } = await client.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const display = typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name.trim() : user.email || "Mi cuenta";
  const confirmed = Boolean((user as { email_confirmed_at?: string | null }).email_confirmed_at);
  const created = (user as { created_at?: string }).created_at;
  const since = created && !Number.isNaN(Date.parse(created)) ? memberSince.format(new Date(created)) : null;

  let analytics: InventoryDashboardView | null = null;
  let analyticsError: "filters" | "load" | null = null;
  let filterMessage = "";
  try { analytics = await loadOwnInventoryOverview(parseInventoryDashboardFilters(await searchParams ?? {})); }
  catch (error) {
    if (error instanceof DashboardAuthorizationError && error.status === 401) redirect("/login?returnTo=/cuenta");
    if (error instanceof InventoryFilterError) { analyticsError = "filters"; filterMessage = error.message; }
    else analyticsError = "load";
  }

  return (
    <AccountShell active="resumen" name={display} email={user.email} title="Mi cuenta" subtitle="Tu perfil, tus accesos y el estado de tus anuncios."
      action={<Link href="/publicar" className="acct-btn">Publicar propiedad</Link>}>
      <section className="acct-profile" aria-label="Perfil">
        <span className="acct-avatar" aria-hidden="true">{initials(display)}</span>
        <div>
          <h2>{display}</h2>
          {user.email && <p>{user.email}</p>}
          <span className={confirmed ? "acct-verified" : "acct-verified pending"}>{confirmed ? "Correo verificado" : "Correo sin verificar"}</span>
          {since && <p>Miembro desde {since}</p>}
        </div>
        <Link href="/mis-propiedades" className="acct-btn acct-btn-quiet">Gestionar anuncios</Link>
      </section>

      <nav className="acct-shortcuts" aria-label="Accesos rápidos">
        <Link href="/mis-propiedades" className="acct-shortcut"><strong>Tus anuncios</strong><span>Revisa precios, estados y fichas publicadas.</span></Link>
        <Link href="/publicar" className="acct-shortcut"><strong>Nuevo anuncio</strong><span>Publica gratis con hasta 5 fotos.</span></Link>
        <Link href="/" className="acct-shortcut"><strong>Ver el mapa</strong><span>Mira cómo aparecen tus inmuebles.</span></Link>
      </nav>

      {analytics && <InventoryOverview view={analytics} />}
      {analyticsError === "filters" && <div className="acct-alert" role="alert">Revisa los filtros: {filterMessage} <Link href="/cuenta">Limpiar filtros</Link></div>}
      {analyticsError === "load" && <div className="acct-alert" role="alert">No pudimos cargar los indicadores de tus anuncios. <a href="/cuenta">Volver a consultar</a></div>}

      <h2 className="acct-section-title">Seguridad</h2>
      <div className="acct-security">
        <p>Para cambiar tu contraseña te enviaremos un enlace a tu correo. Ábrelo en este mismo navegador.</p>
        <Link href="/recuperar-password" className="acct-btn acct-btn-quiet">Cambiar contraseña</Link>
      </div>

      <p className="acct-legal"><Link href="/terminos">Términos y condiciones</Link> · <Link href="/privacidad">Política de privacidad</Link></p>
    </AccountShell>
  );
}
