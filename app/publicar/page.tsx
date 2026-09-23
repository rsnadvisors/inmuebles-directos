"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { MAX_PRICE, PARTIAL_MESSAGE, validatePhotos, validatePublication, validCoordinates } from "../lib/publication";
import SiteHeader from "../components/SiteHeader";

const initialCoordinates = { latitude: "", longitude: "" };
export default function PublishPage() {
  const [status, setStatus] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [coords, setCoords] = useState(initialCoordinates);
  const [coordinatesConfirmed, setCoordinatesConfirmed] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [propertyType, setPropertyType] = useState("Casas");
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const locationVersion = useRef(0);

  function editCoordinate(key: keyof typeof coords, value: string) {
    locationVersion.current++;
    setCoords(previous => ({ ...previous, [key]: value }));
    setCoordinatesConfirmed(false);
  }
  function confirmCoordinates() {
    locationVersion.current++;
    const valid = validCoordinates(coords.latitude, coords.longitude);
    setCoordinatesConfirmed(valid);
    setStatus(valid ? "Coordenadas confirmadas." : "Indica coordenadas válidas dentro del área de Perú.");
  }
  function useLocation() {
    const version = ++locationVersion.current;
    setCoordinatesConfirmed(false);
    if (!navigator.geolocation) return setStatus("Este navegador no admite geolocalización.");
    setStatus("Obteniendo ubicación…");
    navigator.geolocation.getCurrentPosition(({ coords: p }) => {
      if (version !== locationVersion.current) return;
      const next = { latitude: String(p.latitude), longitude: String(p.longitude) };
      setCoords(next);
      const valid = validCoordinates(next.latitude, next.longitude);
      setCoordinatesConfirmed(valid);
      setStatus(valid ? "Ubicación obtenida y confirmada." : "La ubicación obtenida está fuera del área de publicación permitida.");
    }, () => {
      if (version === locationVersion.current) setStatus("No se pudo obtener la ubicación. Puedes introducirla manualmente.");
    }, { enableHighAccuracy: true, timeout: 10000 });
  }
  function onFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    try { validatePhotos(selected); setFiles(selected); setStatus(""); }
    catch (error) {
      setFiles([]);
      event.target.value = "";
      setStatus((error as Error).message);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const payload = new FormData(form);
    payload.set("latitude", coords.latitude);
    payload.set("longitude", coords.longitude);
    payload.set("coordinatesConfirmed", String(coordinatesConfirmed));
    files.forEach(file => payload.append("images", file));
    try { validatePublication(payload); }
    catch (error) { setStatus((error as Error).message); return; }
    submitting.current = true;
    locationVersion.current++;
    setIsSubmitting(true);
    setUncertain(false);
    setPublishedSlug(null);
    setStatus("Publicando…");
    try {
      const response = await fetch("/api/publicar", { method: "POST", body: payload });
      const result = await response.json();
      if (response.status === 401) {
        window.location.assign("/login?returnTo=/publicar");
        setStatus("La sesión expiró. Inicia sesión para continuar.");
      } else if (response.ok && result.ok === true && result.status === "published") {
        form.reset();
        setFiles([]);
        setCoords(initialCoordinates);
        setCoordinatesConfirmed(false);
        setPropertyType("Casas");
        setPublishedSlug(typeof result.slug === "string" ? result.slug : null);
        setStatus("Propiedad publicada. Puedes verla en Mis propiedades.");
      } else if (result.ok === false && ["VALIDATION_ERROR", "INVALID_REQUEST", "INVALID_CONTENT_TYPE", "INVALID_ORIGIN", "REQUEST_TOO_LARGE", "PUBLICATION_FAILED", "UPLOAD_FAILED", "METADATA_FAILED", "FINALIZATION_FAILED"].includes(result.code)) {
        setStatus(typeof result.message === "string" ? result.message : "No se pudo completar la publicación.");
      } else {
        setUncertain(true);
        setStatus(PARTIAL_MESSAGE);
      }
    } catch {
      setUncertain(true);
      setStatus(PARTIAL_MESSAGE);
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }
  return <><SiteHeader /><main className="publish-page">
    <Link href="/" className="back-link">← Volver al mapa</Link>
    <p className="eyebrow">PUBLICA GRATIS · PERÚ</p><h1>Publica tu propiedad</h1>
    <p className="publish-intro">Completa los datos, indica la ubicación y añade fotos para mostrar tu inmueble en el mapa.</p>
    <form onSubmit={submit} className="publish-form" aria-busy={isSubmitting}>
      <label>Tipo de propiedad<select name="type" value={propertyType} onChange={event => setPropertyType(event.target.value)} required disabled={isSubmitting}><option value="Casas">Casa</option><option value="Departamentos">Departamento</option><option value="Terrenos">Terreno</option><option value="Oficinas">Oficina</option><option value="Locales comerciales">Local comercial</option></select></label>
      <label>Operación<select name="operation" required disabled={isSubmitting}><option value="Vender">Vender</option><option value="Alquilar">Alquilar</option></select></label>
      <label>Título del anuncio<input name="title" required maxLength={120} disabled={isSubmitting} placeholder="Ej. Terreno residencial en Castilla" /></label>
      <div className="publication-field-row"><label>Moneda<select name="currency" required disabled={isSubmitting}><option value="PEN">S/ · PEN</option><option value="USD">US$ · USD</option></select></label><label>Precio<input name="price" type="number" min="0" max={MAX_PRICE} step="any" required disabled={isSubmitting} placeholder="72000" /></label></div>
      <label>Descripción<textarea name="description" required maxLength={3000} disabled={isSubmitting} rows={4} placeholder="Describe las características principales…" /></label>
      <div className="publication-field-row"><label>Región<input name="region" required maxLength={120} disabled={isSubmitting} placeholder="Ej. Piura" /></label><label>Ciudad o provincia<input name="city" required maxLength={120} disabled={isSubmitting} placeholder="Ej. Piura" /></label></div>
      <div className="publication-field-row"><label>Distrito (opcional)<input name="district" maxLength={120} disabled={isSubmitting} placeholder="Ej. Castilla" /></label><label>Dirección o sector<input name="address" required maxLength={250} disabled={isSubmitting} placeholder="Referencia pública de ubicación" /></label></div>
      <fieldset disabled={isSubmitting}><legend>Características</legend><div className="publication-field-row"><label>Área total (m²)<input name="area_total_m2" type="number" min="0" step="any" /></label>{propertyType !== "Terrenos" && <label>Área construida (m²)<input name="area_built_m2" type="number" min="0" step="any" /></label>}</div>
        {propertyType !== "Terrenos" && <div className="publication-field-row">{propertyType !== "Oficinas" && propertyType !== "Locales comerciales" && <label>Habitaciones<input name="bedrooms" type="number" min="0" step="1" /></label>}<label>Baños<input name="bathrooms" type="number" min="0" step="1" /></label><label>Estacionamientos<input name="parking_spaces" type="number" min="0" step="1" /></label><label>Pisos<input name="floors" type="number" min="0" step="1" /></label><label>Mantenimiento<input name="maintenance_fee" type="number" min="0" step="any" /></label></div>}
      </fieldset>
      <fieldset disabled={isSubmitting}><legend>Ubicación de coordenadas</legend>
        <div className="coordinate-grid"><label>Latitud<input value={coords.latitude} onChange={e => editCoordinate("latitude", e.target.value)} inputMode="decimal" required /></label><label>Longitud<input value={coords.longitude} onChange={e => editCoordinate("longitude", e.target.value)} inputMode="decimal" required /></label></div>
        <button type="button" className="location-btn" onClick={useLocation}>Usar mi ubicación actual</button>
        <button type="button" className="location-btn" onClick={confirmCoordinates}>Confirmar coordenadas</button>
        <small>{coordinatesConfirmed ? "Coordenadas confirmadas." : "Coordenadas sin confirmar. Obtén tu ubicación o confirma manualmente la ubicación en Perú."}</small>
      </fieldset>
      <label>Fotos de la propiedad<input type="file" accept="image/jpeg,image/png,image/webp" multiple required disabled={isSubmitting} onChange={onFiles} /><small>Obligatorio: 1 a 5 fotos · JPG, PNG o WebP · máximo 5 MiB por foto.</small>{files.length > 0 && <small>{files.length} foto(s) seleccionada(s).</small>}</label>
      <button className="publish-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? "Publicando…" : "Publicar propiedad"}</button>
      {status && <p className="form-status" role={uncertain ? "alert" : "status"}>{status}</p>}
      {status.startsWith("Propiedad publicada") && <div className="publish-success-links">{publishedSlug && <Link href={`/inmueble/${encodeURIComponent(publishedSlug)}`}>Ver ficha completa</Link>}<Link href="/mis-propiedades">Ver Mis propiedades</Link></div>}
    </form>
  </main></>;
}
