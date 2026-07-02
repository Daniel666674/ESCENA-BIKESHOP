/* ESCENA wholesale mode — demo-level retailer pricing (15% off), client-side only.
   DEPLOYMENT TODO: with <5 retailers, swap DEMO_PASSWORD for a small per-retailer
   allowlist (e.g. var CODES = {"ESCENA15-TIENDAX": "Tienda X", ...}) so each
   retailer can be revoked individually and orders can be attributed to whoever's
   code was used. Still no backend needed — just check membership in login()
   instead of equality against one shared string. Not done for the demo. */
(function () {
  var WS_KEY = "escena_wholesale_v1";
  var DISCOUNT = 0.15;
  var DEMO_PASSWORD = "ESCENA15";
  var WA = window.WA || "573107630504";
  var ROOT = window.ESCENA_ROOT || "";

  function isActive() {
    return localStorage.getItem(WS_KEY) === "1";
  }
  function setActive(v) {
    localStorage.setItem(WS_KEY, v ? "1" : "0");
  }
  function login(pw) {
    if ((pw || "").trim().toUpperCase() === DEMO_PASSWORD) {
      setActive(true);
      return true;
    }
    return false;
  }
  function logout() {
    setActive(false);
  }
  function applyDiscount(n) {
    return isActive() ? Math.round(n * (1 - DISCOUNT)) : n;
  }
  function cop(n) {
    return "$" + Math.round(n).toLocaleString("es-CO") + " COP";
  }
  function mayoristaPrefix() {
    return isActive() ? "🏷️ PEDIDO MAYORISTA (15% aplicado)\n" : "";
  }

  /* ---- Banner ---- */
  var bannerHTML =
    '<div class="wsale-banner" id="wsaleBanner">' +
      '<div class="wsale-banner-inner">' +
        '<span>🏷️ MODO MAYORISTA ACTIVO — 15% OFF en todo el catálogo</span>' +
        '<button type="button" id="wsaleLogout">Salir del modo mayorista</button>' +
      '</div>' +
    '</div>';

  var bannerCSS =
    '.wsale-banner { display: none; background: var(--ink); color: #fff; border-bottom: 2px solid #fff; }' +
    '.wsale-banner.show { display: block; }' +
    '.wsale-banner-inner { max-width: 1180px; margin: 0 auto; padding: .55rem 1.5rem; display: flex; align-items: center; justify-content: center; gap: 1.2rem; flex-wrap: wrap; text-align: center; }' +
    '.wsale-banner-inner span { font-size: .76rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }' +
    '.wsale-banner-inner button { background: #fff; color: var(--ink); border: none; border-radius: 4px; padding: .35rem .8rem; font-size: .68rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; cursor: pointer; font-family: inherit; }' +
    '.wsale-banner-inner button:hover { opacity: .8; }' +
    '.wsale-strike { text-decoration: line-through; opacity: .55; font-size: .62em; margin-right: .45em; font-weight: 400; }';

  function ensureBannerStyles() {
    if (document.getElementById("wsaleStyles")) return;
    var style = document.createElement("style");
    style.id = "wsaleStyles";
    style.textContent = bannerCSS;
    document.head.appendChild(style);
  }

  function renderBanner() {
    var banner = document.getElementById("wsaleBanner");
    if (!banner) return;
    banner.classList.toggle("show", isActive());
  }

  /* ---- Rewrite prices/links baked as static HTML on product detail pages ---- */
  function rewriteStaticPDP() {
    var btn = document.querySelector(".pdp-actions .add-cart-btn[data-price]");
    if (!btn) return;
    var raw = parseFloat(btn.getAttribute("data-price"));
    var n = btn.getAttribute("data-n") || "";
    var brand = btn.getAttribute("data-brand") || "";

    var priceEl = document.querySelector(".pdp-price");
    if (priceEl) {
      if (isActive()) {
        priceEl.innerHTML = '<span class="wsale-strike">' + cop(raw) + '</span>' + cop(applyDiscount(raw));
      } else {
        priceEl.textContent = cop(raw);
      }
    }

    var msg = encodeURIComponent(mayoristaPrefix() + "Hola ESCENA 🐕, quiero pedir: " + n + " (" + brand + ") — " + cop(applyDiscount(raw)) + ". ¿Está disponible?");
    var href = "https://wa.me/" + WA + "?text=" + msg;
    var buyLink = document.querySelector(".pdp-actions .btn-ink[href*=\"wa.me\"]");
    if (buyLink) buyLink.href = href;
    var floatBtn = document.querySelector(".wa-float[href*=\"wa.me\"]");
    if (floatBtn) floatBtn.href = href;
  }

  /* ---- Login form wiring (used on mayoristas.html) ---- */
  function wireLoginForm() {
    var form = document.getElementById("wsaleLoginForm");
    if (!form) return;
    if (isActive()) {
      var already = document.getElementById("wsaleAlready");
      if (already) already.style.display = "block";
      form.style.display = "none";
      return;
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var pw = document.getElementById("wsalePw").value;
      var errEl = document.getElementById("wsaleError");
      if (login(pw)) {
        window.location.href = ROOT + "tienda.html";
      } else if (errEl) {
        errEl.style.display = "block";
      }
    });
  }

  function init() {
    ensureBannerStyles();
    document.body.insertAdjacentHTML("afterbegin", bannerHTML);
    renderBanner();
    rewriteStaticPDP();
    wireLoginForm();

    document.addEventListener("click", function (e) {
      var logoutBtn = e.target.closest("#wsaleLogout, #wsaleLogoutBtn");
      if (logoutBtn) {
        logout();
        window.location.reload();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.EscenaWholesale = {
    isActive: isActive,
    login: login,
    logout: logout,
    applyDiscount: applyDiscount,
    cop: cop,
    mayoristaPrefix: mayoristaPrefix,
    DEMO_PASSWORD: DEMO_PASSWORD
  };
})();
