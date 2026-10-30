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

  /* Sales close on WhatsApp, so these clicks are this site's conversions.
     Mark them as key events in GA4 (Admin > Events > "Mark as key event").
       whatsapp_click — any link to WhatsApp (wa.me / api.whatsapp.com / whatsapp://):
                        product pages, footer, header, floating button, stock notices, cart
       generate_lead  — the cart's "Pedir por WhatsApp" button (an actual order); also
                        sends whatsapp_click so the click total is complete
     Parameters (register them in GA4 > Admin > Custom definitions, scope Event):
       click_location — float | product_buy | header | footer | cart | blog | team | other
       product        — product name when the click happens on a product page
       page_path, link_text
     Both only report once gtag exists, i.e. after analytics consent. */
  var WA = /(^|\/\/)(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)|^whatsapp:/i;

  function where(el) {
    if (el.closest("#cartCheckout, #cartDrawer, .cart-drawer")) return "cart";
    if (el.closest(".wa-float")) return "float";
    if (el.closest(".pdp-actions")) return "product_buy";
    if (el.closest("header, .site-header, .nav-cta")) return "header";
    if (el.closest("footer")) return "footer";
    if (/^\/blog/.test(location.pathname)) return "blog";
    if (/^\/team-/.test(location.pathname)) return "team";
    return "other";
  }
  function productName() {
    if (location.pathname.indexOf("/producto/") !== 0) return undefined;
    var h = document.querySelector("h1");
    return h ? (h.textContent || "").trim().slice(0, 100) : undefined;
  }
  function send(name, params) {
    window.gtag("event", name, params);
  }
  function track(e) {
    if (typeof window.gtag !== "function" || !e.target || !e.target.closest) return;
    var cart = e.target.closest("#cartCheckout");
    var a = e.target.closest("a[href]");
    var isWA = a && WA.test(a.getAttribute("href") || "");
    if (!cart && !isWA) return;
    var el = cart || a;
    var params = {
      page_path: location.pathname,
      click_location: where(el),
      link_text: (el.textContent || "").trim().slice(0, 40),
      product: productName(),
      transport_type: "beacon"
    };
    send("whatsapp_click", params);
    if (cart) send("generate_lead", { method: "whatsapp_cart", page_path: location.pathname, transport_type: "beacon" });
  }
  // click = left click / tap / Enter; auxclick = middle click (opens WhatsApp in a new tab)
  document.addEventListener("click", track, true);
  document.addEventListener("auxclick", function (e) { if (e.button === 1) track(e); }, true);
})();
