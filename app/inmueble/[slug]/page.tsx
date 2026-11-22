import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { siteOrigin } from "../../lib/auth-origin";
import Link from "next/link";
import { formatPrice, isMappable, listingCity, type Listing } from "../../lib/inventory";
import { getPublishedListing } from "../../lib/property";
import PropertyGallery from "./PropertyGallery";
import PropertyMap from "./PropertyMap";
import SiteHeader from "../../components/SiteHeader";
import PropertyContactActions from "../../components/PropertyContactActions";
import ListingViewBeacon from "../../components/ListingViewBeacon";
import ShareListing from "../../components/ShareListing";
import { TITULAR } from "../../lib/legal";

type PageProps = { params: Promise<{ slug: string }> };

function metaDescription(property: Listing): string {
  const context = [property.operation !== "Operación no especificada" ? property.operation : "", property.type !== "Tipo no especificado" ? property.type : "", property.location !== "Ubicación no especificada" ? property.location : ""].filter(Boolean).join(" · ");
  return [property.title, context, property.description].filter(Boolean).join(". ").replace(/\s+/g, " ").trim().slice(0, 160).trimEnd();
}

function publishedDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/** Inicio > Operación > Ciudad > Título: cada nivel abre el mapa con ese filtro ya aplicado. */
function Breadcrumb({ property }: { property: Listing }) {
  const operation = property.operation !== "Operación no especificada" ? property.operation : null;
  const city = listingCity(property);
  const href = (params: Record<string, string>) => `/?${new URLSearchParams(params)}`;
  return <nav className="breadcrumb" aria-label="Ruta de navegación">
    <ol>
      <li><Link href="/"><svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></svg>Inicio</Link></li>
      {operation && <li><Link href={href({ operacion: operation })}>{operation}</Link></li>}
      {city && <li><Link href={href(operation ? { operacion: operation, ciudad: city } : { ciudad: city })}>{city}</Link></li>}
      <li className="breadcrumb-current"><span aria-current="page" title={property.title}>{property.title}</span></li>
    </ol>
  </nav>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const property = await getPublishedListing(slug);
  if (!property) notFound();
  const canonical = `/inmueble/${encodeURIComponent(property.slug || slug)}`;
  const description = metaDescription(property);
  return {
    title: `${property.title} | Inmuebles Directos`,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title: property.title,
      description,
      ...(property.imageItems[0] ? { images: [{ url: new URL(property.imageItems[0].url, siteOrigin()).href, alt: property.imageItems[0].altText || property.title }] } : {}),
    },
  };
}

export default async function PropertyPage({ params }: PageProps) {
  const { slug } = await params;
  const property = await getPublishedListing(slug);
  if (!property) notFound();
  const date = publishedDate(property.publishedAt);
  const attributes = [
    ["Área total", property.area, "m²"],
    ["Área construida", property.builtArea, "m²"],
    ["Habitaciones", property.bedrooms, ""],
    ["Baños", property.bathrooms, ""],
    ["Estacionamientos", property.parkingSpaces, ""],
    ["Pisos", property.floors, ""],
  ] as const;
  const shownAttributes = attributes.filter(([, value]) => value !== null);
  const listingUrl = new URL(`/inmueble/${encodeURIComponent(property.slug || slug)}`, siteOrigin()).href;
  const reportHref = `mailto:${TITULAR.correo}?subject=${encodeURIComponent("Denuncia de anuncio")}&body=${encodeURIComponent(
    `Quiero denunciar este anuncio:\n${listingUrl}\n\nMotivo (falso, ya vendido, contenido indebido, datos de otra persona, etc.):\n`)}`;

  return <main className="property-full-page">
    <SiteHeader />
    <Breadcrumb property={property} />
    <article className="property-full-shell">
      <PropertyGallery images={property.imageItems} title={property.title} />
      <div className="property-full-content">
        <section className="property-full-summary">
          <p className="property-full-kicker">{property.operation} · {property.type}{property.reserved && <span className="reserved-badge">Reservado</span>}</p>
          <h1>{property.title}</h1>
          <p className="property-full-price">{formatPrice(property.price, property.currency)}</p>
          {property.location !== "Ubicación no especificada" && <p className="property-full-location">⌖ {property.location}</p>}
          {property.maintenanceFee !== null && <p className="property-full-maintenance">Mantenimiento: {formatPrice(property.maintenanceFee, property.currency)}</p>}
        </section>
        {shownAttributes.length > 0 && <section className="property-full-section" aria-labelledby="property-attributes"><h2 id="property-attributes">Características</h2><dl className="property-full-attributes">{shownAttributes.map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{value}{unit ? ` ${unit}` : ""}</dd></div>)}</dl></section>}
        {property.description && <section className="property-full-section"><h2>Descripción</h2><p className="property-full-description">{property.description}</p></section>}
        {isMappable(property) && <section className="property-full-section"><h2>Ubicación</h2><PropertyMap property={property} /></section>}
        {date && <section className="property-full-section property-full-publication"><h2>Publicación</h2><p>Publicado el {date}</p></section>}
        <PropertyContactActions phone={property.contactPhone} title={property.title} status={property.status} listingId={property.id} /><ListingViewBeacon id={property.id} />
        <ShareListing url={listingUrl} title={property.title} />
        <p className="property-report"><a href={reportHref} rel="nofollow">Denunciar este anuncio</a></p>
      </div>
    </article>
  </main>;
}
