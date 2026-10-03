import PasswordRecoveryForm from "../components/PasswordRecoveryForm";

export const metadata = { title: "Recuperar contraseña | Inmuebles Directos", robots: { index: false, follow: false } };
export default async function RecoverPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const failed = (await searchParams).error === "recovery";
  return <>{failed && <p className="auth-recovery-notice" role="status">El enlace no es válido o expiró. Solicita uno nuevo.</p>}<PasswordRecoveryForm mode="request" /></>;
}
