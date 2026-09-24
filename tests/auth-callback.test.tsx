import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/auth/callback/route";

const auth = vi.hoisted(() => ({ exchange: vi.fn() }));
let diagnosticLog: ReturnType<typeof vi.spyOn>;

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: {
    cookies: { setAll: (items: { name: string; value: string; options: { path: string } }[]) => void };
  }) => ({
    auth: {
      exchangeCodeForSession: (code: string) => auth.exchange(code, options.cookies.setAll),
    },
  }),
}));

function callback(returnTo: string, code?: string, origin = "https://localhost:8080", cookie?: string) {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("returnTo", returnTo);
  if (code) url.searchParams.set("code", code);
  return new NextRequest(url, { headers: { host: "evil.example", "x-forwarded-host": "evil.example", ...(cookie ? { cookie } : {}) } });
}

function resultLog() {
  const call = diagnosticLog.mock.calls.filter(([prefix, event]) => prefix === "[AUTH_CALLBACK_DIAG]" && event?.phase === "result").at(-1);
  return call?.[1] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  diagnosticLog = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "fixture-key");
  auth.exchange.mockReset();
  auth.exchange.mockImplementation(async (_code, setAll) => {
    setAll([{ name: "sb-session", value: "fixture-session", options: { path: "/" } }]);
    return { error: null };
  });
});

afterEach(() => { diagnosticLog.mockRestore(); vi.unstubAllEnvs(); });

describe("Auth callback redirects", () => {
  it("uses the production origin on success and preserves session cookies", async () => {
    const response = await GET(callback("/cuenta", "fixture-code", undefined, "sb-project-auth-token-code-verifier=fixture-verifier"));
    expect(response.headers.get("location")).toBe("https://inmueblesdirectos.com/cuenta");
    expect(response.cookies.get("sb-session")?.value).toBe("fixture-session");
    expect(auth.exchange).toHaveBeenCalledWith("fixture-code", expect.any(Function));
    expect(resultLog()).toMatchObject({ callbackInvoked: true, codePresent: true, verifierCookiePresent: true, exchangeAttempted: true, exchangeResult: "success", cookieWriteCount: 1, redirectBranch: "success" });
  });

  it("uses the production origin when the code is missing", async () => {
    const response = await GET(callback("/cuenta"));
    expect(response.headers.get("location")).toBe("https://inmueblesdirectos.com/login?error=confirmation");
    expect(auth.exchange).not.toHaveBeenCalled();
    expect(resultLog()).toMatchObject({ codePresent: false, exchangeAttempted: false, exchangeResult: "not_attempted", failureClass: "missing_code", redirectBranch: "error" });
  });

  it("distinguishes missing runtime configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    await GET(callback("/cuenta", "fixture-code"));
    expect(auth.exchange).not.toHaveBeenCalled();
    expect(resultLog()).toMatchObject({ supabaseUrlConfigured: false, supabaseAnonKeyConfigured: true, exchangeAttempted: false, failureClass: "runtime_config" });
  });

  it("reports a missing anon key without logging it", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    await GET(callback("/cuenta", "fixture-code"));
    expect(auth.exchange).not.toHaveBeenCalled();
    expect(resultLog()).toMatchObject({ supabaseUrlConfigured: true, supabaseAnonKeyConfigured: false, failureClass: "runtime_config" });
  });

  it("recognizes verifier chunks but not the PKCE flow index", async () => {
    await GET(callback("/cuenta", "fixture-code", undefined, "sb-project-auth-token-flows-code-verifier=decoy"));
    expect(resultLog()?.verifierCookiePresent).toBe(false);
    await GET(callback("/cuenta", "fixture-code", undefined, "sb-project-auth-token-code-verifier.0=fixture-chunk"));
    expect(resultLog()?.verifierCookiePresent).toBe(true);
  });

  it("distinguishes a missing verifier from another exchange error", async () => {
    auth.exchange.mockResolvedValueOnce({ error: { name: "AuthPKCECodeVerifierMissingError", code: "pkce_code_verifier_not_found", message: "synthetic" } });
    await GET(callback("/cuenta", "fixture-code"));
    expect(resultLog()).toMatchObject({ codePresent: true, verifierCookiePresent: false, exchangeAttempted: true, exchangeResult: "error", errorName: "AuthPKCECodeVerifierMissingError", errorCode: "pkce_code_verifier_not_found", cookieWriteCount: 0 });

    auth.exchange.mockResolvedValueOnce({ error: { name: "AuthApiError", code: "bad_code_verifier", message: "synthetic" } });
    await GET(callback("/cuenta", "fixture-code", undefined, "sb-project-auth-token-code-verifier=fixture-verifier"));
    expect(resultLog()).toMatchObject({ codePresent: true, verifierCookiePresent: true, exchangeAttempted: true, exchangeResult: "error", errorName: "AuthApiError", errorCode: "bad_code_verifier" });
  });

  it("never logs credential, query, cookie or arbitrary error values", async () => {
    auth.exchange.mockImplementationOnce(async (_code, setAll) => {
      setAll([{ name: "sb-session", value: "SUPER_SECRET_COOKIE_VALUE", options: { path: "/" } }]);
      return { error: { name: "TEST_EMAIL_SECRET_MARKER", code: "TEST_EMAIL_SECRET_MARKER", message: "SUPER_SECRET_ACCESS_TOKEN" } };
    });
    await GET(callback("/cuenta?marker=TEST_EMAIL_SECRET_MARKER", "SUPER_SECRET_CODE_VALUE", undefined, "sb-project-auth-token-code-verifier=SUPER_SECRET_VERIFIER"));
    const output = JSON.stringify(diagnosticLog.mock.calls);
    for (const marker of ["SUPER_SECRET_CODE_VALUE", "SUPER_SECRET_VERIFIER", "SUPER_SECRET_COOKIE_VALUE", "SUPER_SECRET_ACCESS_TOKEN", "TEST_EMAIL_SECRET_MARKER"]) {
      expect(output).not.toContain(marker);
    }
    expect(resultLog()).toMatchObject({ cookieWriteCount: 1, errorName: "other", errorCode: "other", redirectBranch: "error" });
  });

  it("uses the production origin when code exchange fails", async () => {
    auth.exchange.mockResolvedValueOnce({ error: new Error("fixture failure") });
    const response = await GET(callback("/cuenta", "fixture-code"));
    expect(response.headers.get("location")).toBe("https://inmueblesdirectos.com/login?error=confirmation");
  });

  it.each(["/publicar", "/mis-propiedades"])("keeps a safe internal destination %s", async destination => {
    const response = await GET(callback(destination, "fixture-code"));
    expect(response.headers.get("location")).toBe(`https://inmueblesdirectos.com${destination}`);
  });

  it.each(["https://evil.example", "//evil.example", "javascript:alert(1)", "data:text/html,evil", "\\evil.example"])(
    "rejects an unsafe returnTo value %s",
    async destination => {
      const response = await GET(callback(destination, "fixture-code"));
      expect(response.headers.get("location")).toBe("https://inmueblesdirectos.com/cuenta");
    },
  );

  it("retains the request origin in local development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await GET(callback("/cuenta", "fixture-code", "http://localhost:3103"));
    expect(response.headers.get("location")).toBe("http://localhost:3103/cuenta");
  });
});
