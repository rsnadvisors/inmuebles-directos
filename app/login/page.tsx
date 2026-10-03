import { redirect } from "next/navigation";
import AuthForm from "../components/AuthForm";
import { getVerifiedUser } from "../lib/auth-server";
import { safeReturnTo } from "../lib/safe-return";

export default async function Login({ searchParams }: { searchParams: Promise<{ returnTo?: string; status?: string }> }) {
  const params = await searchParams;
  const destination = safeReturnTo(params.returnTo);
  const { user } = await getVerifiedUser();
  if (user) redirect(destination);
  return <AuthForm mode="login" returnTo={destination} passwordUpdated={params.status === "password-updated"} />;
}
