#!/usr/bin/env python3
"""Write merchant-feed.xml: the product feed for Google Merchant Center.

Merchant Center "free listings" put products in Google Shopping / the Shopping
tab at no cost. It reads this file on a schedule from
    https://escenabmx.com/merchant-feed.xml
(set up once in Merchant Center: Products > Feeds > Scheduled fetch).

Same data and the same visibility rule as the storefront (assets/js/products-data.js
+ stock rules mirrored from assets/js/stock.js), so what Google lists is what is
actually for sale at the price shown on the site. Regenerated on every deploy
(see .github/workflows/deploy.yml); output is also committed.

Shipping and return policy are configured inside Merchant Center itself (the site
quotes shipping per destination, so no single rate can be put in this file).
"""
import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape

sys.path.insert(0, str(Path(__file__).resolve().parent))
import importlib.util

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://escenabmx.com"

# reuse the exact catalog parsing + visibility rules of the landing-page generator
_spec = importlib.util.spec_from_file_location("seo_pages", ROOT / "tools" / "generate-seo-pages.py")
seo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(seo)


def clean(text, limit):
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    return text[:limit].rstrip()


def main():
    items = []
    for p in seo.parse_products():
        if not seo.visible(p) or not p.get("img") or not p.get("n"):
            continue
        if "frame-placeholder" in p["img"] or not (p.get("price") or 0) > 0:
            continue
        slug = seo.product_slug(p)
        brand = (p.get("brand") or "").strip()
        desc = clean(p.get("spec"), 4900) or clean(p["n"], 4900)
        img = p["img"].split("?")[0]
        e = ["    <item>",
             f"      <g:id>{escape(p.get('sku') or slug)}</g:id>",
             f"      <g:title>{escape(clean(p['n'], 150))}</g:title>",
             f"      <g:description>{escape(desc)}</g:description>",
             f"      <g:link>{SITE}/producto/{escape(slug)}</g:link>",
             f"      <g:image_link>{SITE}/{escape(img)}</g:image_link>",
             "      <g:availability>in_stock</g:availability>",
             f"      <g:price>{int(round(p['price']))} COP</g:price>",
             "      <g:condition>new</g:condition>"]
        if re.search(r"[A-Za-z]", brand):
            e.append(f"      <g:brand>{escape(brand)}</g:brand>")
        e.append("      <g:identifier_exists>no</g:identifier_exists>")
        e.append("    </item>")
        items.append("\n".join(e))

    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n'
           "    <title>ESCENABMX</title>\n"
           f"    <link>{SITE}/</link>\n"
           "    <description>Partes y componentes BMX, skate y protecciones en Colombia</description>\n"
           + "\n".join(items) + "\n  </channel>\n</rss>\n")
    (ROOT / "merchant-feed.xml").write_text(xml, encoding="utf-8")
    print(f"merchant-feed.xml: {len(items)} products")


if __name__ == "__main__":
    main()
