"use client";

import { useState } from "react";
import type { ListingImage } from "../../lib/inventory";

export default function PropertyGallery({ images, title }: { images: ListingImage[]; title: string }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) {
    return <div className="property-full-empty-media" role="img" aria-label={`Sin fotografías de ${title}`}><span aria-hidden="true">⌂</span><strong>Sin fotografías disponibles</strong></div>;
  }

  const selected = images[active];
  const alt = selected.altText || title;
  const multiple = images.length > 1;
  return <section className="property-full-gallery" aria-label={`Galería de ${title}`}>
    <div className="property-full-main-image">
      <img src={selected.url} alt={alt} />
      {multiple && <span>{active + 1} / {images.length}</span>}
      {multiple && <button className="property-full-prev" type="button" aria-label="Imagen anterior" onClick={() => setActive((active - 1 + images.length) % images.length)}>‹</button>}
      {multiple && <button className="property-full-next" type="button" aria-label="Imagen siguiente" onClick={() => setActive((active + 1) % images.length)}>›</button>}
    </div>
    {multiple && <div className="property-full-thumbnails">{images.map((image, index) => <button key={`${image.url}-${index}`} type="button" className={index === active ? "active" : ""} aria-label={`Ver imagen ${index + 1}`} onClick={() => setActive(index)}><img src={image.url} alt="" /></button>)}</div>}
  </section>;
}
