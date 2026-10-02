import PasswordRecoveryForm from "../components/PasswordRecoveryForm";
import { getVerifiedUser } from "../lib/auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Restablecer contraseña | Inmuebles Directos", robots: { index: false, follow: false } };
export default async function ResetPassword() {
  try {
    const { user } = await getVerifiedUser();
    return <PasswordRecoveryForm mode="reset" userId={user && !user.is_anonymous ? user.id : undefined} />;
  } catch {
    return <PasswordRecoveryForm mode="reset" />;
  }
}
