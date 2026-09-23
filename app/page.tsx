'use client';


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { getBrowserClient } from "./lib/auth-client";
import { Listing, compactLocation, comparisonAttributes, filterAndSortListings, formatPrice, isMappable, normalizeInventory, previewLocation, primaryImage, propertyIcon, propertyTypes } from "./lib/inventory";
import SiteHeader from "./components/SiteHeader";

const PiuraMap = dynamic(() => import("./PiuraMap"), { ssr: false });

function ListingAttributes({ listing, context }: { listing: Listing; context: "card" | "drawer" }) {
  const attributes = comparisonAttributes(listing);
  if (attributes.length === 0) return null;
  return <div className={`${context}-attributes`} aria-label="Características de la propiedad">{attributes.map(attribute => (
    <span key={attribute.key} className={`property-attribute property-attribute-${attribute.key}`} aria-label={attribute.label}>
      <span aria-hidden="true">{attribute.icon}</span><span aria-hidden="true">{attribute.shortLabel}</span>
    </span>
  ))}</div>;
}

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
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);

  const openDrawer = useCallback((listing: Listing, trigger: HTMLButtonElement | null = null) => {
    drawerTriggerRef.current = trigger;
    setSelected(listing);
  }, []);

  const closeDrawer = useCallback((returnToMap = false) => {
    const trigger = drawerTriggerRef.current;
    setSelected(null);
    if (returnToMap) {
      setMobileList(false);
      setMapResetKey((key) => key + 1);
    }
    window.setTimeout(() => {
      if (trigger?.isConnected) trigger.focus();
      drawerTriggerRef.current = null;
    }, 0);
  }, []);

  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase) { setInventoryState("error"); return; }
    let active = true;
    let requestSequence = 0;
    const load = async () => {
      const request = ++requestSequence;
      setInventoryState("loading");
      setAllListings([]);
      setSelected(null);
      try {
        const { data, error } = await supabase.from("properties").select("id,title,slug,status,listing_type,property_type,price,currency,area_total_m2,address,district,city,region,country,description,bedrooms,bathrooms,parking_spaces,lat,lng,published_at,property_images(id,public_url,alt_text,sort_order,is_cover)").eq("status", "published");
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

  useEffect(() => {
    if (!selected) return;
    drawerCloseRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (galleryOpen) setGalleryOpen(false);
      else closeDrawer();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selected, galleryOpen, closeDrawer]);

  const filtered = useMemo(() => filterAndSortListings(allListings, query, operation, type, sort), [allListings, query, operation, type, sort]);
  useEffect(() => {
    if (selected && !filtered.some(item => item.id === selected.id)) setSelected(null);
  }, [filtered, selected]);

  return (
    <main className="geo-app">
      <SiteHeader query={query} onQueryChange={setQuery} mobileFilters={mobileFilters} onMobileFiltersChange={setMobileFilters} />

      <div className="quick-filters" aria-label="Filtros rápidos">
        {["Todo", "Comprar", "Alquilar", ...propertyTypes].map((filter) => (
          <button key={filter} className={(filter === "Todo" ? operation === "Todo" && type === "Todo" : operation === filter || type === filter) ? "active" : ""} onClick={() => {
            if (filter === "Todo") { setOperation("Todo"); setType("Todo"); }
            else if (filter === "Comprar" || filter === "Alquilar") setOperation(filter);
            else setType(filter);
          }}>{filter}</button>
        ))}
      </div>

      {mobileFilters && <section className="mobile-filter-sheet" aria-label="Filtros de propiedades"><div className="mobile-filter-head"><strong>Filtrar propiedades</strong><button type="button" onClick={() => setMobileFilters(false)} aria-label="Cerrar filtros">×</button></div><div className="mobile-filter-options"><strong>Operación</strong>{["Todo", "Comprar", "Alquilar"].map((value) => <button key={value} type="button" className={operation === value ? "active" : ""} onClick={() => setOperation(value)}>{value}</button>)}<strong>Tipo</strong>{["Todo", ...propertyTypes].map((value) => <button key={value} type="button" className={type === value ? "active" : ""} onClick={() => setType(value)}>{value}</button>)}<button type="button" onClick={() => { setQuery(""); setOperation("Todo"); setType("Todo"); }}>Limpiar filtros</button></div></section>}

      <section id="explorar" className="explorer">
        <aside className={`results-panel ${mobileList ? "mobile-open" : ""}`}>
          <div className="results-head"><div><strong>{filtered.length} propiedades encontradas</strong><span>Total de propiedades: {allListings.length}</span></div><button className="close-mobile" onClick={() => setMobileList(false)} aria-label="Cerrar listado">×</button></div>
          <div className="results-tools"><select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar propiedades"><option value="recommended">Orden predeterminado</option><option value="recent">Más recientes</option><option value="priceAsc">Menor precio por moneda</option><option value="priceDesc">Mayor precio por moneda</option></select><button className="advanced" onClick={() => { setOperation("Todo"); setType("Todo"); setQuery(""); setSort("recommended"); }}>Limpiar filtros</button></div>
          <div className="listing-list">
            {inventoryState !== "success" ? <div className="empty-state" role={inventoryState === "error" ? "alert" : "status"}>{inventoryState === "loading" ? "Cargando propiedades…" : "No pudimos cargar las propiedades en este momento."}</div> : allListings.length === 0 ? <div className="empty-state">No hay propiedades disponibles en este momento.</div> : filtered.length === 0 ? <div className="empty-state">No encontramos propiedades con esos filtros.</div> : filtered.map((item) => (
              <article className={`listing-card ${selected?.id === item.id ? "selected" : ""}`} key={item.id}>
                <div className={`listing-photo ${primaryImage(item) ? "" : "listing-photo-empty"}`}>{primaryImage(item) ? <img src={primaryImage(item)!.url} alt="" loading="lazy" /> : <><span aria-hidden="true">{propertyIcon(item.type)}</span><small>Sin fotografía</small></>}<b>{item.operation}</b></div>
                <div className="listing-content"><div className="listing-price">{formatPrice(item.price, item.currency)}</div><h2>{item.title}</h2><p>{compactLocation(item)}</p><div className="listing-type">{item.type}</div><ListingAttributes listing={item} context="card" /><button className="detail-link" type="button" onClick={(event) => openDrawer(item, event.currentTarget)}>Ver detalles</button></div>
              </article>
            ))}
          </div>
        </aside>
        <section className="map-panel"><PiuraMap properties={filtered.filter(isMappable)} resetViewKey={mapResetKey} layoutKey={`${mobileList}:${!!selected}`} onSelect={(item) => openDrawer(item)} />{!selected && <button className="mobile-list-toggle" aria-label={`Mostrar lista de ${filtered.length} propiedades`} onClick={() => setMobileList(true)}><span aria-hidden="true">☷</span> {filtered.length} propiedades</button>}</section>
      </section>

      {selected && <div className="property-drawer" role="dialog" aria-label={`Ficha de ${selected.title}`}>
        <button ref={drawerCloseRef} className="drawer-close" type="button" onClick={() => closeDrawer()} aria-label="Cerrar detalle de propiedad">×</button>
        {selected.images.length > 0 ? <div className="drawer-gallery"><button className="drawer-main-image" type="button" onClick={() => setGalleryOpen(true)} aria-label="Ampliar galería"><img src={selected.images[galleryIndex]} alt={selected.title} /><span>{galleryIndex + 1} / {selected.images.length}</span></button><div>{selected.images.slice(0, 5).map((image, index) => <button key={image} type="button" aria-label={`Ver imagen ${index + 1}`} className={galleryIndex === index ? "active" : ""} onClick={() => setGalleryIndex(index)}><img src={image} alt="" /></button>)}</div></div> : <div className="drawer-media-empty"><span aria-hidden="true">{propertyIcon(selected.type)}</span><strong>Sin fotografías disponibles</strong></div>}
        <div className="drawer-kicker">{selected.operation} · {selected.type}</div><h2>{selected.title}</h2><div className="drawer-price">{formatPrice(selected.price, selected.currency)}</div>
        {selected.description && <p className="drawer-description">{selected.description}</p>}
        <div className="drawer-location"><span aria-hidden="true">⌖</span> {previewLocation(selected)}</div><ListingAttributes listing={selected} context="drawer" />
        <div className="drawer-actions">{selected.slug && <Link className="drawer-primary-action" href={`/inmueble/${selected.slug}`}>Ficha completa</Link>}{selected.coords && <button className="drawer-secondary-action" type="button" onClick={() => closeDrawer(true)}>Ver mapa</button>}</div>
      </div>}
      {selected && galleryOpen && <div className="gallery-modal" role="dialog" aria-modal="true" aria-label={`Galería de ${selected.title}`}><button type="button" className="gallery-modal-close" onClick={() => setGalleryOpen(false)} aria-label="Cerrar galería">×</button><button type="button" className="gallery-prev" onClick={() => setGalleryIndex((galleryIndex - 1 + selected.images.length) % selected.images.length)} aria-label="Imagen anterior">‹</button><img src={selected.images[galleryIndex]} alt={selected.title} /><button type="button" className="gallery-next" onClick={() => setGalleryIndex((galleryIndex + 1) % selected.images.length)} aria-label="Imagen siguiente">›</button><span>{galleryIndex + 1} / {selected.images.length}</span></div>}
    </main>
  );
}


