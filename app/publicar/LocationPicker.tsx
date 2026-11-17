'use client';

import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type PickedPoint = { lat: number; lng: number };
type Props = { value: PickedPoint | null; onPick: (lat: number, lng: number) => void; onLocate?: () => void; disabled?: boolean };

const PIURA: [number, number] = [-5.1945, -80.6328];
const SATELLITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STREETS = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

// Pin dibujado en SVG (sin imágenes de Leaflet, que no se empaquetan bien); la punta queda en el punto exacto.
const pinIcon = (placed: boolean) => L.divIcon({
  className: "location-pin-host",
  html: `<svg class="location-pin${placed ? "" : " pending"}" width="36" height="46" viewBox="0 0 36 46" aria-hidden="true"><path d="M18 1C8.6 1 1 8.4 1 17.6 1 30 18 45 18 45s17-15 17-27.4C35 8.4 27.4 1 18 1Z" fill="#087f70" stroke="#fff" stroke-width="2"/><circle cx="18" cy="17" r="6.5" fill="#fff"/></svg>`,
  iconSize: [36, 46], iconAnchor: [18, 45],
});

/** Clic o toque en el mapa = mover el pin ahí. */
function ClickToPlace({ onPick, disabled }: { onPick: Props["onPick"]; disabled?: boolean }) {
  useMapEvents({ click: event => { if (!disabled) onPick(event.latlng.lat, event.latlng.lng); } });
  return null;
}

/** Si el punto cambia desde fuera (mi ubicación, coordenadas escritas) y no se ve, lleva el mapa hasta él. */
function FollowValue({ value }: { value: PickedPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (!value) return;
    const point = L.latLng(value.lat, value.lng);
    if (!map.getBounds().pad(-0.15).contains(point)) map.setView(point, Math.max(map.getZoom(), 16), { animate: true });
  }, [map, value]);
  return null;
}

export default function LocationPicker({ value, onPick, onLocate, disabled }: Props) {
  const [satellite, setSatellite] = useState(false);
  // Antes de que el anunciante elija, el pin espera en el centro del mapa (semitransparente) para invitar a moverlo.
  const [idle, setIdle] = useState<PickedPoint>({ lat: PIURA[0], lng: PIURA[1] });
  const position = value ?? idle;
  const icon = useMemo(() => pinIcon(value !== null), [value]);

  return <div className="location-picker" aria-label="Mapa para fijar la ubicación del inmueble">
    <MapContainer center={value ? [value.lat, value.lng] : PIURA} zoom={value ? 16 : 13} scrollWheelZoom={false} className="location-picker-canvas">
      <TileLayer attribution={satellite ? "&copy; Esri" : "&copy; OpenStreetMap contributors"} url={satellite ? SATELLITE : STREETS} maxZoom={19} />
      <Marker position={[position.lat, position.lng]} icon={icon} draggable={!disabled} keyboard={false}
        eventHandlers={{ dragend: event => { const p = (event.target as L.Marker).getLatLng(); setIdle({ lat: p.lat, lng: p.lng }); onPick(p.lat, p.lng); } }} />
      <ClickToPlace onPick={onPick} disabled={disabled} />
      <FollowValue value={value} />
    </MapContainer>
    <div className="location-picker-layers" role="group" aria-label="Vista del mapa">
      <button type="button" aria-pressed={!satellite} onClick={() => setSatellite(false)}>Mapa</button>
      <button type="button" aria-pressed={satellite} onClick={() => setSatellite(true)}>Satélite</button>
    </div>
    {onLocate && <button type="button" className="location-picker-locate" disabled={disabled} onClick={onLocate}
      aria-label="Ir a mi ubicación" title="Ir a mi ubicación">⌖<span>Mi ubicación</span></button>}
  </div>;
}
