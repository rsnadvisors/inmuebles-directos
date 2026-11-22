import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "../components/AuthForm";
import { getVerifiedUser } from "../lib/auth-server";
import { safeReturnTo } from "../lib/safe-return";

// Página de acceso: útil para el usuario, sin valor en Google (noindex), pero sus enlaces sí se siguen.
export const metadata: Metadata = { title: "Iniciar sesión | Inmuebles Directos", robots: { index: false, follow: true } };

export default async function Login({ searchParams }: { searchParams: Promise<{ returnTo?: string; status?: string }> }) {
  const params = await searchParams;
  const destination = safeReturnTo(params.returnTo);
  const { user } = await getVerifiedUser();
  if (user && !user.is_anonymous) redirect(destination);
  return <AuthForm mode="login" returnTo={destination} passwordUpdated={params.status === "password-updated"} />;
}
