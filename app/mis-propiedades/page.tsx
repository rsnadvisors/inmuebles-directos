import Link from "next/link";
import { redirect } from "next/navigation";
import { getVerifiedUser } from "../lib/auth-server";
import { formatPrice } from "../lib/inventory";

export const dynamic = "force-dynamic";

export default async function MyProperties() {
  const { client, user } = await getVerifiedUser();
  if (!client || !user) redirect("/login?returnTo=/mis-propiedades");
  const { data, error } = await client.from("properties").select("id,title,slug,status,price,currency").eq("owner_id", user.id).order("created_at", { ascending: false });
  return <main className="account-page"><Link className="geo-logo" href="/" aria-label="Inmuebles Directos Perú, inicio">Inmuebles<span> Directos</span><small>Perú</small></Link><h1>Mis propiedades</h1>
    {error ? <p role="alert">No pudimos cargar tus propiedades.</p> : !data?.length ? <p>Aún no tienes propiedades publicadas.</p> : <ul>{data.map(property => <li key={property.id}><strong>{property.title}</strong> · {formatPrice(property.price, property.currency === "PEN" || property.currency === "USD" ? property.currency : null)} · {property.status}{property.status === "published" && <Link href={`/inmueble/${property.slug}`}>Ver ficha</Link>}</li>)}</ul>}
    <Link href="/publicar">Publicar otra propiedad</Link>
  </main>;
}
