# Guía de SEO de ESCENABMX

Estado al 26-oct-2026. Este archivo vive en `tools/` y **no se publica** en el sitio.

## 1. Qué ya está funcionando

| Qué | Dónde | Cómo se mantiene |
|---|---|---|
| Páginas por categoría (30) | `/categoria/<cat>` | Se regeneran solas en cada despliegue (`tools/generate-seo-pages.py`) |
| Páginas por marca (29) | `/marca/<marca>` | Igual. Una marca necesita 4+ productos |
| Sitemap de esas páginas | `/sitemap-landing.xml` | Automático; anunciado en `robots.txt` |
| Feed para Google Shopping | `/merchant-feed.xml` | Automático (`tools/generate-merchant-feed.py`), 376 productos |
| Eventos de conversión | `whatsapp_click`, `generate_lead` | `assets/js/analytics.js` (solo con cookies de analítica aceptadas) |
| Título de la home con marca + ciudad | `index.html` | Manual |
| `ropa` y `tenis` fuera de Google | `noindex` + sin sitemap | Quitar `noindex` cuando tengan productos |

Las páginas nuevas usan el mismo diseño de la tienda. Para cambiar el texto de una categoría, edita el diccionario `CATS` en `tools/generate-seo-pages.py`.

## 2. Pendiente de ustedes (una sola vez)

### Search Console
1. Sitemaps → agregar `sitemap-landing.xml` (el `sitemap.xml` ya está).
2. Inspección de URL → "Solicitar indexación" para: `/inicio`, `/categoria/stems`, `/categoria/manubrios`, `/categoria/horquillas`, `/categoria/manzana-trasera`, `/categoria/bielas`, `/marca/cult`, `/marca/federal`.
3. En una semana: Indexación → Páginas, revisar que las ~60 URLs nuevas estén "Indexadas".

### GA4
1. Admin → Eventos: esperar a que aparezcan `whatsapp_click` y `generate_lead` (24–48 h después de que alguien acepte cookies y haga clic).
2. Marcar ambos como **evento clave** (interruptor "Marcar como evento clave"). Son las conversiones reales: la venta se cierra por WhatsApp.

### Google Merchant Center (compras gratis en Google)
1. Crear cuenta en merchants.google.com con la cuenta de Google del negocio. País: Colombia.
2. Verificar y reclamar el sitio `escenabmx.com` (se puede reutilizar la verificación de Search Console).
3. Productos → Feeds → nuevo feed → tipo "Búsqueda programada" → URL `https://escenabmx.com/merchant-feed.xml` → una vez al día.
4. Configurar **envíos** y **devoluciones** en la cuenta (Google las exige y el sitio cotiza el envío por destino, por eso no van en el archivo). La política de devoluciones del sitio está en `/devoluciones`.
5. Activar el programa "Fichas gratuitas" (listados orgánicos).

## 3. Perfil de Google Business (lo que más mueve "tienda BMX Bogotá")

Revisar uno por uno en business.google.com:
- [ ] Nombre exactamente igual a la marca: **ESCENABMX** (sin palabras clave añadidas).
- [ ] Categoría principal: la más cercana a *Tienda de bicicletas*; adicionales: *Taller de reparación de bicicletas*, *Tienda de artículos deportivos* (si aplica).
- [ ] Dirección y teléfono **idénticos** a los del sitio: Calle 51a Sur #81i-53, Villa Andrea/Kennedy, Bogotá · +57 310 763 0504.
- [ ] Horario completo, incluido **domingo y festivos** (hoy el sitio dice domingos 10 am–3 pm: confirmar y que coincida en ambos lados).
- [ ] Enlace al sitio con parámetros para medir: `https://escenabmx.com/inicio?utm_source=google&utm_medium=organic&utm_campaign=perfil`
- [ ] Servicios: mantenimiento de bicicletas, montaje, asesoría de partes BMX.
- [ ] 15+ fotos reales: fachada, interior, el taller, el equipo, productos. Subir 2–3 nuevas cada semana.
- [ ] Una publicación por semana (producto nuevo, promo, evento del Team).
- [ ] Preguntas y respuestas: cargar las 5 más comunes (envíos, formas de pago, garantía, taller, horario).

## 4. Reseñas

Meta: llegar a **50+ reseñas** con 4,5★ o más en 3 meses.
1. En el perfil: "Pedir reseñas" → copiar el enlace corto y generar el QR. Poner el QR en el mostrador y en las bolsas.
2. Mensaje para enviar por WhatsApp **al entregar el pedido** (no antes):

> Hola, ¡gracias por tu compra en ESCENABMX! 🙌 Si quedaste contento, nos ayudas muchísimo con una reseña de 1 minuto: [ENLACE]. Si algo no quedó perfecto, respóndeme este mensaje y lo solucionamos.

3. Responder **todas** las reseñas en menos de 48 h, también las malas, con nombre y sin copiar y pegar.
4. Nunca pagar, regalar descuentos a cambio ni escribir reseñas falsas: Google las elimina y puede suspender el perfil.
5. Cuando haya reseñas reales, se agregan a la home y al `aggregateRating` del schema (hoy no se muestra ninguna calificación para no inventar datos).

## 5. Contenido (blog)

Hoy hay 5 artículos de ~2.600 palabras. Ritmo recomendado: **2 al mes**. La elección final de palabras clave espera la decisión de vocabulario (¿"stem/manubrio/horquilla" o "caña/timón/tenedor"?; mientras tanto los títulos usan las dos). Cada artículo debe enlazar a 2–3 páginas de `/categoria/` y a los productos que menciona.

| # | Tema | Intención de búsqueda | Enlazar a |
|---|---|---|---|
| 1 | Cómo armar una BMX desde cero: orden y piezas | Informativa | `/armar-bmx`, categorías de marco, ruedas |
| 2 | Qué talla de BMX necesito según mi estatura | Informativa | `/categoria/bicicletas`, `/categoria/marcos` |
| 3 | Cassette vs freecoaster: cuál elegir | Comparativa | `/categoria/manzana-trasera` |
| 4 | Guía de platos: cuántos dientes usar en freestyle | Informativa | `/categoria/pinones`, `/categoria/cadenas` |
| 5 | Bielas de 2 y 3 piezas, ejes 19 y 22 mm | Informativa | `/categoria/bielas`, `/categoria/caja-centro` |
| 6 | Cómo elegir llantas BMX para street y parque | Informativa | `/categoria/llantas`, `/categoria/rines` |
| 7 | Primera BMX para un niño: rin 16, 18 o 20 | Informativa | `/categoria/bicicletas` |
| 8 | Qué protecciones usar en el skatepark | Informativa | `/categoria/cascos`, `/categoria/guantes` |
| 9 | Cómo elegir tabla de skate: medidas, trucks y ruedas | Informativa | `/categoria/skate-tablas`, `/categoria/skate-trucks` |
| 10 | Mantenimiento básico de tu BMX cada mes | Informativa | `/agendar` (taller), `/categoria/herramientas` |
| 11 | Dónde comprar partes BMX originales en Bogotá | Local / comercial | `/tienda`, perfil de Google |
| 12 | Marcas de BMX: guía para saber cuál elegir | Comparativa | `/marca/*` |

## 6. Cómo medir (línea base al 25-oct-2026)

| Métrica | Hoy | Dónde |
|---|---|---|
| Clics desde Google | 226 | Search Console → Rendimiento |
| Impresiones | 1.431 | Search Console |
| Posición promedio | 5,3 | Search Console |
| Clics de consultas que NO son de marca | muy pocos (en las 5 consultas principales solo "partes de bmx": 3 clics, posición 14) | Search Console, consultas sin "escena" |
| Sesiones desde búsqueda orgánica | 301 | GA4 → Adquisición de tráfico |
| Clics en WhatsApp | sin medir | GA4 → `whatsapp_click` (nuevo) |

Revisar cada 30 días: impresiones y clics de **consultas sin "escena"** (la cifra clave: hoy casi todo el tráfico es de gente que ya los conoce), cuántas URLs de `/categoria` y `/marca` aparecen en el informe de páginas, clics en WhatsApp y llamadas/rutas del perfil de Google Business. Con los primeros 60 días de datos se afina el vocabulario de títulos.

## 7. Datos del catálogo por limpiar (afectan las páginas de marca)
- La marca **"STL"** (5 productos) parece ser **Stolen** mal escrita: unificar en el admin. Mientras tanto la página de STL no se genera.
- Varios productos tienen en "marca" un precio (`130000`, `85000`…) o están vacíos (4): corregir en el admin.
- "Skate Ter" y "Skate Terror" son la misma marca.
- "Generico" no es marca: dejarlo vacío.

## 8. Siguientes mejoras (no hechas todavía)
- Cambiar los enlaces del menú desplegable del header (hoy `tienda?cat=…`) para que apunten a `/categoria/…` en las 580 páginas. Es el mayor empujón de enlaces internos; requiere además una regla de respaldo en `.htaccess`.
- Que las migas de pan de cada producto pasen por su categoría (Inicio › Cañas › Producto).
- Descripciones únicas para los 30 productos más vistos cuando haya datos de Search Console.
- Ropa y tenis: indexar cuando tengan productos.
