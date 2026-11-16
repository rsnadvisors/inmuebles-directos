"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";

/** Moderación visible: motivo del archivo y formulario para pedir una revisión. */
export default function ReviewRequest({ id, note, requestedAt }: { id: string; note: string | null; requestedAt: string | null }) {
  const router = useRouter();
  const pending = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const text = message.trim();
    if (text.length < 10) { setStatus("Explícanos en al menos 10 caracteres qué corregiste o por qué crees que es un error."); return; }
    pending.current = true; setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/mis-propiedades", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "review-request", id, message: text }) });
      const result = await response.json().catch(() => null) as { ok?: boolean; message?: unknown } | null;
      if (!response.ok || !result?.ok) { setStatus(typeof result?.message === "string" ? result.message : "No pudimos enviar la solicitud. Inténtalo más tarde."); return; }
      setStatus("Recibimos tu solicitud. Te responderemos por correo."); setOpen(false); router.refresh();
    } catch { setStatus("No pudimos conectar con el servidor. Inténtalo de nuevo."); }
    finally { pending.current = false; setBusy(false); }
  }

  return <div className="acct-review" role="group" aria-label="Revisión del anuncio">
    <p><b>Archivado por revisión.</b> {note ? <>Motivo: {note}</> : "El equipo lo retiró del mapa tras una revisión."}</p>
    {requestedAt ? <p className="acct-manage-note">Ya pediste una revisión. Te responderemos por correo.</p>
      : !open ? <button type="button" className="acct-btn acct-btn-quiet" onClick={() => setOpen(true)}>Pedir revisión</button>
      : <form onSubmit={submit} className="acct-review-form">
          <label htmlFor={`review-${id}`}>¿Qué corregiste o por qué crees que es un error?</label>
          <textarea id={`review-${id}`} value={message} onChange={e => setMessage(e.target.value)} maxLength={500} rows={3} disabled={busy} />
          <div className="acct-manage-buttons">
            <button type="submit" className="acct-btn" disabled={busy}>{busy ? "Enviando…" : "Enviar solicitud"}</button>
            <button type="button" className="acct-btn acct-btn-quiet" onClick={() => setOpen(false)} disabled={busy}>Cancelar</button>
          </div>
        </form>}
    <p className="acct-manage-note" role="status">{status}</p>
  </div>;
}
