// @vitest-environment node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const config = require("../next.config.js");
const migration = readFileSync("supabase/migrations/20261117120000_security_audit_hardening.sql", "utf8");

describe("Cabeceras de seguridad (auditoría 17/11)", () => {
  it("se aplican a todas las rutas y mantienen el no-store existente", async () => {
    const rules = await config.headers();
    const all = rules.find((r: { source: string }) => r.source === "/:path*");
    const names = all.headers.map((h: { key: string }) => h.key);
    expect(names).toEqual(expect.arrayContaining([
      "Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options",
      "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security",
    ]));
    expect(rules.find((r: { source: string }) => r.source === "/")?.headers[0].key).toBe("Cache-Control");
    expect(config.poweredByHeader).toBe(false);
  });

  it("la CSP impide el framing sin bloquear scripts ni el mapa", () => {
    const csp = config.securityHeaders.find((h: { key: string }) => h.key === "Content-Security-Policy").value;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src|default-src|img-src|connect-src/);
  });

  it("la geolocalización sigue permitida para «Mi ubicación»", () => {
    const pp = config.securityHeaders.find((h: { key: string }) => h.key === "Permissions-Policy").value;
    expect(pp).toContain("geolocation=(self)");
  });
});

describe("Migración de endurecimiento", () => {
  it("property_features exige is_agent en lectura y escritura", () => {
    const block = migration.split('alter policy "agents manage property features"')[1].split(";")[0];
    expect(block.match(/private\.is_agent\(\)/g)).toHaveLength(2);
  });

  it("anon pierde toda escritura y no relaja ninguna política", () => {
    expect(migration).toMatch(/revoke insert, update, delete, truncate[\s\S]*?from anon;/);
    expect(migration).not.toMatch(/\bgrant\b/i);
    expect(migration).not.toMatch(/using \(true\)|with check \(true\)/i);
  });

  it("no deja auth.uid() sin envolver y recarga el esquema", () => {
    expect(migration.replace(/\(select auth\.uid\(\)\)/g, "")).not.toContain("auth.uid()");
    expect(migration.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
});
