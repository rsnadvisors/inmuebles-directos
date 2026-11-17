"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { FormEvent, useRef, useState } from "react";
import { MAX_PRICE, parsePastedCoordinates, roundCoordinate, validatePhotos, validatePublication, validCoordinates } from "../lib/publication";
import SiteHeader from "../components/SiteHeader";
import { publicationFingerprint } from "../lib/publication-attempt";
import { PublicationRecoveryPanel, usePublicationRecovery } from "./PublicationRecovery";
import Turnstile, { type TurnstileHandle } from "../components/Turnstile";
import { TURNSTILE_HEADER, TURNSTILE_MISSING_MESSAGE } from "../lib/turnstile";

const initialCoordinates = { latitude: "", longitude: "" };
const asText = (c: { latitude: string; longitude: string }) => c.latitude && c.longitude ? `${c.latitude}, ${c.longitude}` : "";
// Leaflet necesita el navegador: el mapa se carga solo en el cliente.
const LocationPicker = dynamic(() => import("./LocationPicker"), { ssr: false,
  loading: () => <div className="location-picker location-picker-loading">Cargando mapa…</div> });
export default function PublishPage() {
  const recovery = usePublicationRecovery();
  const [status, setStatus] = useState("");
  const [coords, setCoords] = useState(initialCoordinates);
  const [coordinatesConfirmed, setCoordinatesConfirmed] = useState(false);
  const [coordText, setCoordText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [propertyType, setPropertyType] = useState("Casas");
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const isSubmitting = recovery.busy;
  const locationVersion = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const captcha = useRef<TurnstileHandle>(null);

  function resetPublicationForm() {
    locationVersion.current++;
    formRef.current?.reset();
    setFiles([]); setCoords(initialCoordinates); setCoordinatesConfirmed(false); setCoordText("");
    setPropertyType("Casas"); setPublishedSlug(null); setStatus("");
  }

  // Pegar o escribir «lat, lng» fija el pin en cuanto el texto es válido; si no, la ubicación queda sin fijar.
  function pasteCoordinates(text: string) {
    locationVersion.current++;
    setCoordText(text);
    const next = parsePastedCoordinates(text);
    if (next) { setCoords(next); setCoordinatesConfirmed(true); setStatus(""); return; }
    setCoords(initialCoordinates); setCoordinatesConfirmed(false);
  }
  // Mover el pin (arrastrar o tocar el mapa) fija y confirma la ubicación en un solo gesto.
  function pickOnMap(lat: number, lng: number) {
    locationVersion.current++;
    const next = { latitude: String(roundCoordinate(lat)), longitude: String(roundCoordinate(lng)) };
    const valid = validCoordinates(next.latitude, next.longitude);
    if (!valid) { setCoordinatesConfirmed(false); setStatus("Ese punto está fuera del área permitida. Fija la ubicación dentro de Perú."); return; }
    setCoords(next); setCoordText(asText(next)); setCoordinatesConfirmed(true); setStatus("");
  }
  function useLocation() {
    const version = ++locationVersion.current;
    setCoordinatesConfirmed(false);
    if (!navigator.geolocation) return setStatus("Este navegador no admite geolocalización.");
    setStatus("Obteniendo ubicación…");
    navigator.geolocation.getCurrentPosition(({ coords: p }) => {
      if (version !== locationVersion.current) return;
      const next = { latitude: String(roundCoordinate(p.latitude)), longitude: String(roundCoordinate(p.longitude)) };
      setCoords(next); setCoordText(asText(next));
      const valid = validCoordinates(next.latitude, next.longitude);
      setCoordinatesConfirmed(valid);
      setStatus(valid ? "" : "La ubicación obtenida está fuera del área de publicación permitida.");
    }, () => {
      if (version === locationVersion.current) setStatus("No pudimos obtener tu ubicación. Mueve el pin hasta tu inmueble.");
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
    const operation = recovery.beginPublication();
    if (!operation) return;
    const form = event.currentTarget;
    try {
      const payload = new FormData(form);
      payload.delete("cf-turnstile-response"); // defensive: never send widget internals as listing fields
      payload.set("latitude", coords.latitude);
      payload.set("longitude", coords.longitude);
      payload.set("coordinatesConfirmed", String(coordinatesConfirmed));
      files.forEach(file => payload.append("images", file));
      if (!coords.latitude && !coords.longitude) { setStatus("Fija la ubicación del inmueble en el mapa."); return; }
      let input: ReturnType<typeof validatePublication>;
      try { input = validatePublication(payload); }
      catch (error) { setStatus((error as Error).message); return; }
      const captchaToken = captcha.current?.token() ?? "";
      if (!captchaToken) { setStatus(TURNSTILE_MISSING_MESSAGE); return; }
      locationVersion.current++;
      setPublishedSlug(null);
      setStatus("Publicando…");
      const fingerprint = await publicationFingerprint(input);
      const attempt = recovery.bindPublication(operation, fingerprint);
      if (!attempt) { if (recovery.isCurrent(operation)) setStatus(""); return; }
      if (!recovery.markPublicationSent(operation)) return;
      const response = await fetch("/api/publicar", { method: "POST", body: payload,
        headers: { "X-Publication-Request-Id": attempt.id, [TURNSTILE_HEADER]: captchaToken } });
      const result = await response.json();
      if (!recovery.isCurrent(operation)) return;
      if (recovery.releaseRejectedPublication(operation, response.status, result)) {
        setStatus(typeof result.message === "string" ? result.message : "La solicitud fue rechazada antes de preparar la publicación.");
        return;
      }
      if (response.status === 401) {
        recovery.publicationUncertain(operation);
        window.location.assign("/login?returnTo=/publicar");
        setStatus("La sesión expiró. Inicia sesión para continuar.");
      } else if (response.ok && result.ok === true && result.status === "published") {
        if (!recovery.completePublication(operation)) return;
        form.reset();
        setFiles([]);
        setCoords(initialCoordinates);
        setCoordinatesConfirmed(false);
        setPropertyType("Casas");
        setPublishedSlug(typeof result.slug === "string" ? result.slug : null);
        setStatus(result.imageDelivery === "unconfirmed"
          ? "Propiedad publicada. No pudimos confirmar la imagen; revísala en Mis propiedades. No vuelvas a publicarla."
          : "Propiedad publicada. Puedes verla en Mis propiedades.");
      } else if (result.ok === false && ["CAPTCHA_FAILED", "CAPTCHA_UNAVAILABLE", "PUBLICATION_DAILY_LIMIT", "VALIDATION_ERROR", "INVALID_REQUEST", "INVALID_CONTENT_TYPE", "INVALID_ORIGIN", "REQUEST_TOO_LARGE", "PUBLICATION_FAILED"].includes(result.code)) {
        recovery.publicationUncertain(operation);
        setStatus(typeof result.message === "string" ? result.message : "No se pudo completar la publicación.");
      } else {
        recovery.publicationUncertain(operation); setStatus("");
      }
    } catch {
      if (recovery.isCurrent(operation)) { recovery.publicationUncertain(operation); setStatus(""); }
    } finally {
      captcha.current?.reset(); // single-use token
      recovery.finishPublication(operation);
    }
  }
  return <><SiteHeader /><main className="publish-page">
    <Link href="/" className="back-link">← Volver al mapa</Link>
    <p className="eyebrow">PUBLICA GRATIS · PERÚ</p><h1>Publica tu propiedad</h1>
    <p className="publish-intro">Completa los datos, indica la ubicación y añade fotos para mostrar tu inmueble en el mapa.</p>
    <PublicationRecoveryPanel onStartNewPublication={resetPublicationForm} />
    <form ref={formRef} onSubmit={submit} className="publish-form" aria-busy={isSubmitting}>
      <label>Tipo de propiedad<select name="type" value={propertyType} onChange={event => setPropertyType(event.target.value)} required disabled={isSubmitting}><option value="Casas">Casa</option><option value="Departamentos">Departamento</option><option value="Terrenos">Terreno</option><option value="Oficinas">Oficina</option><option value="Locales comerciales">Local comercial</option></select></label>
      <label>Operación<select name="operation" required disabled={isSubmitting}><option value="Vender">Vender</option><option value="Alquilar">Alquilar</option></select></label>
      <label>Título del anuncio<input name="title" required maxLength={120} disabled={isSubmitting} placeholder="Ej. Terreno residencial en Castilla" /></label>
      <label>Teléfono de contacto<input name="contact_phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={40} disabled={isSubmitting} aria-describedby="contact-phone-disclosure" placeholder="Ej. 987 654 321 o +51 987 654 321" /></label>
      <p id="contact-phone-disclosure" className="publication-contact-disclosure">Este número será público en tu anuncio para llamadas y WhatsApp. Para otros países, incluye el código con +. Al publicar declaras que la información es veraz y aceptas los <a href="/terminos" target="_blank">Términos y condiciones</a> y la <a href="/privacidad" target="_blank">Política de privacidad</a>.</p>
      <div className="publication-field-row"><label>Moneda<select name="currency" required disabled={isSubmitting}><option value="PEN">S/ · PEN</option><option value="USD">US$ · USD</option></select></label><label>Precio<input name="price" type="number" min="0" max={MAX_PRICE} step="any" required disabled={isSubmitting} placeholder="72000" /></label></div>
      <label>Descripción<textarea name="description" required maxLength={3000} disabled={isSubmitting} rows={4} placeholder="Describe las características principales…" /></label>
      <div className="publication-field-row"><label>Región<input name="region" required maxLength={120} disabled={isSubmitting} placeholder="Ej. Piura" /></label><label>Ciudad o provincia<input name="city" required maxLength={120} disabled={isSubmitting} placeholder="Ej. Piura" /></label></div>
      <div className="publication-field-row"><label>Distrito (opcional)<input name="district" maxLength={120} disabled={isSubmitting} placeholder="Ej. Castilla" /></label><label>Dirección o sector<input name="address" required maxLength={250} disabled={isSubmitting} placeholder="Referencia pública de ubicación" /></label></div>
      <fieldset disabled={isSubmitting}><legend>Características</legend><div className="publication-field-row"><label>Área total (m²)<input name="area_total_m2" type="number" min="0" step="any" /></label>{propertyType !== "Terrenos" && <label>Área construida (m²)<input name="area_built_m2" type="number" min="0" step="any" /></label>}</div>
        {propertyType !== "Terrenos" && <div className="publication-field-row">{propertyType !== "Oficinas" && propertyType !== "Locales comerciales" && <label>Habitaciones<input name="bedrooms" type="number" min="0" step="1" /></label>}<label>Baños<input name="bathrooms" type="number" min="0" step="1" /></label><label>Estacionamientos<input name="parking_spaces" type="number" min="0" step="1" /></label><label>Pisos<input name="floors" type="number" min="0" step="1" /></label><label>Mantenimiento<input name="maintenance_fee" type="number" min="0" step="any" /></label></div>}
      </fieldset>
      <fieldset disabled={isSubmitting} className="location-fieldset"><legend>Ubicación del inmueble</legend>
        <p className="location-hint">Arrastra el puntero para fijar el punto en el mapa.</p>
        <small className="location-sub">También puedes tocar el mapa. Es lo único que necesitas en esta sección.</small>
        <LocationPicker value={coordinatesConfirmed && validCoordinates(coords.latitude, coords.longitude) ? { lat: Number(coords.latitude), lng: Number(coords.longitude) } : null}
          onPick={pickOnMap} onLocate={useLocation} disabled={isSubmitting} />
        <p className={coordinatesConfirmed ? "location-state ok" : "location-state"} aria-live="polite">{coordinatesConfirmed
          ? `✓ Ubicación fijada: ${coords.latitude}, ${coords.longitude}`
          : "Ubicación sin fijar: mueve el pin hasta tu inmueble."}</p>
        <details className="location-manual">
          <summary>¿Tienes las coordenadas? Pégalas aquí</summary>
          <label>Coordenadas<input value={coordText} onChange={e => pasteCoordinates(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="-5.1945, -80.6328" /></label>
          <small>{coordText.trim() && !coordinatesConfirmed ? "Escríbelas así: -5.1945, -80.6328 (latitud, longitud, dentro de Perú)." : "En Google Maps, mantén presionado el lugar y copia los números que aparecen."}</small>
        </details>
        <small>Este punto se mostrará en el mapa público de tu anuncio.</small>
      </fieldset>
      <label>Fotos de la propiedad<input type="file" accept="image/jpeg,image/png,image/webp" multiple required disabled={isSubmitting} onChange={onFiles} /><small>Obligatorio: 1 a 5 fotos · JPG, PNG o WebP · máximo 5 MiB por foto.</small>{files.length > 0 && <small>{files.length} foto(s) seleccionada(s).</small>}</label>
      <Turnstile ref={captcha} action="publish" />
      <button className="publish-submit" type="submit" disabled={!recovery.canSubmit}>{isSubmitting && status === "Publicando…" ? "Publicando…" : "Publicar propiedad"}</button>
      {status && <p className="form-status" role="status">{status}</p>}
      {status.startsWith("Propiedad publicada") && <div className="publish-success-links">{publishedSlug && <Link href={`/inmueble/${encodeURIComponent(publishedSlug)}`}>Ver ficha completa</Link>}<Link href="/mis-propiedades">Ver Mis propiedades</Link></div>}
    </form>
  </main></>;
}
