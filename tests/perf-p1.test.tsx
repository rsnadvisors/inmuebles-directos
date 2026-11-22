// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { imageSrcSet, sizedImageUrl } from "../app/lib/property-image-source";
import { resizedImageResponse, type ImagesBinding } from "../app/lib/property-images";

const ID = "11111111-1111-4111-8111-111111111111";

describe("rendimiento P1", () => {
  it("P1a: ningún componente del cliente importa Supabase de forma estática", () => {
    for (const file of ["app/HomeClient.tsx", "app/components/SiteHeader.tsx", "app/components/SignOutButton.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from "\.{1,2}\/(lib\/)?auth-client"|from "\.\.\/lib\/auth-client"|@supabase\//);
      expect(source, file).toMatch(/loadBrowserClient/);
    }
    expect(readFileSync("app/lib/lazy-browser-client.ts", "utf8")).toMatch(/await import\("\.\/auth-client"\)/);
  });

  it("P1b: un solo dominio de teselas, preconnect y carga temprana del mapa", () => {
    for (const file of ["app/PiuraMap.tsx", "app/publicar/LocationPicker.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/\{s\}\.tile\.openstreetmap/);
      expect(source).toMatch(/https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
    }
    expect(readFileSync("app/page.tsx", "utf8")).toContain('<link rel="preconnect" href="https://tile.openstreetmap.org" />');
    expect(readFileSync("app/HomeClient.tsx", "utf8")).toMatch(/if \(typeof window !== "undefined"\) void loadMap\(\)/);
  });

  it("P1c: URLs con ancho solo para fotos del portal y con anchos permitidos", () => {
    expect(sizedImageUrl(`/api/property-images/${ID}`, 320)).toBe(`/api/property-images/${ID}?w=320`);
    expect(sizedImageUrl("https://example.supabase.co/storage/v1/object/public/a.jpg", 320)).toBe("https://example.supabase.co/storage/v1/object/public/a.jpg");
    expect(imageSrcSet(`/api/property-images/${ID}`)).toBe(`/api/property-images/${ID}?w=640 640w, /api/property-images/${ID}?w=1200 1200w`);
    expect(imageSrcSet("https://example.test/a.jpg")).toBeUndefined();
    expect(readFileSync("wrangler.jsonc", "utf8")).toMatch(/"images": \{ "binding": "IMAGES" \}/);
  });

  it("P1c: redimensiona a WebP con caché privada y vuelve al original si el binding falla o no existe", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const transform = vi.fn(() => ({ output: vi.fn(async () => ({ response: (options?: { headers?: HeadersInit }) => new Response("webp", { headers: { "Content-Type": "image/webp", ...options?.headers } }) })) }));
    const images = { input: vi.fn(() => ({ transform })) } as unknown as ImagesBinding;
    const response = (await resizedImageResponse(blob, 320, images))!;
    expect(transform).toHaveBeenCalledWith({ width: 320, fit: "scale-down" });
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=600"); // P2a: solo en el navegador
    expect(await resizedImageResponse(blob, 320, undefined)).toBeNull();
    const broken = { input: () => { throw new Error("9422"); } } as unknown as ImagesBinding;
    expect(await resizedImageResponse(blob, 320, broken)).toBeNull();
  });
});
