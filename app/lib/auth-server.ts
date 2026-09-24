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
