import Link from "next/link";
import { redirect } from "next/navigation";
import { getVerifiedUser } from "../lib/auth-server";
import AccountShell, { initials } from "../components/account/AccountShell";
import SignOutButton from "../components/SignOutButton";
import QuickStatusButton from "../components/account/QuickStatusButton";
import { ListingContactsChart, WeeklyContactsChart } from "../components/account/OwnerCharts";
import { attentionItems, contactRate, contacts, counts, trend, type Counts, type OwnerListing, type Week } from "../lib/owner-dashboard";

export const dynamic = "force-dynamic";

const memberSince = new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "America/Lima" });
const fmt = (v: number) => v.toLocaleString("es-PE");

function Delta({ delta, unit = "vs. 30 días anteriores" }: { delta: number | null; unit?: string }) {
  if (delta === null) return <span className="acct-kpi-d">sin periodo anterior para comparar</span>;
  const cls = delta > 0 ? "acct-kpi-d up" : delta < 0 ? "acct-kpi-d down" : "acct-kpi-d";
  return <span className={cls}>{delta > 0 ? "+" : ""}{delta} % {unit}</span>;
}

export default async function Account() {
  const { client, user } = await getVerifiedUser();
  if (!client || !user) redirect("/login?returnTo=/cuenta");

  const safeRpc = async (name: string, args: Record<string, unknown>) => {
    try { const { data, error } = await client.rpc(name, args); return error ? null : data; } catch { return null; }
  };
  const [{ data: profile }, { data: rows, error: listingsError }, stats30Raw, stats60Raw, weeklyRaw] = await Promise.all([
    client.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    client.from("properties")
      .select("id,title,slug,status,listing_type,published_at,renewed_at,expired_at,deletion_requested_at,is_reserved,owner_paused,closed_via_portal,property_images(id)")
      .eq("owner_id", user.id).order("created_at", { ascending: false }),
    safeRpc("owner_listing_stats", { p_days: 30 }),
    safeRpc("owner_listing_stats", { p_days: 60 }),
    safeRpc("owner_listing_weekly", { p_weeks: 8 }),
  ]);

  const display = typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name.trim() : user.email || "Mi cuenta";
  const firstName = display.includes("@") ? "" : display.split(/\s+/)[0];
  const confirmed = Boolean((user as { email_confirmed_at?: string | null }).email_confirmed_at);
  const created = (user as { created_at?: string }).created_at;
  const since = created && !Number.isNaN(Date.parse(created)) ? memberSince.format(new Date(created)) : null;

  const listings: OwnerListing[] = ((rows ?? []) as (Omit<OwnerListing, "photos"> & { property_images?: { id: string }[] })[])
    .map(({ property_images, ...l }) => ({ ...l, photos: property_images?.length ?? 0 }));
  const statsAvailable = stats30Raw !== null && stats60Raw !== null;
  const s30: Record<string, Counts> = Object.fromEntries(Object.entries((stats30Raw ?? {}) as Record<string, unknown>).map(([k, v]) => [k, counts(v)]));
  const s60: Record<string, Counts> = Object.fromEntries(Object.entries((stats60Raw ?? {}) as Record<string, unknown>).map(([k, v]) => [k, counts(v)]));
  const sum = (m: Record<string, Counts>) => Object.values(m).reduce((a, c) => ({ view: a.view + c.view, call: a.call + c.call, whatsapp: a.whatsapp + c.whatsapp }), { view: 0, call: 0, whatsapp: 0 });
  const total30 = sum(s30), total60 = sum(s60);
  const prev30: Counts = { view: total60.view - total30.view, call: total60.call - total30.call, whatsapp: total60.whatsapp - total30.whatsapp };
  const contactTrend = trend(contacts(total30), contacts(prev30));
  const viewTrend = trend(total30.view, prev30.view);
  const rate = contactRate(total30);
  const weeks: Week[] = Array.isArray(weeklyRaw) ? (weeklyRaw as Record<string, unknown>[]).map(w => ({ week: String(w.week), ...counts(w) })) : [];
  const hasActivity = weeks.some(w => w.view + w.call + w.whatsapp > 0);

  const published = listings.filter(l => l.status === "published" && !l.deletion_requested_at);
  const paused = listings.filter(l => l.status === "archived" && !!l.owner_paused && !l.deletion_requested_at).length;
  const attention = attentionItems(listings, s30);
  const now = Date.now();
  const perListing = published.map(l => ({ id: l.id, title: l.title, counts: s30[l.id] ?? counts(null),
    ageDays: (now - Date.parse(l.renewed_at ?? l.published_at ?? new Date(now).toISOString())) / 86_400_000 }))
    .sort((a, b) => contacts(b.counts) - contacts(a.counts));

  const subtitle = listings.length === 0 ? "Aquí verás cómo rinden tus anuncios."
    : `${published.length} ${published.length === 1 ? "anuncio publicado" : "anuncios publicados"}${paused ? ` · ${paused} sin publicar` : ""}${statsAvailable ? ` · ${fmt(contacts(total30))} ${contacts(total30) === 1 ? "contacto" : "contactos"} en 30 días` : ""}`;

  return (
    <AccountShell active="resumen" name={display} email={user.email} title={firstName ? `Hola, ${firstName}` : "Mi cuenta"} subtitle={subtitle}
      action={<Link href="/publicar" className="acct-btn">+ Publicar propiedad</Link>}>

      {listingsError && <div className="acct-alert" role="alert">No pudimos cargar tus anuncios. <a href="/cuenta">Volver a intentar</a></div>}

      {!listingsError && listings.length === 0 && <div className="acct-empty"><h2>Publica tu primer inmueble</h2>
        <p>Es gratis. Aquí verás cuántas personas lo visitan y te contactan por llamada o WhatsApp.</p>
        <Link href="/publicar" className="acct-btn">Publicar propiedad</Link></div>}

      {listings.length > 0 && <>
        <section aria-labelledby="attn-title" className="acct-block">
          <h2 id="attn-title" className="acct-section-title">Necesita tu atención</h2>
          {attention.length === 0 ? <p className="acct-ok">Todo en orden: no hay nada pendiente en tus anuncios.</p>
            : <ul className="acct-attn">
              {attention.map(item => {
                const id = item.key.slice(item.key.indexOf("-") + 1);
                return <li key={item.key} className={`acct-attn-card ${item.tone}`}>
                  <strong>{item.title}</strong><span>{item.detail}</span>
                  {item.action.kind === "status" ? <QuickStatusButton id={id} action={item.action.status} label={item.action.label} />
                    : <Link href={item.action.href} className="acct-btn acct-btn-quiet">{item.action.label}</Link>}
                </li>;
              })}
            </ul>}
        </section>

        <section aria-label="Resultados de los últimos 30 días" className="acct-kpis">
          {statsAvailable ? <>
            <div className="acct-kpi"><small>Contactos · 30 días</small><strong>{fmt(contacts(total30))}</strong><Delta delta={contactTrend.delta} />
              <span className="acct-kpi-d">{fmt(total30.whatsapp)} por WhatsApp · {fmt(total30.call)} llamadas</span></div>
            <div className="acct-kpi"><small>Visitas a tus anuncios</small><strong>{fmt(total30.view)}</strong><Delta delta={viewTrend.delta} /></div>
            <div className="acct-kpi"><small>De cada 100 visitas, contactan</small><strong>{rate === null ? "—" : rate.toLocaleString("es-PE")}</strong>
              <span className="acct-kpi-d">{rate === null ? "se calcula a partir de 20 visitas" : "llamadas y WhatsApp"}</span></div>
          </> : <p className="acct-alert">No pudimos cargar tus estadísticas. Tus anuncios siguen publicados con normalidad.</p>}
        </section>

        {statsAvailable && <div className="acct-charts">
          <section className="acct-chart-panel" aria-labelledby="chart-weeks">
            <h3 id="chart-weeks">¿Cuántas personas te contactan cada semana?</h3>
            <p className="acct-legend"><span><i className="acct-chart-a" />WhatsApp</span><span><i className="acct-chart-b" />Llamadas</span><span><i className="acct-chart-line-key" />Visitas</span></p>
            {hasActivity ? <WeeklyContactsChart weeks={weeks} />
              : <p className="acct-chart-empty">Aún no hay visitas registradas en las últimas 8 semanas. Comparte el enlace de tus anuncios para empezar a recibirlas.</p>}
            <p className="acct-chart-note">Si suben las visitas pero no los contactos, revisa el precio y las fotos.</p>
          </section>
          <section className="acct-chart-panel" aria-labelledby="chart-listings">
            <h3 id="chart-listings">¿Qué anuncio rinde y cuál necesita ayuda?</h3>
            {perListing.length ? <ListingContactsChart rows={perListing} />
              : <p className="acct-chart-empty">Cuando tengas anuncios publicados verás aquí sus contactos.</p>}
            <p className="acct-chart-note">Contactos (llamadas y WhatsApp) de los últimos 30 días. Cifras aproximadas.</p>
          </section>
        </div>}

        <p className="acct-more"><Link href="/mis-propiedades" className="acct-btn acct-btn-quiet">Ver y gestionar mis anuncios</Link></p>
      </>}

      <section aria-labelledby="account-title" className="acct-block">
        <h2 id="account-title" className="acct-section-title">Tu cuenta</h2>
        <div className="acct-account">
          <div className="acct-account-id">
            <span className="acct-avatar" aria-hidden="true">{initials(display)}</span>
            <div><strong>{display}</strong>{user.email && <small>{user.email}</small>}
              <small>{confirmed ? "Correo verificado" : "Correo sin verificar"}{since ? ` · miembro desde ${since}` : ""}</small></div>
          </div>
          <div className="acct-manage-buttons">
            <Link href="/recuperar-password" className="acct-btn acct-btn-quiet">Cambiar contraseña</Link>
            <a href="/api/mi-cuenta/datos" className="acct-btn acct-btn-quiet" download>Descargar mis datos</a>
            <span className="acct-signout-inline"><SignOutButton /></span>
            <Link href="/cuenta/eliminar" className="acct-btn acct-btn-danger">Eliminar mi cuenta</Link>
          </div>
        </div>
      </section>

      <p className="acct-legal"><Link href="/terminos">Términos y condiciones</Link> · <Link href="/privacidad">Política de privacidad</Link></p>
    </AccountShell>
  );
}
