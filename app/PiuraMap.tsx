'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { formatPrice, propertyIcon, MappableListing as Property } from "./lib/inventory";
type Props = { properties?: Property[]; onSelect?: (property: Property) => void; resetViewKey?: number; layoutKey?: string; center?: [number, number] };
const piura: [number, number] = [-5.1945, -80.6328];

function iconFor(property: Property) {
  const icon = propertyIcon(property.type);
  return L.divIcon({ className: "piura-marker-host", html: `<div class="piura-marker"><span class="marker-icon" aria-hidden="true">${icon}</span><span>${formatPrice(property.price, property.currency)}</span></div>`, iconSize: [1, 1], iconAnchor: [0, 1] });
}
function LocateButton() {
  const map = useMap();
  return <button className="map-locate" type="button" onClick={() => map.locate({ setView: true, maxZoom: 15 })} aria-label="Centrar mapa en mi ubicación">⌖</button>;
}
function LayerToggle({ satellite, onChange }: { satellite: boolean; onChange: (value: boolean) => void }) {
  return <div className="map-layer-toggle" role="group" aria-label="Vista del mapa"><button type="button" aria-pressed={!satellite} onClick={() => onChange(false)}>Mapa</button><button type="button" aria-pressed={satellite} onClick={() => onChange(true)}>Satélite</button></div>;
}
function ResizeMap({ layoutKey }: { layoutKey?: string }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer?.();
    if (!container) return;
    let frame = requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    const resize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => map.invalidateSize({ pan: false })); };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(container);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener("resize", resize); };
  }, [map, layoutKey]);
  return null;
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

export default function PiuraMap({ properties = [], onSelect, resetViewKey, layoutKey, center = piura }: Props) {
  const [satellite, setSatellite] = useState(false);
  const shown = properties;
  return <div className="leaflet-map" aria-label="Mapa interactivo de propiedades en Perú">
    <MapContainer center={center} zoom={13} scrollWheelZoom className="leaflet-map-canvas">
      <TileLayer attribution={satellite ? '&copy; Esri' : '&copy; OpenStreetMap contributors'} url={satellite ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} />
      {shown.map((property) => <Marker key={property.id} position={property.coords} icon={iconFor(property)} eventHandlers={{ click: () => onSelect?.(property) }}><Popup><strong>{property.title}</strong><br />{property.operation} · {property.type} · {formatPrice(property.price, property.currency)}</Popup></Marker>)}
      <LocateButton />
      <ResetViewOnClose resetViewKey={resetViewKey} />
      <ResizeMap layoutKey={layoutKey} />
    </MapContainer>
    <div className="map-badge">Mapa · {shown.length} propiedades con ubicación</div>
    <LayerToggle satellite={satellite} onChange={setSatellite} />
  </div>;
}


