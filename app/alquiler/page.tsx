import { LandingView, landingMetadata } from "../components/LandingPage";

// Página por operación («/alquiler»): se genera en cada visita con los anuncios publicados.
export const dynamic = "force-dynamic";
export const generateMetadata = () => landingMetadata("alquiler");
export default function Page() { return LandingView({ operation: "alquiler" }); }
