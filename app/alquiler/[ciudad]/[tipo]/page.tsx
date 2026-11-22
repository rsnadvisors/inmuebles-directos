import { LandingView, landingMetadata } from "../../../components/LandingPage";

type Props = { params: Promise<{ ciudad: string; tipo: string }> };
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: Props) { return landingMetadata("alquiler", await params); }
export default async function Page({ params }: Props) { return LandingView({ operation: "alquiler", params: await params }); }
