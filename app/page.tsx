'use client';

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

const PiuraMap = dynamic(() => import("./PiuraMap"), { ssr: false });

type Listing = {
  id: number;
  title: string;
  operation: "Comprar" | "Alquilar";
  type: "Casas" | "Terrenos" | "Departamentos";
  price: number;
  area: number;
  zone: string;
  description: string;
  coords: [number, number];
};

const listings: Listing[] = [
  { id: 1, title: "Terreno urbano estratégico", operation: "Comprar", type: "Terrenos", price: 98000, area: 640, zone: "Piura, Piura", description: "Lote urbano con acceso a vías principales y servicios cercanos.", coords: [-5.1945, -80.6328] },
  { id: 2, title: "Casa familiar en Los Tallanes", operation: "Comprar", type: "Casas", price: 185000, area: 180, zone: "Los Tallanes, Piura", description: "Casa de dos niveles, tres dormitorios y patio interior.", coords: [-5.176, -80.645] },
  { id: 3, title: "Departamento amoblado céntrico", operation: "Alquilar", type: "Departamentos", price: 1800, area: 82, zone: "Centro de Piura", description: "Departamento luminoso cerca de comercios, bancos y restaurantes.", coords: [-5.195, -80.626] },
  { id: 4, title: "Terreno residencial en Castilla", operation: "Comprar", type: "Terrenos", price: 72000, area: 420, zone: "Castilla, Piura", description: "Terreno plano ideal para vivienda o inversión.", coords: [-5.205, -80.615] },
];

const money = (value: number) => value >= 10000
  ? `USD ${value.toLocaleString("en-US")}`
  : `USD ${value.toLocaleString("en-US")}/mes`;

export default function Home() {
  const [query, setQuery] = useState("");
  const [operation, setOperation] = useState("Todo");
  const [type, setType] = useState("Todo");
  const [sort, setSort] = useState("recommended");
  const [selected, setSelected] = useState<Listing | null>(null);
  const [mobileList, setMobileList] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const result = listings.filter((item) => {
      const matchesText = !term || `${item.title} ${item.zone} ${item.type}`.toLowerCase().includes(term);
      const matchesOperation = operation === "Todo" || item.operation === operation;
      const matchesType = type === "Todo" || item.type === type;
      return matchesText && matchesOperation && matchesType;
    });
    return [...result].sort((a, b) => sort === "priceAsc" ? a.price - b.price : sort === "priceDesc" ? b.price - a.price : a.id - b.id);
  }, [query, operation, type, sort]);

  return (
    <main className="geo-app">
      <header className="geo-header">
        <Link className="geo-logo" href="/">Geo<span>Propiedades</span><small>Piura</small></Link>
        <div className="header-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar propiedad, ciudad o provincia" aria-label="Buscar propiedad, ciudad o provincia" /></div>
        <nav className="geo-nav"><Link href="/publicar">Publicar gratis</Link><a href="#explorar">Explorar mapa</a><Link href="/login">Iniciar sesión</Link></nav>
      </header>

      <div className="quick-filters" aria-label="Filtros rápidos">
        {["Todo", "Comprar", "Alquilar", "Casas", "Terrenos", "Departamentos"].map((filter) => (
          <button key={filter} className={(operation === filter || type === filter || (filter === "Todo" && operation === "Todo" && type === "Todo")) ? "active" : ""} onClick={() => {
            if (filter === "Todo") { setOperation("Todo"); setType("Todo"); }
            else if (filter === "Comprar" || filter === "Alquilar") { setOperation(filter); setType("Todo"); }
            else { setType(filter); setOperation("Todo"); }
          }}>{filter}</button>
        ))}
      </div>

      <section id="explorar" className="explorer">
        <aside className={`results-panel ${mobileList ? "mobile-open" : ""}`}>
          <div className="results-head"><div><strong>{filtered.length} propiedades encontradas</strong><span>Total en Piura: {listings.length}</span></div><button className="close-mobile" onClick={() => setMobileList(false)} aria-label="Cerrar listado">×</button></div>
          <div className="results-tools"><select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar propiedades"><option value="recommended">Recomendadas</option><option value="priceAsc">Menor precio</option><option value="priceDesc">Mayor precio</option></select><button className="advanced" onClick={() => { setOperation("Todo"); setType("Todo"); setQuery(""); }}>Limpiar filtros</button></div>
          <div className="listing-list">
            {filtered.length === 0 ? <div className="empty-state">No encontramos propiedades con esos filtros.</div> : filtered.map((item) => (
              <article className={`listing-card ${selected?.id === item.id ? "selected" : ""}`} key={item.id} onClick={() => setSelected(item)}>
                <div className="listing-photo"><span>{item.type === "Terrenos" ? "▧" : "⌂"}</span><b>{item.operation}</b></div>
                <div className="listing-content"><div className="listing-price">{money(item.price)}</div><h2>{item.title}</h2><p>{item.zone}</p><div className="listing-meta">{item.type} · {item.area} m²</div><button className="detail-link" onClick={(e) => { e.stopPropagation(); setSelected(item); }}>Ver ficha y contacto →</button></div>
              </article>
            ))}
          </div>
        </aside>
        <section className="map-panel"><PiuraMap properties={filtered} onSelect={(item: Listing) => setSelected(item)} /><button className="mobile-list-toggle" onClick={() => setMobileList(true)}>☷ {filtered.length} propiedades</button></section>
      </section>

      {selected && <div className="property-drawer" role="dialog" aria-modal="true" aria-label={`Ficha de ${selected.title}`}><button className="drawer-close" onClick={() => setSelected(null)} aria-label="Cerrar ficha">×</button><div className="drawer-kicker">{selected.operation} · {selected.type}</div><h2>{selected.title}</h2><div className="drawer-price">{money(selected.price)}</div><p>{selected.description}</p><div className="drawer-details"><span>⌖ {selected.zone}</span><span>▧ {selected.area} m²</span></div><div className="drawer-actions"><Link className="contact-btn" href="/contacto">Contactar anunciante</Link><button className="save-btn" onClick={() => alert("Propiedad guardada en favoritos")}>♡ Guardar</button></div></div>}
    </main>
  );
}

