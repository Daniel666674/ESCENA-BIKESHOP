/* ESCENA cart — shared localStorage cart + WhatsApp checkout */
(function () {
  var CART_KEY = "escena_cart_v1";
  var WA = "573107630504";
  var ROOT = window.ESCENA_ROOT || "";

  function cop(n) {
    if (window.EscenaWholesale && window.EscenaWholesale.isActive()) n = window.EscenaWholesale.applyDiscount(n);
    return "$" + Math.round(n).toLocaleString("es-CO") + " COP";
  }

  function cartGet() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch (e) { return []; }
  }
  function cartSave(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    renderBadge();
  }
  function sameLine(i, slug, variant) {
    return i.slug === slug && (i.variant || "") === (variant || "");
  }
  function cartAdd(item, qty, maxUnits) {
    qty = qty || 1;
    var items = cartGet();
    var existing = null;
    for (var i = 0; i < items.length; i++) { if (sameLine(items[i], item.slug, item.variant)) { existing = items[i]; break; } }
    var cap = (typeof maxUnits === "number" && !isNaN(maxUnits)) ? maxUnits : null;
    if (existing) {
      existing.qty += qty;
      if (cap !== null) existing.max = cap;
      if (typeof existing.max === "number") existing.qty = Math.min(existing.qty, existing.max);
    } else {
      var newItem = { slug: item.slug, n: item.n, brand: item.brand, price: item.price, img: item.img, qty: qty };
      if (item.variant) newItem.variant = item.variant;
      if (cap !== null) newItem.max = cap;
      if (cap !== null) newItem.qty = Math.min(newItem.qty, cap);
      items.push(newItem);
    }
    cartSave(items);
    renderDrawer();
  }
  function cartRemove(slug, variant) {
    var items = cartGet().filter(function (i) { return !sameLine(i, slug, variant); });
    cartSave(items);
    renderDrawer();
  }
  function cartSetQty(slug, variant, qty) {
    var items = cartGet();
    for (var i = 0; i < items.length; i++) {
      if (sameLine(items[i], slug, variant)) {
        var q = Math.max(1, qty);
        if (typeof items[i].max === "number") q = Math.min(q, Math.max(1, items[i].max));
        items[i].qty = q;
        break;
      }
    }
    cartSave(items);
    renderDrawer();
  }
  function cartCount() {
    return cartGet().reduce(function (sum, i) { return sum + i.qty; }, 0);
  }
  function cartTotal() {
    return cartGet().reduce(function (sum, i) { return sum + i.qty * i.price; }, 0);
  }
  function cartClear() {
    cartSave([]);
    renderDrawer();
  }

  /* ---- DOM injection ---- */
  var drawerHTML =
    '<div class="cart-overlay" id="cartOverlay">' +
      '<div class="cart-drawer" role="dialog" aria-modal="true" aria-label="Tu carrito">' +
        '<div class="cart-head"><h3>Tu carrito</h3><button class="cart-close" id="cartClose" aria-label="Cerrar">&times;</button></div>' +
        '<div class="cart-body" id="cartBody"></div>' +
        '<div class="cart-foot">' +
          '<div class="cart-subtotal"><span>Subtotal</span><span class="amt" id="cartSubtotal">$0 COP</span></div>' +
          '<button class="cart-checkout" id="cartCheckout" type="button">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413"/></svg>' +
            'Finalizar pedido por WhatsApp' +
          '</button>' +
          '<button class="cart-continue" id="cartContinue" type="button">Seguir comprando</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="cart-toast" id="cartToast" style="position:fixed;top:1.2rem;right:1.4rem;z-index:650;background:rgba(255,255,255,.96);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:#0A0A0A;padding:.45rem .8rem;border-radius:999px;border:1px solid rgba(0,0,0,.07);box-shadow:0 6px 20px rgba(0,0,0,.12);font-size:.74rem;font-weight:600;opacity:0;transform:translateY(-6px);transition:opacity .2s, transform .2s;pointer-events:none;max-width:min(300px, calc(100vw - 2.8rem));"></div>';

  function showToast(msg) {
    var t = document.getElementById("cartToast");
    if (!t) return;
    t.textContent = msg;
    t.style.opacity = "1";
    t.style.transform = "translateY(0)";
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(function () {
      t.style.opacity = "0";
      t.style.transform = "translateY(-8px)";
    }, 2000);
  }

  function itemHTML(item) {
    var imgSrc = /^https?:\/\//.test(item.img) ? item.img : ROOT + item.img;
    var href = ROOT + "producto/" + item.slug;
    return (
      '<div class="cart-item" data-slug="' + item.slug + '" data-variant="' + (item.variant || "") + '">' +
        '<a class="ci-img" href="' + href + '"><img src="' + imgSrc + '" alt="' + item.n + '" loading="lazy" width="62" height="62"></a>' +
        '<div class="ci-info">' +
          '<span class="ci-brand">' + item.brand + '</span>' +
          '<h4 class="ci-name"><a href="' + href + '" style="color:inherit;text-decoration:none;">' + item.n + '</a></h4>' +
          (item.variant ? '<span class="ci-variant">' + item.variant + '</span>' : '') +
          '<span class="ci-qty">' +
            '<button type="button" class="ci-dec" aria-label="Reducir cantidad">&minus;</button>' +
            '<span>' + item.qty + '</span>' +
            '<button type="button" class="ci-inc" aria-label="Aumentar cantidad">+</button>' +
          '</span>' +
          '<button type="button" class="ci-remove">Quitar</button>' +
        '</div>' +
        '<div class="ci-price">' + cop(item.price * item.qty) + '</div>' +
      '</div>'
    );
  }

  function renderDrawer() {
    var body = document.getElementById("cartBody");
    var checkoutBtn = document.getElementById("cartCheckout");
    if (!body) return;
    var items = cartGet();
    if (items.length === 0) {
      body.innerHTML = '<p class="cart-empty">Tu carrito está vacío.<br>Agregá partes desde la tienda.</p>';
      if (checkoutBtn) checkoutBtn.disabled = true;
    } else {
      body.innerHTML = items.map(itemHTML).join("");
      if (checkoutBtn) checkoutBtn.disabled = false;
    }
    var subtotalEl = document.getElementById("cartSubtotal");
    if (subtotalEl) subtotalEl.textContent = cop(cartTotal());
  }

  function renderBadge() {
    var n = cartCount();
    var badges = document.querySelectorAll(".cart-badge");
    for (var i = 0; i < badges.length; i++) {
      badges[i].textContent = n;
      if (n > 0) badges[i].classList.add("show");
      else badges[i].classList.remove("show");
    }
  }

  var drawerOpenedFrom = null;
  function openDrawer() {
    var ov = document.getElementById("cartOverlay");
    if (!ov) return;
    drawerOpenedFrom = document.activeElement;
    ov.classList.add("show");
    var closeBtn = document.getElementById("cartClose");
    if (closeBtn) closeBtn.focus();
  }
  function closeDrawer() {
    var ov = document.getElementById("cartOverlay");
    if (ov) ov.classList.remove("show");
    if (drawerOpenedFrom && typeof drawerOpenedFrom.focus === "function") drawerOpenedFrom.focus();
    drawerOpenedFrom = null;
  }

  function buildCheckoutMessage() {
    var items = cartGet();
    var lines = [];
    if (window.EscenaWholesale && window.EscenaWholesale.isActive()) lines.push("🏷️ PEDIDO MAYORISTA (15% aplicado)");
    lines.push("Hola ESCENA 🐕, quiero pedir:");
    items.forEach(function (i) {
      lines.push("• " + i.qty + "x " + i.n + " (" + i.brand + ")" + (i.variant ? " [" + i.variant + "]" : "") + " — " + cop(i.price * i.qty));
    });
    lines.push("Total: " + cop(cartTotal()));
    lines.push("¿Está todo disponible?");
    return lines.join("\n");
  }

  function init() {
    document.body.insertAdjacentHTML("beforeend", drawerHTML);
    renderDrawer();
    renderBadge();

    document.addEventListener("click", function (e) {
      var cartBtn = e.target.closest(".cart-btn");
      if (cartBtn) { openDrawer(); return; }

      var closeBtn = e.target.closest("#cartClose, #cartContinue");
      if (closeBtn) { closeDrawer(); return; }

      var overlay = e.target.closest("#cartOverlay");
      if (overlay && e.target.id === "cartOverlay") { closeDrawer(); return; }

      var incBtn = e.target.closest(".ci-inc");
      if (incBtn) {
        var incRow = incBtn.closest(".cart-item");
        var slugInc = incRow.getAttribute("data-slug"), variantInc = incRow.getAttribute("data-variant");
        var itemsInc = cartGet();
        var curInc = itemsInc.find(function (i) { return sameLine(i, slugInc, variantInc); });
        if (curInc) cartSetQty(slugInc, variantInc, curInc.qty + 1);
        return;
      }
      var decBtn = e.target.closest(".ci-dec");
      if (decBtn) {
        var decRow = decBtn.closest(".cart-item");
        var slugDec = decRow.getAttribute("data-slug"), variantDec = decRow.getAttribute("data-variant");
        var itemsDec = cartGet();
        var curDec = itemsDec.find(function (i) { return sameLine(i, slugDec, variantDec); });
        if (curDec) {
          if (curDec.qty <= 1) cartRemove(slugDec, variantDec);
          else cartSetQty(slugDec, variantDec, curDec.qty - 1);
        }
        return;
      }
      var removeBtn = e.target.closest(".ci-remove");
      if (removeBtn) {
        var remRow = removeBtn.closest(".cart-item");
        cartRemove(remRow.getAttribute("data-slug"), remRow.getAttribute("data-variant"));
        return;
      }
      var checkoutBtn = e.target.closest("#cartCheckout");
      if (checkoutBtn && !checkoutBtn.disabled) {
        var msg = encodeURIComponent(buildCheckoutMessage());
        window.open("https://wa.me/" + WA + "?text=" + msg, "_blank", "noopener");
        cartClear();
        closeDrawer();
        showToast("Pedido enviado por WhatsApp");
        return;
      }
      var addBtn = e.target.closest(".add-cart-btn");
      if (addBtn) {
        var item = {
          slug: addBtn.getAttribute("data-slug"),
          n: addBtn.getAttribute("data-n"),
          brand: addBtn.getAttribute("data-brand"),
          price: parseFloat(addBtn.getAttribute("data-price")),
          img: addBtn.getAttribute("data-img"),
          variant: addBtn.getAttribute("data-variant") || ""
        };
        var unitsAttr = addBtn.getAttribute("data-units");
        var maxUnits = (unitsAttr !== null && unitsAttr !== "") ? parseInt(unitsAttr, 10) : NaN;
        var qtyInput = addBtn.closest("form, .pdp-actions, article") ? addBtn.closest("form, .pdp-actions, article").querySelector(".qty-input") : null;
        var qty = qtyInput ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;
        if (!isNaN(maxUnits)) qty = Math.min(qty, Math.max(1, maxUnits));
        cartAdd(item, qty, maxUnits);
        showToast(item.n + " agregado al carrito");
        var origText = addBtn.textContent;
        addBtn.classList.add("added");
        addBtn.textContent = "Agregado ✓";
        setTimeout(function () {
          addBtn.classList.remove("added");
          addBtn.textContent = origText;
        }, 1300);
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeDrawer();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.EscenaCart = { add: cartAdd, count: cartCount, total: cartTotal, get: cartGet };
})();

/* Header shrink-on-scroll */
(function () {
  var hdr = document.querySelector('.site-header');
  if (!hdr) return;
  function tick() { hdr.classList.toggle('scrolled', window.scrollY > 50); }
  window.addEventListener('scroll', tick, { passive: true });
  tick();
})();

/* ---- Brand strip (subtle moving marquee at the very top) + nav active state.
   Runs on every storefront page; product pages under /producto/ need a "../"
   asset/link prefix. ---- */
(function () {
  // Pages live at the site root or one level deep (producto/ , blog/), so those
  // subdirectories need a "../" prefix for asset + link paths.
  var PFX = /\/(producto|blog)\//.test(location.pathname) ? "../" : "";

  // Cache-busted (?v=N) — assets are served with a 1-year immutable
  // Cache-Control (see .htaccess), so overwriting a logo file in place is
  // invisible to any browser/CDN that already fetched the old bytes unless
  // the URL itself changes. Bump a logo's ?v= whenever its file is replaced.
  var BRAND_LOGOS = [
    { name: "Mutanty", key: "Mutanty", img: "assets/img/logo_01_Mutanty.png?v=2" },
    { name: "Fate", img: "assets/img/logo_02_Fate.jpeg?v=2" },
    { name: "Cult", img: "assets/img/logo_03_Cult.png?v=2" },
    { name: "Fiend", img: "assets/img/logo_04_Fiend.jpeg?v=2" },
    { name: "Shadow", img: "assets/img/logo_05_Shadow.png?v=2" },
    { name: "Wethepeople", img: "assets/img/logo_06_Wethepeople.png?v=3" },
    { name: "Odyssey", img: "assets/img/logo_07_Odyssey.png?v=2" },
    { name: "BSD", img: "assets/img/logo_08_BSD.png?v=2" },
    { name: "Éclat", img: "assets/img/logo_09_Eclat.png?v=2" },
    { name: "Demolition", img: "assets/img/logo_10_Demolition.png?v=3" },
    { name: "Kink BMX", img: "assets/img/logo_11_KinkBMX.png?v=2" },
    { name: "Federal", img: "assets/img/logo_12_Federal.png?v=2" },
    { name: "Animal", img: "assets/img/logo_13_Animal.png?v=2" },
    { name: "Merritt", img: "assets/img/logo_14_Merritt.jpeg?v=2" },
    { name: "Subrosa", img: "assets/img/logo_15_Subrosa.jpeg?v=2" },
    { name: "Stranger", img: "assets/img/logo_16_Stranger.png?v=2" },
    { name: "Volume", img: "assets/img/logo_17_Volume.jpeg?v=2" },
    { name: "Profile Racing", img: "assets/img/logo_18_ProfileRacing.jpeg?v=2" },
    { name: "Cinema", img: "assets/img/logo_19_Cinema.jpeg?v=2" },
    { name: "Primo", img: "assets/img/logo_20_Primo.png?v=2" }
  ];

  var track = document.getElementById("brandStripTrack");
  if (track) {
    function groupHTML() {
      return BRAND_LOGOS.map(function (b) {
        return '<span class="bs-chip"><a href="' + PFX + 'tienda?brand=' +
          encodeURIComponent(b.key || b.name) + '" aria-label="' + b.name +
          '"><img src="' + PFX + b.img + '" alt="' + b.name +
          '" loading="lazy" height="30"></a></span>';
      }).join("");
    }
    track.innerHTML = '<div class="brand-strip-group">' + groupHTML() +
      '</div><div class="brand-strip-group">' + groupHTML() + '</div>';
  }

  /* Active nav state — the static markup is identical on every page, so we
     light up the current section here from the URL. */
  // Normalise the current page name so this works with clean URLs (/tienda),
  // explicit .html (/tienda.html), or the extensionless home (/inicio, /).
  var page = (location.pathname.split("/").pop() || "").toLowerCase().replace(/\.html$/, "");
  if (page === "" || page === "index") page = "inicio";
  var params = new URLSearchParams(location.search);
  var cat = params.get("cat");

  // world tabs
  var world = "bmx";
  if (page === "mtb") world = "mtb";
  else if (page === "skate") world = "skate";
  var wt = document.querySelector('.world-tab[data-world="' + world + '"]');
  if (wt) wt.classList.add("is-active");

  // main nav
  var navKey = null;
  if (params.has("promo")) navKey = "promo";
  else if (cat === "bicicletas") navKey = "bicicletas";
  else if (page === "tienda") navKey = "partes";
  else if (page === "protecciones") navKey = "protecciones";
  else if (page === "ropa" || page === "tenis") navKey = "ropa";
  else if (page === "armar-bmx") navKey = "armar";
  if (navKey) {
    var el = document.querySelector('[data-nav="' + navKey + '"]');
    if (el) {
      if (el.classList.contains("nav-drop")) el.classList.add("active");
      else el.classList.add("active");
    }
  }
})();
