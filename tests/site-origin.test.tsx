import { afterEach, describe, expect, it, vi } from "vitest";
import { authOrigin, recoveryRedirect, siteOrigin } from "../app/lib/auth-origin";
import { safeReturnTo } from "../app/lib/safe-return";

afterEach(() => vi.unstubAllEnvs());

describe("canonical site origin", () => {
  it("uses the configured origin for production recovery and metadata", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_ORIGIN", "https://portal.example.test/");
    expect(siteOrigin()).toBe("https://portal.example.test");
    expect(recoveryRedirect("https://request.example.test"))
      .toBe("https://portal.example.test/auth/callback?returnTo=%2Frestablecer-password");
  });

  it("keeps local callback flows and internal return paths", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_ORIGIN", "https://portal.example.test");
    expect(authOrigin("http://127.0.0.1:3100")).toBe("http://127.0.0.1:3100");
    expect(safeReturnTo("/propiedades?tipo=casa")).toBe("/propiedades?tipo=casa");
  });

  it.each(["http://portal.example.test", "https://portal.example.test/catalogo", "https://portal.example.test?preview=1"])(
    "rejects a noncanonical origin",
    (origin) => {
      vi.stubEnv("NEXT_PUBLIC_SITE_ORIGIN", origin);
      expect(() => siteOrigin()).toThrow();
    },
  );
});
