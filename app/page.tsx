import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import { readHomeListings } from "./lib/property";

const TITLE = "Inmuebles en venta y alquiler en Piura | Inmuebles Directos";
const DESCRIPTION = "Encuentra casas, departamentos, terrenos y locales en venta y alquiler en Piura, con el precio sobre el mapa. Contacta directo al propietario por llamada o WhatsApp.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website", url: "/", siteName: "Inmuebles Directos", locale: "es_PE", title: TITLE, description: DESCRIPTION,
    images: [{ url: "/og-inicio.jpg", width: 1200, height: 630, alt: "Inmuebles en venta y alquiler en Piura, con el precio sobre el mapa" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og-inicio.jpg"] },
};

// Se genera en cada visita (el inicio ya se sirve con no-store): el listado debe estar siempre al día.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  return <HomeClient initialListings={await readHomeListings()} />;
}
