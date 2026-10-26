#!/usr/bin/env python3
"""Build crawlable landing pages for every product category and brand.

Why this exists: the store pages (tienda/skate/protecciones) filter the catalog
in the browser (`tienda?cat=bielas`), and every filtered view canonicals to the
bare store URL — so Google has no page it can rank for "bielas BMX Colombia" or
"Cult BMX Bogotá". This script writes one real, static HTML page per category
and per brand:

    categoria/<cat>.html     e.g. /categoria/stems      (>= MIN_CAT_PRODUCTS products)
    marca/<brand>.html       e.g. /marca/cult           (>= MIN_BRAND_PRODUCTS products)
    sitemap-landing.xml      listed in robots.txt next to sitemap.xml

Each page is the existing store page (same design, cart, filters, header and
footer) with: its own <title>/description/canonical, an H1, a short intro, the
full product list already in the HTML, CollectionPage + BreadcrumbList + ItemList
JSON-LD, and links to every other category/brand. `window.ESCENA_LANDING` tells
the store's JS to open already filtered.

Run on every deploy (see .github/workflows/deploy.yml) so the pages follow the
catalog admin.html publishes. The output is also committed so a failed run can
never leave the home page linking to missing pages. Re-running is idempotent.
"""
import html
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://escenabmx.com"
PRODUCTS_JS = ROOT / "assets/js/products-data.js"
MIN_CAT_PRODUCTS = 3
MIN_BRAND_PRODUCTS = 4
# Pages the home page links to must never disappear (a sold-out week would otherwise
# turn those links into 404s), so they are generated from a single product up.
PINNED_CATS = {"stems", "manubrios", "horquillas", "manzana-trasera", "skate-lijas", "skate-trucks"}
# Not real brands: placeholders / data-entry variants in the catalog. ("STL" is how some
# Stolen products were typed — merge it into "Stolen" in the admin, then drop it here.)
SKIP_BRANDS = {"generico", "genericos", "stl"}

# base page -> (file, breadcrumb label, breadcrumb url)
BASES = {
    "tienda": ("tienda.html", "Tienda", "tienda"),
    "skate": ("skate.html", "Skate", "skate"),
    "protecciones": ("protecciones.html", "Protecciones", "protecciones"),
}

# ----------------------------------------------------------------------------
# Category copy. `title` is the keyword phrase (both common names where Colombian
# riders use two: caña/stem, timón/manubrio, tenedor/horquilla...). `intro` is
# deliberately plain buying guidance — no brand or spec claims the catalog can't back.
# ----------------------------------------------------------------------------
CATS = {
    "bicicletas": dict(base="tienda", chip="Bicicletas", h1="Bicicletas BMX", title="Bicicletas BMX",
        intro='Bicicletas BMX completas para freestyle, street y parque, listas para rodar. Fíjate en el rin (16, 18 o 20 pulgadas) según la estatura del rider, y si prefieres elegir cada pieza usa nuestro configurador <a href="armar-bmx">Arma tu BMX</a>.'),
    "marcos": dict(base="tienda", chip="Marcos", h1="Marcos BMX (Frames)", title="Marcos BMX (Frames)",
        intro="El marco es la base de toda BMX: define la geometría, el largo del top tube y qué tan estable o ágil se siente la bici. Aquí encuentras marcos de distintas marcas y medidas para street, parque y dirt. Si dudas del largo ideal para tu estatura, escríbenos por WhatsApp."),
    "stems": dict(base="tienda", chip="Cañas (Stems)", h1="Cañas BMX (Stems)", title="Cañas BMX (Stems)",
        intro="La caña, también conocida como stem, une el timón con el tenedor y define el alcance de la bici. Las de carga frontal (front load) permiten instalar el timón por delante y las de carga superior (top load) por arriba, con un perfil más compacto. Revisa el alcance (reach) y la compatibilidad con tu timón antes de elegir."),
    "manubrios": dict(base="tienda", chip="Timones (Manubrios)", h1="Timones BMX (Manubrios)", title="Timones BMX (Manubrios)",
        intro="El timón, o manubrio, define la altura y el ancho de tu agarre. En BMX freestyle los hay de 2 piezas y de 4 piezas, con distintas alturas y curvaturas. Elige según tu estilo y tu estatura, y confirma que tu caña sea compatible con su diámetro."),
    "horquillas": dict(base="tienda", chip="Tenedores (Horquillas)", h1="Tenedores BMX (Horquillas)", title="Tenedores BMX (Horquillas)",
        intro='El tenedor, también llamado horquilla, sostiene la rueda delantera y recibe el impacto de cada aterrizaje. Revisa el tamaño del eje delantero (3/8" o 14 mm), el offset y que el tubo de dirección sea compatible con tu marco.'),
    "bielas": dict(base="tienda", chip="Bielas (Cranks)", h1="Bielas BMX (Cranks)", title="Bielas BMX (Cranks)",
        intro="Las bielas transmiten tu pedaleo al plato. Se consiguen de 2 y de 3 piezas, con ejes de 19 mm o 22 mm según la caja de centro de tu marco, y en distintas longitudes. Confirma el eje y el tipo de caja de centro antes de comprar."),
    "manzana-delantera": dict(base="tienda", chip="Manzanas delanteras", h1="Manzanas Delanteras BMX (Bujes)", title="Manzanas Delanteras BMX (Bujes)",
        intro='La manzana delantera, o buje delantero, es el centro de la rueda de adelante. Verifica que el eje sea compatible con tu tenedor (3/8" o 14 mm) y que el número de huecos (36 es lo más común) coincida con el de tu rin.'),
    "manzana-trasera": dict(base="tienda", chip="Manzanas traseras y Cassettes", h1="Manzanas Traseras y Cassettes BMX (Bujes)", title="Manzanas Traseras y Cassettes BMX",
        intro="La manzana trasera, o buje trasero, puede ser tipo cassette o freecoaster. El cassette transmite el pedaleo de forma directa y es el más común en BMX; el freecoaster permite girar los pedales hacia atrás sin que la rueda retroceda. Revisa el número de huecos y el lado (derecho o izquierdo) antes de elegir."),
    "rines": dict(base="tienda", chip="Rines (Aros)", h1="Rines BMX (Aros)", title="Rines BMX (Aros)",
        intro="El rin, o aro, es la estructura de la rueda. Los hay en aluminio, con distintos anchos y número de huecos (36 es lo más común). Confirma el diámetro, los huecos y que coincida con tu manzana."),
    "llantas": dict(base="tienda", chip="Llantas", h1="Llantas BMX", title="Llantas BMX",
        intro="Llantas para BMX en distintos anchos y diseños de taco: más lisas y rápidas para pista y parque, o más anchas y con más agarre para street. Mira el ancho y la presión máxima impresa en el costado de la llanta."),
    "pinones": dict(base="tienda", chip="Platos (Piñones)", h1="Platos BMX (Piñones)", title="Platos BMX (Piñones)",
        intro="El plato es el engranaje que va en las bielas y, junto con el piñón trasero, define la relación de transmisión. Los más usados en freestyle van de 25 a 28 dientes. Elige según tu estilo y revisa que sea compatible con tus bielas y tu cadena."),
    "cadenas": dict(base="tienda", chip="Cadenas", h1="Cadenas BMX", title="Cadenas BMX",
        intro="Cadenas para BMX de una sola velocidad, en distintos colores y acabados. Verifica que el ancho y el largo coincidan con tu plato y tu piñón: una cadena en buen estado también alarga la vida de los dientes."),
    "pedales": dict(base="tienda", chip="Pedales", h1="Pedales BMX", title="Pedales BMX",
        intro='Pedales de plataforma para BMX en aluminio, nylon y otros materiales, con distintos pines y tamaños de plataforma. Casi todas las bielas de 2 y 3 piezas usan rosca de 9/16", que es la medida estándar.'),
    "sillines": dict(base="tienda", chip="Sillas (Sillines)", h1="Sillas BMX (Sillines)", title="Sillas BMX (Sillines)",
        intro="Sillas para BMX en distintos diseños y colores. Las pivotal son las más usadas en freestyle: se fijan al poste con un sistema de pivote que permite ajustar la inclinación. Revisa que el tipo de silla sea compatible con tu poste."),
    "tijas": dict(base="tienda", chip="Postes (Tijas)", h1="Postes BMX (Tijas)", title="Postes BMX (Tijas)",
        intro="El poste, o tija, conecta la silla con el marco. En BMX se usan sobre todo los postes pivotal. Verifica el diámetro del tubo del sillín de tu marco y el largo para ajustar bien la altura."),
    "punos": dict(base="tienda", chip="Grips (Puños)", h1="Grips BMX (Puños)", title="Grips BMX (Puños)",
        intro="Los grips son los puños del timón: la textura, el diámetro y la dureza cambian el confort y el control. Los hay con y sin aleta (flange), en distintos largos, y de goma o de materiales más blandos."),
    "caja-frente": dict(base="tienda", chip="Cajas de dirección", h1="Cajas de Frente BMX (Dirección)", title="Cajas de Frente BMX (Dirección)",
        intro="La caja de frente, o caja de dirección, conecta el tenedor con el marco y permite girar el timón. Revisa el estándar de tu marco (integrada o con copas externas) antes de elegir."),
    "caja-centro": dict(base="tienda", chip="Cajas de centro", h1="Cajas de Centro BMX (Pedalier)", title="Cajas de Centro BMX (Pedalier)",
        intro="La caja de centro, o pedalier, es el conjunto de rodamientos por donde gira el eje de las bielas. Los estándares más comunes en BMX son Mid y Spanish; confirma cuál usa tu marco antes de comprar."),
    "clavijas": dict(base="tienda", chip="Pegs (Clavijas)", h1="Pegs BMX (Clavijas)", title="Pegs BMX (Clavijas)",
        intro="Los pegs son los tubos que se instalan en los ejes de las ruedas para hacer grinds. Los hay de aluminio y de acero, en distintos largos. Verifica que sean compatibles con el eje de tu rueda."),
    "tornilleria": dict(base="tienda", chip="Tornillería", h1="Tornillería BMX", title="Tornillería BMX",
        intro="Tornillos y tuercas de repuesto para tu BMX, en distintos materiales y colores. Confirma la medida y la rosca antes de comprar para que encajen con tu pieza."),
    "herramientas": dict(base="tienda", chip="Herramientas", h1="Herramientas BMX", title="Herramientas BMX",
        intro="Herramientas para armar y mantener tu BMX en casa. Si necesitas ayuda con el montaje, también tenemos taller: agenda tu cita por WhatsApp."),
    # --- skate ---
    "skate-tablas": dict(base="skate", chip="Tablas (Maderos)", h1="Tablas de Skate (Maderos)", title="Tablas de Skate (Maderos)",
        intro='Tablas de skate, también llamadas maderos o decks, para street y parque. Las medidas más comunes van de 7.75" a 8.5" de ancho: escoge según el tamaño de tus pies y tu estilo.'),
    "skate-lijas": dict(base="skate", chip="Lijas (Grip tape)", h1="Lijas de Skate (Grip Tape)", title="Lijas de Skate (Grip Tape)",
        intro="La lija, o grip tape, es la superficie que se pega sobre la tabla para que tus pies no resbalen. Hay lijas negras clásicas y lijas con diseños."),
    "skate-trucks": dict(base="skate", chip="Trucks", h1="Trucks de Skate", title="Trucks de Skate",
        intro="Los trucks son los ejes metálicos que sostienen las ruedas y definen cómo gira la tabla. Procura que el ancho del eje coincida con el ancho de tu tabla."),
    "skate-rodamientos": dict(base="skate", chip="Rodamientos", h1="Rodamientos de Skate", title="Rodamientos de Skate",
        intro="Los rodamientos van dentro de las ruedas y definen qué tan libre gira la tabla. Un skate lleva 8 rodamientos, 2 por rueda."),
    "skate-accesorios": dict(base="skate", chip="Accesorios de skate", h1="Accesorios de Skate", title="Accesorios de Skate",
        intro="Accesorios y repuestos para tu skate. Si no encuentras lo que buscas, escríbenos por WhatsApp y te ayudamos."),
    # --- protecciones ---
    "cascos": dict(base="protecciones", chip="Cascos", h1="Cascos para BMX y Skate", title="Cascos para BMX y Skate",
        intro="Cascos para BMX, skate y scooter, de estilo clásico y de cara completa (full cut). Elige la talla midiendo el contorno de tu cabeza: debe ajustar firme sin apretar."),
    "guantes": dict(base="protecciones", chip="Guantes", h1="Guantes BMX", title="Guantes BMX",
        intro="Guantes ligeros para BMX y MTB: mejoran el agarre, protegen las palmas en las caídas y ayudan a evitar ampollas. Elige la talla según el ancho de tu mano."),
    "canilleras": dict(base="protecciones", chip="Canilleras", h1="Canilleras BMX", title="Canilleras BMX",
        intro="Las canilleras protegen las espinillas de los golpes con los pedales, una de las lesiones más comunes en BMX."),
    "rodilleras": dict(base="protecciones", chip="Rodilleras", h1="Rodilleras BMX y Skate", title="Rodilleras BMX y Skate",
        intro="Rodilleras para BMX y skate que absorben el impacto de las caídas. Revisa la talla y que no limiten el movimiento al pedalear."),
}
CAT_ORDER = list(CATS.keys())
GROUP_TITLES = {"tienda": "BMX", "skate": "Skate", "protecciones": "Protecciones"}


def parse_products():
    text = PRODUCTS_JS.read_text(encoding="utf-8")
    m = re.search(r"window\.ESCENA_PRODUCTS\s*=\s*(\[.*\])\s*;?\s*$", text, re.S)
    if not m:
        raise SystemExit("couldn't find window.ESCENA_PRODUCTS in products-data.js")
    return json.loads(m.group(1))


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def available(p):
    """Mirror of available() in assets/js/stock.js."""
    best = _num(p.get("units"))
    for v in (p.get("sizes") or []) + (p.get("colors") or []):
        vu = _num((v or {}).get("units"))
        if vu is not None and (best is None or vu > best):
            best = vu
    return best


def visible(p):
    """Mirror of isVisible() in assets/js/stock.js."""
    if p.get("published") is False:
        return False
    a = available(p)
    return not (a is not None and a <= 0)


def sort_key(p):
    o = p.get("order")
    o = o if isinstance(o, (int, float)) and not isinstance(o, bool) else None
    return (0, o, 0) if o is not None else (1, 0, -(p.get("price") or 0))


def esc(s):
    return html.escape(str(s if s is not None else ""), quote=True)


def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")
    return s or "marca"


def money(n):
    return "$ " + f"{round(n):,}".replace(",", ".")


def product_slug(p):
    return p.get("slug") or re.sub(r"\.[A-Za-z0-9]+$", "", p["img"].split("/")[-1])


def price_html(p):
    colors = p.get("colors") or []
    if len(colors) > 1:
        prices = [c["price"] if (c.get("price") or 0) > 0 else p["price"] for c in colors]
        if min(prices) != max(prices):
            return '<span class="price-from">Desde</span> ' + money(min(prices))
    return money(p["price"])


def card_html(p):
    """Same markup as cardHTML() in tienda.html, minus swatches (the JS repaints)."""
    has_detail = "frame-placeholder" not in p["img"]
    href = "producto/" + product_slug(p)
    tag = '<span class="tag">¡Oferta!</span>' if p.get("promo") else (
        f'<span class="tag">{esc(p["tag"])}</span>' if p.get("tag") else "")
    pos = p.get("imgPos") or "50% 50%"
    style = f"object-position:{esc(pos)};"
    alt = esc(p["n"]) + (f' - {esc(p["brand"])}' if p.get("brand") else "") + " BMX"
    return (
        '<article class="card">'
        + (f'<a class="ph-link" href="{href}">' if has_detail else '<div class="ph-link">')
        + f'<div class="ph">{tag}<img src="{esc(p["img"])}" alt="{alt}" loading="lazy" width="400" height="400" style="{style}"></div>'
        + ("</a>" if has_detail else "</div>")
        + '<div class="body">'
        + "<h3>" + (f'<a class="title-link" href="{href}">{esc(p["n"])}</a>' if has_detail else esc(p["n"])) + "</h3>"
        + f'<div class="price">{price_html(p)}</div></div></article>'
    )


def sub1(pattern, repl, text, label):
    new, n = re.subn(pattern, lambda m: repl, text, count=1, flags=re.S)
    if n != 1:
        raise ValueError(f"pattern for {label!r} matched {n} times")
    return new


def trim(text, limit):
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0].rstrip(",;:.")
    return cut + "…"


LINKS_CSS = """<style>
  .seo-links { padding: 2.2rem 1.5rem 2.6rem; background: #f6f6f4; border-top: 1px solid #ececeb; }
  .seo-links .wrap { max-width: 1180px; margin: 0 auto; }
  .seo-links h2 { font-family: 'Bebas Neue', sans-serif; font-weight: 400; font-size: 1.5rem; letter-spacing: .04em; margin: 1.1rem 0 .6rem; }
  .seo-links h2:first-child { margin-top: 0; }
  .seo-links h3 { font-size: .68rem; letter-spacing: .16em; text-transform: uppercase; color: #666; margin: .9rem 0 .4rem; }
  .seo-links .chips { display: flex; flex-wrap: wrap; gap: .45rem; }
  .seo-links .chips a { display: inline-block; padding: .35rem .8rem; border: 1px solid #dcdcd8; border-radius: 999px; background: #fff; color: #0A0A0A; text-decoration: none; font-size: .78rem; }
  .seo-links .chips a:hover { background: #0A0A0A; color: #fff; border-color: #0A0A0A; }
  .seo-intro { padding: 1.3rem 1.5rem 0; }
  .seo-intro .wrap { max-width: 1180px; margin: 0 auto; }
  .seo-intro p { max-width: 820px; color: #555; font-size: .92rem; line-height: 1.7; }
  .seo-intro a { color: #0A0A0A; text-decoration: underline; }
</style>"""


def links_block(cat_pages, brand_pages):
    groups = defaultdict(list)
    for cat, info in cat_pages:
        groups[CATS[cat]["base"]].append(f'<a href="categoria/{cat}">{esc(CATS[cat]["chip"])}</a>')
    out = [LINKS_CSS, '<nav class="seo-links" aria-label="Categorías y marcas"><div class="wrap">',
           "<h2>Explora por categoría</h2>"]
    for base in ("tienda", "skate", "protecciones"):
        if groups[base]:
            out.append(f'<h3>{GROUP_TITLES[base]}</h3><div class="chips">{"".join(groups[base])}</div>')
    if brand_pages:
        out.append("<h2>Explora por marca</h2>")
        out.append('<div class="chips">' + "".join(
            f'<a href="marca/{slug}">{esc(name)}</a>' for slug, name, _ in brand_pages) + "</div>")
    out.append("</div></nav>")
    return "\n".join(out)


MARK = re.compile(r"<!-- SEO-LINKS:START -->.*?<!-- SEO-LINKS:END -->", re.S)


def with_links(text, block):
    return sub1(MARK.pattern, f"<!-- SEO-LINKS:START -->\n{block}\n<!-- SEO-LINKS:END -->", text, "seo-links marker")


def build_landing(base_text, base_key, *, url, title, desc, h1, subtitle, crumb_label, intro_html,
                  landing_js, products, og_image, links):
    _, base_label, base_url = BASES[base_key]
    s = base_text
    s = sub1(r"<title>.*?</title>", f"<title>{esc(title)}</title>", s, "title")
    s = sub1(r'<meta name="description" content="[^"]*" />', f'<meta name="description" content="{esc(desc)}" />', s, "description")
    s = sub1(r'<meta name="keywords" content="[^"]*" />', f'<meta name="keywords" content="{esc(h1)}, BMX Colombia, ESCENABMX, Bogotá" />', s, "keywords")
    s = sub1(r'<link rel="canonical" href="[^"]*" />', f'<link rel="canonical" href="{url}" />', s, "canonical")
    s = sub1(r'<link rel="alternate" hreflang="es-co" href="[^"]*" />', f'<link rel="alternate" hreflang="es-co" href="{url}" />', s, "hreflang")
    s = sub1(r'<link rel="alternate" hreflang="x-default" href="[^"]*" />', f'<link rel="alternate" hreflang="x-default" href="{url}" />', s, "x-default")
    s = sub1(r'<meta property="og:title" content="[^"]*" />', f'<meta property="og:title" content="{esc(title)}" />', s, "og:title")
    s = sub1(r'<meta property="og:description" content="[^"]*" />', f'<meta property="og:description" content="{esc(desc)}" />', s, "og:description")
    s = sub1(r'<meta property="og:url" content="[^"]*" />', f'<meta property="og:url" content="{url}" />', s, "og:url")
    s = sub1(r'<meta property="og:image" content="[^"]*" />', f'<meta property="og:image" content="{og_image}" />', s, "og:image")
    s = sub1(r'<meta name="twitter:title" content="[^"]*" />', f'<meta name="twitter:title" content="{esc(title)}" />', s, "twitter:title")
    s = sub1(r'<meta name="twitter:description" content="[^"]*" />', f'<meta name="twitter:description" content="{esc(desc)}" />', s, "twitter:description")
    s = sub1(r'<meta name="twitter:image" content="[^"]*" />', f'<meta name="twitter:image" content="{og_image}" />', s, "twitter:image")

    ld = [
        {"@context": "https://schema.org", "@type": "CollectionPage", "name": h1, "url": url,
         "description": desc, "inLanguage": "es-CO",
         "isPartOf": {"@type": "WebSite", "name": "ESCENABMX", "url": SITE + "/"},
         "mainEntity": {"@type": "ItemList", "numberOfItems": len(products), "itemListElement": [
             {"@type": "ListItem", "position": i + 1, "url": f"{SITE}/producto/{product_slug(p)}", "name": p["n"]}
             for i, p in enumerate(products)]}},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Inicio", "item": f"{SITE}/inicio"},
            {"@type": "ListItem", "position": 2, "name": base_label, "item": f"{SITE}/{base_url}"},
            {"@type": "ListItem", "position": 3, "name": crumb_label, "item": url}]},
    ]
    # the store page ships its own generic Inicio > Tienda breadcrumb; ours replaces it
    s = re.sub(r'[ \t]*<script type="application/ld\+json">(?:(?!</script>).)*?"BreadcrumbList".*?</script>\n?',
               "", s, count=1, flags=re.S)
    head_extra = "".join(
        '<script type="application/ld+json">' + json.dumps(o, ensure_ascii=False).replace("</", "<\\/") + "</script>\n  "
        for o in ld)
    head_extra += f"<script>window.ESCENA_LANDING = {json.dumps(landing_js)};</script>\n"
    s = sub1(r"</head>", head_extra + "</head>", s, "</head>")
    # every relative URL in the store page (assets/, producto/, tienda?cat=...) is written
    # for the site root; these pages live one folder down.
    s = sub1(r'<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n  <base href="/" />', s, "charset")

    s = sub1(r'<div class="crumb">.*?</div>',
             f'<div class="crumb"><a href="inicio">Inicio</a> / <a href="{base_url}">{esc(base_label)}</a> / {esc(crumb_label)}</div>', s, "crumb")
    s = sub1(r'<h1 id="pageTitle">.*?</h1>', f'<h1 id="pageTitle">{esc(h1.upper())}</h1>', s, "h1")
    s = sub1(r'<p id="pageSubtitle">.*?</p>', f'<p id="pageSubtitle">{esc(subtitle)}</p>', s, "subtitle")
    s = sub1(r"<!-- ============ SHOP ============ -->",
             f'<div class="seo-intro"><div class="wrap"><p>{intro_html}</p></div></div>\n<!-- ============ SHOP ============ -->', s, "shop")
    s = sub1(r'<div class="grid" id="grid"><!-- products injected by JS --></div>',
             '<div class="grid" id="grid">' + "".join(card_html(p) for p in products) + "</div>", s, "grid")
    s = with_links(s, links)
    return s


def main():
    products = [p for p in parse_products() if visible(p) and p.get("img") and p.get("n")]

    # ---------------- categories ----------------
    by_cat = defaultdict(list)
    for p in products:
        by_cat[p.get("cat")].append(p)
    cat_pages = []
    for cat in CAT_ORDER:
        items = sorted(by_cat.get(cat, []), key=sort_key)
        if len(items) >= (1 if cat in PINNED_CATS else MIN_CAT_PRODUCTS):
            cat_pages.append((cat, items))

    # ---------------- brands ----------------
    groups = defaultdict(list)
    for p in products:
        b = re.sub(r"\s+", " ", (p.get("brand") or "").strip())
        if re.search(r"[A-Za-z]", b):          # skips blanks and price-looking junk ("130000")
            groups[b.lower()].append(p)
    brand_pages = []   # (slug, display, items)
    used = set()
    for key, items in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        if len(items) < MIN_BRAND_PRODUCTS or key in SKIP_BRANDS:
            continue
        display = Counter(re.sub(r"\s+", " ", p["brand"].strip()) for p in items).most_common(1)[0][0]
        slug = slugify(display)
        if slug in used:
            continue
        used.add(slug)
        brand_pages.append((slug, display, sorted(items, key=sort_key)))
    brand_pages.sort(key=lambda t: t[1].lower())

    block = links_block(cat_pages, brand_pages)

    base_text = {k: (ROOT / v[0]).read_text(encoding="utf-8") for k, v in BASES.items()}
    out_cat, out_brand = ROOT / "categoria", ROOT / "marca"
    out_cat.mkdir(exist_ok=True)
    out_brand.mkdir(exist_ok=True)
    written = set()

    for cat, items in cat_pages:
        cfg = CATS[cat]
        prices = [p["price"] for p in items if p.get("price")]
        top = [b for b, _ in Counter((p.get("brand") or "").strip() for p in items if (p.get("brand") or "").strip()).most_common(3)]
        url = f"{SITE}/categoria/{cat}"
        desc = trim(f'{cfg["title"]} en ESCENABMX, tienda de BMX en Bogotá: {len(items)} productos'
                    + (f' desde {money(min(prices))}' if prices else "")
                    + (f' de {", ".join(top)}' if top else "")
                    + ". Envíos a toda Colombia y pedidos por WhatsApp.", 158)
        page = build_landing(
            base_text[cfg["base"]], cfg["base"], url=url,
            title=f'{cfg["title"]} en Colombia | ESCENABMX', desc=desc, h1=cfg["h1"],
            subtitle=f'{len(items)} productos en stock. Pide por WhatsApp y recibe en toda Colombia.',
            crumb_label=cfg["chip"], intro_html=cfg["intro"], landing_js={"cat": cat}, products=items,
            og_image=f'{SITE}/{items[0]["img"].split("?")[0]}', links=block)
        (out_cat / f"{cat}.html").write_text(page, encoding="utf-8")
        written.add(out_cat / f"{cat}.html")

    for slug, name, items in brand_pages:
        prices = [p["price"] for p in items if p.get("price")]
        cats = Counter(p["cat"] for p in items if p.get("cat") in CATS)
        cat_names = [CATS[c]["chip"] for c, _ in cats.most_common(4)]
        url = f"{SITE}/marca/{slug}"
        desc = trim(f'Productos {name} en ESCENABMX, tienda de BMX en Bogotá: {len(items)} referencias'
                    + (f' ({", ".join(cat_names)})' if cat_names else "")
                    + (f', desde {money(min(prices))} hasta {money(max(prices))}' if prices else "")
                    + ". Envíos a toda Colombia y pedidos por WhatsApp.", 158)
        links_in = "".join(
            f'<a href="categoria/{c}">{esc(CATS[c]["chip"])}</a> ({n})' + (", " if i < len(cats) - 1 else "")
            for i, (c, n) in enumerate(cats.most_common()) if c in CATS and any(cp == c for cp, _ in cat_pages))
        intro = (f'En ESCENABMX tenemos {len(items)} productos de {esc(name)} disponibles'
                 + (f', desde {money(min(prices))} hasta {money(max(prices))}' if prices else "")
                 + "." + (f" Encuéntralos por categoría: {links_in}." if links_in else "")
                 + " Si no ves la pieza que buscas, escríbenos por WhatsApp: podemos consultarla.")
        page = build_landing(
            base_text["tienda"], "tienda", url=url,
            title=f"{name} en Colombia: {len(items)} productos | ESCENABMX", desc=desc, h1=name,
            subtitle=f"Todo lo de {name} disponible en ESCENABMX. Pide por WhatsApp y recibe en toda Colombia.",
            crumb_label=name, intro_html=intro, landing_js={"brand": name}, products=items,
            og_image=f'{SITE}/{items[0]["img"].split("?")[0]}', links=block)
        (out_brand / f"{slug}.html").write_text(page, encoding="utf-8")
        written.add(out_brand / f"{slug}.html")

    # bare /categoria and /marca have nothing to show: send people to the store
    redirect = ('<!DOCTYPE html><html lang="es-CO"><head><meta charset="UTF-8" />'
                '<title>Tienda | ESCENABMX</title><meta name="robots" content="noindex, follow" />'
                f'<link rel="canonical" href="{SITE}/tienda" />'
                f'<meta http-equiv="refresh" content="0; url=/tienda" /></head>'
                '<body><a href="/tienda">Ir a la tienda</a></body></html>\n')
    for folder in (out_cat, out_brand):
        (folder / "index.html").write_text(redirect, encoding="utf-8")
        written.add(folder / "index.html")

    # this script owns these two folders: drop pages for categories/brands that no longer qualify
    for folder in (out_cat, out_brand):
        for f in folder.glob("*.html"):
            if f not in written:
                f.unlink()

    # crawlable links on the store pages themselves
    for key, (fname, _, _) in BASES.items():
        path = ROOT / fname
        path.write_text(with_links(path.read_text(encoding="utf-8"), block), encoding="utf-8")

    urls = [f"{SITE}/categoria/{c}" for c, _ in cat_pages] + [f"{SITE}/marca/{s}" for s, _, _ in brand_pages]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for i, u in enumerate(urls):
        pr = "0.8" if "/categoria/" in u else "0.6"
        sm.append(f"  <url>\n    <loc>{u}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>{pr}</priority>\n  </url>")
    sm.append("</urlset>\n")
    (ROOT / "sitemap-landing.xml").write_text("\n".join(sm), encoding="utf-8")
    print(f"generated {len(cat_pages)} category pages + {len(brand_pages)} brand pages "
          f"({len(urls)} URLs in sitemap-landing.xml)")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # never break a deploy over SEO pages
        print(f"generate-seo-pages failed: {e}", file=sys.stderr)
        raise
