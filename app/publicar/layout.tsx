import { redirect } from "next/navigation";
import { getVerifiedUser } from "../lib/auth-server";

export const dynamic = "force-dynamic";

export default async function PublishLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getVerifiedUser();
  if (!user) redirect("/login?returnTo=/publicar");
  return children;
}
