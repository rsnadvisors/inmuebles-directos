import Link from "next/link";
import SignOutButton from "../SignOutButton";
import AccountMenu from "./AccountMenu";
import "./account.css";

type Section = "resumen" | "propiedades";

export function initials(name: string): string {
  const words = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  const letters = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2));
  return letters.toUpperCase();
}

function NavIcon({ kind }: { kind: "resumen" | "propiedades" | "publicar" | "mapa" }) {
  const paths: Record<typeof kind, string> = {
    resumen: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm8 0h8v-9h-8v9Zm0-16v5h8V4h-8Z",
    propiedades: "M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z",
    publicar: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z",
    mapa: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 2.2 6 2v11.6l-6-2V6.2Z",
  };
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d={paths[kind]} fill="currentColor" /></svg>;
}

export default function AccountShell({ active, name, email, title, subtitle, action, children }: {
  active: Section; name: string; email?: string | null; title: string; subtitle?: string;
  action?: React.ReactNode; children: React.ReactNode;
}) {
  const items = [
    { key: "resumen" as const, href: "/cuenta", label: "Mi cuenta" },
    { key: "propiedades" as const, href: "/mis-propiedades", label: "Mis propiedades" },
  ];
  return (
    <div className="acct">
      <aside className="acct-side" aria-label="Panel de tu cuenta">
        <Link className="acct-brand" href="/" aria-label="Inmuebles Directos Perú, inicio">Inmuebles <span>Directos</span></Link>
        <nav className="acct-nav" aria-label="Secciones de tu cuenta">
          {items.map(item => (
            <Link key={item.key} href={item.href} className="acct-nav-link" aria-current={active === item.key ? "page" : undefined}>
              <NavIcon kind={item.key} />{item.label}
            </Link>
          ))}
          <Link href="/" className="acct-nav-link"><NavIcon kind="mapa" />Ver el mapa</Link>
        </nav>
        <Link href="/publicar" className="acct-publish"><NavIcon kind="publicar" />Publicar propiedad</Link>
        <div className="acct-side-user">
          <span className="acct-avatar" aria-hidden="true">{initials(name)}</span>
          <span className="acct-side-id"><strong>{name}</strong>{email && <small>{email}</small>}</span>
        </div>
        <div className="acct-signout"><SignOutButton /></div>
      </aside>

      <header className="acct-topbar">
        <Link className="acct-brand" href="/" aria-label="Inmuebles Directos Perú, inicio">Inmuebles <span>Directos</span></Link>
        <AccountMenu name={name} email={email} initials={initials(name)} />
      </header>

      <main className="acct-main">
        <div className="acct-head">
          <div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
        {children}
      </main>

      <nav className="acct-tabbar" aria-label="Navegación de tu cuenta">
        <Link href="/cuenta" aria-current={active === "resumen" ? "page" : undefined}><NavIcon kind="resumen" />Cuenta</Link>
        <Link href="/mis-propiedades" aria-current={active === "propiedades" ? "page" : undefined}><NavIcon kind="propiedades" />Propiedades</Link>
        <Link href="/publicar" className="acct-tab-publish"><NavIcon kind="publicar" />Publicar</Link>
        <Link href="/"><NavIcon kind="mapa" />Mapa</Link>
      </nav>
    </div>
  );
}
