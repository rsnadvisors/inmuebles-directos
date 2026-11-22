"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { loadBrowserClient } from "../lib/lazy-browser-client";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return <><button type="button" disabled={busy} onClick={async () => {
    setBusy(true);
    setError(false);
    try {
      const client = await loadBrowserClient();
      if (!client) return;
      const result = await client.auth.signOut();
      if (result.error) { setError(true); return; }
      router.replace("/"); router.refresh();
    } catch { setError(true); }
    finally { setBusy(false); }
  }}>{busy ? "Saliendo…" : "Cerrar sesión"}</button>{error && <span role="alert">No pudimos cerrar sesión. Inténtalo de nuevo.</span>}</>;
}
