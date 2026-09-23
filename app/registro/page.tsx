import { redirect } from "next/navigation";
import AuthForm from "../components/AuthForm";
import { getVerifiedUser } from "../lib/auth-server";
import { safeReturnTo } from "../lib/safe-return";

export default async function Register({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const destination = safeReturnTo((await searchParams).returnTo);
  const { user } = await getVerifiedUser();
  if (user) redirect(destination);
  return <AuthForm mode="register" returnTo={destination} />;
}
