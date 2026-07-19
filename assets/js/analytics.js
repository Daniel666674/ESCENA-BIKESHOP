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
})();
