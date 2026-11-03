/* ESCENA — GA4 loader, consent-gated.
   Google Analytics (gtag.js) is NOT loaded and NO tracking cookie is set until
   the visitor explicitly accepts analytics cookies in the consent banner
   (see cookie-consent.js, which exposes window.EscenaConsent and fires the
   "escena-consent-changed" event). This keeps the site compliant with
   Colombian Habeas Data: nothing leaves the browser pre-consent.

   The Measurement ID below is a public GA4 identifier — safe in client code by
   design, it only routes hits to the property and grants no account access. */
(function () {
  var GA_ID = "G-D3QVZGG6LZ";
  var loaded = false;
  var queue = [];
  function flushQueue() { while (queue.length) window.gtag.apply(null, queue.shift()); }
  // GA4 only exists after analytics consent; page-load events (view_item) wait for it.
  function ga() {
    if (typeof window.gtag === "function") window.gtag.apply(null, arguments);
    else queue.push(arguments);
  }

  /* First-party ledger endpoint (Cloudflare Worker, see tools/README-WHATSAPP.md).
     While empty, nothing is sent and the site behaves exactly as before.
     The beacon carries NO personal data and no cookie/ID of the visitor: just a
     random Ref, the button, the product and the traffic source. */
  var LEDGER_URL = "";

  function loadGA() {
    if (loaded) return;
    loaded = true;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag("js", new Date());
    // anonymize_ip + deny ad-personalization signals: analytics only, no ads.
    gtag("config", GA_ID, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
    flushQueue();
  }

  function maybeLoad() {
    if (window.EscenaConsent && window.EscenaConsent.hasAnalyticsConsent()) loadGA();
  }

  // Fire now if consent was given on a previous visit…
  maybeLoad();
  // …or the moment the visitor accepts in this session.
  document.addEventListener("escena-consent-changed", function (e) {
    if (e && e.detail && e.detail.choice === "all") loadGA();
  });

  /* ------------------------------------------------------------------
     WhatsApp attribution. Sales close in a WhatsApp chat, so every way into
     that chat is stamped with a unique Ref (e.g. "Ref: EB-7K3QX") written at the
     end of the pre-filled message. The shop sees it in the chat, and when the
     sale is logged with that Ref the revenue is tied back to the exact button,
     product, page and traffic source of the click.

     GA4 events (register the parameters as custom dimensions, scope Event):
       view_item / add_to_cart  standard e-commerce funnel on product pages
       whatsapp_click           any way into WhatsApp (also the cart's)
       generate_lead            the click carries value + items (the "purchase intent")
       params: wa_ref, click_location, product, page_path, link_text, source_*
     The revenue itself arrives later as a `purchase` (transaction_id = Ref).
     ------------------------------------------------------------------ */
  var WA = /(^|\/\/)(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)|^whatsapp:/i;
  var ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I: easy to read in a chat

  function newRef() {
    var out = "";
    try {
      var buf = new Uint8Array(5);
      (window.crypto || window.msCrypto).getRandomValues(buf);
      for (var i = 0; i < 5; i++) out += ALPHABET.charAt(buf[i] % ALPHABET.length);
    } catch (e) {
      for (var j = 0; j < 5; j++) out += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    }
    return "EB-" + out;
  }

  /* Where this visit came from. Kept in sessionStorage (this tab only, gone when it
     closes), written once on landing so it isn't lost when the visitor navigates. */
  function trafficSource() {
    var KEY = "escena_src_v1";
    try { var saved = sessionStorage.getItem(KEY); if (saved) return JSON.parse(saved); } catch (e) {}
    var q = new URLSearchParams(location.search), host = "";
    try { host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : ""; } catch (e) {}
    var src = q.get("utm_source"), med = q.get("utm_medium"), camp = q.get("utm_campaign");
    if (!src) {
      if (q.get("gclid")) { src = "google"; med = med || "cpc"; }
      else if (!host || host.indexOf("escenabmx.com") > -1) { src = "(direct)"; med = med || "(none)"; }
      else if (/(^|\.)google\./.test(host)) { src = "google"; med = med || "organic"; }
      else if (/(^|\.)(bing|duckduckgo|yahoo)\./.test(host)) { src = host.split(".")[0]; med = med || "organic"; }
      else if (/instagram|facebook|fb\.|tiktok|youtube|t\.co|twitter|whatsapp/.test(host)) { src = host.replace(/\.(com|co|me)$/, ""); med = med || "social"; }
      else { src = host; med = med || "referral"; }
    }
    var out = { source: src, medium: med || "(none)", campaign: camp || "", landing: location.pathname, referrer: host };
    try { sessionStorage.setItem(KEY, JSON.stringify(out)); } catch (e) {}
    return out;
  }
  var SRC = trafficSource();

  function where(el) {
    if (el.closest("#cartCheckout, #cartDrawer, .cart-drawer")) return "cart";
    if (el.closest(".wa-float")) return "float";
    if (el.closest(".pdp-actions")) return "product_buy";
    if (el.closest("header, .site-header, .nav-cta")) return "header";
    if (el.closest("footer")) return "footer";
    if (/^\/blog/.test(location.pathname)) return "blog";
    if (/^\/team-/.test(location.pathname)) return "team";
    if (/^\/producto\//.test(location.pathname)) return "product_page";
    return "other";
  }

  // The product being looked at on a product page (its buy button carries the data).
  function pageItem() {
    if (!/^\/producto\//.test(location.pathname)) return null;
    var b = document.querySelector(".pdp-actions .add-cart-btn");
    if (!b) return null;
    var q = document.querySelector(".pdp-actions .qty-input");
    return {
      item_id: b.getAttribute("data-slug") || "",
      item_name: b.getAttribute("data-n") || "",
      item_brand: b.getAttribute("data-brand") || "",
      item_variant: b.getAttribute("data-variant") || "",
      price: parseFloat(b.getAttribute("data-price")) || 0,
      quantity: Math.max(1, parseInt(q && q.value, 10) || 1)
    };
  }
  function total(items) {
    return (items || []).reduce(function (s, i) { return s + (i.price || 0) * (i.quantity || 1); }, 0);
  }

  // Rewrites the link so the message carries the Ref. Always lands on a fresh Ref per click.
  function stamp(a, ref, product) {
    var raw = a.getAttribute("href") || "";
    var base = raw.split("?")[0], text = "";
    var m = raw.match(/[?&]text=([^&#]*)/);
    if (m) { try { text = decodeURIComponent(m[1].replace(/\+/g, " ")); } catch (e) { text = m[1]; } }
    text = text.replace(/\n*\s*Ref: EB-[A-Z0-9]+\s*$/, "");
    if (!text) text = "Hola ESCENA, te escribo desde escenabmx.com" + (product ? " por: " + product : "");
    text += "\n\nRef: " + ref;
    a.setAttribute("href", base + "?text=" + encodeURIComponent(text));
  }

  function ledger(rec) {
    if (!LEDGER_URL || !navigator.sendBeacon) return;
    try { navigator.sendBeacon(LEDGER_URL, new Blob([JSON.stringify(rec)], { type: "text/plain" })); } catch (e) {}
  }

  /* One conversion = one chat opened. `kind` is "link" (any wa.me link) or "cart". */
  function conversion(info) {
    var items = info.items || [], value = info.value != null ? info.value : total(items);
    var loc = info.location;
    var params = {
      wa_ref: info.ref, click_location: loc, page_path: location.pathname,
      link_text: info.text || "", product: items.length === 1 ? items[0].item_name : (items.length ? "(varios)" : undefined),
      source_name: SRC.source, source_medium: SRC.medium, source_campaign: SRC.campaign || undefined,
      transport_type: "beacon"
    };
    var gaNow = typeof window.gtag === "function" ? window.gtag : function () {};
    gaNow("event", "whatsapp_click", params);
    var lead = { currency: "COP", value: value, items: items.length ? items : undefined };
    for (var k in params) if (params[k] !== undefined) lead[k] = params[k];
    gaNow("event", "generate_lead", lead);
    ledger({ t: "click", ref: info.ref, ts: Date.now(), loc: loc, page: location.pathname, text: info.text || "",
             items: items, value: value, src: SRC.source, med: SRC.medium, camp: SRC.campaign, landing: SRC.landing, rh: SRC.referrer });
  }

  // Used by cart.js when the checkout button opens WhatsApp with the order.
  window.EscenaTrack = {
    newRef: newRef,
    cartCheckout: function (orderNumber, cartItems, cartValue) {
      var items = (cartItems || []).map(function (i) {
        return { item_id: i.slug || "", item_name: i.n || "", item_brand: i.brand || "", item_variant: i.variant || "", price: i.price || 0, quantity: i.qty || 1 };
      });
      conversion({ ref: orderNumber, location: "cart", text: "Pedir por WhatsApp", items: items, value: cartValue });
    }
  };

  function onLink(e) {
    if (!e.target || !e.target.closest) return;
    var a = e.target.closest("a[href]");
    if (!a || !WA.test(a.getAttribute("href") || "")) return;
    var item = pageItem(), ref = newRef();
    stamp(a, ref, item && item.item_name);
    if (e.type === "contextmenu") return; // "copy link" carries the Ref, but it isn't a click
    conversion({ ref: ref, location: where(a), text: (a.textContent || "").trim().slice(0, 40), items: item ? [item] : [] });
  }
  // click = left click / tap / Enter; auxclick = middle click (opens WhatsApp in a new tab)
  document.addEventListener("click", onLink, true);
  document.addEventListener("auxclick", function (e) { if (e.button === 1) onLink(e); }, true);
  document.addEventListener("contextmenu", onLink, true);

  // Standard e-commerce funnel on product pages.
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest(".add-cart-btn");
    if (!b || b.disabled) return;
    var item = pageItem();
    if (!item) {
      item = { item_id: b.getAttribute("data-slug") || "", item_name: b.getAttribute("data-n") || "", item_brand: b.getAttribute("data-brand") || "",
               item_variant: b.getAttribute("data-variant") || "", price: parseFloat(b.getAttribute("data-price")) || 0, quantity: 1 };
    }
    ga("event", "add_to_cart", { currency: "COP", value: total([item]), items: [item] });
  }, true);

  function viewItem() {
    var item = pageItem();
    if (item && item.item_id) ga("event", "view_item", { currency: "COP", value: item.price, items: [item] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", viewItem);
  else viewItem();
})();
