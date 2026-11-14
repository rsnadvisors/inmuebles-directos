import Link from "next/link";

export const metadata = { title: "Página no encontrada · Inmuebles Directos", robots: { index: false } };

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", padding: "48px 5vw", fontFamily: "Arial, sans-serif", background: "#f8fafc" }}>
      <Link href="/" style={{ color: "#0f766e", fontWeight: 700 }} aria-label="Inmuebles Directos Perú, inicio">Inmuebles Directos Perú</Link>
      <h1 style={{ fontSize: "clamp(32px, 5vw, 56px)", margin: "30px 0 12px", color: "#0f172a" }}>Página no encontrada</h1>
      <p style={{ color: "#64748b", maxWidth: 620, fontSize: 18 }}>La dirección que buscas no existe o ya no está disponible. Encuentra propiedades en el mapa de inicio.</p>
      <Link className="btn primary" href="/">Volver al inicio</Link>
    </main>
  );
}
