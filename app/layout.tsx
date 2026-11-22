import type { Metadata } from "next";
import { siteOrigin } from "./lib/auth-origin";
import { jsonLdText, siteJsonLd } from "./lib/listing-seo";
import { DM_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Fuentes servidas desde el propio dominio (next/font las descarga al compilar): sin la cadena bloqueante
// CSS → fonts.googleapis.com → fonts.gstatic.com y sin saltos de diseño gracias al tamaño de respaldo ajustado.
// Sin «weight»: Google sirve la versión variable (un solo archivo para 400–800 en lugar de cinco). Rendimiento P3a.
const ui = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const meta = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-meta", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: "Inmuebles Directos",
  description: "Propiedades en venta y alquiler en Perú, ubicadas en un solo mapa.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" className={`${ui.variable} ${meta.variable}`}><body>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(siteJsonLd(siteOrigin())) }} />
    {children}
  </body></html>;
}
