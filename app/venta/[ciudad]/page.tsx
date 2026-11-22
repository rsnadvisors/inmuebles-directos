import { LandingView, landingMetadata } from "../../components/LandingPage";

type Props = { params: Promise<{ ciudad: string }> };
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: Props) { return landingMetadata("venta", await params); }
export default async function Page({ params }: Props) { return LandingView({ operation: "venta", params: await params }); }
