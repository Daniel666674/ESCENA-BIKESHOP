/* ESCENA wholesale + admin login — demo-level, client-side only.
   DEPLOYMENT TODO: swap the ACCOUNTS list below for real per-retailer
   accounts (still no backend strictly required — a small server-side
   check would be a meaningful upgrade over shipping credentials in the
   page source, but is out of scope for this demo). Each retailer can
   already be revoked individually just by removing their entry. */
(function () {
  var WS_KEY = "escena_wholesale_v1";
  var WS_NAME_KEY = "escena_wholesale_name_v1";
  var ADMIN_KEY = "escena_admin_auth_v1";
  var DISCOUNT = 0.15;
  var WA = window.WA || "573107630504";
  var ROOT = window.ESCENA_ROOT || "";

  var ACCOUNTS = [
    { email: "bogota@mayorista.demo", password: "Bogota2026!", role: "retailer", name: "BMX Bogotá Store" },
    { email: "medellin@mayorista.demo", password: "Medellin2026!", role: "retailer", name: "Medellín Bikes" },
    { email: "cali@mayorista.demo", password: "Cali2026!", role: "retailer", name: "Cali Street BMX" },
    { email: "admin@escenabikeshop.com", password: "EscenaAdmin2026!", role: "admin", name: "ESCENA Admin" }
  ];

  var WA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413"/></svg>';
  var USER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"/><path d="M3 21c0-4.97 4.03-8 9-8s9 3.03 9 8"/></svg>';

  /* ---- Payment badges: Visa/Mastercard are official simple-icons path data (verified).
     Nequi/Daviplata/PSE/Bold have no reliable official vector source reachable from this
     environment — these render as brand-colored wordmarks, not exact logo artwork. Swap
     in real assets if/when available. ---- */
  var VISA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="#1A1F71"><path d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z"/></svg>';
  var MC_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="12" r="7" fill="#EB001B"/><circle cx="15" cy="12" r="7" fill="#F79E1B" style="mix-blend-mode:multiply"/></svg>';

  function isActive() {
    return localStorage.getItem(WS_KEY) === "1";
  }
  function retailerName() {
    return localStorage.getItem(WS_NAME_KEY) || "";
  }
  function isAdmin() {
    return sessionStorage.getItem(ADMIN_KEY) === "1";
  }
  function logout() {
    localStorage.removeItem(WS_KEY);
    localStorage.removeItem(WS_NAME_KEY);
  }
  function adminLogout() {
    sessionStorage.removeItem(ADMIN_KEY);
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

  /* login(email, password) -> {ok, role} */
  function login(email, password) {
    email = (email || "").trim().toLowerCase();
    var account = ACCOUNTS.filter(function (a) { return a.email === email && a.password === password; })[0];
    if (!account) return { ok: false };
    if (account.role === "admin") {
      sessionStorage.setItem(ADMIN_KEY, "1");
      return { ok: true, role: "admin" };
    }
    localStorage.setItem(WS_KEY, "1");
    localStorage.setItem(WS_NAME_KEY, account.name);
    return { ok: true, role: "retailer", name: account.name };
  }

  /* ---- Injected UI: banner, account button, login modal ---- */
  var injectedHTML =
    '<div class="wsale-banner" id="wsaleBanner">' +
      '<div class="wsale-banner-inner">' +
        '<span id="wsaleBannerText">🏷️ MODO MAYORISTA ACTIVO — 15% OFF en todo el catálogo</span>' +
        '<button type="button" id="wsaleLogout">Salir del modo mayorista</button>' +
      '</div>' +
    '</div>' +
    '<div class="wsale-overlay" id="wsaleOverlay">' +
      '<div class="wsale-modal">' +
        '<button class="wsale-close" id="wsaleClose" aria-label="Cerrar">&times;</button>' +
        '<div id="wsaleLoggedView" class="wsale-logged-view">' +
          '<span class="wsale-badge">Sesión activa</span>' +
          '<h3 id="wsaleLoggedName">—</h3>' +
          '<p>Los precios mayoristas (15% off) están activos en toda la tienda.</p>' +
          '<button type="button" class="btn btn-ink" id="wsaleGoTienda">Ir a la tienda</button>' +
          '<button type="button" class="wsale-textlink" id="wsaleLogoutModal">Cerrar sesión</button>' +
        '</div>' +
        '<form id="wsaleLoginForm">' +
          '<img src="' + ROOT + 'assets/img/escena-logo.jpg" alt="ESCENA BMX" />' +
          '<h3>INICIAR SESIÓN</h3>' +
          '<p>Acceso para mayoristas y equipo ESCENA.</p>' +
          '<input type="email" id="wsaleEmail" placeholder="Correo" autocomplete="username" required />' +
          '<input type="password" id="wsalePw" placeholder="Contraseña" autocomplete="current-password" required />' +
          '<button type="submit" class="btn btn-ink">Entrar</button>' +
          '<p id="wsaleError">Correo o contraseña incorrectos.</p>' +
          '<p class="wsale-request">¿Tenés una tienda? <a href="' + ROOT + 'mayoristas.html">Conocé el programa de mayoristas</a></p>' +
        '</form>' +
      '</div>' +
    '</div>';

  var injectedCSS =
    '.wsale-banner { display: none; background: var(--ink); color: #fff; border-bottom: 2px solid #fff; }' +
    '.wsale-banner.show { display: block; }' +
    '.wsale-banner-inner { max-width: 1180px; margin: 0 auto; padding: .55rem 1.5rem; display: flex; align-items: center; justify-content: center; gap: 1.2rem; flex-wrap: wrap; text-align: center; }' +
    '.wsale-banner-inner span { font-size: .76rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }' +
    '.wsale-banner-inner button { background: #fff; color: var(--ink); border: none; border-radius: 4px; padding: .35rem .8rem; font-size: .68rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; cursor: pointer; font-family: inherit; }' +
    '.wsale-banner-inner button:hover { opacity: .8; }' +
    '.wsale-strike { text-decoration: line-through; opacity: .55; font-size: .62em; margin-right: .45em; font-weight: 400; }' +
    '.wsale-account-btn { position: relative; display: flex; align-items: center; justify-content: center; width: 46px; height: 46px; background: none; border: none; cursor: pointer; color: var(--ink); padding: 0; }' +
    '.wsale-account-btn svg { width: 24px; height: 24px; fill: none; stroke: var(--ink); stroke-width: 1.8; }' +
    '.wsale-account-btn.is-active svg { fill: var(--ink); stroke: none; }' +
    '.wsale-account-btn .dot { position: absolute; top: 8px; right: 6px; width: 9px; height: 9px; border-radius: 50%; background: #1baf7a; border: 2px solid #fff; display: none; }' +
    '.wsale-account-btn.is-active .dot { display: block; }' +
    'header.top-bar .wsale-account-btn { color: #fff !important; }' +
    'header.top-bar .wsale-account-btn svg { stroke: #fff !important; }' +
    'header.top-bar .wsale-account-btn.is-active svg { fill: #fff !important; }' +
    'header.top-bar .nav-cta svg { fill: var(--ink) !important; }' +
    '.nav-cta { display: inline-flex !important; align-items: center; gap: .45rem; }' +
    '.nav-cta svg { width: 15px; height: 15px; fill: #fff; flex-shrink: 0; }' +
    '.wsale-overlay { position: fixed; inset: 0; z-index: 600; background: rgba(10,10,10,.72); display: none; align-items: center; justify-content: center; padding: 1.2rem; }' +
    '.wsale-overlay.show { display: flex; }' +
    '.wsale-modal { background: #fff; border-radius: 14px; max-width: 400px; width: 100%; padding: 2.2rem 1.8rem 1.8rem; position: relative; text-align: center; box-shadow: 0 30px 80px rgba(0,0,0,.4); }' +
    '.wsale-close { position: absolute; top: .8rem; right: .8rem; width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--line); background: #fff; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--ink); }' +
    '.wsale-close:hover { background: var(--ink); color: #fff; border-color: var(--ink); }' +
    '#wsaleLoginForm img { width: 52px; height: 52px; border-radius: 50%; margin: 0 auto 1rem; background: #fff; border: 1px solid var(--line); }' +
    '#wsaleLoginForm h3, .wsale-logged-view h3 { font-family: "Bebas Neue", sans-serif; font-size: 1.8rem; letter-spacing: .03em; margin-bottom: .5rem; }' +
    '#wsaleLoginForm p, .wsale-logged-view p { font-size: .85rem; color: var(--muted); margin-bottom: 1.1rem; }' +
    '#wsaleLoginForm { display: flex; flex-direction: column; gap: .8rem; }' +
    '#wsaleLoginForm input { border: 1.5px solid var(--line); border-radius: 8px; padding: .85rem 1rem; font-size: .9rem; font-family: inherit; }' +
    '#wsaleLoginForm input:focus { outline: none; border-color: var(--ink); }' +
    '#wsaleError { display: none; color: #c0392b; font-size: .78rem; }' +
    '.wsale-request { font-size: .78rem; color: var(--muted); margin-top: .3rem; }' +
    '.wsale-request a { color: var(--ink); font-weight: 700; text-decoration: underline; }' +
    '.wsale-logged-view { display: none; }' +
    '.wsale-logged-view .wsale-badge { display: inline-block; background: var(--ink); color: #fff; font-size: .64rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; padding: .35rem .8rem; border-radius: 999px; margin-bottom: 1rem; }' +
    '.wsale-logged-view .btn { width: 100%; margin-bottom: .8rem; }' +
    '.wsale-textlink { background: none; border: none; color: var(--muted); font-size: .78rem; text-decoration: underline; cursor: pointer; font-family: inherit; }' +
    '.wsale-textlink:hover { color: var(--ink); }' +
    '.pay-badge { display: inline-flex; align-items: center; justify-content: center; height: 26px; padding: 0 .6rem; background: #fff; border-radius: 5px; }' +
    '.pay-badge svg { height: 13px; width: auto; display: block; }' +
    '.pay-badge.pay-text { font-family: "Inter", sans-serif; font-weight: 800; font-size: .72rem; letter-spacing: .01em; white-space: nowrap; }' +
    '.pay-plain { font-size: .68rem; letter-spacing: .04em; color: rgba(255,255,255,.5); border: 1px solid rgba(255,255,255,.15); border-radius: 5px; padding: .25rem .5rem; }';

  function ensureStyles() {
    if (document.getElementById("wsaleStyles")) return;
    var style = document.createElement("style");
    style.id = "wsaleStyles";
    style.textContent = injectedCSS;
    document.head.appendChild(style);
  }

  function openModal() {
    var overlay = document.getElementById("wsaleOverlay");
    if (!overlay) return;
    var loggedView = document.getElementById("wsaleLoggedView");
    var form = document.getElementById("wsaleLoginForm");
    if (isActive()) {
      document.getElementById("wsaleLoggedName").textContent = retailerName();
      loggedView.style.display = "block";
      form.style.display = "none";
    } else {
      loggedView.style.display = "none";
      form.style.display = "flex";
    }
    overlay.classList.add("show");
  }
  function closeModal() {
    var overlay = document.getElementById("wsaleOverlay");
    if (overlay) overlay.classList.remove("show");
    var err = document.getElementById("wsaleError");
    if (err) err.style.display = "none";
  }

  function renderBanner() {
    var banner = document.getElementById("wsaleBanner");
    if (!banner) return;
    banner.classList.toggle("show", isActive());
    var txt = document.getElementById("wsaleBannerText");
    if (txt && isActive()) {
      txt.textContent = "🏷️ MODO MAYORISTA ACTIVO (" + retailerName() + ") — 15% OFF en todo el catálogo";
    }
  }

  function renderAccountBtn() {
    document.querySelectorAll(".wsale-account-btn").forEach(function (btn) {
      btn.classList.toggle("is-active", isActive());
      btn.setAttribute("aria-label", isActive() ? "Cuenta mayorista (" + retailerName() + ")" : "Iniciar sesión");
    });
  }

  function injectAccountButtons() {
    var btnHTML = '<button type="button" class="wsale-account-btn" aria-label="Iniciar sesión">' + USER_SVG + '<span class="dot"></span></button>';
    document.querySelectorAll(".nav-right").forEach(function (navRight) {
      if (navRight.querySelector(".wsale-account-btn")) return;
      var cartBtn = navRight.querySelector(".cart-btn");
      var wrap = document.createElement("div");
      wrap.innerHTML = btnHTML;
      var btn = wrap.firstChild;
      if (cartBtn) navRight.insertBefore(btn, cartBtn);
      else navRight.appendChild(btn);
    });
  }

  function fixWaCta() {
    document.querySelectorAll('.nav-cta[href*="wa.me"]').forEach(function (a) {
      if (a.querySelector("svg")) return;
      a.insertAdjacentHTML("afterbegin", WA_SVG);
    });
  }

  function renderPaymentBadges() {
    var html =
      '<span class="pay-badge">' + MC_SVG + '</span>' +
      '<span class="pay-badge">' + VISA_SVG + '</span>' +
      '<span class="pay-badge pay-text" style="color:#E5007D;">nequi</span>' +
      '<span class="pay-badge pay-text" style="color:#EE1C25;">DaviPlata</span>' +
      '<span class="pay-badge pay-text" style="color:#003DA5;">PSE</span>' +
      '<span class="pay-badge pay-text" style="color:#0A0A0A;">bold</span>' +
      '<span class="pay-plain">Transferencia</span>' +
      '<span class="pay-plain">Efectivo</span>';
    document.querySelectorAll(".pay-row").forEach(function (el) { el.innerHTML = html; });
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

  function init() {
    ensureStyles();
    document.body.insertAdjacentHTML("afterbegin", injectedHTML);
    injectAccountButtons();
    fixWaCta();
    renderPaymentBadges();
    renderBanner();
    renderAccountBtn();
    rewriteStaticPDP();

    if (/[?&]login=1/.test(window.location.search)) openModal();

    document.addEventListener("click", function (e) {
      if (e.target.closest(".wsale-account-btn")) { openModal(); return; }
      if (e.target.closest("#wsaleClose")) { closeModal(); return; }
      if (e.target.closest("#wsaleOverlay") && e.target.id === "wsaleOverlay") { closeModal(); return; }
      if (e.target.closest("#wsaleLogout, #wsaleLogoutModal")) {
        logout();
        window.location.reload();
        return;
      }
      if (e.target.closest("#wsaleGoTienda")) {
        window.location.href = ROOT + "tienda.html";
        return;
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });

    var form = document.getElementById("wsaleLoginForm");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = document.getElementById("wsaleEmail").value;
      var pw = document.getElementById("wsalePw").value;
      var result = login(email, pw);
      var errEl = document.getElementById("wsaleError");
      if (!result.ok) {
        errEl.style.display = "block";
        return;
      }
      if (result.role === "admin") {
        window.location.href = ROOT + "admin.html";
      } else {
        window.location.href = ROOT + "tienda.html";
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
    retailerName: retailerName,
    isAdmin: isAdmin,
    login: login,
    logout: logout,
    adminLogout: adminLogout,
    applyDiscount: applyDiscount,
    cop: cop,
    mayoristaPrefix: mayoristaPrefix,
    openLoginModal: function () {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", openModal);
      } else {
        openModal();
      }
    }
  };
})();
