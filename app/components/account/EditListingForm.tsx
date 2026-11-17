"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { EDITABLE_KEYS, ListingValidationError, validateListingEdit } from "../../lib/listing-management";
import { MAX_PRICE, parsePastedCoordinates, roundCoordinate, validCoordinates } from "../../lib/publication";

// El mismo mapa con pin de /publicar; Leaflet necesita el navegador.
const LocationPicker = dynamic(() => import("../../publicar/LocationPicker"), { ssr: false,
  loading: () => <div className="location-picker location-picker-loading">Cargando mapa…</div> });

export type EditListingInitial = {
  id: string; title: string; property_type: string; listing_type: string; price: number; currency: string; contact_phone: string | null;
  maintenance_fee: number | null; area_total_m2: number | null; area_built_m2: number | null; bedrooms: number | null; bathrooms: number | null;
  parking_spaces: number | null; floors: number | null; description: string | null; address: string | null; district: string | null;
  city: string | null; region: string | null; lat: number | null; lng: number | null;
};
const TYPE: Record<string, string> = { house: "Casa", apartment: "Departamento", land: "Terreno", office: "Oficina", commercial: "Local comercial" };
const v = (value: unknown) => value === null || value === undefined ? "" : String(value);
/** Muestra +51 987 654 321 como 987 654 321 para que el campo sea familiar; la validación vuelve a normalizarlo. */
const phone = (value: string | null) => value?.startsWith("+519") && value.length === 12 ? value.slice(3) : value ?? "";
type Point = { latitude: string; longitude: string };
const pointOf = (lat: number | null, lng: number | null): Point | null =>
  lat !== null && lng !== null && validCoordinates(String(lat), String(lng)) ? { latitude: String(lat), longitude: String(lng) } : null;

export default function EditListingForm({ initial }: { initial: EditListingInitial }) {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [point, setPoint] = useState<Point | null>(() => pointOf(initial.lat, initial.lng));
  const [coordText, setCoordText] = useState(() => { const p = pointOf(initial.lat, initial.lng); return p ? `${p.latitude}, ${p.longitude}` : ""; });
  const [locationNote, setLocationNote] = useState("");
  const land = initial.property_type === "land";
  const noRooms = land || initial.property_type === "office" || initial.property_type === "commercial";

  function place(next: Point | null, note = "") {
    setPoint(next); setLocationNote(note);
    if (next) setCoordText(`${next.latitude}, ${next.longitude}`);
  }
  function pickOnMap(lat: number, lng: number) {
    const next = { latitude: String(roundCoordinate(lat)), longitude: String(roundCoordinate(lng)) };
    if (validCoordinates(next.latitude, next.longitude)) place(next);
    else setLocationNote("Ese punto está fuera del área permitida. Fija la ubicación dentro de Perú.");
  }
  function locate() {
    if (!navigator.geolocation) { setLocationNote("Este navegador no admite geolocalización."); return; }
    setLocationNote("Obteniendo ubicación…");
    navigator.geolocation.getCurrentPosition(({ coords }) => pickOnMap(coords.latitude, coords.longitude),
      () => setLocationNote("No pudimos obtener tu ubicación. Mueve el pin hasta tu inmueble."), { enableHighAccuracy: true, timeout: 10000 });
  }
  function pasteCoordinates(text: string) {
    setCoordText(text);
    const next = parsePastedCoordinates(text);
    if (next) { setPoint(next); setLocationNote(""); } else setPoint(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = new FormData(event.currentTarget);
    const raw: Record<string, unknown> = {};
    for (const key of EDITABLE_KEYS) if (form.has(key)) raw[key] = form.get(key);
    let fields;
    if (!point) { setMessage("Fija la ubicación del inmueble en el mapa."); return; }
    try { fields = validateListingEdit(raw, initial.property_type); }
    catch (error) { setMessage(error instanceof ListingValidationError ? error.message : "Revisa los datos."); return; }
    pending.current = true; setBusy(true); setMessage("Guardando…");
    try {
      const response = await fetch("/api/mis-propiedades", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "edit", id: initial.id, fields }) });
      const result = await response.json().catch(() => null) as { ok?: boolean; message?: unknown } | null;
      if (!response.ok || !result?.ok) {
        setMessage(typeof result?.message === "string" ? result.message : "No pudimos guardar los cambios. Inténtalo más tarde.");
        return;
      }
      setMessage("Cambios guardados.");
      router.push("/mis-propiedades?actualizado=1");
      router.refresh();
    } catch { setMessage("No pudimos conectar con el servidor. Inténtalo de nuevo."); }
    finally { pending.current = false; setBusy(false); }
  }

  return <form className="publish-form acct-edit-form" onSubmit={submit} aria-busy={busy}>
    <p className="acct-manage-note">{TYPE[initial.property_type] ?? "Inmueble"} en {initial.listing_type === "rent" ? "alquiler" : "venta"}. El tipo y la operación no se pueden cambiar; si son distintos, publica un anuncio nuevo.</p>
    <label>Título del anuncio<input name="title" required maxLength={120} defaultValue={v(initial.title)} disabled={busy} /></label>
    <div className="publication-field-row">
      <label>Moneda<select name="currency" defaultValue={initial.currency === "USD" ? "USD" : "PEN"} disabled={busy}><option value="PEN">S/ · PEN</option><option value="USD">US$ · USD</option></select></label>
      <label>Precio<input name="price" type="number" min="0" max={MAX_PRICE} step="any" required defaultValue={v(initial.price)} disabled={busy} /></label>
    </div>
    <label>Teléfono de contacto<input name="contact_phone" type="tel" inputMode="tel" required maxLength={40} defaultValue={phone(initial.contact_phone)} disabled={busy} /></label>
    <label>Descripción<textarea name="description" required maxLength={3000} rows={5} defaultValue={v(initial.description)} disabled={busy} /></label>
    <div className="publication-field-row">
      <label>Región<input name="region" required maxLength={120} defaultValue={v(initial.region)} disabled={busy} /></label>
      <label>Ciudad o provincia<input name="city" required maxLength={120} defaultValue={v(initial.city)} disabled={busy} /></label>
    </div>
    <div className="publication-field-row">
      <label>Distrito (opcional)<input name="district" maxLength={120} defaultValue={v(initial.district)} disabled={busy} /></label>
      <label>Dirección o sector<input name="address" required maxLength={250} defaultValue={v(initial.address)} disabled={busy} /></label>
    </div>
    <fieldset disabled={busy}><legend>Características</legend>
      <div className="publication-field-row">
        <label>Área total (m²)<input name="area_total_m2" type="number" min="0" step="any" defaultValue={v(initial.area_total_m2)} /></label>
        {!land && <label>Área construida (m²)<input name="area_built_m2" type="number" min="0" step="any" defaultValue={v(initial.area_built_m2)} /></label>}
      </div>
      {!land && <div className="publication-field-row">
        {!noRooms && <label>Habitaciones<input name="bedrooms" type="number" min="0" step="1" defaultValue={v(initial.bedrooms)} /></label>}
        <label>Baños<input name="bathrooms" type="number" min="0" step="1" defaultValue={v(initial.bathrooms)} /></label>
        <label>Estacionamientos<input name="parking_spaces" type="number" min="0" step="1" defaultValue={v(initial.parking_spaces)} /></label>
        <label>Pisos<input name="floors" type="number" min="0" step="1" defaultValue={v(initial.floors)} /></label>
        <label>Mantenimiento<input name="maintenance_fee" type="number" min="0" step="any" defaultValue={v(initial.maintenance_fee)} /></label>
      </div>}
    </fieldset>
    <fieldset disabled={busy} className="location-fieldset"><legend>Ubicación del inmueble</legend>
      <p className="location-hint">Arrastra el puntero para fijar el punto en el mapa.</p>
      <small className="location-sub">También puedes tocar el mapa. Si la ubicación ya es correcta, no hace falta cambiarla.</small>
      <LocationPicker value={point ? { lat: Number(point.latitude), lng: Number(point.longitude) } : null} onPick={pickOnMap} onLocate={locate} disabled={busy} />
      <p className={point ? "location-state ok" : "location-state"} aria-live="polite">{point
        ? `✓ Ubicación fijada: ${point.latitude}, ${point.longitude}` : "Ubicación sin fijar: mueve el pin hasta tu inmueble."}</p>
      {locationNote && <p className="location-state" role="alert">{locationNote}</p>}
      <input type="hidden" name="lat" value={point?.latitude ?? ""} />
      <input type="hidden" name="lng" value={point?.longitude ?? ""} />
      <details className="location-manual">
        <summary>¿Tienes las coordenadas? Pégalas aquí</summary>
        <label>Coordenadas<input value={coordText} onChange={e => pasteCoordinates(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="-5.1945, -80.6328" /></label>
        <small>{coordText.trim() && !point ? "Escríbelas así: -5.1945, -80.6328 (latitud, longitud, dentro de Perú)." : "En Google Maps, mantén presionado el lugar y copia los números que aparecen."}</small>
      </details>
      <small>Este punto se mostrará en el mapa público de tu anuncio.</small>
    </fieldset>
    <button className="publish-submit" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</button>
    <p className="form-status" role="status">{message}</p>
  </form>;
}
