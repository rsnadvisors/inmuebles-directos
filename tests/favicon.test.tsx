import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

describe("favicon ID", () => {
  it("usa los colores del logo: I verde y D oscuro sobre fondo blanco", () => {
    const svg = readFileSync("app/icon.svg", "utf8");
    expect(svg).toMatch(/<rect width="64" height="64" rx="14" fill="#ffffff"\/>/);
    const fills = [...svg.matchAll(/<path fill="(#[0-9a-f]{6})"/g)].map(m => m[1]);
    expect(fills).toEqual(["#087f70", "#15232d"]);
  });
  it("incluye las versiones para navegadores antiguos y para iPhone", () => {
    expect(existsSync("app/favicon.ico")).toBe(true);
    expect(readFileSync("app/apple-icon.png").subarray(1, 4).toString()).toBe("PNG");
  });
});
