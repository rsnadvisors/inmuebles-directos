"""Regenera las imágenes fijas del mapa de la portada (rendimiento P3c).

La portada muestra public/mapa-piura.webp (escritorio) y public/mapa-piura-movil.webp (móvil) debajo del mapa
interactivo mientras carga Leaflet. Para que el cambio no se note, la imagen debe coincidir píxel a píxel con la
vista inicial del mapa: mismo centro, mismo zoom y la misma escala de teselas (256 px).

Este script lee el centro (`const piura`) y el zoom inicial (`zoom={N}` del MapContainer) directamente de
app/PiuraMap.tsx, descarga una sola vez las teselas necesarias de OpenStreetMap y compone las dos imágenes.

Cuándo ejecutarlo: solo si cambia el centro o el zoom inicial del mapa en app/PiuraMap.tsx.

Uso (desde la raíz del proyecto; necesita Python 3 y Pillow: `pip install pillow`):
    python scripts/build-static-map.py

Las teselas son © OpenStreetMap contributors (ODbL); la atribución ya se muestra en el mapa interactivo.
La política de uso de teselas de OpenStreetMap admite descargas puntuales como esta (unas 35 teselas).
"""
import io
import math
import re
import time
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MAP_SOURCE = ROOT / "app" / "PiuraMap.tsx"
OUT_DIR = ROOT / "public"
# Escritorio: cubre el panel del mapa hasta pantallas de ~2000 px. Móvil: cubre el mapa de un teléfono en vertical.
SIZES = {"mapa-piura.webp": (1600, 1000), "mapa-piura-movil.webp": (480, 900)}
QUALITY = 42  # es una imagen de transición: prima el peso (≈60 KB en móvil)
HEADERS = {"User-Agent": "static-map-builder/1.0 (one-time build of a placeholder image)"}
TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"


def read_initial_view() -> tuple[float, float, int]:
    """Centro y zoom iniciales tal como los usa el mapa interactivo."""
    source = MAP_SOURCE.read_text(encoding="utf-8")
    center = re.search(r"const piura: \[number, number\] = \[(-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\];", source)
    zoom = re.search(r"<MapContainer[^>]*\bzoom=\{(\d+)\}", source)
    if not center or not zoom:
        raise SystemExit(f"No encontré «const piura» o «zoom={{N}}» en {MAP_SOURCE}; revisa el script.")
    return float(center.group(1)), float(center.group(2)), int(zoom.group(1))


def world_pixel(lat: float, lng: float, zoom: int) -> tuple[float, float]:
    """Coordenadas en píxeles del mundo (proyección Web Mercator, teselas de 256 px), como Leaflet."""
    size = 256 * 2 ** zoom
    sin_lat = math.sin(math.radians(lat))
    x = (lng + 180) / 360 * size
    y = (0.5 - math.log((1 + sin_lat) / (1 - sin_lat)) / (4 * math.pi)) * size
    return x, y


def main() -> None:
    lat, lng, zoom = read_initial_view()
    print(f"Vista inicial del mapa: centro {lat}, {lng} · zoom {zoom}")
    tiles: dict[tuple[int, int], Image.Image] = {}

    def tile(x: int, y: int) -> Image.Image:
        if (x, y) not in tiles:
            request = urllib.request.Request(TILE_URL.format(z=zoom, x=x, y=y), headers=HEADERS)
            with urllib.request.urlopen(request, timeout=30) as response:
                tiles[(x, y)] = Image.open(io.BytesIO(response.read())).convert("RGB")
            time.sleep(0.2)  # sin ráfagas contra el servidor de teselas
        return tiles[(x, y)]

    center_x, center_y = world_pixel(lat, lng, zoom)
    for name, (width, height) in SIZES.items():
        left, top = center_x - width / 2, center_y - height / 2
        canvas = Image.new("RGB", (width, height), (242, 239, 233))
        for tx in range(int(left // 256), int((left + width) // 256) + 1):
            for ty in range(int(top // 256), int((top + height) // 256) + 1):
                canvas.paste(tile(tx, ty), (round(tx * 256 - left), round(ty * 256 - top)))
        target = OUT_DIR / name
        canvas.save(target, "WEBP", quality=QUALITY, method=6)
        print(f"{target.relative_to(ROOT)}: {width}×{height}, {target.stat().st_size / 1024:.0f} KB")
    print(f"Teselas descargadas: {len(tiles)}")


if __name__ == "__main__":
    main()
