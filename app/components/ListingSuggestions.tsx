import Link from "next/link";
import { compactLocation, formatPrice, primaryImage, propertyIcon, type Listing } from "../lib/inventory";
import { sizedImageUrl } from "../lib/property-image-source";

/** Lista compacta de anuncios (foto, precio, título, zona) con un enlace final opcional. Ficha y página de cierre. */
export default function ListingSuggestions({ heading, items, allHref, allLabel, headingId = "property-related" }: {
  heading: string; items: Listing[]; allHref?: string; allLabel?: string; headingId?: string;
}) {
  if (items.length === 0) return null;
  return <section className="property-full-section property-related" aria-labelledby={headingId}>
    <h2 id={headingId}>{heading}</h2>
    <ul>{items.map(item => {
      const image = primaryImage(item);
      return <li key={item.id}><Link href={`/inmueble/${item.slug}`}>
        <span className={`property-related-photo${image ? "" : " empty"}`}>{image ? <img src={sizedImageUrl(image.url, 320)} alt="" width={96} height={72} loading="lazy" decoding="async" /> : <span aria-hidden="true">{propertyIcon(item.type)}</span>}</span>
        <span className="property-related-text"><b>{formatPrice(item.price, item.currency)}</b><span>{item.title}</span><small>{compactLocation(item)}</small></span>
      </Link></li>;
    })}</ul>
    {allHref && allLabel && <Link className="property-related-all" href={allHref}>{allLabel} ›</Link>}
  </section>;
}
