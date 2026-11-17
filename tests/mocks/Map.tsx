import { formatPrice, MappableListing } from "../../app/lib/inventory";
type Props = { properties?: MappableListing[]; onPick?: (lat: number, lng: number) => void; onLocate?: () => void; value?: { lat: number; lng: number } | null; disabled?: boolean };

// Contract placeholder, not a Leaflet test. No tiles or geolocation requests.
// The /publicar location picker is also loaded with next/dynamic: it gets a button that "drops the pin"
// at a map-click-like point with full float precision, plus a readout of the value it was given.
export default function MapMock({ properties = [], onPick, onLocate, value, disabled }: Props) {
  if (onPick) return <section aria-label="Mapa de ubicación simulado">
    <button type="button" disabled={disabled} onClick={() => onPick(-5.176585364261654, -80.61069405048632)}>Soltar pin de prueba</button>
    <button type="button" disabled={disabled} onClick={() => onPick(40.4168, -3.7038)}>Soltar pin fuera de Perú</button>
    {onLocate && <button type="button" disabled={disabled} onClick={onLocate}>Ir a mi ubicación</button>}
    <span data-testid="pin-del-mapa">{value ? `${value.lat},${value.lng}` : "sin fijar"}</span>
  </section>;
  return <section aria-label="Mapa simulado">
    <output aria-label="Número de marcadores">{properties.length}</output>
    <output aria-label="Datos de marcadores">{JSON.stringify(properties.map(({ id, price, type }) => ({ id, price, type })))}</output>
    <output aria-label="Semántica de marcadores">{JSON.stringify(properties.map(item => ({ price: formatPrice(item.price, item.currency), operation: item.operation, type: item.type })))}</output>
  </section>;
}
