import * as React from "react";
import { redirect } from "next/navigation";
import { getVerifiedPublicationUser, getVerifiedUser } from "../lib/auth-server";
import PublicationRecovery from "./PublicationRecovery";

export const dynamic = "force-dynamic";

export default async function PublishLayout({ children }: { children: React.ReactNode }) {
  let auth: Awaited<ReturnType<typeof getVerifiedPublicationUser>>;
  try { auth = await getVerifiedPublicationUser(); }
  catch { return <p>No pudimos verificar tu cuenta. Vuelve a intentarlo más tarde.</p>; }
  if (auth.reason === "AUTH_REQUIRED") redirect("/login?returnTo=/publicar");
  if (auth.user) return <PublicationRecovery key={auth.user.id} userId={auth.user.id} canPublish>{children}</PublicationRecovery>;
  let recovery: Awaited<ReturnType<typeof getVerifiedUser>>;
  try { recovery = await getVerifiedUser(); }
  catch { return <p>No pudimos verificar tu cuenta. Vuelve a intentarlo más tarde.</p>; }
  if (!recovery.client || !recovery.user) redirect("/login?returnTo=/publicar");
  if (typeof recovery.user.id !== "string" || !recovery.user.id.trim()) return <p>No pudimos verificar tu cuenta. Vuelve a intentarlo más tarde.</p>;
  return <PublicationRecovery key={`recovery:${recovery.user.id}`} userId={recovery.user.id} canPublish={false} />;
}
