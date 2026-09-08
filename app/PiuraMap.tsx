"use client";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
const piura: [number, number] = [-5.1945, -80.6328];
const markerIcon = L.divIcon({ className: "piura-marker", html: "<span>USD 98k</span>", iconSize: [86, 34], iconAnchor: [43, 17] });
function LocateButton() { const map = useMap(); return <button className="map-locate" type="button" onClick={() => map.locate({ setView: true, maxZoom: 15 })} aria-label="Centrar mapa en mi ubicación">⌖</button>; }
export default function PiuraMap() { return <div className="leaflet-map" aria-label="Mapa interactivo de propiedades en Piura"><MapContainer center={piura} zoom={13} scrollWheelZoom className="leaflet-map-canvas"><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Marker position={piura} icon={markerIcon}><Popup><strong>Terreno urbano estratégico</strong><br />Piura · 640 m²<br /><b>USD 98,000</b></Popup></Marker><LocateButton /></MapContainer></div>; }
