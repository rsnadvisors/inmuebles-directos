import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        try { items.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* Server Components cannot write; proxy refreshes cookies. */ }
      },
    },
  });
}

export async function getVerifiedUser() {
  const client = await getServerClient();
  if (!client) return { client: null, user: null };
  const { data, error } = await client.auth.getUser();
  return { client, user: error ? null : data.user };
}

// Publication requires a provider-verified registered identity with confirmed email.
// Keep generic authentication separate so existing owner recovery remains available.
export async function getVerifiedPublicationUser() {
  const { client, user } = await getVerifiedUser();
  if (!client || !user) return { client: null, user: null, reason: "AUTH_REQUIRED" } as const;
  if (typeof user.id !== "string" || !user.id.trim() || user.is_anonymous !== false
    || typeof user.email !== "string" || !user.email.trim()
    || typeof user.email_confirmed_at !== "string" || !user.email_confirmed_at.trim()
    || !Number.isFinite(Date.parse(user.email_confirmed_at))) {
    return { client: null, user: null, reason: "PUBLICATION_IDENTITY_REQUIRED" } as const;
  }
  return { client, user, reason: null } as const;
}
