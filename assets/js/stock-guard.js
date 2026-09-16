/* ESCENA — guard de agotados y descontinuados para las páginas de producto
 *
 * Las páginas de producto son HTML estático generado por el panel: su stock,
 * su precio y su bloque "También te puede gustar" quedan congelados en el
 * momento en que se generó la página. Este script las reconcilia contra el
 * catálogo vivo (assets/js/products-data.js) en cada carga, para que nunca
 * contradigan a la tienda.
 *
 * Tres estados posibles:
 *
 *   A la venta    → no toca nada.
 *   Agotado       → aviso, compra apagada, OutOfStock en el schema.
 *   Descontinuado → el producto ya no está en el catálogo. La página existe
 *                   (Google la indexó, hay enlaces compartidos por WhatsApp)
 *                   pero el producto se fue hace meses. Sin este guard muestra
 *                   precio viejo y botón de compra activo, y alguien pide por
 *                   WhatsApp algo que no existe.
 *
 * En los dos últimos casos el bloque de relacionados se convierte en la salida:
 * alternativas reales de la misma categoría, en vez de un callejón sin salida.
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

  /* La categoría no está en un atributo propio, pero sí en la migaja de pan
   * que el generador hornea en cada página (../tienda?cat=cadenas). Es la
   * única forma de saber a qué familia pertenece un producto que ya no está
   * en el catálogo — y sin ella no podríamos ofrecer alternativas. */
  function catOfPage() {
    var a = d.querySelector('.breadcrumb a[href*="cat="]');
    if (!a) return null;
    var m = (a.getAttribute("href") || "").match(/[?&]cat=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function cop(n) {
    return "$" + String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " COP";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  var slug = slugOfPage();
  var me = S.bySlug(slug);
  var cat = me ? me.cat : catOfPage();
  var titulo = (d.querySelector("h1") || {}).textContent || d.title;

  /* ---------- apagar la compra ---------- */
  function killPurchase() {
    var actions = d.getElementById("pdpActions");
    if (actions) actions.classList.add("is-agotado");

    // El applyStock() de la página se vuelve a ejecutar cada vez que alguien
    // toca una variante, y podría volver a habilitar el botón con el stock
    // congelado en el HTML. Poniendo TODOS los data-units en 0, cualquier
    // recálculo posterior llega igual a "no hay" — no hay forma de revivirlo.
    var conStock = d.querySelectorAll("[data-units]");
    for (var i = 0; i < conStock.length; i++) conStock[i].setAttribute("data-units", "0");

    var opts = d.querySelectorAll(".pdp-variant-options button");
    for (var j = 0; j < opts.length; j++) opts[j].disabled = true;

    var btn = d.querySelector(".add-cart-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Agotado"; }
    return { actions: actions, btn: btn };
  }

  function setSchema(availability) {
    var nodes = d.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < nodes.length; i++) {
      var data;
      try { data = JSON.parse(nodes[i].textContent); } catch (e) { continue; }
      if (!data || data["@type"] !== "Product" || !data.offers) continue;
      var offers = [].concat(data.offers);
      offers.forEach(function (o) { o.availability = availability; });
      data.offers = Array.isArray(data.offers) ? offers : offers[0];
      nodes[i].textContent = JSON.stringify(data);
    }
  }

  function notice(opts) {
    var actions = d.getElementById("pdpActions");
    if (!actions || d.getElementById("pdpOutNotice")) return;
    var box = d.createElement("div");
    box.id = "pdpOutNotice";
    box.setAttribute("style",
      "max-width:340px;margin:0 0 1.1rem;padding:.9rem 1rem;border:1.5px solid #c0392b;" +
      "border-radius:10px;background:#fff5f4;");
    box.innerHTML =
      '<p style="margin:0 0 .55rem;font-size:.82rem;font-weight:800;letter-spacing:.04em;' +
      'text-transform:uppercase;color:#c0392b;">' + esc(opts.titulo) + '</p>' +
      '<p style="margin:0 0 .7rem;font-size:.82rem;line-height:1.45;color:#444;">' +
      esc(opts.texto) + '</p>' +
      '<a href="https://wa.me/' + WA + '?text=' + encodeURIComponent(opts.wa) + '" ' +
      'target="_blank" rel="noopener" ' +
      'style="display:inline-block;background:#0A0A0A;color:#fff;text-decoration:none;' +
      'font-size:.78rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;' +
      'padding:.6rem 1rem;border-radius:999px;">' + esc(opts.cta) + '</a>';
    actions.parentNode.insertBefore(box, actions);
  }

  var url = w.location.origin + w.location.pathname;
  var estado = !me ? "descontinuado" : (S.isOut(me) ? "agotado" : "ok");

  if (estado === "agotado") {
    killPurchase();
    var hint = d.getElementById("pdpStockHint");
    if (hint) { hint.textContent = "Agotado"; hint.classList.add("is-out"); hint.classList.remove("is-low"); }
    notice({
      titulo: "Agotado temporalmente",
      texto: "Se nos acabó por ahora. Escríbenos y te avisamos apenas vuelva a entrar.",
      cta: "Avísame cuando llegue",
      wa: "Hola ESCENA 🐕, quiero que me avisen cuando vuelva a entrar: " + titulo + ".\n" + url
    });
    setSchema("https://schema.org/OutOfStock");
  }

  if (estado === "descontinuado") {
    var ref = killPurchase();
    if (ref.btn) ref.btn.textContent = "No disponible";
    var hint2 = d.getElementById("pdpStockHint");
    if (hint2) { hint2.textContent = "Ya no disponible"; hint2.classList.add("is-out"); }

    // El precio que muestra la página es de la última vez que se generó, y
    // puede tener meses. Mostrarlo como si fuera vigente es peor que no
    // mostrarlo: alguien llega desde Google esperando pagar eso.
    var precio = d.querySelector(".pdp-price");
    if (precio) {
      precio.style.textDecoration = "line-through";
      precio.style.opacity = ".45";
      precio.setAttribute("title", "Precio de referencia — este producto ya no está a la venta");
    }

    // "Pedir por WhatsApp" apuntaba a comprar este producto exacto.
    var waLink = d.getElementById("pdpWaLink");
    if (waLink) {
      waLink.textContent = "Preguntar por algo similar";
      waLink.href = "https://wa.me/" + WA + "?text=" + encodeURIComponent(
        "Hola ESCENA 🐕, vi este producto en la web pero ya no está disponible: " +
        titulo + ".\n¿Tienen algo parecido?\n" + url);
    }

    notice({
      titulo: "Ya no manejamos este producto",
      texto: "Salió de nuestro catálogo. Abajo te dejamos alternativas de la misma categoría, o escríbenos y te ayudamos a encontrar el reemplazo.",
      cta: "Buscar un reemplazo",
      wa: "Hola ESCENA 🐕, busco un reemplazo para: " + titulo + ".\n" + url
    });
    setSchema("https://schema.org/Discontinued");
  }

  /* ---------- relacionados ---------- */
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

  function alternativas(excluir, ignorarCat) {
    return (w.ESCENA_PRODUCTS || []).filter(function (q) {
      return q && q.slug && q.img &&
        (ignorarCat || (cat && q.cat === cat)) &&
        q.slug !== slug &&
        excluir.indexOf(q.slug) === -1 &&
        S.isVisible(q) &&
        q.img.indexOf("frame-placeholder") === -1 && q.img.indexOf("data:") !== 0;
    });
  }

  function fixRelated() {
    var block = d.querySelector(".related");

    // Dos páginas se generaron sin bloque de relacionados porque en ese momento
    // su categoría no tenía ningún otro producto. Si además están
    // descontinuadas, quedan sin ninguna salida: se lo creamos. El CSS de
    // .related está en la hoja de estilos de todas las páginas, así que el
    // bloque hereda el diseño sin tocar nada más.
    if (!block && estado !== "ok") {
      var pie = d.querySelector("footer");
      if (!pie) return;
      block = d.createElement("div");
      block.className = "related";
      block.innerHTML = '<h2>Alternativas disponibles</h2><div class="related-grid"></div>';
      pie.parentNode.insertBefore(block, pie);
    }

    var grid = block && block.querySelector(".related-grid");
    if (!grid) return;

    var cards = [].slice.call(grid.querySelectorAll(".r-card"));
    var wanted = cards.length || 4; // una página descontinuada puede no traer bloque lleno
    var kept = [];

    cards.forEach(function (a) {
      var s = (a.getAttribute("href") || "").replace(/^\.\//, "").replace(/\.html$/, "");
      var q = S.bySlug(s);
      // Un slug que no está en el catálogo es una página vieja: la quitamos,
      // porque enlazar a un descontinuado desde otro producto no ayuda a nadie.
      if (!q || !S.isVisible(q)) { a.parentNode.removeChild(a); return; }
      // La foto quedó congelada cuando se generó ESTA página: si al producto
      // le cambiaron la portada después, la ruta horneada apunta a un archivo
      // que el panel ya puede haber borrado. Repintamos desde el catálogo vivo
      // para que ninguna tarjeta dependa de una ruta vieja.
      var im = a.querySelector("img");
      if (im && q.img) {
        var fresh = "../" + q.img;
        if (im.getAttribute("src") !== fresh) im.setAttribute("src", fresh);
      }
      kept.push(s);
    });

    if (estado === "descontinuado" && block) {
      var h2 = block.querySelector("h2");
      if (h2) h2.textContent = "Alternativas disponibles";
    }

    if (kept.length >= wanted) return;

    function rellenar(pool) {
      for (var i = 0; i < pool.length && kept.length < wanted; i++) {
        grid.insertAdjacentHTML("beforeend", cardHTML(pool[i]));
        kept.push(pool[i].slug);
      }
    }

    rellenar(alternativas(kept, false));

    // Hay categorías enteras sin nada vendible (hoy "piezas": 10 de las 71
    // páginas descontinuadas caen ahí). Esconder el bloque las deja en un
    // callejón sin salida, que es justo lo que queríamos evitar al no
    // borrarlas: mejor ofrecer el resto de la tienda, diciendo claramente
    // que ya no es la misma categoría.
    if (!grid.querySelector(".r-card")) {
      rellenar(alternativas(kept, true));
      var h2b = block.querySelector("h2");
      if (h2b && grid.querySelector(".r-card")) h2b.textContent = "Lo que sí tenemos";
    }

    if (!grid.querySelector(".r-card")) block.style.display = "none";
  }

  fixRelated();
})(window, document);
