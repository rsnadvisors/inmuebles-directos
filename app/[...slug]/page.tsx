import { notFound } from "next/navigation";

// Unknown routes are real 404s (no soft-200 placeholder pages for crawlers or users).
export default async function RoutePage({ params }: { params: Promise<{ slug: string[] }> }) {
  await params;
  notFound();
}
