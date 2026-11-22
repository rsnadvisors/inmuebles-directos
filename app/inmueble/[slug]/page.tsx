import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { siteOrigin } from "../../lib/auth-origin";
import Breadcrumb from "../../components/Breadcrumb";
import { formatPrice, isMappable, type Listing } from "../../lib/inventory";
import { jsonLdText, listingBreadcrumb, listingJsonLd, listingSeoDescription, listingSeoTitle } from "../../lib/listing-seo";
import { getPublishedListing, getPublisherName } from "../../lib/property";
import PropertyGallery from "./PropertyGallery";
import PropertyMap from "./PropertyMap";
import SiteHeader from "../../components/SiteHeader";
import PropertyContactActions from "../../components/PropertyContactActions";
import ListingViewBeacon from "../../components/ListingViewBeacon";
import ShareListing from "../../components/ShareListing";
import { TITULAR } from "../../lib/legal";

type PageProps = { params: Promise<{ slug: string }> };

function publishedDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/** Quién publica: avatar con inicial, nombre abreviado, fecha y sello del portal. */
function Publisher({ name, date }: { name: string | null; date: string | null }) {
  const shown = name ?? "Anunciante";
  return <div className="publisher">
    <div className="publisher-head">
      <span className="publisher-avatar" aria-hidden="true">{shown.charAt(0).toLocaleUpperCase("es-PE")}</span>
      <div className="publisher-text"><strong className="publisher-name">{shown}</strong>{date && <span className="publisher-date">Publicado el {date}</span>}</div>
    </div>
    <p className="publisher-trust"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor" /><path d="m7 12.5 3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>Publicada en Inmuebles Directos</p>
  </div>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const property = await getPublishedListing(slug);
  if (!property) notFound();
  const canonical = `/inmueble/${encodeURIComponent(property.slug || slug)}`;
  const description = listingSeoDescription(property);
  return {
    title: listingSeoTitle(property),
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: "Inmuebles Directos",
      locale: "es_PE",
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
  const publisher = await getPublisherName(property.id);
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
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(listingJsonLd(property, listingUrl, siteOrigin())) }} />
    <Breadcrumb steps={listingBreadcrumb(property)} />
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
        <section className="property-full-section property-full-publication" aria-labelledby="property-publication"><h2 id="property-publication">Publicación</h2><Publisher name={publisher} date={date} /></section>
        <PropertyContactActions phone={property.contactPhone} title={property.title} status={property.status} listingId={property.id} /><ListingViewBeacon id={property.id} />
        <ShareListing url={listingUrl} title={property.title} />
        <p className="property-report"><a href={reportHref} rel="nofollow">Denunciar este anuncio</a></p>
      </div>
    </article>
  </main>;
}
