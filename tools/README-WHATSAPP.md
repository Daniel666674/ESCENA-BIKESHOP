# Medición de ventas por WhatsApp (ESCENABMX)

Este archivo vive en `tools/` y **no se publica** en el sitio.

El sitio no tiene checkout: la venta se cierra en un chat. Para atribuir ingresos hay que unir tres puntos: **el clic**, **el chat** y **la venta cerrada**. La pieza que los une es la **Ref**.

## Cómo funciona

1. Cada vez que alguien entra a WhatsApp desde la web (botón de compra, botón flotante, header, footer, blog, páginas del Team, carrito) el mensaje prellenado termina con una Ref única:
   `Ref: EB-7K3QX`. En el carrito la Ref es el número de pedido (`Pedido #ESC-261103-171`).
2. En ese mismo instante se registra el clic con: Ref, botón, página, producto(s), valor, fuente de tráfico (Instagram, Google orgánico, directo, campaña).
3. El equipo ve la Ref en el chat. Cuando la venta se cierra se anota **Ref + valor real cobrado**. Eso une el ingreso con el botón, el producto y la fuente del clic.

Sin el paso 3 no hay ingresos atribuidos: ninguna herramienta puede adivinar una venta que ocurre dentro de WhatsApp.

## Qué está hecho (fase 1, en el código)

`assets/js/analytics.js` (v4) y `assets/js/cart.js` (v15):

| Evento GA4 | Cuándo | Datos |
|---|---|---|
| `view_item` | Se abre una ficha de producto | producto, marca, precio |
| `add_to_cart` | Botón "Agregar al carrito" | producto, precio, cantidad |
| `whatsapp_click` | Cualquier entrada a WhatsApp | `wa_ref`, `click_location`, `product`, `page_path`, `source_name`, `source_medium`, `source_campaign` |
| `generate_lead` | El mismo clic, con valor | todo lo anterior + `value`, `currency: COP`, `items[]` |

`click_location`: `product_buy` · `product_page` · `float` · `header` · `footer` · `cart` · `blog` · `team` · `other`.

Los eventos de GA4 solo salen si el visitante acepta cookies de analítica. La Ref en el mensaje sale siempre.

## Pendiente en GA4 (una sola vez, ~10 min)

1. Administrar → Definiciones personalizadas → crear dimensiones de **evento** para: `wa_ref`, `click_location`, `product`, `source_name`, `source_medium`, `source_campaign`.
2. Administrar → Eventos → marcar `generate_lead` como **evento clave** (y quitar la marca a `whatsapp_click` si se quiere contar solo una conversión por clic).
3. Con 24–48 h de datos: Informes → Monetización → Compras de comercio electrónico muestra el embudo `view_item` → `add_to_cart` → `generate_lead`.

## Siguientes fases (necesitan decisiones)

**Fase 2: libro de clics y ventas propio (primer plano, sin cookies).** Un Worker de Cloudflare en TypeScript con base D1 que:
- recibe cada clic (la variable `LEDGER_URL` de `analytics.js`, hoy vacía),
- cuenta **todos** los clics, también los de quien rechaza cookies, porque no lleva identificadores personales,
- expone un endpoint para registrar la venta cerrada (Ref + valor + productos reales).

**Fase 3: registrar ventas.** Una pantalla "Ventas" en el panel `admin.html`: se escribe la Ref que aparece en el chat y el valor cobrado (opcional: productos). Es lo que cierra el círculo.

**Fase 4: el visual.**
- Panel en el admin: clics → chats → ventas → ingresos, por botón, producto, categoría y fuente; tasa de cierre; ventas sin Ref (para medir cuánto se escapa).
- Al registrar una venta, el Worker envía un `purchase` a GA4 (Measurement Protocol, `transaction_id` = Ref) para ver ingresos también en GA4 y en Looker Studio.

## Límites que conviene conocer

- Un clic no es un chat: hay quien toca el botón y no escribe. Por eso la Ref mide "chats que llegaron con Ref" cuando alguien la registra al responder.
- Quien borra la línea "Ref" del mensaje antes de enviarlo llega sin Ref. Se registra la venta igual como "sin Ref" y se ve cuánto pesa.
- GA4 solo atribuye una compra a una visita si el evento llega cerca del clic. Para ventas cerradas días después, el atribuido confiable es el del libro propio (Fase 2), no el de GA4.
