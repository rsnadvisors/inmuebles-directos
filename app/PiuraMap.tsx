'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Property = { id: number; title: string; operation: string; price: number; coords: [number, number] };
type Props = { properties?: Property[]; onSelect?: (property: Property) => void };
const piura: [number, number] = [-5.1945, -80.6328];
function iconFor(price: number) { return L.divIcon({ className: "piura-marker", html: `<span>USD ${price.toLocaleString("en-US")}</span>`, iconSize: [104, 34], iconAnchor: [52, 17] }); }
function LocateButton() { const map = useMap(); return <button className="map-locate" type="button" onClick={() => map.locate({ setView: true, maxZoom: 15 })} aria-label="Centrar mapa en mi ubicación">⌖</button>; }
function LayerToggle({ satellite, onToggle }: { satellite: boolean; onToggle: () => void }) { return <button className="map-layer-toggle" type="button" onClick={onToggle} aria-pressed={satellite} aria-label={satellite ? "Cambiar a mapa" : "Cambiar a satélite"}><span className="layer-thumb" aria-hidden="true" /><strong>{satellite ? "Mapa" : "Satélite"}</strong></button>; }
export default function PiuraMap({ properties = [], onSelect }: Props) {
  const [satellite, setSatellite] = useState(false);
  const shown = properties.length ? properties : [{ id: 1, title: "Terreno urbano estratégico", operation: "Comprar", price: 98000, coords: piura }];
  return <div className="leaflet-map" aria-label="Mapa interactivo de propiedades en Piura"><MapContainer center={piura} zoom={13} scrollWheelZoom className="leaflet-map-canvas"><TileLayer attribution={satellite ? '&copy; Esri' : '&copy; OpenStreetMap contributors'} url={satellite ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} />{shown.map((property) => <Marker key={property.id} position={property.coords} icon={iconFor(property.price)} eventHandlers={{ click: () => onSelect?.(property) }}><Popup><strong>{property.title}</strong><br />{property.operation} · USD {property.price.toLocaleString("en-US")}</Popup></Marker>)}<LocateButton /></MapContainer><div className="map-badge">Mapa de Piura · {shown.length} propiedades</div><LayerToggle satellite={satellite} onToggle={() => setSatellite((value) => !value)} /></div>;
}
