"""Favicon «ID» de Inmuebles Directos: I verde (#087f70) + D oscuro (#15232d), en Plus Jakarta Sans ExtraBold
(la misma letra del logo), sobre un cuadrado blanco redondeado para que se vea en pestañas claras y oscuras."""
import os, sys, site
sys.path.insert(0, site.getusersitepackages())
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else HERE
TEAL, INK, BG = "#087f70", "#15232d", "#ffffff"
SIZE, RADIUS = 64, 14          # lienzo del SVG y radio del fondo
CAP = 38                       # altura de las mayúsculas dentro de 64 px
TRACKING = -0.06               # mismo espaciado que el logo (letter-spacing: -.06em)

vf = TTFont(os.path.join(HERE, "PlusJakartaSans.ttf"))
font = instantiateVariableFont(vf, {"wght": 800}, inplace=False)
ttf_path = os.path.join(HERE, "PlusJakartaSans-ExtraBold.ttf")
font.save(ttf_path)

gs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font["head"].unitsPerEm
cap_height = font["OS/2"].sCapHeight or 700
scale = CAP / cap_height
glyphs = [(cmap[ord("I")], TEAL), (cmap[ord("D")], INK)]

# Ancho total en unidades de la fuente: avances + tracking, recortando los márgenes laterales exteriores.
def bounds(name):
    pen = BoundsPen(gs); gs[name].draw(pen); return pen.bounds
b_first, b_last = bounds(glyphs[0][0]), bounds(glyphs[-1][0])
x = 0.0; positions = []
for i, (name, _) in enumerate(glyphs):
    positions.append(x)
    x += gs[name].width + (TRACKING * upm if i < len(glyphs) - 1 else 0)
ink_left = positions[0] + b_first[0]
ink_right = positions[-1] + b_last[2]
width_units = ink_right - ink_left
offset_x = (SIZE - width_units * scale) / 2 - ink_left * scale
baseline = (SIZE + CAP) / 2      # centra la altura de mayúscula en el lienzo

paths = []
for (name, color), px in zip(glyphs, positions):
    pen = SVGPathPen(gs)
    # y invertida: SVG crece hacia abajo, la fuente hacia arriba.
    tpen = TransformPen(pen, (scale, 0, 0, -scale, offset_x + px * scale, baseline))
    gs[name].draw(tpen)
    paths.append(f'<path fill="{color}" d="{pen.getCommands()}"/>')

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}">'
       f'<rect width="{SIZE}" height="{SIZE}" rx="{RADIUS}" fill="{BG}"/>' + "".join(paths) + "</svg>\n")
open(os.path.join(OUT, "icon.svg"), "w", encoding="utf-8").write(svg)

# PNG: misma geometría, dibujada con la fuente instanciada a la escala del tamaño pedido.
def render(px_size, rounded=True):
    k = px_size / SIZE
    img = Image.new("RGBA", (px_size, px_size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded: d.rounded_rectangle([0, 0, px_size - 1, px_size - 1], radius=RADIUS * k, fill=BG)
    else: d.rectangle([0, 0, px_size, px_size], fill=BG)
    f = ImageFont.truetype(ttf_path, size=max(1, round(upm * scale * k)))
    for (name, color), pos in zip(glyphs, positions):
        ch = "I" if name == glyphs[0][0] else "D"
        d.text(((offset_x + pos * scale) * k, baseline * k), ch, font=f, fill=color, anchor="ls")
    return img

render(180, rounded=False).convert("RGB").save(os.path.join(OUT, "apple-icon.png"))   # iOS redondea solo
render(512).save(os.path.join(OUT, "preview-512.png"))
big = render(256)
big.save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
strip = Image.new("RGBA", (16 + 32 + 48 + 96 + 60, 120), (0, 0, 0, 0))
xx = 10
for s in (16, 32, 48, 96):
    strip.paste(render(s), (xx, 110 - s), render(s)); xx += s + 15
strip.save(os.path.join(OUT, "preview-sizes.png"))
print("ok", round(scale, 4), round(offset_x, 2), round(baseline, 2))
