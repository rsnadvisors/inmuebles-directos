"use client";

import { useState } from "react";
import type { ListingImage } from "../../lib/inventory";
import { imageSrcSet, sizedImageUrl } from "../../lib/property-image-source";

/** `context` describe el inmueble («Casa en venta en Los Ejidos, Piura») para el texto alternativo cuando el anunciante no puso uno. */
export default function PropertyGallery({ images, title, context }: { images: ListingImage[]; title: string; context?: string }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) {
    return <div className="property-full-empty-media" role="img" aria-label={`Sin fotografías de ${title}`}><span aria-hidden="true">⌂</span><strong>Sin fotografías disponibles</strong></div>;
  }

  const index = Math.min(active, images.length - 1);
  const selected = images[index];
  const describe = (position: number) => `${title}${context ? ` – ${context}` : ""}${images.length > 1 ? `, foto ${position + 1} de ${images.length}` : ""}`;
  const alt = selected.altText || describe(index);
  const multiple = images.length > 1;
  return <section className="property-full-gallery" aria-label={`Galería de ${title}`}>
    <div className="property-full-main-image">
      <img src={sizedImageUrl(selected.url, 1200)} srcSet={imageSrcSet(selected.url)} sizes="(max-width: 800px) 100vw, 680px" alt={alt} width={1200} height={900} decoding="async" fetchPriority={index === 0 ? "high" : "auto"} />
      {multiple && <span>{index + 1} / {images.length}</span>}
      {multiple && <button className="property-full-prev" type="button" aria-label="Imagen anterior" onClick={() => setActive((index - 1 + images.length) % images.length)}>‹</button>}
      {multiple && <button className="property-full-next" type="button" aria-label="Imagen siguiente" onClick={() => setActive((index + 1) % images.length)}>›</button>}
    </div>
    {multiple && <div className="property-full-thumbnails">{images.map((image, thumbnailIndex) => <button key={`${image.url}-${thumbnailIndex}`} type="button" className={thumbnailIndex === index ? "active" : ""} aria-label={`Ver imagen ${thumbnailIndex + 1}`} onClick={() => setActive(thumbnailIndex)}><img src={sizedImageUrl(image.url, 320)} alt="" width={78} height={62} loading="lazy" decoding="async" /></button>)}</div>}
  </section>;
}
