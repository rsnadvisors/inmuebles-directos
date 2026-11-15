import Link from "next/link";
import { LEGAL_UPDATED } from "../lib/legal";

export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="legal-page" style={{ minHeight: "100vh", padding: "40px 5vw 64px", background: "#f8fafc", color: "#0f172a", fontFamily: "Arial, sans-serif", lineHeight: 1.65 }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#0f766e", fontWeight: 700 }} aria-label="Inmuebles Directos Perú, inicio">Inmuebles Directos Perú</Link>
        <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)", margin: "24px 0 4px" }}>{title}</h1>
        <p style={{ color: "#64748b", marginTop: 0 }}>Última actualización: {LEGAL_UPDATED}</p>
        {children}
        <p style={{ marginTop: 40 }}>
          <Link href="/privacidad">Política de privacidad</Link> · <Link href="/terminos">Términos y condiciones de uso</Link> · <Link href="/">Volver al inicio</Link>
        </p>
      </div>
    </main>
  );
}
