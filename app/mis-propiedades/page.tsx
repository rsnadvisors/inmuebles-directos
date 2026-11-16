import Link from "next/link";
import { redirect } from "next/navigation";
import { getVerifiedUser } from "../lib/auth-server";
import { formatPrice } from "../lib/inventory";
import { resolvePropertyImage } from "../lib/property-image-source";
import AccountShell from "../components/account/AccountShell";
import ListingActions from "../components/account/ListingActions";
import { daysLeft, listingExpiry, listingStatusLabel } from "../lib/listing-management";
import { siteOrigin } from "../lib/auth-origin";

export const dynamic = "force-dynamic";

const TYPE: Record<string, string> = { house: "Casa", apartment: "Departamento", land: "Terreno", office: "Oficina", commercial: "Local comercial" };
const OPERATION: Record<string, string> = { sale: "Venta", rent: "Alquiler" };
const TABS: { key: string; label: string; match: (r: Row) => boolean }[] = [
  { key: "todas", label: "Todas", match: (_r: Row) => true },
  { key: "publicadas", label: "Publicadas", match: (r: Row) => r.status === "published" && !r.deletion_requested_at },
  { key: "borradores", label: "Borradores", match: (r: Row) => r.status === "draft" },
  { key: "cerradas", label: "Cerradas", match: (r: Row) => r.status !== "draft" && (r.status !== "published" || !!r.deletion_requested_at) },
];
const dateFormat = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Lima" });

type Row = { id: string; title: string; slug: string; status: string; price: number; currency: string; property_type: string; listing_type: string;
  district: string | null; city: string | null; published_at: string | null; created_at: string;
  is_reserved?: boolean | null; owner_paused?: boolean | null; deletion_requested_at?: string | null;
  renewed_at?: string | null; expired_at?: string | null; closed_via_portal?: boolean | null; moderation_note?: string | null; review_requested_at?: string | null;
  property_images?: { id: string; storage_bucket: string | null; public_url: string | null; sort_order: number; is_cover: boolean }[] };

function cover(row: Row): string | null {
  const images = [...(row.property_images ?? [])].sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order);
  const first = images[0];
  if (!first) return null;
  const src = resolvePropertyImage(first);
  // Drafts are not public: the owner sees them through the authenticated preview route.
  return src && row.status !== "published" && src.startsWith("/api/property-images/") ? `${src}/preview` : src;
}

function expiryText(row: Row): string {
  if (row.status !== "published" || row.deletion_requested_at) return "";
  const expiry = listingExpiry(row);
  const left = daysLeft(expiry);
  if (!expiry || left === null) return "";
  return left <= 0 ? " · Vence hoy" : ` · Vence el ${dateFormat.format(expiry)}${left <= 15 ? ` (en ${left} ${left === 1 ? "día" : "días"})` : ""}`;
}
function statsText(s?: { view?: number | null; call?: number | null; whatsapp?: number | null }): string {
  const n = (v?: number | null) => Number(v ?? 0);
  const plural = (v: number, one: string, many: string) => `${v.toLocaleString("es-PE")} ${v === 1 ? one : many}`;
  return `Últimos 30 días (aprox.): ${plural(n(s?.view), "visita", "visitas")} · ${plural(n(s?.call), "llamada", "llamadas")} · ${plural(n(s?.whatsapp), "clic", "clics")} en WhatsApp`;
}

export default async function MyProperties({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const { client, user } = await getVerifiedUser();
  if (!client || !user) redirect("/login?returnTo=/mis-propiedades");
  const [{ data: profile }, { data, error }, statsResult] = await Promise.all([
    client.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    client.from("properties")
      .select("id,title,slug,status,price,currency,property_type,listing_type,district,city,published_at,created_at,is_reserved,owner_paused,deletion_requested_at,renewed_at,expired_at,closed_via_portal,moderation_note,review_requested_at,property_images(id,storage_bucket,public_url,sort_order,is_cover)")
      .eq("owner_id", user.id).order("created_at", { ascending: false }),
    // Aggregated, owner-only counters; a failure here never hides the listings.
    Promise.resolve(client.rpc("owner_listing_stats", { p_days: 30 })).catch(() => ({ data: null })),
  ]);
  const stats = (statsResult?.data ?? {}) as Record<string, { view?: number | null; call?: number | null; whatsapp?: number | null }>;
  const display = typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name.trim() : user.email || "Mi cuenta";
  const rows = (data ?? []) as Row[];
  const origin = siteOrigin();
  const query = await searchParams ?? {};
  const requested = query.estado;
  const updated = query.actualizado === "1";
  const tab = TABS.find(t => t.key === requested) ?? TABS[0];
  const visible = rows.filter(row => tab.match(row));
  const published = rows.filter(row => row.status === "published" && !row.deletion_requested_at).length;

  return (
    <AccountShell active="propiedades" name={display} email={user.email} title="Mis propiedades"
      subtitle={rows.length ? `${rows.length} ${rows.length === 1 ? "anuncio" : "anuncios"}, ${published} ${published === 1 ? "publicado" : "publicados"}` : "Aquí verás los inmuebles que publiques."}
      action={<Link href="/publicar" className="acct-btn">Publicar propiedad</Link>}>
      {updated && <p className="acct-notice" role="status">Cambios guardados.</p>}
      {error ? <div className="acct-alert" role="alert">No pudimos cargar tus propiedades. <a href="/mis-propiedades">Volver a intentar</a></div> : <>
        {rows.length > 0 && <nav className="acct-tabs" aria-label="Filtrar por estado">
          {TABS.map(t => <Link key={t.key} href={t.key === "todas" ? "/mis-propiedades" : `/mis-propiedades?estado=${t.key}`} aria-current={t.key === tab.key ? "page" : undefined}>
            {t.label}{" "}<b>{rows.filter(row => t.match(row)).length}</b></Link>)}
        </nav>}
        {!rows.length ? <div className="acct-empty"><h2>Aún no tienes anuncios</h2><p>Publica tu primer inmueble gratis. Los interesados te contactarán directamente.</p><Link href="/publicar" className="acct-btn">Publicar propiedad</Link></div>
          : !visible.length ? <div className="acct-empty"><h2>No hay anuncios en «{tab.label}»</h2><p>Prueba con otra pestaña.</p><Link href="/mis-propiedades" className="acct-btn acct-btn-quiet">Ver todos</Link></div>
          : <ul className="acct-list" aria-label={`Anuncios: ${tab.label}`}>
            {visible.map(row => {
              const src = cover(row);
              const place = [row.district, row.city].filter(Boolean).join(", ");
              const when = row.published_at ?? row.created_at;
              return <li key={row.id} className="acct-row">
                <div className="acct-cover">{src ? <img src={src} alt="" loading="lazy" /> : <span aria-hidden="true">⌂</span>}</div>
                <div className="acct-row-info">
                  <h2>{row.title}</h2>
                  <p>{[TYPE[row.property_type], OPERATION[row.listing_type]].filter(Boolean).join(" en ")}{place && ` · ${place}`}</p>
                  <p>{row.published_at ? "Publicado el" : "Creado el"} {dateFormat.format(new Date(when))}{expiryText(row)}</p>
                  {row.status !== "draft" && <p className="acct-stats">{statsText(stats[row.id])}</p>}
                </div>
                <div className="acct-row-price">
                  <strong>{formatPrice(row.price, row.currency === "PEN" || row.currency === "USD" ? row.currency : null)}</strong>
                  <span className="acct-status" data-status={row.deletion_requested_at ? "archived" : row.status === "published" && row.is_reserved ? "reserved" : row.status}>{listingStatusLabel(row)}</span>
                </div>
                <div className="acct-row-actions">
                  <ListingActions id={row.id} title={row.title} slug={row.slug} status={row.status} listingType={row.listing_type}
                    isReserved={!!row.is_reserved} ownerPaused={!!row.owner_paused} deletionRequestedAt={row.deletion_requested_at ?? null} publishedAt={row.published_at} renewedAt={row.renewed_at ?? null} closedViaPortal={row.closed_via_portal ?? null} siteOrigin={origin} moderationNote={row.moderation_note ?? null} reviewRequestedAt={row.review_requested_at ?? null} />
                </div>
              </li>;
            })}
          </ul>}
      </>}
    </AccountShell>
  );
}
