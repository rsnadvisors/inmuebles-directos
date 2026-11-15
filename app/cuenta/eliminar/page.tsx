import Link from "next/link";
import { redirect } from "next/navigation";
import { getVerifiedUser } from "../../lib/auth-server";
import AccountShell from "../../components/account/AccountShell";
import DeleteAccountForm from "../../components/account/DeleteAccountForm";

export const dynamic = "force-dynamic";

export default async function DeleteAccountPage() {
  const { client, user } = await getVerifiedUser();
  if (!client || !user) redirect("/login?returnTo=/cuenta/eliminar");
  const [{ data: profile }, { count }] = await Promise.all([
    client.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    client.from("properties").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
  ]);
  const display = typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name.trim() : user.email || "Mi cuenta";
  const listings = count ?? 0;
  return <AccountShell active="resumen" name={display} email={user.email} title="Eliminar mi cuenta" subtitle="Esta acción no se puede deshacer."
    action={<Link href="/cuenta" className="acct-btn acct-btn-quiet">Volver a Mi cuenta</Link>}>
    <div className="acct-security acct-danger-zone">
      <p>Al eliminar tu cuenta borraremos de forma definitiva:</p>
      <ul>
        <li>{listings === 0 ? "Tus anuncios (no tienes ninguno ahora)." : `Tus ${listings} ${listings === 1 ? "anuncio" : "anuncios"}, publicados o no, y todas sus fotos.`}</li>
        <li>Tu perfil y tus favoritos.</li>
        <li>Tu acceso: no podrás volver a iniciar sesión con este correo, aunque podrás crear una cuenta nueva.</li>
      </ul>
      <p>Si solo quieres dejar de mostrar un anuncio, usa «Pausar» o «Marcar como vendido» en <Link href="/mis-propiedades">Mis propiedades</Link>. Antes de eliminar puedes <a href="/api/mi-cuenta/datos" download>descargar una copia de tus datos</a>.</p>
      <p className="acct-manage-note">Las copias de seguridad cifradas se conservan hasta 90 días y luego se eliminan; no se usan para ningún otro fin.</p>
      <DeleteAccountForm />
    </div>
  </AccountShell>;
}
