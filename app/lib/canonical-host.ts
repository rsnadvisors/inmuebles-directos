/** Redirección al dominio canónico: www.<dominio> y *.workers.dev → https://<dominio>, conservando ruta y consulta.
 * Devuelve null cuando no hay que redirigir (dominio canónico, desarrollo local u otros hosts). */
export function canonicalRedirect(requestUrl: string, canonicalOrigin: string): string | null {
  let url: URL, canonical: URL;
  try { url = new URL(requestUrl); canonical = new URL(canonicalOrigin); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if (host === canonical.hostname) return null;
  if (host !== `www.${canonical.hostname}` && !host.endsWith(".workers.dev")) return null;
  return `${canonical.origin}${url.pathname}${url.search}`;
}
