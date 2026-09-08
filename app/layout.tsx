import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Geo Propiedades Ecuador",
  description: "Propiedades en venta y alquiler en Ecuador, ubicadas en un solo mapa.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
