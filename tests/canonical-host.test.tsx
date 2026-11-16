import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canonicalRedirect } from "../app/lib/canonical-host";

const C = "https://inmueblesdirectosperu.com";
describe("dominio canónico", () => {
  it("redirige www y workers.dev conservando ruta y consulta", () => {
    expect(canonicalRedirect("https://www.inmueblesdirectosperu.com/inmueble/casa?x=1", C)).toBe(`${C}/inmueble/casa?x=1`);
    expect(canonicalRedirect("https://inmuebles-directos.rsnadvisors.workers.dev/cuenta", C)).toBe(`${C}/cuenta`);
  });
  it("no toca el dominio canónico, desarrollo local ni otros hosts", () => {
    expect(canonicalRedirect(`${C}/`, C)).toBeNull();
    expect(canonicalRedirect("http://localhost:3000/", C)).toBeNull();
    expect(canonicalRedirect("https://evil.example/phish", C)).toBeNull();
    expect(canonicalRedirect("https://www.evil.example/", C)).toBeNull();
  });
  it("el Worker sirve el dominio propio y lo usa como origen canónico", () => {
    const w = readFileSync("wrangler.jsonc", "utf8");
    expect(w).toMatch(/"NEXT_PUBLIC_SITE_ORIGIN": "https:\/\/inmueblesdirectosperu\.com"/);
    expect(w).toMatch(/"pattern": "inmueblesdirectosperu\.com", "custom_domain": true/);
    expect(w).toMatch(/"pattern": "www\.inmueblesdirectosperu\.com", "custom_domain": true/);
  });
});
