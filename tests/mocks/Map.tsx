type Props = { properties: Array<{ id: string | number; title: string; price: number; type: string }> };

// Contract placeholder, not a Leaflet test. No tiles or geolocation requests.
export default function MapMock({ properties }: Props) {
  return <section aria-label="Mapa simulado">
    <output aria-label="Número de marcadores">{properties.length}</output>
    <output aria-label="Datos de marcadores">{JSON.stringify(properties.map(({ id, price, type }) => ({ id, price, type })))}</output>
  </section>;
}
