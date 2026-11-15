"use client";

import { FormEvent, useRef, useState } from "react";
import { ACCOUNT_DELETION_PHRASE } from "../../lib/listing-management";

export default function DeleteAccountForm() {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [message, setMessage] = useState("");
  const ready = phrase.trim() === ACCOUNT_DELETION_PHRASE;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !ready) return;
    pending.current = true; setBusy(true); setMessage("Eliminando tu cuenta… no cierres esta página.");
    try {
      const response = await fetch("/api/mi-cuenta/eliminar", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: ACCOUNT_DELETION_PHRASE }) });
      const result = await response.json().catch(() => null) as { ok?: boolean; message?: unknown } | null;
      if (!response.ok || !result?.ok) {
        setMessage(typeof result?.message === "string" ? result.message : "No pudimos eliminar la cuenta. Inténtalo más tarde.");
        return;
      }
      window.location.assign("/cuenta-eliminada");
    } catch { setMessage("No pudimos conectar con el servidor. Inténtalo de nuevo."); }
    finally { pending.current = false; setBusy(false); }
  }

  return <form onSubmit={submit} className="acct-delete-form" aria-busy={busy}>
    <label>Para confirmar, escribe <b>{ACCOUNT_DELETION_PHRASE}</b>
      <input value={phrase} onChange={e => setPhrase(e.target.value)} autoComplete="off" disabled={busy} /></label>
    <button type="submit" className="acct-btn acct-btn-danger" disabled={busy || !ready}>{busy ? "Eliminando…" : "Eliminar mi cuenta definitivamente"}</button>
    <p className="acct-manage-note" role="status">{message}</p>
  </form>;
}
