"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { getBrowserClient } from "../lib/auth-client";
import { safeReturnTo } from "../lib/safe-return";
import { LEGAL_VERSION } from "../lib/legal";
import PasswordInput from "./PasswordInput";
import Turnstile, { type TurnstileHandle } from "./Turnstile";
import { TURNSTILE_MISSING_MESSAGE } from "../lib/turnstile";

export default function AuthForm({ mode, returnTo, passwordUpdated = false }: { mode: "login" | "register"; returnTo: string; passwordUpdated?: boolean }) {
  const router = useRouter();
  const pending = useRef(false);
  const captcha = useRef<TurnstileHandle>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const destination = safeReturnTo(returnTo);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
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
      if (form.get("accept_legal") !== "on") { setMessage("Debes aceptar los Términos y condiciones y la Política de privacidad."); return; }
    }
    const captchaToken = captcha.current?.token() ?? "";
    if (!captchaToken) { setMessage(TURNSTILE_MISSING_MESSAGE); return; }
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (mode === "login") {
        const { error } = await client.auth.signInWithPassword({ email, password, options: { captchaToken } });
        if (error) { setMessage("No pudimos iniciar sesión. Revisa el correo y la contraseña."); return; }
        router.replace(destination);
        router.refresh();
      } else {
        const { data, error } = await client.auth.signUp({ email, password, options: {
          // Evidence of informed consent (Ley 29733): accepted version and timestamp.
          data: { full_name: fullName, legal_version: LEGAL_VERSION, legal_accepted_at: new Date().toISOString() },
          emailRedirectTo: `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(destination)}`,
          captchaToken,
        } });
        if (error) { setMessage("No pudimos crear la cuenta. Comprueba los datos e inténtalo otra vez."); return; }
        if (data.session) { router.replace(destination); router.refresh(); }
        else setMessage("Revisa tu correo para confirmar la cuenta y luego inicia sesión.");
      }
    } catch { setMessage("No pudimos conectar con el servicio. Inténtalo más tarde."); }
    // Turnstile tokens are single-use: always request a fresh one for the next attempt.
    finally { captcha.current?.reset(); pending.current = false; setBusy(false); }
  }

  return <main className="auth-page"><Link href="/" className="geo-logo" aria-label="Inmuebles Directos Perú, inicio">Inmuebles<span> Directos</span><small>Perú</small></Link>
    <section className="auth-card"><h1>{mode === "login" ? "Iniciar sesión" : "Crear cuenta"}</h1><p>{mode === "login" ? "Accede para publicar y consultar tus propiedades." : "Crea tu cuenta para publicar inmuebles."}</p>
      <form onSubmit={submit} aria-busy={busy}>
        {mode === "register" && <label>Nombre completo<input name="full_name" autoComplete="name" required maxLength={120} disabled={busy} /></label>}
        <label>Correo electrónico<input name="email" type="email" autoComplete="email" required disabled={busy} /></label>
        <PasswordInput label="Contraseña" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 8 : undefined} disabled={busy} describedBy="auth-feedback" />
        {mode === "register" && <PasswordInput label="Confirmar contraseña" name="confirm_password" autoComplete="new-password" disabled={busy} describedBy="auth-feedback" />}
        {mode === "register" && <label className="auth-legal-consent" style={{ display: "flex", gap: 8, alignItems: "flex-start", fontWeight: 400 }}>
          <input type="checkbox" name="accept_legal" required disabled={busy} style={{ width: "auto", marginTop: 4 }} />
          <span>He leído y acepto los <Link href="/terminos" target="_blank">Términos y condiciones</Link> y la <Link href="/privacidad" target="_blank">Política de privacidad</Link>, y autorizo el tratamiento de mis datos personales conforme a la Ley N.º 29733.</span>
        </label>}
        <Turnstile ref={captcha} action={mode === "login" ? "login" : "register"} />
        <button type="submit" disabled={busy}>{busy ? "Espera…" : mode === "login" ? "Entrar" : "Crear cuenta"}</button>
      </form>
      <p id="auth-feedback" role="status" className="auth-message">{message || (mode === "login" && passwordUpdated ? "Tu contraseña fue actualizada. Ya puedes iniciar sesión." : "")}</p>
      {mode === "login" && <p><Link href="/recuperar-password">¿Olvidaste tu contraseña?</Link></p>}
      <p className="auth-legal-links" style={{ fontSize: 13 }}><Link href="/terminos">Términos</Link> · <Link href="/privacidad">Privacidad</Link></p>
      <p>{mode === "login" ? "¿Aún no tienes cuenta?" : "¿Ya tienes cuenta?"} <Link href={`${mode === "login" ? "/registro" : "/login"}?returnTo=${encodeURIComponent(destination)}`}>{mode === "login" ? "Crear cuenta" : "Iniciar sesión"}</Link></p>
    </section>
  </main>;
}
