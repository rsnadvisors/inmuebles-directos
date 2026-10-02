"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { getBrowserClient } from "../lib/auth-client";
import { recoveryRedirect } from "../lib/auth-origin";
import PasswordInput from "./PasswordInput";

export const RECOVERY_MESSAGE = "Si existe una cuenta asociada a ese correo, recibirás instrucciones para restablecer tu contraseña. Si no llegan, espera unos minutos antes de solicitar otro enlace.";

export default function PasswordRecoveryForm({ mode, userId }: { mode: "request" | "reset"; userId?: string }) {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [finished, setFinished] = useState(false);
  const [invalid, setInvalid] = useState(mode === "reset" && !userId);
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || finished || invalid) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    if (mode === "request" && !/^\S+@\S+\.\S+$/.test(email)) { setMessage("Escribe un correo electrónico válido."); return; }
    if (mode === "reset" && !passwordUpdated) {
      if (password.length < 8) { setMessage("La contraseña debe tener al menos 8 caracteres."); return; }
      if (password !== form.get("confirm_password")) { setMessage("Las contraseñas no coinciden."); return; }
    }
    const client = getBrowserClient();
    if (!client) { setMessage("El servicio de cuentas no está disponible. Inténtalo más tarde."); return; }
    pending.current = true;
    setBusy(true);
    setMessage("");
    let credentialUpdated = passwordUpdated;
    try {
      if (mode === "request") {
        // Provider existence/delivery errors deliberately share the same neutral response.
        try { await client.auth.resetPasswordForEmail(email, { redirectTo: recoveryRedirect(window.location.origin) }); }
        catch { /* Do not serialize provider errors or reveal account existence. */ }
        formElement.reset();
        setMessage(RECOVERY_MESSAGE);
        setFinished(true);
        return;
      }
      if (!passwordUpdated) {
        const { data, error } = await client.auth.getUser();
        if (error || !data.user || data.user.is_anonymous || data.user.id !== userId) {
          setInvalid(true);
          return;
        }
        const result = await client.auth.updateUser({ password });
        if (result.error) { setMessage("No pudimos actualizar la contraseña. Usa una contraseña de al menos 8 caracteres y cumple los requisitos de tu cuenta, o solicita un nuevo enlace."); return; }
        setPasswordUpdated(true);
        credentialUpdated = true;
        formElement.reset();
      }
      // Local scope revokes only this session's refresh token; no global sign-out.
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) { setMessage("Tu contraseña fue actualizada, pero no pudimos cerrar esta sesión. Pulsa de nuevo para cerrar sesión antes de iniciar sesión con la nueva contraseña."); return; }
      setFinished(true);
      router.replace("/login?status=password-updated");
      router.refresh();
    } catch {
      setMessage(credentialUpdated ? "Tu contraseña fue actualizada. Intenta cerrar esta sesión nuevamente." : "No pudimos completar la operación. Inténtalo más tarde o solicita un nuevo enlace.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <Link href="/" className="geo-logo" aria-label="Inmuebles Directos Perú, inicio">Inmuebles<span> Directos</span><small>Perú</small></Link>
    <section className="auth-card">
      <h1>{mode === "request" ? "Recuperar contraseña" : "Restablecer contraseña"}</h1>
      {invalid ? <><p role="status">El enlace no es válido, expiró o no hay una sesión verificada.</p><Link href="/recuperar-password">Solicitar un nuevo enlace</Link></> : <>
        <p>{mode === "request" ? "Escribe tu correo para solicitar un enlace. Ábrelo en el mismo navegador y perfil donde lo solicitaste." : "Cambiarás la contraseña de tu cuenta en esta sesión verificada. Al terminar cerraremos esta sesión y podrás iniciar sesión con tu nueva contraseña."}</p>
        <form onSubmit={submit} aria-busy={busy}>
          {mode === "request" ? <label>Correo electrónico<input name="email" type="email" autoComplete="email" required disabled={busy || finished} aria-describedby="recovery-feedback" /></label> : !passwordUpdated && <>
            <PasswordInput label="Nueva contraseña" name="password" autoComplete="new-password" minLength={8} disabled={busy || finished} describedBy="recovery-feedback" />
            <PasswordInput label="Confirmar nueva contraseña" name="confirm_password" autoComplete="new-password" disabled={busy || finished} describedBy="recovery-feedback" />
          </>}
          <button type="submit" disabled={busy || finished}>{busy ? mode === "request" ? "Enviando…" : "Actualizando…" : mode === "request" ? "Enviar enlace" : passwordUpdated ? "Cerrar esta sesión" : "Actualizar contraseña"}</button>
        </form>
        <p id="recovery-feedback" role="status" className="auth-message">{message}</p>
        {mode === "reset" && <p><Link href="/recuperar-password">Solicitar un nuevo enlace</Link></p>}
      </>}
      <p><Link href="/login">Volver a iniciar sesión</Link></p>
    </section>
  </main>;
}
