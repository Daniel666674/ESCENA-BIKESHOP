/* ESCENA — reglas de stock y visibilidad (fuente única de verdad)
 *
 * Vive en su propio archivo a propósito: admin.html reescribe
 * assets/js/products-data.js COMPLETO en cada publicación
 * ("window.ESCENA_PRODUCTS = " + JSON.stringify(...)), así que cualquier
 * lógica que viviera ahí se borraría sola en la siguiente publicación.
 *
 * Regla acordada: un producto solo desaparece de la tienda cuando no queda
 * NADA vendible — ni unidades sueltas ni ninguna de sus variantes. Un
 * producto con units:0 pero con un color en 1 sigue a la venta (caso real:
 * marco-profit-culver-gris-cromolio).
 *
 * El producto nunca se borra del catálogo: el panel de inventario lo sigue
 * viendo completo. Esto solo decide qué se PINTA en el sitio público.
 */
(function (w) {
  "use strict";

  function num(v) {
    return (typeof v === "number" && isFinite(v)) ? v : null;
  }

  function variantsOf(p) {
    var out = [];
    if (p && p.sizes && p.sizes.length) out = out.concat(p.sizes);
    if (p && p.colors && p.colors.length) out = out.concat(p.colors);
    return out;
  }

  /* Unidades realmente vendibles = la mejor opción disponible (el producto
   * suelto o su variante con más stock). NO es la suma: sumar mezclaría
   * tallas distintas y diría "hay 4" cuando en realidad hay 4 repartidas en
   * tallas que el cliente puede no querer.
   *
   * Devuelve null cuando el catálogo no registra stock para este producto
   * (ni en units ni en variantes) — desconocido no es lo mismo que cero, y
   * ante la duda nunca escondemos algo que sí se puede vender.
   */
  function available(p) {
    if (!p) return 0;
    var best = null;
    var u = num(p.units);
    if (u !== null) best = u;
    variantsOf(p).forEach(function (v) {
      var vu = num(v && v.units);
      if (vu !== null && (best === null || vu > best)) best = vu;
    });
    return best;
  }

  /* true solo cuando sabemos con certeza que está en cero. */
  function isOut(p) {
    var a = available(p);
    return a !== null && a <= 0;
  }

  /* Lo que deciden las vitrinas: published !== false es el borrador del
   * panel (ya existía); isOut es el agotado. */
  function isVisible(p) {
    return !!p && p.published !== false && !isOut(p);
  }

  function bySlug(slug) {
    var list = w.ESCENA_PRODUCTS || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].slug === slug) return list[i];
    }
    return null;
  }

  w.ESCENA_STOCK = {
    available: available,
    isOut: isOut,
    isVisible: isVisible,
    bySlug: bySlug
  };
})(window);
