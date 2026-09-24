import Link from "next/link";
import { redirect } from "next/navigation";
import SignOutButton from "../components/SignOutButton";
import { getVerifiedUser } from "../lib/auth-server";

export const dynamic = "force-dynamic";

export default async function Account() {
  const { client, user } = await getVerifiedUser();
  if (!client || !user) redirect("/login?returnTo=/cuenta");
  const { data: profile } = await client.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const display = typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name.trim() : user.email || "Mi cuenta";
  return <main className="account-page"><Link className="geo-logo" href="/" aria-label="Inmuebles Directos Perú, inicio">Inmuebles<span> Directos</span><small>Perú</small></Link><h1>Mi cuenta</h1><p>{display}</p>{user.email && <p>{user.email}</p>}<Link href="/mis-propiedades">Mis propiedades</Link><SignOutButton /></main>;
}
