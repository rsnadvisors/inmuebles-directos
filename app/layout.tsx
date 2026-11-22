import type { Metadata } from "next";
import { siteOrigin } from "./lib/auth-origin";
import { jsonLdText, siteJsonLd } from "./lib/listing-seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: "Inmuebles Directos",
  description: "Propiedades en venta y alquiler en Perú, ubicadas en un solo mapa.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(siteJsonLd(siteOrigin())) }} />
    {children}
  </body></html>;
}
