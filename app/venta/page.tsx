import { LandingView, landingMetadata } from "../components/LandingPage";

// Página por operación («/venta»): se genera en cada visita con los anuncios publicados.
export const dynamic = "force-dynamic";
export const generateMetadata = () => landingMetadata("venta");
export default function Page() { return LandingView({ operation: "venta" }); }
