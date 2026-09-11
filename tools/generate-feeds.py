#!/usr/bin/env python3
"""Regenerate the public/semi-public JSON feeds Nexus (or any external
reporting tool) reads from — run on every deploy so they never drift from
whatever admin.html last published.

Two outputs, deliberately different trust levels:

- assets/data/inventory.json — fully public. It's a reshaped mirror of
  assets/js/products-data.js, which is already served to every storefront
  visitor with no auth; this file adds nothing a competitor couldn't already
  see on the site itself.

- assets/data/sales-summary-<TOKEN>.json — NOT public data. Individual sale
  records in assets/js/sales-log.js include buyer name, phone number, and
  free-text notes (see admin.html's sale form) — real customer PII, and
  deploy.yml deliberately keeps that raw file off the public site for
  exactly that reason. This script only ever emits monthly/product
  aggregates (units, revenue) with every PII field dropped — even if this
  URL leaks, no customer data is exposed. The token in the filename is the
  only access control a static host can offer (no server to check a Bearer
  header against) — treat the full URL as a secret, and if it ever leaks,
  generate a new token (edit TOKEN below) and update whatever reads it.
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRODUCTS_JS = ROOT / "assets/js/products-data.js"
SALES_JS = ROOT / "assets/js/sales-log.js"
OUT_DIR = ROOT / "assets/data"

# Fixed on purpose — regenerating this file must never change the sales feed's
# URL, or whatever's reading it (Nexus) silently breaks. Rotate only if the
# URL actually leaks, and update the consumer at the same time.
SALES_TOKEN = "cMsEC3jqkyYY07W-vQ2Vs4d4tXgEj3Q1"


def parse_window_assignment(path, var_name):
    """assets/js/{products-data,sales-log}.js are hand-authored as
    `window.VAR = [ ... ];` (see admin.html's ghPutWithRetry writers) — not
    valid JSON on their own. Strip the assignment/trailing semicolon so the
    array literal can be parsed as JSON.
    """
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8")
    m = re.search(r"window\." + re.escape(var_name) + r"\s*=\s*(\[.*\])\s*;?\s*$", text, re.S)
    if not m:
        print(f"warning: couldn't find window.{var_name} in {path}, treating as empty", file=sys.stderr)
        return []
    return json.loads(m.group(1))


def build_inventory():
    products = parse_window_assignment(PRODUCTS_JS, "ESCENA_PRODUCTS")
    out = []
    for p in products:
        if p.get("published") is False:
            continue
        entry = {
            "slug": p.get("slug"),
            "sku": p.get("sku"),
            "name": p.get("n"),
            "brand": p.get("brand"),
            "category": p.get("cat"),
            "price": p.get("price"),
            "units": p.get("units"),
        }
        variants = p.get("colors") or p.get("sizes")
        if variants:
            entry["variants"] = [
                {"label": v.get("label"), "units": v.get("units"), "price": v.get("price", p.get("price"))}
                for v in variants
            ]
        out.append(entry)
    return {
        "generatedAt": None,  # filled in by main()
        "totalSkus": len(out),
        "totalUnits": sum(e.get("units") or 0 for e in out),
        "products": out,
    }


def build_sales_summary():
    sales = parse_window_assignment(SALES_JS, "ESCENA_SALES")
    by_month = defaultdict(lambda: {"units": 0, "revenue": 0})
    by_month_product = defaultdict(lambda: {"units": 0, "revenue": 0})
    for s in sales:
        date = s.get("date", "")
        month = date[:7] if len(date) >= 7 else "unknown"  # YYYY-MM
        qty = s.get("qty") or 0
        total = s.get("total") or 0
        by_month[month]["units"] += qty
        by_month[month]["revenue"] += total
        key = (month, s.get("slug"))
        bucket = by_month_product[key]
        bucket["units"] += qty
        bucket["revenue"] += total
        bucket.setdefault("name", s.get("n"))
        bucket.setdefault("sku", s.get("sku"))
        bucket.setdefault("brand", s.get("brand"))

    months = [
        {"month": m, "units": v["units"], "revenue": v["revenue"]}
        for m, v in sorted(by_month.items())
    ]
    products = [
        {"month": m, "slug": slug, "name": v.get("name"), "sku": v.get("sku"), "brand": v.get("brand"),
         "units": v["units"], "revenue": v["revenue"]}
        for (m, slug), v in sorted(by_month_product.items())
    ]
    return {
        "generatedAt": None,
        "note": "Aggregated monthly totals only — no buyer name, phone, payment method, or notes are included by design.",
        "totalSales": len(sales),
        "byMonth": months,
        "byMonthAndProduct": products,
    }


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    now = __import__("datetime").datetime.utcnow().isoformat() + "Z"

    inventory = build_inventory()
    inventory["generatedAt"] = now
    (OUT_DIR / "inventory.json").write_text(json.dumps(inventory, indent=2, ensure_ascii=False), encoding="utf-8")

    sales_summary = build_sales_summary()
    sales_summary["generatedAt"] = now
    sales_path = OUT_DIR / f"sales-summary-{SALES_TOKEN}.json"
    sales_path.write_text(json.dumps(sales_summary, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"wrote {OUT_DIR / 'inventory.json'} ({inventory['totalSkus']} SKUs)")
    print(f"wrote {sales_path} ({sales_summary['totalSales']} sales)")


if __name__ == "__main__":
    main()
