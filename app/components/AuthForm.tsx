"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getBrowserClient } from "../lib/auth-client";
import { safeReturnTo } from "../lib/safe-return";

export default function AuthForm({ mode, returnTo }: { mode: "login" | "register"; returnTo: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const destination = safeReturnTo(returnTo);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const client = getBrowserClient();
    if (!client) { setMessage("El servicio de cuentas no está disponible."); return; }
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("full_name") ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { setMessage("Escribe un correo electrónico válido."); return; }
    if (mode === "register") {
      if (fullName.length < 2 || fullName.length > 120) { setMessage("Escribe tu nombre completo (2 a 120 caracteres)."); return; }
      if (password.length < 8) { setMessage("La contraseña debe tener al menos 8 caracteres."); return; }
      if (password !== form.get("confirm_password")) { setMessage("Las contraseñas no coinciden."); return; }
    }
    setBusy(true);
    setMessage("");
    try {
      if (mode === "login") {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) { setMessage("No pudimos iniciar sesión. Revisa el correo y la contraseña."); return; }
        router.replace(destination);
        router.refresh();
      } else {
        const { data, error } = await client.auth.signUp({ email, password, options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(destination)}`,
        } });
        if (error) { setMessage("No pudimos crear la cuenta. Comprueba los datos e inténtalo otra vez."); return; }
        if (data.session) { router.replace(destination); router.refresh(); }
        else setMessage("Revisa tu correo para confirmar la cuenta y luego inicia sesión.");
      }
    } catch { setMessage("No pudimos conectar con el servicio. Inténtalo más tarde."); }
    finally { setBusy(false); }
  }

  return <main className="auth-page"><Link href="/" className="geo-logo" aria-label="Inmuebles Directos Perú, inicio">Inmuebles<span> Directos</span><small>Perú</small></Link>
    <section className="auth-card"><h1>{mode === "login" ? "Iniciar sesión" : "Crear cuenta"}</h1><p>{mode === "login" ? "Accede para publicar y consultar tus propiedades." : "Crea tu cuenta para publicar inmuebles."}</p>
      <form onSubmit={submit} aria-busy={busy}>
        {mode === "register" && <label>Nombre completo<input name="full_name" autoComplete="name" required maxLength={120} disabled={busy} /></label>}
        <label>Correo electrónico<input name="email" type="email" autoComplete="email" required disabled={busy} /></label>
        <label>Contraseña<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 8 : undefined} disabled={busy} /></label>
        {mode === "register" && <label>Confirmar contraseña<input name="confirm_password" type="password" autoComplete="new-password" required disabled={busy} /></label>}
        <button type="submit" disabled={busy}>{busy ? "Espera…" : mode === "login" ? "Entrar" : "Crear cuenta"}</button>
      </form>
      {message && <p role="status" className="auth-message">{message}</p>}
      <p>{mode === "login" ? "¿Aún no tienes cuenta?" : "¿Ya tienes cuenta?"} <Link href={`${mode === "login" ? "/registro" : "/login"}?returnTo=${encodeURIComponent(destination)}`}>{mode === "login" ? "Crear cuenta" : "Iniciar sesión"}</Link></p>
    </section>
  </main>;
}
