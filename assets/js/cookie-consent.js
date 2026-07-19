/* ESCENA cookie consent — self-built, no third-party service.
   Gates analytics scripts (GA4, once added) behind an explicit choice.
   Exposes window.EscenaConsent for other scripts to check before loading
   anything that sets a cookie or tracks the visitor. */
(function () {
  var KEY = "escena_cookie_consent_v1";
  var ROOT = window.ESCENA_ROOT || "";

  function getChoice() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function setChoice(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
  }
  function hasAnalyticsConsent() {
    return getChoice() === "all";
  }

  var bannerHTML =
    '<div class="cookie-banner" id="cookieBanner" role="dialog" aria-label="Aviso de cookies">' +
      '<p>Usamos cookies esenciales para que la tienda funcione y, si lo aceptás, cookies de analítica para entender el tráfico del sitio. ' +
        '<a href="' + ROOT + 'privacidad">Leer más</a>.</p>' +
      '<div class="cookie-banner-actions">' +
        '<button type="button" id="cookieEssentialBtn">Solo esenciales</button>' +
        '<button type="button" id="cookieAcceptBtn" class="cookie-accept">Aceptar</button>' +
      '</div>' +
    '</div>';

  function showBanner() {
    document.body.insertAdjacentHTML("beforeend", bannerHTML);
    var banner = document.getElementById("cookieBanner");
    requestAnimationFrame(function () { banner.classList.add("show"); });
    function dismiss(choice) {
      setChoice(choice);
      banner.classList.remove("show");
      setTimeout(function () { banner.remove(); }, 300);
      document.dispatchEvent(new CustomEvent("escena-consent-changed", { detail: { choice: choice } }));
    }
    document.getElementById("cookieAcceptBtn").addEventListener("click", function () { dismiss("all"); });
    document.getElementById("cookieEssentialBtn").addEventListener("click", function () { dismiss("essential"); });
  }

  function init() {
    if (!getChoice()) showBanner();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.EscenaConsent = { get: getChoice, hasAnalyticsConsent: hasAnalyticsConsent };
})();
