#!/usr/bin/env python3
"""Quick public-SEO snapshot of one or more sites, to compare ESCENABMX with competitors.

Reads only what any visitor or Google can read (home page, robots.txt, sitemap, llms.txt).
No logins, no API keys, nothing is sent anywhere. Standard library only (Python 3.8+).

    python3 tools/competitor-audit.py escenabmx.com sabotagebikeshop.com tiendabmx.com
    python3 tools/competitor-audit.py sabotagebikeshop.com > sabotage.txt     # save the report

It reports: title / description / H1 / H2, menu categories (the words they use for
parts), structured-data types, platform, sitemap size and what it is made of,
hreflang / canonical, robots and llms.txt. Paste the output back to compare.
"""
import collections
import json
import re
import sys
import time
import urllib.request
from urllib.parse import urljoin, urlparse

UA = "Mozilla/5.0 (compatible; ESCENA-SEO-audit/1.0)"


def get(url, limit=3_000_000):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "es-CO,es;q=0.9"})
    t = time.time()
    with urllib.request.urlopen(req, timeout=25) as r:
        body = r.read(limit)
        enc = r.headers.get_content_charset() or "utf-8"
        return r.geturl(), r.status, time.time() - t, body.decode(enc, "replace")


def safe_get(url):
    try:
        return get(url)
    except Exception as e:  # noqa: BLE001 - report and continue
        return None, None, None, f"ERROR: {e}"


def strip(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


def meta(html, name, attr="name"):
    m = re.search(r'<meta[^>]+%s=["\']%s["\'][^>]*content=["\']([^"\']*)["\']' % (attr, re.escape(name)), html, re.I) \
        or re.search(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]*%s=["\']%s["\']' % (attr, re.escape(name)), html, re.I)
    return strip(m.group(1)) if m else ""


def platform(html):
    checks = [("Shopify", "cdn.shopify.com"), ("WordPress/WooCommerce", "wp-content"), ("Wix", "wixstatic.com"),
              ("Tiendanube/Nuvemshop", "tiendanube"), ("Tiendanube/Nuvemshop", "nuvemshop"),
              ("Squarespace", "squarespace"), ("PrestaShop", "prestashop"), ("Magento", "magento"),
              ("VTEX", "vtex"), ("Webflow", "webflow")]
    for name, needle in checks:
        if needle in html.lower():
            return name
    return "propia / no detectada"


def sitemap_urls(base, robots_text):
    urls, seen, queue = [], set(), []
    for m in re.finditer(r"(?im)^\s*sitemap:\s*(\S+)", robots_text or ""):
        queue.append(m.group(1))
    if not queue:
        queue = [urljoin(base, "/sitemap.xml")]
    while queue and len(seen) < 12:
        u = queue.pop(0)
        if u in seen:
            continue
        seen.add(u)
        _, st, _, txt = safe_get(u)
        if not st or txt.startswith("ERROR"):
            continue
        locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", txt)
        if "<sitemapindex" in txt:
            queue.extend(locs)
        else:
            urls.extend(locs)
    return urls, sorted(seen)


def report(host):
    base = host if host.startswith("http") else "https://" + host
    base = base.rstrip("/") + "/"
    print("=" * 78)
    print(f"{base}")
    print("=" * 78)
    final, status, secs, html = safe_get(base)
    if not status:
        print(html)
        return
    print(f"HTTP {status} · {secs:.1f}s · {len(html)//1024} KB · destino final: {final}")
    print(f"Plataforma: {platform(html)}")
    t = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    print(f"\nTITLE ({len(strip(t.group(1))) if t else 0} car.): {strip(t.group(1)) if t else '(sin title)'}")
    d = meta(html, "description")
    print(f"DESCRIPCIÓN ({len(d)} car.): {d or '(sin description)'}")
    can = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]*href=["\']([^"\']+)', html, re.I)
    print(f"Canonical: {can.group(1) if can else '(no)'}")
    lang = re.search(r'<html[^>]*lang=["\']([^"\']+)', html, re.I)
    print("Idioma: %s · hreflang: %d · robots meta: %s" % (
        lang.group(1) if lang else "(no declarado)", len(re.findall(r"hreflang=", html, re.I)), meta(html, "robots") or "(no)"))
    print(f"og:title: {meta(html, 'og:title', 'property') or '(no)'}")
    for tag in ("h1", "h2"):
        items = [strip(x) for x in re.findall(r"<%s[^>]*>(.*?)</%s>" % (tag, tag), html, re.I | re.S)]
        items = [i for i in items if i][:12]
        print(f"\n{tag.upper()} ({len(items)}): " + (" | ".join(items) if items else "(ninguno)"))

    types = collections.Counter()
    for blk in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html, re.I | re.S):
        try:
            data = json.loads(blk)
        except Exception:  # noqa: BLE001
            types["(JSON-LD inválido)"] += 1
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            o = stack.pop()
            if isinstance(o, dict):
                ty = o.get("@type")
                for x in (ty if isinstance(ty, list) else [ty]):
                    if x:
                        types[x] += 1
                stack.extend(v for v in o.values() if isinstance(v, (dict, list)))
            elif isinstance(o, list):
                stack.extend(o)
    print("\nDatos estructurados: " + (", ".join(f"{k}×{v}" for k, v in types.most_common()) or "(ninguno)"))

    nav = re.findall(r"<(?:nav|header)[^>]*>(.*?)</(?:nav|header)>", html, re.I | re.S)
    seen, words = set(), []
    for blk in nav:
        for txt in re.findall(r"<a[^>]*>(.*?)</a>", blk, re.I | re.S):
            w = strip(txt)
            if 2 <= len(w) <= 40 and w.lower() not in seen:
                seen.add(w.lower())
                words.append(w)
    print("\nMenú (palabras que usan): " + (" · ".join(words[:45]) or "(no se detectó)"))

    _, rs, _, robots = safe_get(urljoin(base, "/robots.txt"))
    print(f"\nrobots.txt: {'HTTP ' + str(rs) if rs else 'no'}" + (f" · bloquea: {len(re.findall(r'(?im)^disallow:\s*/', robots))} reglas" if rs else ""))
    _, ls, _, llms = safe_get(urljoin(base, "/llms.txt"))
    print(f"llms.txt: {'sí' if ls == 200 and not llms.lower().startswith('<!doctype') else 'no'}")

    urls, maps = sitemap_urls(base, robots if rs else "")
    print(f"\nSitemaps: {', '.join(maps) or '(no encontrado)'}")
    print(f"URLs en el sitemap: {len(urls)}")
    if urls:
        seg = collections.Counter((urlparse(u).path.strip('/').split('/')[0] or '(home)') for u in urls)
        print("Distribución por carpeta: " + ", ".join(f"{k}:{v}" for k, v in seg.most_common(10)))
        prod = [u for u in urls if re.search(r"/(product|producto|productos|products|p)/", u)]
        cat = [u for u in urls if re.search(r"/(categoria|categorias|category|collections|c|marca|marcas|brand)/", u)]
        print(f"…con pinta de producto: {len(prod)} · de categoría/marca: {len(cat)}")
        print("Ejemplos: " + " | ".join(urls[:5]))
    print()


if __name__ == "__main__":
    hosts = sys.argv[1:]
    if not hosts:
        sys.exit(__doc__)
    for h in hosts:
        report(h)
