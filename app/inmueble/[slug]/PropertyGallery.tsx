"use client";

import { useState } from "react";
import type { ListingImage } from "../../lib/inventory";

export default function PropertyGallery({ images, title }: { images: ListingImage[]; title: string }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) {
    return <div className="property-full-empty-media" role="img" aria-label={`Sin fotografías de ${title}`}><span aria-hidden="true">⌂</span><strong>Sin fotografías disponibles</strong></div>;
  }

  const index = Math.min(active, images.length - 1);
  const selected = images[index];
  const alt = selected.altText || title;
  const multiple = images.length > 1;
  return <section className="property-full-gallery" aria-label={`Galería de ${title}`}>
    <div className="property-full-main-image">
      <img src={selected.url} alt={alt} />
      {multiple && <span>{index + 1} / {images.length}</span>}
      {multiple && <button className="property-full-prev" type="button" aria-label="Imagen anterior" onClick={() => setActive((index - 1 + images.length) % images.length)}>‹</button>}
      {multiple && <button className="property-full-next" type="button" aria-label="Imagen siguiente" onClick={() => setActive((index + 1) % images.length)}>›</button>}
    </div>
    {multiple && <div className="property-full-thumbnails">{images.map((image, thumbnailIndex) => <button key={`${image.url}-${thumbnailIndex}`} type="button" className={thumbnailIndex === index ? "active" : ""} aria-label={`Ver imagen ${thumbnailIndex + 1}`} onClick={() => setActive(thumbnailIndex)}><img src={image.url} alt="" /></button>)}</div>}
  </section>;
}
