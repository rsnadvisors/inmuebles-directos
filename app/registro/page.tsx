import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthForm from "../components/AuthForm";
import { getVerifiedUser } from "../lib/auth-server";
import { safeReturnTo } from "../lib/safe-return";

// Página de acceso: útil para el usuario, sin valor en Google (noindex), pero sus enlaces sí se siguen.
export const metadata: Metadata = { title: "Crear cuenta | Inmuebles Directos", robots: { index: false, follow: true } };

export default async function Register({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const destination = safeReturnTo((await searchParams).returnTo);
  const { user } = await getVerifiedUser();
  if (user && !user.is_anonymous) redirect(destination);
  return <AuthForm mode="register" returnTo={destination} />;
}
