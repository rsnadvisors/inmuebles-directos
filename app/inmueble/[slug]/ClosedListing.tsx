import Link from "next/link";
import Breadcrumb, { type BreadcrumbStep } from "../../components/Breadcrumb";
import ListingSuggestions from "../../components/ListingSuggestions";
import SiteHeader from "../../components/SiteHeader";
import type { Listing } from "../../lib/inventory";
import { landingPath, operationSlug } from "../../lib/landing";
import { suggestionsFor, type ListingPublicState } from "../../lib/listing-state";

// «Esta casa», «Este terreno»: el demostrativo concuerda con el tipo.
const THIS: Record<string, string> = { Casas: "Esta casa", Departamentos: "Este departamento", Terrenos: "Este terreno", Oficinas: "Esta oficina", "Locales comerciales": "Este local comercial" };

function monthYear(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

/** Título de la pestaña para un anuncio cerrado o no disponible. */
export function closedListingTitle(state: ListingPublicState): string {
  if (state.state === "sold" || state.state === "rented") return `${state.state === "sold" ? "Vendido" : "Alquilado"}: ${state.title ?? "inmueble"}`;
  return "Anuncio no disponible";
}

/**
 * Página de una URL de anuncio que ya no está publicado: vendido/alquilado (ficha de cierre sin fotos, precio ni
 * contacto) o no disponible por ahora (sin ningún dato del anuncio). En ambos casos ofrece la zona.
 */
export default function ClosedListing({ state, inventory }: { state: ListingPublicState; inventory: Listing[] | undefined }) {
  const closed = state.state === "sold" || state.state === "rented";
  const op = state.operation ? operationSlug(state.operation) : null;
  const opLabel = op === "venta" ? "en venta" : op === "alquiler" ? "en alquiler" : "";
  const { items, sameCity } = suggestionsFor(state, inventory);
  const zoneHref = op && state.city && sameCity ? landingPath(op, state.city) : op ? `/${op}` : "/";
  const zoneLabel = op ? `Ver inmuebles ${opLabel}${state.city && sameCity ? ` en ${state.city}` : ""}` : "Ver todos los inmuebles";
  const steps: BreadcrumbStep[] = [{ name: "Inicio", path: "/" }];
  if (op && state.operation) steps.push({ name: state.operation, path: `/${op}` });
  if (op && state.city && sameCity) steps.push({ name: state.city, path: landingPath(op, state.city) });
  steps.push({ name: closed ? state.title ?? "Anuncio cerrado" : "Anuncio no disponible" });
  const subject = (state.type && THIS[state.type]) || "Este inmueble";
  const when = monthYear(state.closedAt);
  const where = [state.district, state.city].filter(Boolean).filter((part, index, parts) => index === 0 || part !== parts[index - 1]).join(", ");

  return <main className="property-full-page">
    <SiteHeader />
    <Breadcrumb steps={steps} />
    <div className="closed-listing">
      <section className={`closed-listing-card ${closed ? "is-closed" : "is-paused"}`}>
        <p className="closed-listing-badge">{state.state === "sold" ? "Vendido" : state.state === "rented" ? "Alquilado" : "No disponible"}</p>
        <h1>{closed ? state.title ?? `${subject} ya no está disponible` : "Este anuncio no está disponible por ahora"}</h1>
        <p className="closed-listing-text">{closed
          ? `${subject}${where ? ` en ${where}` : ""} ya se ${state.state === "sold" ? "vendió" : "alquiló"}${when ? ` (${when})` : ""}. El anuncio se mantiene como referencia, sin datos de contacto.`
          : "El anunciante lo pausó o está en revisión. Puede volver a publicarse más adelante en esta misma dirección."}</p>
        <div className="closed-listing-actions">
          <Link className="landing-map" href={zoneHref}>{zoneLabel}</Link>
          <Link className="closed-listing-secondary" href="/">Explorar el mapa</Link>
        </div>
      </section>
      <ListingSuggestions heading={sameCity && state.city ? `Inmuebles similares ${opLabel} en ${state.city}` : `Otros inmuebles ${opLabel}`.trim()}
        items={items} allHref={zoneHref} allLabel={zoneLabel} />
    </div>
  </main>;
}
