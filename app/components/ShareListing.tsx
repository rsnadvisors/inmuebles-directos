"use client";

import { useEffect, useState } from "react";

/** Enlaces para compartir un anuncio: WhatsApp, Facebook, copiar enlace y, en el celular, el menú nativo de compartir. */
export function shareLinks(url: string, title: string) {
  const text = `${title} · ${url}`;
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  };
}

export default function ShareListing({ url, title, compact = false }: { url: string; title: string; compact?: boolean }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "error">("idle");
  const links = shareLinks(url, title);
  // Detected after hydration so server and client render the same markup.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => { setCanShare(typeof navigator.share === "function"); }, []);

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied("ok"); }
    catch { setCopied("error"); }
    window.setTimeout(() => setCopied("idle"), 2500);
  }
  async function nativeShare() {
    try { await navigator.share({ title, text: title, url }); } catch { /* cancelado por el usuario */ }
  }

  return <div className={compact ? "share share-compact" : "share"} role="group" aria-label="Compartir este anuncio">
    {!compact && <span className="share-label">Compartir</span>}
    {canShare && <button type="button" className="share-btn share-native" onClick={nativeShare}>Compartir…</button>}
    <a className="share-btn share-whatsapp" href={links.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
    <a className="share-btn" href={links.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>
    <button type="button" className="share-btn" onClick={copy}>{copied === "ok" ? "¡Enlace copiado!" : "Copiar enlace"}</button>
    {copied === "error" && <span className="share-fallback">Copia este enlace: <span>{url}</span></span>}
  </div>;
}
