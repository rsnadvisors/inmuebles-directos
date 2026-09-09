'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Property = { id: string | number; title: string; operation: string; type?: string; price: number; coords: [number, number] };
type Props = { properties?: Property[]; onSelect?: (property: Property) => void; resetViewKey?: number };
const piura: [number, number] = [-5.1945, -80.6328];

function iconFor(property: Property) {
  const icon = property.type === "Casas" ? "⌂" : property.type === "Departamentos" ? "▥" : "⌖";
  return L.divIcon({ className: "piura-marker-host", html: `<div class="piura-marker"><span class="marker-icon" aria-hidden="true">${icon}</span><span>USD ${property.price.toLocaleString("en-US")}</span></div>`, iconSize: [1, 1], iconAnchor: [0, 1] });
}
function LocateButton() {
  const map = useMap();
  return <button className="map-locate" type="button" onClick={() => map.locate({ setView: true, maxZoom: 15 })} aria-label="Centrar mapa en mi ubicación">⌖</button>;
}
function LayerToggle({ satellite, onToggle }: { satellite: boolean; onToggle: () => void }) {
  return <button className="map-layer-toggle" type="button" onClick={onToggle} aria-pressed={satellite} aria-label={satellite ? "Cambiar a mapa" : "Cambiar a satélite"}><span className={`layer-thumb ${satellite ? "layer-thumb-map" : "layer-thumb-satellite"}`} aria-hidden="true" /><strong>{satellite ? "Mapa" : "Satélite"}</strong></button>;
}
function ResetViewOnClose({ resetViewKey = 0 }: { resetViewKey?: number }) {
  const map = useMap();
  const initial = useRef(resetViewKey);
  useEffect(() => {
    if (resetViewKey === initial.current) return;
    map.closePopup();
    map.setView(piura, 13, { animate: true });
    initial.current = resetViewKey;
  }, [map, resetViewKey]);
  return null;
}

export default function PiuraMap({ properties = [], onSelect, resetViewKey }: Props) {
  const [satellite, setSatellite] = useState(false);
  const shown = properties;
  return <div className="leaflet-map" aria-label="Mapa interactivo de propiedades en Piura">
    <MapContainer center={piura} zoom={13} scrollWheelZoom className="leaflet-map-canvas">
      <TileLayer attribution={satellite ? '&copy; Esri' : '&copy; OpenStreetMap contributors'} url={satellite ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} />
      {shown.map((property) => <Marker key={property.id} position={property.coords} icon={iconFor(property)} eventHandlers={{ click: () => onSelect?.(property) }}><Popup><strong>{property.title}</strong><br />{property.operation} · USD {property.price.toLocaleString("en-US")}</Popup></Marker>)}
      <LocateButton />
      <ResetViewOnClose resetViewKey={resetViewKey} />
    </MapContainer>
    <div className="map-badge">Mapa de Piura · {shown.length} propiedades</div>
    <LayerToggle satellite={satellite} onToggle={() => setSatellite((value) => !value)} />
  </div>;
}


