import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { siteOrigin } from "../../lib/auth-origin";
import Breadcrumb from "../../components/Breadcrumb";
import { formatPrice, isMappable, listingCity, type Listing } from "../../lib/inventory";
import { jsonLdText, listingBreadcrumb, listingJsonLd, listingKind, listingSeoDescription, listingSeoTitle, listingZone } from "../../lib/listing-seo";
import { getPublishedListing, getPublisherName, readHomeListings } from "../../lib/property";
import { landingPath, operationSlug, slugify } from "../../lib/landing";
import PropertyGallery from "./PropertyGallery";
import PropertyMap from "./PropertyMap";
import SiteHeader from "../../components/SiteHeader";
import PropertyContactActions from "../../components/PropertyContactActions";
import ListingViewBeacon from "../../components/ListingViewBeacon";
import ShareListing from "../../components/ShareListing";
import { TITULAR } from "../../lib/legal";
import ListingSuggestions from "../../components/ListingSuggestions";
import { getListingPublicState, removedListingTarget } from "../../lib/listing-state";
import ClosedListing, { closedListingTitle } from "./ClosedListing";

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

/** Hasta 4 anuncios de la misma operación y ciudad, los más recientes primero (sin el actual). */
function relatedListings(property: Listing, all: Listing[] | undefined): Listing[] {
  const city = slugify(listingCity(property));
  if (!all || !city) return [];
  return all.filter(item => item.id !== property.id && item.slug && item.operation === property.operation && slugify(listingCity(item)) === city)
    .sort((a, b) => (b.publishedAt ? Date.parse(b.publishedAt) : 0) - (a.publishedAt ? Date.parse(a.publishedAt) : 0))
    .slice(0, 4);
}

/** «Más inmuebles en venta en Piura»: enlaces a otras fichas de la zona y a su página (M5). */
function RelatedListings({ property, items }: { property: Listing; items: Listing[] }) {
  const op = operationSlug(property.operation);
  const city = listingCity(property);
  if (!op || !city) return null;
  const label = op === "venta" ? "en venta" : "en alquiler";
  return <ListingSuggestions heading={`Más inmuebles ${label} en ${city}`} items={items}
    allHref={landingPath(op, city)} allLabel={`Ver todos los inmuebles ${label} en ${city}`} />;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const property = await getPublishedListing(slug);
  if (!property) {
    // Vendido, alquilado o no disponible: página propia fuera del índice (sus enlaces sí se siguen). Retirado: la
    // página hace la redirección permanente; sin estado público, 404.
    const state = await getListingPublicState(slug);
    if (!state) notFound();
    return { title: `${closedListingTitle(state)} | Inmuebles Directos`, robots: { index: false, follow: true } };
  }
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
  if (!property) {
    const state = await getListingPublicState(slug);
    if (!state) notFound();
    const inventory = await readHomeListings();
    // Eliminado (o cerrado hace más de 6 meses): redirección permanente a su zona, que conserva la autoridad del enlace.
    if (state.state === "removed") permanentRedirect(removedListingTarget(state, inventory));
    return <ClosedListing state={state} inventory={inventory} />;
  }
  const date = publishedDate(property.publishedAt);
  // Nombre del anunciante y anuncios de la zona en paralelo: la ficha no espera dos consultas seguidas.
  const [publisher, inventory] = await Promise.all([getPublisherName(property.id), readHomeListings()]);
  const related = relatedListings(property, inventory);
  const kind = listingKind(property);
  const zone = listingZone(property);
  const photoContext = kind && zone ? `${kind} en ${zone}` : kind || zone;
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
      <PropertyGallery images={property.imageItems} title={property.title} context={photoContext} />
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
        <RelatedListings property={property} items={related} />
        <p className="property-report"><a href={reportHref} rel="nofollow">Denunciar este anuncio</a></p>
      </div>
    </article>
  </main>;
}
