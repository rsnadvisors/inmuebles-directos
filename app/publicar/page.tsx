"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { MAX_PRICE, PARTIAL_MESSAGE, validatePhotos, validatePublication, validCoordinates } from "../lib/publication";

const initialCoordinates = { latitude: "-5.1945", longitude: "-80.6328" };
export default function PublishPage() {
  const [status, setStatus] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [coords, setCoords] = useState(initialCoordinates);
  const [coordinatesConfirmed, setCoordinatesConfirmed] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
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
    setStatus(valid ? "Coordenadas confirmadas." : "Indica coordenadas válidas dentro de Piura.");
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
    setStatus("Publicando…");
    try {
      const response = await fetch("/api/publicar", { method: "POST", body: payload });
      const result = await response.json();
      if (response.ok && result.ok === true && result.status === "published") {
        form.reset();
        setFiles([]);
        setCoords(initialCoordinates);
        setCoordinatesConfirmed(false);
        setStatus("Propiedad publicada. El marcador aparecerá al volver al mapa.");
      } else if (result.ok === false && ["VALIDATION_ERROR", "INVALID_REQUEST", "INVALID_CONTENT_TYPE", "INVALID_ORIGIN", "REQUEST_TOO_LARGE", "PUBLICATION_FAILED"].includes(result.code)) {
        setStatus(result.code === "PUBLICATION_FAILED" ? "El servicio de publicación no está disponible." : "No se pudo aceptar el formulario. Revisa los datos, las coordenadas y las fotos.");
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
  return <main className="publish-page">
    <Link href="/" className="back-link">← Volver al mapa</Link>
    <p className="eyebrow">PUBLICA GRATIS · PIURA</p><h1>Publica tu propiedad</h1>
    <p className="publish-intro">Completa los datos, indica la ubicación y añade fotos para mostrar tu inmueble en el mapa.</p>
    <form onSubmit={submit} className="publish-form" aria-busy={isSubmitting}>
      <label>Tipo de propiedad<select name="type" required disabled={isSubmitting}><option value="Terrenos">Terreno</option><option value="Casas">Casa</option><option value="Departamentos">Departamento</option></select></label>
      <label>Operación<select name="operation" required disabled={isSubmitting}><option value="Vender">Vender</option><option value="Alquilar">Alquilar</option></select></label>
      <label>Título del anuncio<input name="title" required maxLength={120} disabled={isSubmitting} placeholder="Ej. Terreno residencial en Castilla" /></label>
      <label>Precio en USD<input name="price" type="number" min="0" max={MAX_PRICE} step="any" required disabled={isSubmitting} placeholder="72000" /></label>
      <label>Descripción<textarea name="description" required maxLength={3000} disabled={isSubmitting} rows={4} placeholder="Describe las características principales…" /></label>
      <label>Dirección o sector<input name="address" required maxLength={250} disabled={isSubmitting} placeholder="Castilla, Piura" /></label>
      <fieldset disabled={isSubmitting}><legend>Ubicación de coordenadas</legend>
        <div className="coordinate-grid"><label>Latitud<input value={coords.latitude} onChange={e => editCoordinate("latitude", e.target.value)} inputMode="decimal" required /></label><label>Longitud<input value={coords.longitude} onChange={e => editCoordinate("longitude", e.target.value)} inputMode="decimal" required /></label></div>
        <button type="button" className="location-btn" onClick={useLocation}>Usar mi ubicación actual</button>
        <button type="button" className="location-btn" onClick={confirmCoordinates}>Confirmar coordenadas</button>
        <small>{coordinatesConfirmed ? "Coordenadas confirmadas." : "Coordenadas sin confirmar. Obtén tu ubicación o confirma manualmente la ubicación en Piura."}</small>
      </fieldset>
      <label>Fotos de la propiedad<input type="file" accept="image/jpeg,image/png,image/webp" multiple required disabled={isSubmitting} onChange={onFiles} /><small>Obligatorio: 1 a 5 fotos · JPG, PNG o WebP · máximo 5 MiB por foto.</small>{files.length > 0 && <small>{files.length} foto(s) seleccionada(s).</small>}</label>
      <button className="publish-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? "Publicando…" : "Publicar propiedad"}</button>
      {status && <p className="form-status" role={uncertain ? "alert" : "status"}>{status}</p>}
    </form>
  </main>;
}
