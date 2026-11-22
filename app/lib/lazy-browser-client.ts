/**
 * Supabase en el navegador, cargado bajo demanda (rendimiento P1a, 22/11/2026). El cliente completo (auth,
 * Realtime, PostgREST) pesa ~67 KB comprimidos; importarlo de forma estática lo metía en el JavaScript inicial
 * de todas las páginas y retrasaba el mapa. Con import() queda en un fragmento aparte que se descarga después
 * del primer pintado.
 */
export type BrowserClient = NonNullable<ReturnType<typeof import("./auth-client").getBrowserClient>>;

export async function loadBrowserClient(): Promise<BrowserClient | null> {
  const { getBrowserClient } = await import("./auth-client");
  return getBrowserClient();
}

/** Ejecuta `task` cuando el navegador esté libre (o tras `timeout` ms como máximo), sin competir con la carga inicial. */
export function whenIdle(task: () => void, timeout = 3000): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(task, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(task, 1);
  return () => window.clearTimeout(id);
}
