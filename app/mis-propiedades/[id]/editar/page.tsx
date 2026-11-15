import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getVerifiedUser } from "../../../lib/auth-server";
import { availableActions, LISTING_ID } from "../../../lib/listing-management";
import AccountShell from "../../../components/account/AccountShell";
import EditListingForm, { type EditListingInitial } from "../../../components/account/EditListingForm";

export const dynamic = "force-dynamic";

const EDIT_SELECT = "id,title,slug,status,listing_type,property_type,price,currency,contact_phone,maintenance_fee,area_total_m2,area_built_m2,bedrooms,bathrooms,parking_spaces,floors,description,address,district,city,region,lat,lng,published_at,is_reserved,owner_paused,deletion_requested_at";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client, user } = await getVerifiedUser();
  if (!client || !user) redirect(`/login?returnTo=${encodeURIComponent(`/mis-propiedades/${id}/editar`)}`);
  if (!LISTING_ID.test(id)) notFound();
  const [{ data: profile }, { data: row }] = await Promise.all([
    client.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    client.from("properties").select(EDIT_SELECT).eq("id", id).eq("owner_id", user.id).maybeSingle(),
  ]);
  if (!row) notFound();
  const display = typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name.trim() : user.email || "Mi cuenta";
  const { canEdit } = availableActions(row);
  return <AccountShell active="propiedades" name={display} email={user.email} title="Editar anuncio" subtitle={row.title}
    action={<Link href="/mis-propiedades" className="acct-btn acct-btn-quiet">Volver a Mis propiedades</Link>}>
    {canEdit ? <EditListingForm initial={row as EditListingInitial} />
      : <div className="acct-empty"><h2>Este anuncio no se puede editar ahora</h2><p>Los borradores, los anuncios en eliminación y los archivados por revisión no admiten cambios.</p><Link href="/mis-propiedades" className="acct-btn">Volver</Link></div>}
  </AccountShell>;
}
