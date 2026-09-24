import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/auth/callback/route";

const auth = vi.hoisted(() => ({ exchange: vi.fn() }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: {
    cookies: { setAll: (items: { name: string; value: string; options: { path: string } }[]) => void };
  }) => ({
    auth: {
      exchangeCodeForSession: (code: string) => auth.exchange(code, options.cookies.setAll),
    },
  }),
}));

function callback(returnTo: string, code?: string, origin = "https://localhost:8080") {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("returnTo", returnTo);
  if (code) url.searchParams.set("code", code);
  return new NextRequest(url, { headers: { host: "evil.example", "x-forwarded-host": "evil.example" } });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "fixture-key");
  auth.exchange.mockReset();
  auth.exchange.mockImplementation(async (_code, setAll) => {
    setAll([{ name: "sb-session", value: "fixture-session", options: { path: "/" } }]);
    return { error: null };
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("Auth callback redirects", () => {
  it("uses the production origin on success and preserves session cookies", async () => {
    const response = await GET(callback("/cuenta", "fixture-code"));
    expect(response.headers.get("location")).toBe("https://inmueblesdirectos.com/cuenta");
    expect(response.cookies.get("sb-session")?.value).toBe("fixture-session");
    expect(auth.exchange).toHaveBeenCalledWith("fixture-code", expect.any(Function));
  });

  it("uses the production origin when the code is missing", async () => {
    const response = await GET(callback("/cuenta"));
    expect(response.headers.get("location")).toBe("https://inmueblesdirectos.com/login?error=confirmation");
    expect(auth.exchange).not.toHaveBeenCalled();
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
