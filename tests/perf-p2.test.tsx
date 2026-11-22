import { afterEach, describe, expect, it, vi } from "vitest";
import { HOME_LISTINGS_TTL_SECONDS, readHomeListings } from "../app/lib/property";
import { properties } from "./fixtures/properties";
import { setInventory, setResponse, supabase } from "./mocks/supabase";

/** Caché de Cloudflare simulada (caches.default) en memoria. */
function fakeEdgeCache() {
  const store = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (key: string) => store.get(key)?.clone()),
    put: vi.fn(async (key: string, response: Response) => { store.set(key, response.clone()); }),
  };
  vi.stubGlobal("caches", { default: cache });
  return { cache, store };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("rendimiento P2b: lista de anuncios en caché 60 s", () => {
  it("la primera lectura consulta la base y guarda el resultado; la siguiente sale de la caché", async () => {
    const { cache, store } = fakeEdgeCache();
    setInventory(properties);
    expect((await readHomeListings())!.map(item => item.id)).toHaveLength(3);
    expect(cache.put).toHaveBeenCalledTimes(1);
    const [key, saved] = cache.put.mock.calls[0];
    expect(key).toBe("https://inmueblesdirectosperu.com/__cache/anuncios-publicados-v1");
    expect(saved.headers.get("Cache-Control")).toBe(`public, max-age=${HOME_LISTINGS_TTL_SECONDS}`);
    expect(HOME_LISTINGS_TTL_SECONDS).toBe(60);
    const queries = supabase.from.mock.calls.length;
    setInventory([]); // aunque la base cambie, durante el minuto se sirve lo guardado
    expect(await readHomeListings()).toHaveLength(3);
    expect(supabase.from.mock.calls.length).toBe(queries);
    expect(store.size).toBe(1);
  });

  it("un error de la base no se guarda en caché", async () => {
    const { cache } = fakeEdgeCache();
    setResponse(async () => ({ data: null, error: { message: "boom" } }));
    expect(await readHomeListings()).toBeUndefined();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("si la caché falla, se lee directo de la base", async () => {
    vi.stubGlobal("caches", { default: { match: async () => { throw new Error("cache down"); }, put: async () => { throw new Error("cache down"); } } });
    setInventory(properties);
    expect(await readHomeListings()).toHaveLength(3);
  });

  it("sin caché disponible (desarrollo, pruebas) funciona como antes", async () => {
    setInventory(properties);
    expect(await readHomeListings()).toHaveLength(3);
  });
});
