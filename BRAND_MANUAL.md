# Manual de marca · Inmuebles Directos

> Versión 1.0 · 24 de noviembre de 2026
> Tokens de diseño: [`design/brand-tokens.json`](design/brand-tokens.json) · Isotipo: [`public/brand/`](public/brand/)

Este manual describe la marca **tal como ya existe** en inmueblesdirectosperu.com (código, estilos y textos actuales) y la ordena en reglas. Cada especificación lleva una de dos marcas:

- **[En uso]**: ya está en la web. Es la referencia.
- **[Nuevo]**: se define aquí y falta llevarlo a la web. Incluye las correcciones de accesibilidad detectadas al redactar el manual.

---

## 1. Identidad estratégica

### Propósito
Que comprar, vender o alquilar un inmueble en el Perú empiece con una conversación directa entre las personas que lo hacen posible.

### Misión
Ofrecer un mapa claro y actualizado de inmuebles reales, con el precio visible y el contacto directo con quien publica, para que propietarios y agentes publiquen gratis y quienes buscan decidan con información completa.

### Visión
Ser el punto de partida de quien busca casa, terreno o local en las ciudades del Perú, empezando por Piura: el lugar donde se ve qué hay, dónde está y cuánto cuesta.

### Valores

| Valor | Qué significa en la práctica |
|---|---|
| **Confianza** | Anuncios con ubicación real en el mapa, nombre del anunciante y estado al día (publicado, reservado, vendido). Nada de precios ocultos ni anuncios fantasma. |
| **Claridad** | El precio va sobre el pin. Las características van en cifras (m², dormitorios, baños). Los textos son cortos y en español sencillo. |
| **Trato directo** | Llamar o escribir por WhatsApp a quien publica, sin formularios intermedios ni intermediarios innecesarios. |
| **Agilidad digital** | Publicar en minutos desde el celular, fijar el punto en el mapa con el dedo y ver resultados al instante. |

### Propuesta de valor
**Ves el inmueble en el mapa, ves el precio y le escribes directo al dueño.** Publicar es gratis.

### Posicionamiento frente a los portales tradicionales

| | Portales tradicionales | Inmuebles Directos |
|---|---|---|
| Búsqueda | Listas largas con filtros; el mapa es secundario | **El mapa es la búsqueda**: precio sobre cada pin |
| Contacto | Formulario que llega a una bandeja o a una inmobiliaria | **Llamada o WhatsApp directo** con mensaje prellenado |
| Publicar | Planes pagados o destacados obligatorios | **Gratis**, con ubicación exacta y fotos |
| Cobertura | Nacional y genérica | **Local primero** (Piura): zonas y referencias que la gente reconoce |
| Estado | Anuncios vencidos que siguen visibles | Vigencia de 90 días, «Reservado», «Vendido» y retiro automático |

### Público objetivo

| Perfil | Quién es | Qué necesita | Mensaje clave |
|---|---|---|---|
| **Propietario** | Persona natural de 30 a 65 años en Piura que vende o alquila uno o dos inmuebles. Usa WhatsApp y el celular a diario. | Publicar sin pagar, recibir contactos serios y no perder tiempo con trámites. | «Publica gratis y recibe llamadas directas.» |
| **Agente inmobiliario** | Profesional independiente con varios inmuebles a cargo. | Visibilidad local, fichas que se vean profesionales y enlaces para compartir. | «Tus inmuebles en el mapa de Piura, con ficha propia para compartir.» |
| **Comprador / inquilino** | Familia o persona que busca en una zona concreta y compara precios. | Ver qué hay cerca (colegios, mercados, avenidas), comparar precios y contactar sin intermediarios. | «Mira el precio en el mapa y escríbele al dueño.» |

---

## 2. Logotipo y sistema de símbolos

### 2.1 Logotipo principal **[En uso]**
Es un logotipo tipográfico de una línea:

| Parte | Especificación |
|---|---|
| «Inmuebles» | Plus Jakarta Sans 800, color **teal** `#087f70` |
| «Directos» | Plus Jakarta Sans 800, color **tinta** `#15232d` |
| Interletraje | −0,06 em (compacto, se lee como una sola pieza) |
| Descriptor «PERÚ» | DM Mono 600, mayúsculas, interletraje +0,12 em, color `#64727d`, debajo y alineado a la izquierda |

**Concepto:** las dos palabras dicen qué es («Inmuebles») y cómo funciona («Directos»). El teal marca el producto; la tinta, la promesa. El descriptor monoespaciado recuerda a una coordenada o a una ficha técnica: es el lado del dato y del mapa.

En la web se dibuja como texto vivo (`.geo-logo`, enlazado al inicio). **[Nuevo]** Para usos fuera de la web (redes, impresos) hay que exportarlo a SVG con el texto convertido en trazos; es tarea pendiente de diseño.

### 2.2 Isotipo **[En uso]**
Monograma **«ID»**:
- la **I** en teal y la **D** en tinta;
- sobre un cuadrado blanco con esquinas redondeadas al 21,9 % del lado (14/64).

Archivo maestro: `app/icon.svg`. Se usa como favicon, ícono de aplicación (`apple-icon.png`) y avatar en redes.

**Pin del mapa:** el marcador del mapa **no** usa el isotipo. Es una píldora blanca con el precio (ver 7.4), porque en el mapa manda el dato. El isotipo se reserva para identidad (pestaña, app, perfil, sello).

### 2.3 Variantes cromáticas **[Nuevo · archivos en `public/brand/`]**

| Variante | Archivo | Fondo | Uso |
|---|---|---|---|
| Principal (positivo) | `isotipo.svg` | Blanco | Favicon, fondos claros |
| Negativo | `isotipo-negativo.svg` | Forest `#073d37` (I en mint, D en blanco) | Fondos oscuros, piezas sociales |
| Sobre color | `isotipo-teal.svg` | Teal `#087f70` (todo blanco) | Avatares, sellos |
| Monocromo oscuro | `isotipo-mono-oscuro.svg` | Transparente (todo tinta) | Impresión a una tinta, sellos de agua |
| Monocromo claro | `isotipo-mono-claro.svg` | Transparente (todo blanco) | Sobre fotografía oscura |

Logotipo:
- **Positivo** **[En uso]**: Inmuebles en teal y Directos en tinta, sobre blanco o `#f7faf9`.
- **Negativo** **[Nuevo]**: Inmuebles en mint `#35d2aa` y Directos en blanco, sobre forest `#073d37`.
- **Monocromo** **[Nuevo]**: todo en tinta o todo en blanco.

### 2.4 Área de protección
- **Logotipo:** un margen libre de **1 x** por los cuatro lados, donde **x = altura de la letra «I»** de «Inmuebles».
- **Isotipo:** un margen libre de **1/4 del lado** del cuadrado.

Dentro del área de protección no entra ningún texto, ícono ni borde de foto.

### 2.5 Tamaños mínimos

| Pieza | Digital | Impreso |
|---|---|---|
| Logotipo con descriptor | 120 px de ancho | 30 mm |
| Logotipo sin descriptor | 96 px | 24 mm |
| Isotipo | 16 px (favicon) · 24 px en interfaz | 8 mm |

Por debajo del mínimo del logotipo, usar solo el isotipo.

### 2.6 Usos incorrectos
1. Cambiar los colores de las palabras o invertirlos (Directos en teal).
2. Escribir el logotipo en otra tipografía o sin el interletraje compacto.
3. Separar «Inmuebles» y «Directos» en dos líneas, salvo en el isotipo.
4. Usar el mint como color de texto o de logotipo sobre blanco: 1,92:1, ilegible.
5. Deformar, rotar, añadir sombra, contorno o degradado.
6. Colocarlo sobre fotos con zonas claras y oscuras sin un fondo sólido debajo.
7. Usar el isotipo como pin del mapa o dentro de un texto.
8. Traducir o quitar las tildes del descriptor: siempre «PERÚ».

---

## 3. Paleta de colores

### 3.1 Primarios y de marca

| Token | HEX | RGB | CMYK* | Variable CSS | Estado | Uso |
|---|---|---|---|---|---|---|
| Teal | `#087f70` | 8 127 112 | 94 0 12 50 | `--teal` | En uso | Botones principales, enlaces, precios, «Inmuebles» |
| Teal oscuro | `#075f56` | 7 95 86 | 93 0 9 63 | `--teal-dark` | En uso | Hover, activo, texto sobre verde claro |
| Forest | `#073d37` | 7 61 55 | 89 0 10 76 | `--forest` | Nuevo (literal en `.live-bar`) | Fondo oscuro de marca |
| Mint | `#35d2aa` | 53 210 170 | 75 0 19 18 | `--mint` | Nuevo | Acento **solo** sobre forest |
| Teal claro | `#e3f2ee` | 227 242 238 | 6 0 2 5 | `--teal-tint` | En uso (literal) | Fondo de chips y contadores |

### 3.2 Neutros

| Token | HEX | RGB | CMYK* | Variable CSS | Uso |
|---|---|---|---|---|---|
| Tinta | `#15232d` | 21 35 45 | 53 22 0 82 | `--ink` | Texto principal, titulares |
| Pizarra | `#52636a` | 82 99 106 | 23 7 0 58 | `--slate` (nuevo) | Controles, navegación |
| Gris texto | `#64727d` | 100 114 125 | 20 9 0 51 | `--muted` | Texto secundario (mínimo 12 px) |
| Borde | `#d7e2df` | 215 226 223 | 5 0 1 11 | `--border` (nuevo) | Bordes de controles |
| Línea | `#e1e8e6` | 225 232 230 | 3 0 1 9 | `--line` | Separadores, borde de tarjetas |
| Suave | `#f5f8f7` | 245 248 247 | 1 0 0 3 | `--soft` | Superficies secundarias |
| Lienzo | `#f7faf9` | 247 250 249 | 1 0 0 2 | `--canvas` (nuevo) | Fondo de página |
| Blanco | `#ffffff` | 255 255 255 | 0 0 0 0 | `--white` | Tarjetas, encabezado, pines |

### 3.3 Semánticos

| Token | HEX | Fondo | Contraste | Estado | Uso |
|---|---|---|---|---|---|
| Éxito | `#127a4b` | `#e3f4ea` | 4,70:1 sobre su fondo · 5,37:1 sobre blanco | Nuevo | «Cambios guardados», confirmaciones |
| Verificado | `#16a34a` | — | 3,30:1 (solo ícono) | En uso | Check del sello «Publicada en Inmuebles Directos» |
| Alerta | `#8a5a00` | `#fff1d6` | 5,31:1 | En uso | Avisos, «Reservado» |
| Error | `#b42318` | `#fef3f2` | 6,05:1 · 6,57:1 sobre blanco | Nuevo | Errores de formulario, «Eliminar» |
| Foco | `#087f70` | — | 4,91:1 | Nuevo | Anillo de foco del teclado |

### 3.4 Etiquetas de inmueble

| Etiqueta | Texto | Fondo | Contraste | Estado |
|---|---|---|---|---|
| **Venta** | `#ffffff` | `#087f70` | 4,91:1 | Nuevo (hoy la tarjeta muestra «Comprar» en blanco y teal) |
| **Alquiler** | `#ffffff` | `#15232d` | 16,03:1 | Nuevo |
| **Reservado** | `#8a5a00` | `#fff1d6` | 5,31:1 | En uso |
| **Destacado** | `#35d2aa` | `#073d37` | 6,32:1 | Nuevo (reservado para un futuro destacado) |
| **Vendido / Alquilado** | `#075f56` | `#e3f2ee` | 6,55:1 | Nuevo (corrige el teal actual) |
| **No disponible** | `#52636a` | `#eef2f1` | 5,55:1 | En uso |

Las etiquetas van en DM Mono 500, 11 px, mayúsculas, con interletraje +0,06 em, en una píldora (radio 999 px) con relleno de 4 × 10 px.

\* *Los valores CMYK son una conversión matemática desde RGB, como punto de partida. Para impresos, pide una prueba de color a la imprenta y ajusta sobre papel; los verdes azulados saturados suelen perder viveza en CMYK.*

### 3.5 Reglas de contraste (WCAG 2.2 AA)

Medido sobre los colores reales:

| Combinación | Contraste | Veredicto |
|---|---|---|
| Tinta sobre blanco | 16,03:1 | ✔ Cualquier tamaño |
| Blanco sobre teal (botón principal) | 4,91:1 | ✔ Texto normal |
| Teal sobre blanco (enlaces, precios) | 4,91:1 | ✔ Texto normal |
| Teal sobre lienzo `#f7faf9` | 4,67:1 | ✔ Texto normal |
| Gris texto sobre blanco | 4,95:1 | ✔ Texto normal, mínimo 12 px |
| Gris texto sobre lienzo | 4,71:1 | ✔ Texto normal |
| **Teal sobre teal claro** | **4,25:1** | ✘ **Corregir**: contadores de chips y etiqueta «Vendido». Usar teal oscuro (6,55:1). |
| **Anillo de foco `#55c4b2` sobre blanco** | **2,12:1** | ✘ **Corregir**: el foco necesita 3:1. Usar teal `#087f70` (4,91:1). |
| Mint sobre blanco | 1,92:1 | ✘ Prohibido como texto |
| Mint sobre forest | 6,32:1 | ✔ |
| Teal sobre fondo del mapa `#efebe4` | 4,13:1 | Solo texto ≥ 18,66 px en negrita o elementos gráficos (por eso los pines tienen fondo blanco) |

**Reglas:**
1. El texto de lectura no baja de **4,5:1**. El texto grande (≥ 24 px, o ≥ 18,66 px en negrita) y los íconos o bordes de controles no bajan de **3:1**.
2. Los botones de acción principal son **teal con texto blanco**. El hover es teal oscuro: nunca más claro.
3. El color nunca es la única señal. Las etiquetas llevan texto («Reservado») y los errores llevan mensaje.
4. Las zonas táctiles miden al menos **44 × 44 px** (ya se cumple en botones, ×, pines y controles del mapa).

---

## 4. Tipografía

### 4.1 Familias **[En uso]**

| Rol | Familia | Por qué | Carga |
|---|---|---|---|
| Interfaz y titulares | **Plus Jakarta Sans** | Geométrica, cálida y muy legible en celular. El peso 800 da carácter a precios y titulares sin aumentar el tamaño. | `next/font/google`, versión variable 200–800 (un solo archivo) |
| Datos y etiquetas | **DM Mono** | Aporta el registro de «ficha técnica»: etiquetas, contadores y el descriptor del logotipo. | `next/font/google`, pesos 400 y 500 |

Respaldo: `Arial, sans-serif` y `monospace`. No se usan otras familias.

### 4.2 Jerarquía

| Estilo | Tamaño | Peso | Interlineado | Interletraje | Uso |
|---|---|---|---|---|---|
| H1 / display | clamp(30 px, 4vw, 48 px) | 800 | 1,08 | −0,045 em | Título del inmueble, páginas de zona |
| H2 | clamp(22 px, 3vw, 28 px) | 800 | 1,15 | −0,03 em | Secciones de página |
| H3 | 20 px | 800 | 1,2 | −0,02 em | Secciones de la ficha («Características», «Ubicación») |
| H4 | 17 px | 700 | 1,3 | −0,01 em | Títulos de tarjeta, bloques |
| H5 | 15 px | 700 | 1,35 | 0 | Títulos de lista |
| H6 | 13 px | 700 | 1,4 | 0 | Subtítulos menores |
| Precio XL | 28 px | 800 | 1,1 | −0,02 em | Precio en la ficha (teal) |
| Precio | 16–19 px | 800 | 1,2 | 0 | Precio en tarjetas y pines (teal) |
| Cuerpo grande | 18 px | 400 | 1,55 | 0 | Introducciones |
| Cuerpo | 16 px | 400 | 1,65 | 0 | Descripción del inmueble |
| Cuerpo pequeño | 14 px | 400 | 1,55 | 0 | Textos de apoyo |
| Interfaz | 13 px | 700 | 1,3 | 0 | Botones, navegación, chips |
| Nota | 12 px | 500 | 1,4 | 0 | Ubicación, ayudas (mínimo de lectura) |
| Etiqueta | 11 px DM Mono | 500 | 1,3 | +0,06 em, mayúsculas | «COMPRAR · CASAS», etiquetas de estado |

**Reglas:**
- Los titulares usan `text-wrap: balance`.
- Los párrafos no superan unos **70 caracteres** por línea.
- Los precios se escriben siempre con el formato del sistema: `US$ 320,000` y `S/ 1,800`, con espacio después del símbolo.
- Las cifras alineadas en tablas usan `font-variant-numeric: tabular-nums`.
- Nada de texto de lectura en DM Mono por encima de 2 líneas: es para datos, no para párrafos.

---

## 5. Recursos gráficos y estilo visual

### 5.1 Iconografía
**Hoy [En uso]:** los atributos se marcan con caracteres de texto (`▧` área, `⌂` dormitorios, `♧` baños, `▣` estacionamientos) y el pin con `⌂ ▥ ⌖ ▣ ▤` según el tipo. Funcionan sin descargar nada, pero no forman una familia coherente y varían según el sistema operativo.

**Norma [Nuevo]:** un solo juego de íconos lineales, **Lucide**:

| Parámetro | Valor |
|---|---|
| Retícula | 24 px (se muestra a 16, 20 o 24 px) |
| Trazo | 1,75 px, sin rellenos |
| Extremos y uniones | Redondeados |
| Color | Teal en atributos y acciones; gris texto en información secundaria |
| Etiqueta | Todo ícono informativo lleva texto o `aria-label` |

| Amenidad | Ícono Lucide |
|---|---|
| Área (m²) | `maximize-2` |
| Dormitorios | `bed-double` |
| Baños | `bath` |
| Estacionamientos | `car` |
| Ubicación | `map-pin` |
| Pisos | `layers` |
| Casa / Departamento / Terreno / Oficina / Local | `house` / `building-2` / `land-plot` / `briefcase` / `store` |
| Llamar / WhatsApp | `phone` / logotipo oficial de WhatsApp (solo en su botón) |

### 5.2 Dirección de arte fotográfica

| Aspecto | Norma |
|---|---|
| Luz | Natural, de día, con cortinas abiertas y luces interiores encendidas. Sin flash directo. Exteriores con cielo despejado: en Piura, entre las 8:00 y las 10:00 o después de las 16:00 para evitar sombras duras. |
| Encuadre | Horizontal 4:3 (la galería recorta a 4:3). Cámara a la altura del pecho, en vertical recta, sin inclinar. Primero la fachada; luego sala, cocina, dormitorio principal, baños y extras. |
| Orden | La **portada** debe ser la foto más representativa: fachada para casas y locales, vista del lote con referencia para terrenos. |
| Calidad | Mínimo 1200 px de ancho. Enfocada, sin filtros de color ni marcas de agua de terceros. |
| Contenido | Espacios ordenados, sin personas reconocibles ni placas de vehículos. Nada de documentos, fotos familiares ni pantallas con datos personales. |
| Tratamiento | Solo correcciones naturales (enderezar, exposición, balance de blancos). Prohibido alterar el inmueble: cielos reemplazados, muebles agregados o ambientes inexistentes. |
| Técnica **[En uso]** | La web redimensiona y convierte a WebP automáticamente (320, 640 y 1200 px). El anunciante no necesita optimizar nada. |
| Sin foto | Se muestra el ícono del tipo sobre un degradado de teal claro y la leyenda «Sin fotografía». Nunca se usa una foto de archivo o genérica. |

### 5.3 Retícula, espaciado, radios y sombras **[En uso]**

**Retícula**
- Contenedor máximo de 1180 px.
- Margen lateral de 16 px en celular y de 24 a 32 px en escritorio.
- **Portada:** panel de resultados de 370 a 460 px más el mapa.
- **Ficha:** dos columnas, 1,15 fr de galería y 0,85 fr de datos. En celular, una sola columna.

**Espaciado**
- Base de 4 px.
- Escala: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 72.
- Entre tarjetas, 12 a 18 px. Dentro de una sección de la ficha, 20 a 25 px.

**Radios**

| Token | Valor | Uso |
|---|---|---|
| xs | 8 px | Miniaturas, botones compactos |
| sm | 12 px | Inputs, buscador, atributos |
| md | 16 px | Tarjetas de listado, panel lateral |
| lg | 18 px | Secciones de la ficha |
| xl | 22 px | Galería principal, formularios |
| pill | 999 px | Botones principales, chips, pines, etiquetas |

**Sombras** (siempre teñidas de verde, nunca negras puras salvo en controles sobre el mapa)

| Token | Valor | Uso |
|---|---|---|
| card | `0 5px 18px rgba(11,118,110,.09)` | Tarjeta en hover o seleccionada |
| raised | `0 8px 30px rgba(23,59,53,.07)` | Formularios y paneles |
| pin | `0 5px 16px rgba(23,59,53,.16)` | Pines de precio |
| float | `0 3px 14px rgba(0,0,0,.2)` | Controles flotantes sobre el mapa |
| drawer | `0 14px 45px rgba(23,59,53,.25)` | Panel de detalle |

---

## 6. Identidad verbal

### 6.1 Personalidad y tono
Inmuebles Directos habla como **un vecino que sabe de inmuebles**: profesional, cercano, directo y resolutivo.

| Somos | No somos |
|---|---|
| Claros: decimos el precio y el paso siguiente | Vendedores insistentes |
| Cercanos: tuteamos, usamos referencias locales | Informales o con jerga |
| Directos: frases cortas, verbos de acción | Burocráticos o legales sin necesidad |
| Resolutivos: cada error dice cómo arreglarse | Alarmistas o vagos («Algo salió mal») |

**Reglas de redacción:**
- **Tuteo** en toda la interfaz.
- **Botones** en infinitivo o imperativo breve, que digan exactamente qué pasa: «Publicar gratis», «Guardar cambios», «Ver ficha completa».
- **Errores** que dicen qué pasó y qué hacer, sin culpar ni disculparse en exceso.
- **Cifras y referencias locales** antes que adjetivos: «a 2 cuadras del Óvalo Grau» mejor que «excelente ubicación».

### 6.2 Ejemplos

**Eslogan:** «Mira el precio en el mapa. Habla directo con el dueño.»

**Variantes cortas:** «Tu próximo inmueble, sin intermediarios.» · «Publica gratis. Te contactan directo.»

**Titulares para el inicio**
- «Inmuebles en venta y alquiler en Piura» **[En uso]**: el H1 actual, pensado para Google.
- «Casas, terrenos y locales con el precio sobre el mapa»
- «¿Vendes o alquilas? Publica gratis en 5 minutos»

**Microcopy**

| Lugar | Texto |
|---|---|
| Buscador (placeholder) | «Buscar propiedad, ciudad o provincia» **[En uso]** |
| Botón principal | «Publicar gratis» **[En uso]** |
| Tarjeta | «Ver detalles» · «Ficha completa» **[En uso]** |
| Contacto | «Llamar» · «WhatsApp» **[En uso]** |
| Sin resultados | «No encontramos propiedades con esos filtros.» **[En uso]** + «Prueba con otra zona o quita un filtro.» **[Nuevo]** |
| Ubicación al publicar | «Arrastra el puntero para fijar el punto en el mapa.» **[En uso]** |
| Tras publicar | «Propiedad publicada. Su ficha ya está visible; en el mapa del inicio puede tardar hasta un minuto en aparecer.» **[En uso]** |
| Error de conexión | «No pudimos conectar con el servidor. Inténtalo de nuevo.» **[En uso]** |

**WhatsApp**
- **Mensaje prellenado al anunciante [En uso]:** «Hola, vi tu propiedad "{título}" en Inmuebles Directos y quisiera más información.»
- **Al compartir un anuncio [En uso]:** «{título} · {enlace}»
- **Al compartir, versión sugerida [Nuevo]:** «🏠 {título} — {precio} en {zona}. Míralo en el mapa: {enlace}»

**Redes sociales (ejemplos)**
- *Nuevo anuncio:* «Nuevo en Castilla, Piura: terreno de 160 m² en Miraflores Country Club por US$ 75,000. Precio a la vista y contacto directo con el dueño 👉 {enlace}»
- *Para propietarios:* «¿Tienes un inmueble para vender o alquilar? Publícalo gratis, fija el punto en el mapa y recibe llamadas directas. Sin comisiones de la plataforma.»
- *Educativo:* «Antes de visitar un inmueble, revisa en el mapa qué tiene cerca: colegios, mercados y avenidas. En Inmuebles Directos lo ves todo en una pantalla.»

### 6.3 Glosario

| Preferimos | Evitamos | Por qué |
|---|---|---|
| Inmueble, propiedad | «Listing», «property», «bien raíz» en la interfaz | Español claro y local |
| Anuncio | Publicación (en la interfaz), aviso | Coherencia con «Mis propiedades» y «Ficha» |
| Ficha | Detalle, página del inmueble | Es el nombre en uso («Ficha completa») |
| Anunciante, propietario | Cliente, usuario (en textos públicos) | Habla de la persona |
| Comprar · Alquilar (filtros) / Venta · Alquiler (etiquetas) | Renta, arriendo en la interfaz | Así busca la gente en Piura; «renta» se entiende, pero no es nuestro término |
| Publicar gratis | «Sin costo», «free» | Es la promesa, dicha siempre igual |
| Directo, sin intermediarios | «Sin comisión» como absoluto | No controlamos lo que cobra un agente; decimos lo que hace el portal |
| Reservado, Vendido, Alquilado, No disponible | «Ya no está», «Ocupado» | Son los estados reales del sistema |
| m² | m2, mts, metros² | Unidad correcta |
| S/ 1,800 · US$ 75,000 | S/. · $ a secas · USD 75000 | Formato del sistema |

**Palabras a evitar:** «oportunidad única», «ganga», «¡no te lo pierdas!», «haz clic aquí», «inmobiliaria» (no lo somos), y cualquier promesa que el portal no controle («precio garantizado», «trámite asegurado»).

---

## 7. Aplicaciones y reglas de uso

### 7.1 Encabezado web **[En uso]**
- Fondo blanco con borde inferior de línea.
- **Escritorio:** logotipo a la izquierda, buscador de 44 px de alto (radio 12 px) y navegación a la derecha: «Publicar gratis» como píldora teal, «Explorar mapa» e «Iniciar sesión» o el nombre del usuario.
- **Celular:** logotipo, botón «Publicar gratis» y menú (☰). El buscador baja a una segunda fila a todo el ancho.
- Debajo, los filtros rápidos en píldoras: Todo, Comprar, Alquilar, Casas… El filtro activo va en teal con texto blanco.

### 7.2 Tarjeta de listado **[En uso]**
- Fondo blanco, borde de línea y radio de 13 a 16 px. En hover, borde `#60b9aa` y sombra *card*.
- **Foto:** a la izquierda (104 × 116 px; 82 × 88 en celular), con la etiqueta de operación abajo a la izquierda y «Reservado» arriba a la derecha.
- **Contenido, en este orden:**
  1. precio (teal 800);
  2. título (H4, máximo 2 líneas), enlazado a la ficha;
  3. zona (nota, gris);
  4. tipo;
  5. atributos (m², hab., baños, est.).
- **Acción:** «Ver detalles» abre el panel sin salir del mapa.

### 7.3 Ficha de propiedad **[En uso]**
1. Ruta de navegación: Inicio › Operación › Ciudad › Título.
2. Galería 4:3 con radio xl y miniaturas.
3. Resumen: etiqueta DM Mono, H1, precio XL y ubicación.
4. Características en cuadrícula de 3 columnas (2 en celular).
5. Descripción.
6. Mapa.
7. Publicación: avatar con inicial, nombre abreviado, fecha y sello verificado.
8. Contacto («Llamar» y «WhatsApp»).
9. Compartir.
10. «Más inmuebles en {zona}».
11. Denunciar.

Si el anuncio no está publicado, su URL muestra la ficha de cierre («Vendido» o «Alquilado») o «No disponible por ahora», siempre sin teléfono.

### 7.4 Pin del mapa **[En uso]**
- Píldora blanca de 38 px de alto, borde `#dce8e4`, sombra *pin* y relleno horizontal de 12 px.
- Contiene el ícono del tipo y el **precio** (Plus Jakarta 700, 11 px, teal).
- La punta queda sobre el punto exacto; el pin se ancla en su borde inferior.
- **Nunca** se cambia el pin por el isotipo ni se ocultan los precios.
- **[Nuevo]** Pin seleccionado: fondo teal con texto blanco (4,91:1).
- **[Nuevo]** Pin «Destacado» (si se lanza): fondo forest con texto mint.

### 7.5 Redes sociales
- **Imagen para compartir la portada [En uso]:** `public/og-inicio.jpg`, 1200 × 630, con el logotipo, el titular, las categorías y un mapa con precios.
- **Formatos [Nuevo]:**
  - Instagram y Facebook: 1080 × 1350 (4:5) para anuncios, con la foto del inmueble a sangre y una franja inferior blanca de 300 px (precio en teal y zona en tinta).
  - Historias: 1080 × 1920, con el isotipo negativo en una esquina dentro de su área de protección.
- **Perfil:** `isotipo.svg` sobre blanco, o `isotipo-teal.svg` si la plataforma recorta en círculo.
- **Texto sobre foto:** siempre sobre una franja sólida (blanco o forest), nunca directamente sobre la imagen.

### 7.6 Papelería digital y firma de correo **[Nuevo]**

Firma de correo en texto HTML simple, sin imágenes de fondo:

```
Nombre Apellido
Equipo de Inmuebles Directos
inmueblesdirectosperu.com · WhatsApp +51 9XX XXX XXX
Piura, Perú
```

- **Nombre:** Plus Jakarta Sans o Arial, 14 px, 700, tinta.
- **Segunda línea:** 13 px, gris texto.
- **Enlace:** teal.
- **Isotipo:** a 32 px a la izquierda, opcional.
- **Prohibido:** frases motivacionales, banners animados y más de 4 líneas.

**Documentos PDF** (guías, contratos de ejemplo):
- márgenes de 20 mm;
- logotipo arriba a la izquierda a 30 mm;
- H1 de 28 pt;
- cuerpo de 11 pt Plus Jakarta Sans;
- pie con la URL en DM Mono a 8 pt.

Ejemplo vigente: `Guia-practica-Inmuebles-Directos-Piura.pdf`.

### 7.7 Checklist antes de publicar una pieza o una vista nueva

**Marca**
- [ ] El logotipo y el isotipo respetan los colores, el área de protección y el tamaño mínimo.
- [ ] Solo aparecen colores de la paleta (`design/brand-tokens.json`); nada de literales nuevos en el CSS.
- [ ] Solo se usan Plus Jakarta Sans y DM Mono, con la jerarquía de la sección 4.

**Accesibilidad**
- [ ] El texto de lectura tiene contraste de 4,5:1 o más; el texto grande, íconos y bordes, de 3:1 o más.
- [ ] Ningún texto de lectura usa teal sobre teal claro ni mint sobre fondos claros.
- [ ] Hay foco visible con teclado y las zonas táctiles miden 44 px o más.
- [ ] Las imágenes informativas tienen texto alternativo y las decorativas llevan `alt=""`.

**Contenido**
- [ ] Los precios usan el formato `US$ 320,000` / `S/ 1,800`.
- [ ] Los textos tutean, son breves y usan el glosario (sección 6.3).
- [ ] Los botones dicen exactamente qué hacen; los errores dicen cómo resolverse.
- [ ] No hay datos personales visibles en fotos ni capturas (teléfonos, documentos, placas).

**Web**
- [ ] Funciona a 375 px de ancho sin desplazamiento horizontal.
- [ ] Las fotos pasan por `/api/property-images/{id}?w=…`, con `width` y `height`.
- [ ] La página tiene título (60 caracteres o menos), descripción, canonical y H1 únicos.
- [ ] Las pruebas automáticas pasan (`npm test`) y PageSpeed móvil no empeora.

---

## Anexo · Correcciones pendientes en la web
Detectadas al redactar este manual. Son pequeñas y no cambian la identidad:

1. **Foco:** reemplazar `outline: 3px solid #55c4b2` (2,12:1) por `#087f70` en todos los `:focus-visible`.
2. **Teal sobre teal claro:** contadores de `.landing-related b` y etiqueta `.is-closed .closed-listing-badge` → `color: #075f56`.
3. **Variables:** declarar en `:root` los tokens nuevos (`--forest`, `--mint`, `--slate`, `--border`, `--canvas`, semánticos) y reemplazar los literales equivalentes.
4. **Íconos:** sustituir los caracteres `▧ ⌂ ♧ ▣` por íconos Lucide (sección 5.1).
5. **Etiquetas de operación:** aplicar los colores de «Venta» y «Alquiler» de la sección 3.4.
6. **Logotipo:** exportar el logotipo a SVG con el texto convertido en trazos para usos fuera de la web.
