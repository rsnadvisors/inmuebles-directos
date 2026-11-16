"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/** Botón de acción directa del dashboard (Renovar / Volver a publicar) sobre un anuncio propio. */
export default function QuickStatusButton({ id, action, label }: { id: string; action: "renew" | "reactivate"; label: string }) {
  const router = useRouter();
  const pending = useRef(false);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  async function run() {
    if (pending.current) return;
    pending.current = true; setState("busy");
    try {
      const response = await fetch("/api/mis-propiedades", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "status", id, action }) });
      const result = await response.json().catch(() => null) as { ok?: boolean } | null;
      if (!response.ok || !result?.ok) { setState("error"); return; }
      setState("done"); router.refresh();
    } catch { setState("error"); }
    finally { pending.current = false; }
  }
  return <span className="acct-quick">
    <button type="button" className="acct-btn" disabled={state === "busy" || state === "done"} onClick={run}>
      {state === "busy" ? "Guardando…" : state === "done" ? "Listo" : label}
    </button>
    {state === "error" && <small role="alert">No se pudo. Inténtalo en Mis propiedades.</small>}
  </span>;
}
