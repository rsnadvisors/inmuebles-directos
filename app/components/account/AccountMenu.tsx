"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import SignOutButton from "../SignOutButton";
import { TITULAR } from "../../lib/legal";

/** Menú de cuenta del móvil: se abre desde el avatar de la barra superior. */
export default function AccountMenu({ name, email, initials }: { name: string; email?: string | null; initials: string }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    const onPointer = (event: MouseEvent | TouchEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  const close = () => setOpen(false);
  const whatsapp = `https://wa.me/51${TITULAR.telefono.replace(/\D/g, "")}`;

  return <div className="acct-menu" ref={wrapper}>
    <button ref={button} type="button" className="acct-avatar acct-menu-trigger" aria-label="Abrir el menú de tu cuenta"
      aria-haspopup="true" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>{initials}</button>
    {open && <div id={panelId} className="acct-menu-panel" role="region" aria-label="Menú de tu cuenta">
      <div className="acct-menu-id"><strong>{name}</strong>{email && <small>{email}</small>}</div>
      <nav aria-label="Opciones de tu cuenta">
        <a href="/api/mi-cuenta/datos" download onClick={close}>Descargar mis datos</a>
        <a href={`mailto:${TITULAR.correo}?subject=${encodeURIComponent("Ayuda con Inmuebles Directos")}`} onClick={close}>Ayuda por correo</a>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={close}>Ayuda por WhatsApp</a>
        <Link href="/terminos" onClick={close}>Términos y condiciones</Link>
        <Link href="/privacidad" onClick={close}>Política de privacidad</Link>
      </nav>
      <div className="acct-menu-signout"><SignOutButton /></div>
    </div>}
  </div>;
}
