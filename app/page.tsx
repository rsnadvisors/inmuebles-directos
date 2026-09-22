'use client';


import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supabase } from "./lib/supabase";
import { Listing, comparePrice, formatPrice, isMappable, normalizeInventory, propertyIcon, propertyTypes } from "./lib/inventory";

const PiuraMap = dynamic(() => import("./PiuraMap"), { ssr: false });

export default function Home() {
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [inventoryState, setInventoryState] = useState<"loading" | "success" | "error">("loading");
  const [query, setQuery] = useState("");
  const [operation, setOperation] = useState("Todo");
  const [type, setType] = useState("Todo");
  const [sort, setSort] = useState("recommended");
  const [selected, setSelected] = useState<Listing | null>(null);
  const [mobileList, setMobileList] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [mapResetKey, setMapResetKey] = useState(0);

  useEffect(() => {
    if (!supabase) { setInventoryState("error"); return; }
    let active = true;
    let requestSequence = 0;
    const load = async () => {
      const request = ++requestSequence;
      setInventoryState("loading");
      setAllListings([]);
      setSelected(null);
      try {
        const { data, error } = await supabase.from("properties").select("id,title,slug,status,listing_type,property_type,price,currency,area_total_m2,address,district,city,description,bedrooms,bathrooms,parking_spaces,lat,lng,property_images(id,public_url,alt_text,sort_order,is_cover)").eq("status", "published");
        if (!active || request !== requestSequence) return;
        if (error) throw error;
        setAllListings(normalizeInventory(data));
        setInventoryState("success");
      } catch {
        if (!active || request !== requestSequence) return;
        setAllListings([]);
        setInventoryState("error");
      }
    };
    load();
    const channel = supabase.channel("properties-map").on("postgres_changes", { event: "*", schema: "public", table: "properties" }, load).subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, []);

  useEffect(() => { setGalleryIndex(0); setGalleryOpen(false); }, [selected?.id]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const result = allListings.filter((item) => {
      const matchesText = !term || `${item.title} ${item.zone} ${item.type}`.toLowerCase().includes(term);
      const matchesOperation = operation === "Todo" || item.operation === operation;
      const matchesType = type === "Todo" || item.type === type;
      return matchesText && matchesOperation && matchesType;
    });
    return [...result].sort((a, b) => sort === "priceAsc" ? comparePrice(a, b) : sort === "priceDesc" ? comparePrice(a, b, true) : String(a.id).localeCompare(String(b.id)));
  }, [allListings, query, operation, type, sort]);

  return (
    <main className="geo-app">
      <header className="geo-header">
        <Link className="geo-logo" href="/">Geo<span>Propiedades</span><small>Piura</small></Link>
        <div className="header-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar propiedad, ciudad o provincia" aria-label="Buscar propiedad, ciudad o provincia" /></div>
        <button className="mobile-filter-toggle" type="button" aria-label="Abrir filtros" aria-expanded={mobileFilters} onClick={() => setMobileFilters((open) => !open)}>☷</button>
        <nav className="geo-nav"><Link href="/publicar">Publicar gratis</Link><a href="#explorar">Explorar mapa</a><Link href="/login">Iniciar sesión</Link><button className="mobile-menu" type="button" aria-label="Abrir menú">☰</button></nav>
      </header>

      <div className="quick-filters" aria-label="Filtros rápidos">
        {["Todo", "Comprar", "Alquilar", ...propertyTypes].map((filter) => (
          <button key={filter} className={(operation === filter || type === filter || (filter === "Todo" && operation === "Todo" && type === "Todo")) ? "active" : ""} onClick={() => {
            if (filter === "Todo") { setOperation("Todo"); setType("Todo"); }
            else if (filter === "Comprar" || filter === "Alquilar") { setOperation(filter); setType("Todo"); }
            else { setType(filter); setOperation("Todo"); }
          }}>{filter}</button>
        ))}
      </div>

      {mobileFilters && <section className="mobile-filter-sheet" aria-label="Filtros de propiedades"><div className="mobile-filter-head"><strong>Filtrar propiedades</strong><button type="button" onClick={() => setMobileFilters(false)} aria-label="Cerrar filtros">×</button></div><div className="mobile-filter-options"><strong>Operación</strong>{["Todo", "Comprar", "Alquilar"].map((value) => <button key={value} type="button" className={operation === value ? "active" : ""} onClick={() => { setOperation(value); setType("Todo"); }}>{value}</button>)}<strong>Tipo</strong>{["Todo", ...propertyTypes].map((value) => <button key={value} type="button" className={type === value ? "active" : ""} onClick={() => { setType(value); setOperation("Todo"); }}>{value}</button>)}</div></section>}

      <section id="explorar" className="explorer">
        <aside className={`results-panel ${mobileList ? "mobile-open" : ""}`}>
          <div className="results-head"><div><strong>{filtered.length} propiedades encontradas</strong><span>Total de propiedades: {allListings.length}</span></div><button className="close-mobile" onClick={() => setMobileList(false)} aria-label="Cerrar listado">×</button></div>
          <div className="results-tools"><select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar propiedades"><option value="recommended">Orden predeterminado</option><option value="priceAsc">Menor precio</option><option value="priceDesc">Mayor precio</option></select><button className="advanced" onClick={() => { setOperation("Todo"); setType("Todo"); setQuery(""); }}>Limpiar filtros</button></div>
          <div className="listing-list">
            {inventoryState !== "success" ? <div className="empty-state" role={inventoryState === "error" ? "alert" : "status"}>{inventoryState === "loading" ? "Cargando propiedades…" : "No pudimos cargar las propiedades en este momento."}</div> : allListings.length === 0 ? <div className="empty-state">No hay propiedades disponibles en este momento.</div> : filtered.length === 0 ? <div className="empty-state">No encontramos propiedades con esos filtros.</div> : filtered.map((item) => (
              <article className={`listing-card ${selected?.id === item.id ? "selected" : ""}`} key={item.id} onClick={() => setSelected(item)}>
                <div className="listing-photo">{item.images[0] ? <img src={item.images[0]} alt="" loading="lazy" /> : <span>{propertyIcon(item.type)}</span>}<b>{item.operation}</b></div>
                <div className="listing-content"><div className="listing-price">{formatPrice(item.price, item.currency)}</div><h2>{item.title}</h2><p>{item.zone}</p><div className="listing-meta">{item.type}{item.area > 0 ? ` · ${item.area} m²` : ""}</div><button className="detail-link" onClick={(e) => { e.stopPropagation(); setSelected(item); }}>Ver ficha y contacto →</button></div>
              </article>
            ))}
          </div>
        </aside>
        <section className="map-panel"><PiuraMap properties={filtered.filter(isMappable)} resetViewKey={mapResetKey} onSelect={(item) => setSelected(item)} />{!selected && <button className="mobile-list-toggle" aria-label={`Mostrar lista de ${filtered.length} propiedades`} onClick={() => setMobileList(true)}><span aria-hidden="true">☷</span> {filtered.length} propiedades</button>}</section>
      </section>

      {selected && <div className="property-drawer" role="dialog" aria-modal="true" aria-label={`Ficha de ${selected.title}`}><button className="drawer-close" onClick={() => { setSelected(null); setMobileList(false); setMapResetKey((key) => key + 1); }} aria-label="Cerrar detalle de propiedad">×</button>{selected.images.length > 0 && <div className="drawer-gallery"><button className="drawer-main-image" type="button" onClick={() => setGalleryOpen(true)} aria-label="Ampliar galería"><img src={selected.images[galleryIndex]} alt={selected.title} /><span>{galleryIndex + 1} / {selected.images.length}</span></button><div>{selected.images.slice(0, 5).map((image, index) => <button key={image} type="button" aria-label={`Ver imagen ${index + 1}`} className={galleryIndex === index ? "active" : ""} onClick={() => setGalleryIndex(index)}><img src={image} alt="" /></button>)}</div></div>}<div className="drawer-kicker">{selected.operation} · {selected.type}{selected.status ? ` · ${selected.status === "published" ? "Publicado" : selected.status}` : ""}</div><h2>{selected.title}</h2><div className="drawer-price">{formatPrice(selected.price, selected.currency)}</div><p>{selected.description}</p><div className="drawer-details"><span>⌖ {selected.zone}</span>{selected.area > 0 && <span>▧ {selected.area} m²</span>}{selected.bedrooms != null && <span>⌂ {selected.bedrooms} hab.</span>}{selected.bathrooms != null && <span>♧ {selected.bathrooms} baños</span>}{selected.parkingSpaces != null && <span>▣ {selected.parkingSpaces} estacionamientos</span>}</div><div className="drawer-actions"><button className="contact-btn" type="button" onClick={() => { setSelected(null); setMobileList(false); setMapResetKey((key) => key + 1); }}>Ver mapa</button>{selected.slug && <Link className="save-btn" href={`/inmueble/${selected.slug}`}>Ficha completa</Link>}<button className="save-btn" onClick={() => alert("Propiedad guardada en favoritos")}>♡ Guardar</button></div></div>}
      {selected && galleryOpen && <div className="gallery-modal" role="dialog" aria-modal="true" aria-label={`Galería de ${selected.title}`}><button type="button" className="gallery-modal-close" onClick={() => setGalleryOpen(false)} aria-label="Cerrar galería">×</button><button type="button" className="gallery-prev" onClick={() => setGalleryIndex((galleryIndex - 1 + selected.images.length) % selected.images.length)} aria-label="Imagen anterior">‹</button><img src={selected.images[galleryIndex]} alt={selected.title} /><button type="button" className="gallery-next" onClick={() => setGalleryIndex((galleryIndex + 1) % selected.images.length)} aria-label="Imagen siguiente">›</button><span>{galleryIndex + 1} / {selected.images.length}</span></div>}
    </main>
  );
}


