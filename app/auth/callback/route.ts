import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { safeReturnTo } from "../../lib/safe-return";

const DIAGNOSTIC_PREFIX = "[AUTH_CALLBACK_DIAG]";
const SAFE_ERROR_NAMES = new Set([
  "AuthApiError", "AuthPKCECodeVerifierMissingError", "AuthPKCEGrantCodeExchangeError",
  "AuthInvalidTokenResponseError", "AuthRetryableFetchError", "AuthUnknownError",
]);
const SAFE_ERROR_CODES = new Set([
  "pkce_code_verifier_not_found", "bad_code_verifier", "flow_state_not_found",
  "otp_expired", "invalid_credentials", "unexpected_failure", "request_timeout",
]);

function safeErrorCategory(error: unknown) {
  const candidate = error && typeof error === "object" ? error as { name?: unknown; code?: unknown } : {};
  return {
    errorName: typeof candidate.name === "string" && SAFE_ERROR_NAMES.has(candidate.name) ? candidate.name : "other",
    errorCode: typeof candidate.code === "string" && SAFE_ERROR_CODES.has(candidate.code) ? candidate.code : "other",
  };
}

function hasVerifierCookie(request: NextRequest, url: string | undefined) {
  if (!url) return false;
  try {
    // supabase-js defaults to sb-<URL hostname first label>-auth-token; SSR stores its PKCE verifier in cookies.
    const cookieKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token-code-verifier`;
    return request.cookies.getAll().some(({ name, value }) =>
      value.length > 0 && (name === cookieKey || (name.startsWith(`${cookieKey}.`) && /^\d+$/.test(name.slice(cookieKey.length + 1))))
    );
  } catch { return false; }
}

export async function GET(request: NextRequest) {
  const destination = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const origin = process.env.NODE_ENV === "production" ? "https://inmueblesdirectos.com" : request.nextUrl.origin;
  const response = NextResponse.redirect(new URL(destination, origin));
  const errorUrl = new URL("/login?error=confirmation", origin);
  const code = request.nextUrl.searchParams.get("code");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const context = {
    diagnosticId: crypto.randomUUID(), callbackInvoked: true,
    supabaseUrlConfigured: Boolean(url), supabaseAnonKeyConfigured: Boolean(key),
    codePresent: Boolean(code), returnToPresent: request.nextUrl.searchParams.has("returnTo"),
    verifierCookiePresent: hasVerifierCookie(request, url),
  };
  console.info(DIAGNOSTIC_PREFIX, { ...context, phase: "received" });
  if (!code || !url || !key) {
    console.info(DIAGNOSTIC_PREFIX, { ...context, phase: "result", exchangeAttempted: false,
      exchangeResult: "not_attempted", failureClass: !code ? "missing_code" : "runtime_config",
      errorName: "none", errorCode: "none", cookieWriteCount: 0, redirectBranch: "error" });
    return NextResponse.redirect(errorUrl);
  }
  let cookieWriteCount = 0;
  let exchangeAttempted = false;
  try {
    const client = createServerClient(url, key, { cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => items.forEach(({ name, value, options }) => {
        cookieWriteCount += 1;
        response.cookies.set(name, value, options);
      }),
    } });
    exchangeAttempted = true;
    console.info(DIAGNOSTIC_PREFIX, { ...context, phase: "exchange_start", exchangeAttempted });
    const { error } = await client.auth.exchangeCodeForSession(code);
    console.info(DIAGNOSTIC_PREFIX, { ...context, phase: "result", exchangeAttempted,
      exchangeResult: error ? "error" : "success", ...(error ? safeErrorCategory(error) : { errorName: "none", errorCode: "none" }),
      cookieWriteCount, redirectBranch: error ? "error" : "success" });
    return error ? NextResponse.redirect(errorUrl) : response;
  } catch (error) {
    console.info(DIAGNOSTIC_PREFIX, { ...context, phase: "result", exchangeAttempted,
      exchangeResult: "threw", ...safeErrorCategory(error), cookieWriteCount, redirectBranch: "none" });
    throw error;
  }
}
