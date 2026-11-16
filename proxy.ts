import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { canonicalRedirect } from "./app/lib/canonical-host";
import { siteOrigin } from "./app/lib/auth-origin";

export async function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    let target: string | null = null;
    try { target = canonicalRedirect(request.url, siteOrigin()); } catch { target = null; }
    // 301 for GET/HEAD (SEO); 308 keeps the method for anything else.
    if (target) return NextResponse.redirect(target, ["GET", "HEAD"].includes(request.method) ? 301 : 308);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await client.auth.getClaims();
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
