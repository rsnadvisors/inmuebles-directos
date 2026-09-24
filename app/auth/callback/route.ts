import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { safeReturnTo } from "../../lib/safe-return";

export async function GET(request: NextRequest) {
  const destination = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const response = NextResponse.redirect(new URL(destination, request.url));
  const code = request.nextUrl.searchParams.get("code");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!code || !url || !key) return NextResponse.redirect(new URL("/login?error=confirmation", request.url));
  const client = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: (items) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
  } });
  const { error } = await client.auth.exchangeCodeForSession(code);
  return error ? NextResponse.redirect(new URL("/login?error=confirmation", request.url)) : response;
}
