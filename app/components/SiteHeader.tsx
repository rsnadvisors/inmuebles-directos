"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getBrowserClient } from "../lib/auth-client";
import SignOutButton from "./SignOutButton";

type Props = {
  query?: string;
  onQueryChange?: (value: string) => void;
  mobileFilters?: boolean;
  onMobileFiltersChange?: (value: boolean) => void;
};

export default function SiteHeader({ query, onQueryChange, mobileFilters, onMobileFiltersChange }: Props) {
  const [account, setAccount] = useState<{ signedIn: boolean; name: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const client = getBrowserClient();
    if (!client) { setAccount({ signedIn: false, name: "" }); return; }
    let active = true;
    async function load() {
      const { data, error } = await client!.auth.getUser();
      if (!active) return;
      if (error || !data.user) { setAccount({ signedIn: false, name: "" }); return; }
      const { data: profile } = await client!.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
      if (active) setAccount({ signedIn: true, name: typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name.trim() : data.user.email || "Mi cuenta" });
    }
    load();
    const { data: subscription } = client.auth.onAuthStateChange(() => { window.setTimeout(() => { void load(); }, 0); });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenuOpen(false); buttonRef.current?.focus(); } };
    const outside = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    document.addEventListener("keydown", key); document.addEventListener("mousedown", outside);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", outside); };
  }, [menuOpen]);
  const publishHref = account?.signedIn ? "/publicar" : "/login?returnTo=/publicar";
  const close = () => setMenuOpen(false);
  return <header className={`geo-header ${onQueryChange ? "geo-header-search" : "geo-header-simple"}`}>
    <Link className="geo-logo" href="/" aria-label="Inmuebles Directos Perú, inicio">Inmuebles<span> Directos</span><small>Perú</small></Link>
    {onQueryChange && <><label className="header-search"><span aria-hidden="true">⌕</span><input value={query ?? ""} onChange={event => onQueryChange(event.target.value)} placeholder="Buscar propiedad, ciudad o provincia" aria-label="Buscar propiedad, ciudad o provincia" /></label><button className="mobile-filter-toggle" type="button" aria-label="Abrir filtros" aria-expanded={!!mobileFilters} onClick={() => onMobileFiltersChange?.(!mobileFilters)}>☷</button></>}
    <nav className="geo-nav" aria-label="Navegación principal"><Link className="publish-cta" href={publishHref}>Publicar gratis</Link><Link href="/">Explorar mapa</Link>{account?.signedIn ? <Link href="/cuenta">{account.name}</Link> : <Link href="/login">Iniciar sesión</Link>}</nav>
    <div className="mobile-nav" ref={menuRef}><button ref={buttonRef} className="mobile-menu" type="button" aria-label="Abrir menú" aria-expanded={menuOpen} aria-controls="mobile-site-menu" onClick={() => setMenuOpen(open => !open)}>☰</button>
      {menuOpen && <nav id="mobile-site-menu" className="mobile-menu-panel" aria-label="Menú móvil"><Link href="/" onClick={close}>Inicio</Link><Link href={publishHref} onClick={close}>Publicar gratis</Link>{account?.signedIn ? <><Link href="/cuenta" onClick={close}>Mi cuenta</Link><Link href="/mis-propiedades" onClick={close}>Mis propiedades</Link><SignOutButton /></> : <><Link href="/login" onClick={close}>Iniciar sesión</Link><Link href="/registro" onClick={close}>Crear cuenta</Link></>}</nav>}
    </div>
  </header>;
}
