/* ESCENA — guard de agotados para las páginas de producto (producto/*.html)
 *
 * Las páginas de producto son HTML estático generado por el panel: su stock y
 * su bloque "También te puede gustar" quedan congelados en el momento en que
 * se generó la página. Este script las reconcilia contra el catálogo vivo
 * (assets/js/products-data.js) en cada carga, para que nunca contradigan a la
 * tienda:
 *
 *   1. Si el producto está agotado, muestra el aviso y apaga la compra.
 *   2. Marca OutOfStock en los datos estructurados (Google recomienda
 *      conservar la página con OutOfStock para agotados temporales: se
 *      mantiene el posicionamiento para cuando vuelva la mercancía).
 *   3. Poda del bloque de relacionados cualquier tarjeta que apunte a un
 *      producto oculto, y la repone con otro de la misma categoría que sí
 *      esté disponible.
 *
 * No borra nada del catálogo: el panel de inventario sigue viendo todo.
 */
(function (w, d) {
  "use strict";

  var S = w.ESCENA_STOCK;
  if (!S || !w.ESCENA_PRODUCTS) return; // sin catálogo vivo, la página se queda como está
  var WA = "573107630504";

  function slugOfPage() {
    var btn = d.querySelector(".add-cart-btn[data-slug]");
    if (btn) return btn.getAttribute("data-slug");
    var last = w.location.pathname.split("/").pop() || "";
    return last.replace(/\.html$/, "");
  }

  function cop(n) {
    return "$" + String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " COP";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  var me = S.bySlug(slugOfPage());

  /* ---- 1 + 2: producto agotado ---- */
  function markOutOfStock(p) {
    var actions = d.getElementById("pdpActions");

    if (actions && !d.getElementById("pdpOutNotice")) {
      var name = p.n || d.title;
      var msg = "Hola ESCENA 🐕, quiero que me avisen cuando vuelva a entrar: " +
        name + ".\n" + w.location.origin + w.location.pathname;
      var box = d.createElement("div");
      box.id = "pdpOutNotice";
      box.setAttribute("style",
        "max-width:340px;margin:0 0 1.1rem;padding:.9rem 1rem;border:1.5px solid #c0392b;" +
        "border-radius:10px;background:#fff5f4;");
      box.innerHTML =
        '<p style="margin:0 0 .55rem;font-size:.82rem;font-weight:800;letter-spacing:.04em;' +
        'text-transform:uppercase;color:#c0392b;">Agotado temporalmente</p>' +
        '<p style="margin:0 0 .7rem;font-size:.82rem;line-height:1.45;color:#444;">' +
        'Se nos acabó por ahora. Escríbenos y te avisamos apenas vuelva a entrar.</p>' +
        '<a href="https://wa.me/' + WA + '?text=' + encodeURIComponent(msg) + '" ' +
        'target="_blank" rel="noopener" ' +
        'style="display:inline-block;background:#0A0A0A;color:#fff;text-decoration:none;' +
        'font-size:.78rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;' +
        'padding:.6rem 1rem;border-radius:999px;">Avísame cuando llegue</a>';
      actions.parentNode.insertBefore(box, actions);
    }

    // El applyStock() de la página ya apaga el botón cuando su data-units dice
    // 0, pero ese número viene congelado del HTML: si el stock bajó después de
    // generar la página, seguiría diciendo "Agregar al carrito". Lo forzamos.
    if (actions) actions.classList.add("is-agotado");
    var btn = d.querySelector(".add-cart-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Agotado";
      btn.setAttribute("data-units", "0");
    }
    var hint = d.getElementById("pdpStockHint");
    if (hint) {
      hint.textContent = "Agotado";
      hint.classList.add("is-out");
      hint.classList.remove("is-low");
      hint.setAttribute("data-units", "0");
    }
  }

  function markSchemaOutOfStock() {
    var nodes = d.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < nodes.length; i++) {
      var data;
      try { data = JSON.parse(nodes[i].textContent); } catch (e) { continue; }
      if (!data || data["@type"] !== "Product" || !data.offers) continue;
      var offers = [].concat(data.offers);
      offers.forEach(function (o) { o.availability = "https://schema.org/OutOfStock"; });
      data.offers = Array.isArray(data.offers) ? offers : offers[0];
      nodes[i].textContent = JSON.stringify(data);
    }
  }

  if (me && S.isOut(me)) {
    markOutOfStock(me);
    markSchemaOutOfStock();
  }

  /* ---- 3: relacionados ---- */
  function cardHTML(q) {
    return '<a class="r-card" href="' + esc(q.slug) + '">\n' +
      '        <div class="ph" style="position:relative;"><img src="../' + esc(q.img) +
      '" alt="' + esc(q.n) + (q.brand ? " - " + esc(q.brand) : "") +
      ' BMX" loading="lazy" width="300" height="300" /></div>\n' +
      '        <div class="body">\n' +
      '          <span class="brand-lbl">' + esc(q.brand || "") + '</span>\n' +
      '          <h3>' + esc(q.n) + '</h3>\n' +
      '          <div class="price">' + cop(q.price) + '</div>\n' +
      '        </div>\n      </a>';
  }

  function fixRelated() {
    var block = d.querySelector(".related");
    var grid = block && block.querySelector(".related-grid");
    if (!grid) return;

    var cards = [].slice.call(grid.querySelectorAll(".r-card"));
    var wanted = cards.length; // conservar el mismo tamaño de fila que diseñó la página
    var kept = [];

    cards.forEach(function (a) {
      var slug = (a.getAttribute("href") || "").replace(/^\.\//, "").replace(/\.html$/, "");
      var q = S.bySlug(slug);
      // Un slug que no está en el catálogo es una página vieja que ya no
      // tenemos cómo verificar: la dejamos, no es asunto de este cambio.
      if (q && !S.isVisible(q)) { a.parentNode.removeChild(a); return; }
      kept.push(slug);
    });

    if (kept.length >= wanted) return; // no se quitó nada

    // Reponer con productos disponibles de la MISMA categoría, para que la fila
    // no quede con una sola tarjeta estirada. Si esta página ya no corresponde a
    // ningún producto del catálogo (quedan ~70 páginas de productos viejos), no
    // sabemos su categoría: podamos y no reponemos, antes que rellenar la fila
    // con cosas que no tienen nada que ver.
    var pool = !me ? [] : (w.ESCENA_PRODUCTS || []).filter(function (q) {
      return q && q.slug && q.img &&
        q.slug !== me.slug &&
        q.cat === me.cat &&
        kept.indexOf(q.slug) === -1 &&
        S.isVisible(q) &&
        q.img.indexOf("frame-placeholder") === -1 && q.img.indexOf("data:") !== 0;
    });

    for (var i = 0; i < pool.length && kept.length < wanted; i++) {
      grid.insertAdjacentHTML("beforeend", cardHTML(pool[i]));
      kept.push(pool[i].slug);
    }

    // Si la categoría entera se quedó sin disponibles, ocultamos el bloque en
    // vez de dejar un título con la fila vacía.
    if (!grid.querySelector(".r-card")) block.style.display = "none";
  }

  fixRelated();
})(window, document);
