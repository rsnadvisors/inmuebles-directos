import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import SiteHeader from "./SiteHeader";
import Breadcrumb from "./Breadcrumb";
import { siteOrigin } from "../lib/auth-origin";
import { compactLocation, comparisonAttributes, formatPrice, primaryImage, propertyIcon } from "../lib/inventory";
import { buildLanding, landingBreadcrumb, landingMetaDescription, landingMetaTitle, type Landing } from "../lib/landing";
import { jsonLdText } from "../lib/listing-seo";
import { readHomeListings } from "../lib/property";
import { sizedImageUrl } from "../lib/property-image-source";

export type LandingParams = { ciudad?: string; tipo?: string };

/** Una sola lectura por petición, compartida entre los metadatos y la página. */
const listingsForRequest = cache(async () => {
  const listings = await readHomeListings();
  // Si la base no responde, un 500 (no un 404): Google reintenta en vez de dar la página por desaparecida.
  if (!listings) throw new Error("No se pudieron leer los anuncios publicados");
  return listings;
});

async function resolve(operation: string, params: LandingParams): Promise<Landing> {
  const landing = buildLanding(await listingsForRequest(), operation, params.ciudad, params.tipo);
  if (!landing) notFound();
  return landing;
}

export async function landingMetadata(operation: string, params: LandingParams = {}): Promise<Metadata> {
  const landing = await resolve(operation, params);
  const title = landingMetaTitle(landing);
  const description = landingMetaDescription(landing);
  const cover = landing.listings.map(primaryImage).find(Boolean);
  return {
    title, description,
    alternates: { canonical: landing.path },
    // Con pocos anuncios la página sirve al usuario pero no se ofrece a Google (contenido pobre); sus enlaces sí se siguen.
    ...(landing.indexable ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type: "website", url: landing.path, siteName: "Inmuebles Directos", locale: "es_PE", title: landing.title, description,
      images: cover ? [{ url: new URL(cover.url, siteOrigin()).href, alt: landing.title }] : [{ url: "/og-inicio.jpg", width: 1200, height: 630, alt: landing.title }],
    },
  };
}

function structuredData(landing: Landing) {
  const origin = siteOrigin();
  const absolute = (path: string) => new URL(path, origin).href;
  const steps = landingBreadcrumb(landing);
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": `${absolute(landing.path)}#pagina`, url: absolute(landing.path), name: landing.title, description: landingMetaDescription(landing), inLanguage: "es-PE",
        mainEntity: { "@type": "ItemList", numberOfItems: landing.listings.length,
          itemListElement: landing.listings.filter(item => item.slug).map((item, index) => ({ "@type": "ListItem", position: index + 1, url: absolute(`/inmueble/${item.slug}`), name: item.title })) } },
      { "@type": "BreadcrumbList", itemListElement: steps.map((step, index) => ({ "@type": "ListItem", position: index + 1, name: step.name, item: absolute(step.path ?? landing.path) })) },
    ],
  };
}

export async function LandingView({ operation, params = {} }: { operation: string; params?: LandingParams }) {
  const landing = await resolve(operation, params);
  return <main className="landing-page">
    <SiteHeader />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(structuredData(landing)) }} />
    <Breadcrumb steps={landingBreadcrumb(landing)} />
    <div className="landing-shell">
      <header className="landing-head">
        <h1>{landing.title}</h1>
        <p className="landing-intro">{landing.intro}</p>
        <div className="landing-actions">
          <Link className="landing-map" href={landing.mapHref}><span aria-hidden="true">⌖</span> Ver en el mapa</Link>
          {landing.related.length > 0 && <nav className="landing-related" aria-label="Búsquedas relacionadas">
            {landing.related.map(link => <Link key={link.path} href={link.path}>{link.label} <b>{link.count}</b></Link>)}
          </nav>}
        </div>
      </header>
      <ul className="landing-grid" aria-label={`${landing.listings.length} resultados`}>
        {landing.listings.map(item => {
          const image = primaryImage(item);
          const href = item.slug ? `/inmueble/${item.slug}` : undefined;
          const attributes = comparisonAttributes(item);
          return <li key={item.id}><article className="landing-card">
            <div className={`landing-card-photo${image ? "" : " empty"}`}>
              {image ? <img src={sizedImageUrl(image.url, 640)} alt={image.altText || `${item.title}, ${compactLocation(item)}`} loading="lazy" width={400} height={260} /> : <span aria-hidden="true">{propertyIcon(item.type)}</span>}
              <b>{item.operation}</b>{item.reserved && <b className="landing-card-reserved">Reservado</b>}
            </div>
            <div className="landing-card-body">
              <p className="landing-card-price">{formatPrice(item.price, item.currency)}</p>
              <h2>{href ? <Link href={href}>{item.title}</Link> : item.title}</h2>
              <p className="landing-card-location">{compactLocation(item)}</p>
              {attributes.length > 0 && <p className="landing-card-attributes">{attributes.map(attribute => <span key={attribute.key} aria-label={attribute.label}><span aria-hidden="true">{attribute.icon}</span> <span aria-hidden="true">{attribute.shortLabel}</span></span>)}</p>}
            </div>
          </article></li>;
        })}
      </ul>
    </div>
  </main>;
}
