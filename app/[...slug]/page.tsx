import Link from "next/link";

export default async function RoutePage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const section = slug.join(" / ");
  const title = section === "explorar" ? "Explorar propiedades" : section === "publicar" ? "Publica gratis" : section === "ayuda" ? "Centro de ayuda" : "Propiedades en Ecuador";
  return (
    <main style={{ minHeight: "100vh", padding: "48px 5vw", fontFamily: "Arial, sans-serif", background: "#f8fafc" }}>
      <Link href="/" style={{ color: "#0f766e", fontWeight: 700 }}>Geo Propiedades Ecuador</Link>
      <h1 style={{ fontSize: "clamp(36px, 6vw, 64px)", margin: "30px 0 12px", color: "#0f172a" }}>{title}</h1>
      <p style={{ color: "#64748b", maxWidth: 620, fontSize: 18 }}>Encuentra propiedades en un solo mapa interactivo. Esta sección está preparada para continuar el flujo de Geo Propiedades Ecuador.</p>
      <Link className="btn primary" href="/">Volver al inicio</Link>
    </main>
  );
}
