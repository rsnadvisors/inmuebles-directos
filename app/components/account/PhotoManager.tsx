"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, useRef, useState } from "react";
import { MAX_PHOTOS, moved, PHOTO_TYPES, withCover } from "../../lib/listing-photos";
import { MAX_PHOTO_BYTES } from "../../lib/publication";

export type ManagedPhoto = { id: string; src: string | null };

/** Fotos de un anuncio propio: añadir, quitar, elegir portada y ordenar. Cada cambio se guarda al momento. */
export default function PhotoManager({ listingId, photos }: { listingId: string; photos: ManagedPhoto[] }) {
  const router = useRouter();
  const pending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ids = photos.map(p => p.id);

  async function run(label: string, request: () => Promise<Response>, confirmText?: string) {
    if (pending.current) return;
    if (confirmText && !window.confirm(confirmText)) return;
    pending.current = true; setBusy(true); setMessage(label);
    try {
      const response = await request();
      const result = await response.json().catch(() => null) as { ok?: boolean; message?: unknown } | null;
      if (!response.ok || !result?.ok) { setMessage(typeof result?.message === "string" ? result.message : "No pudimos guardar el cambio. Inténtalo de nuevo."); return; }
      setMessage("Fotos actualizadas.");
      router.refresh();
    } catch { setMessage("No pudimos conectar con el servidor. Inténtalo de nuevo."); }
    finally { pending.current = false; setBusy(false); if (input.current) input.current.value = ""; }
  }
  const json = (body: Record<string, unknown>) => () => fetch("/api/mis-propiedades", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: listingId, ...body }) });
  const order = (next: string[]) => run("Guardando el orden…", json({ op: "image-order", order: next }));

  function add(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type) || file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
      setMessage("La foto debe ser JPG, PNG o WebP y pesar como máximo 5 MiB."); event.target.value = ""; return;
    }
    const body = new FormData(); body.set("id", listingId); body.set("image", file);
    run("Subiendo la foto…", () => fetch("/api/mis-propiedades/fotos", { method: "POST", body }));
  }

  return <section className="acct-photos" aria-label="Fotos del anuncio" aria-busy={busy}>
    <h2 className="acct-section-title">Fotos</h2>
    <p className="acct-manage-note">La primera es la portada. Máximo {MAX_PHOTOS} fotos; el anuncio necesita al menos una.</p>
    <ol className="acct-photo-grid">
      {photos.map((photo, index) => <li key={photo.id} className="acct-photo">
        <div className="acct-photo-img">{photo.src ? <img src={photo.src} alt={`Foto ${index + 1}`} loading="lazy" /> : <span aria-hidden="true">⌂</span>}
          {index === 0 && <b className="acct-photo-cover">Portada</b>}</div>
        <div className="acct-photo-tools">
          {index > 0 && <button type="button" disabled={busy} onClick={() => order(withCover(ids, photo.id))}>Hacer portada</button>}
          <button type="button" disabled={busy || index === 0} aria-label={`Mover la foto ${index + 1} a la izquierda`} onClick={() => order(moved(ids, photo.id, -1))}>←</button>
          <button type="button" disabled={busy || index === photos.length - 1} aria-label={`Mover la foto ${index + 1} a la derecha`} onClick={() => order(moved(ids, photo.id, 1))}>→</button>
          <button type="button" className="acct-photo-remove" disabled={busy || photos.length <= 1}
            onClick={() => run("Quitando la foto…", json({ op: "image-remove", imageId: photo.id }), "¿Quitar esta foto del anuncio? Se borrará definitivamente.")}>Quitar</button>
        </div>
      </li>)}
    </ol>
    {photos.length < MAX_PHOTOS && <label className="acct-btn acct-btn-quiet acct-photo-add">Añadir foto
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={add} hidden /></label>}
    <p className="acct-manage-note" role="status">{message}</p>
  </section>;
}
