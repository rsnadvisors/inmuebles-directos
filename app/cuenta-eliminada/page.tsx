import Link from "next/link";

export const metadata = { title: "Cuenta eliminada | Inmuebles Directos", robots: { index: false } };

export default function AccountDeleted() {
  return <main className="auth-page"><Link href="/" className="geo-logo" aria-label="Inmuebles Directos Perú, inicio">Inmuebles<span> Directos</span><small>Perú</small></Link>
    <section className="auth-card"><h1>Tu cuenta fue eliminada</h1>
      <p>Borramos tus anuncios, fotos, perfil y acceso. Gracias por haber usado Inmuebles Directos.</p>
      <p><Link href="/">Volver al mapa</Link></p>
    </section></main>;
}
