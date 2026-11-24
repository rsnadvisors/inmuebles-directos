import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokens = JSON.parse(readFileSync("design/brand-tokens.json", "utf8"));
const css = readFileSync("app/globals.css", "utf8");
const root = /:root\{([^}]*)\}/.exec(css)![1];
const cssVar = (name: string) => new RegExp(`${name}:\s*([^;]+)`).exec(root)?.[1]?.trim().toLowerCase();

function hex(h: string) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); }
function luminance(h: string) {
  const [r, g, b] = hex(h).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

describe("manual de marca y tokens", () => {
  it("los colores «en uso» con variable CSS coinciden con :root de globals.css", () => {
    for (const group of ["brand", "neutral"]) {
      for (const [name, token] of Object.entries(tokens.color[group]) as Array<[string, { $value: string; css: string; status: string }]>) {
        const value = cssVar(token.css);
        if (token.status === "en-uso" && value) expect(value, `${name} (${token.css})`).toBe(token.$value);
      }
    }
    expect(cssVar("--teal")).toBe("#087f70");
    expect(cssVar("--ink")).toBe("#15232d");
  });

  it("toda etiqueta de inmueble cumple AA (4,5:1) y el contraste declarado es el real", () => {
    for (const [name, label] of Object.entries(tokens.color.label) as Array<[string, { fg: string; bg: string; contrast?: number }]>) {
      const real = contrast(label.fg, label.bg);
      expect(real, name).toBeGreaterThanOrEqual(4.5);
      if (label.contrast) expect(Math.abs(real - label.contrast), name).toBeLessThan(0.01);
    }
  });

  it("los colores semánticos de texto cumplen AA sobre blanco y el foco cumple 3:1", () => {
    for (const name of ["success", "warning", "error"]) expect(contrast(tokens.color.semantic[name].$value, "#ffffff"), name).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens.color.semantic.focus.$value, "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it("el manual existe, enlaza los tokens y las variantes del isotipo están publicadas", () => {
    const manual = readFileSync("BRAND_MANUAL.md", "utf8");
    expect(manual).toContain("design/brand-tokens.json");
    for (const file of ["isotipo", "isotipo-negativo", "isotipo-teal", "isotipo-mono-oscuro", "isotipo-mono-claro"]) {
      expect(existsSync(`public/brand/${file}.svg`), file).toBe(true);
      expect(manual).toContain(`${file}.svg`);
    }
    // Las variantes usan exactamente los trazos del ícono maestro.
    const master = readFileSync("app/icon.svg", "utf8").match(/ d="([^"]+)"/g)!;
    expect(readFileSync("public/brand/isotipo-negativo.svg", "utf8").match(/ d="([^"]+)"/g)).toEqual(master);
  });
});
