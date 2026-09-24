"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getBrowserClient } from "../lib/auth-client";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return <><button type="button" disabled={busy} onClick={async () => {
    const client = getBrowserClient();
    if (!client) return;
    setBusy(true);
    setError(false);
    try {
      const result = await client.auth.signOut();
      if (result.error) { setError(true); return; }
      router.replace("/"); router.refresh();
    } catch { setError(true); }
    finally { setBusy(false); }
  }}>{busy ? "Saliendo…" : "Cerrar sesión"}</button>{error && <span role="alert">No pudimos cerrar sesión. Inténtalo de nuevo.</span>}</>;
}
