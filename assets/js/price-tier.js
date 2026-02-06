/**
 * KBWG מחיר Tier helpers (no build step; works on GitHub Pages).
 *
 * Shows price level as $$$$$ where inactive $ are gray.
 *
 * Global API:
 *   window.KBWGPriceTier = {
 *     priceTierFromUsd,
 *     renderPriceTier,
 *     sortBrandsCheapestFirst,
 *     sortProductsCheapestFirst
 *   }
 */
(function (global) {
  'use strict';

  /**
   * Map a representative USD price to a tier 1..5.
   * You can tune these thresholds for your audience/category.
   */
  function priceTierFromUsd(usd) {
    var p = Number(usd);
    if (!Number.isFinite(p) || p <= 0) return 3; // sensible default if unknown
    if (p <= 12) return 1;
    if (p <= 25) return 2;
    if (p <= 45) return 3;
    if (p <= 80) return 4;
    return 5;
  }

  /**
   * Create a DOM node that shows $$$$$ with the right amount "active".
   * @param {number} tier 1..5
   * @param {object} [opts]
   * @param {string} [opts.size] 'sm' | undefined
   */
  function renderPriceTier(tier, opts) {
    opts = opts || {};
    var t = Math.max(1, Math.min(5, Number(tier) || 3));

    var wrap = document.createElement('span');
    wrap.className = 'price-tier price-tier--t' + t + (opts.size === 'sm' ? ' price-tier--sm' : '');
    wrap.setAttribute('aria-label', 'מחיר level: ' + t + ' out of 5');

    for (var i = 1; i <= 5; i++) {
      var s = document.createElement('span');
      s.className = 'dollar' + (i <= t ? '' : ' inactive');
      s.textContent = '$';
      wrap.appendChild(s);
    }
    return wrap;
  }

  /**
   * Helper: sorts brands with cheapest first by priceTier then name.
   */
  function sortBrandsCheapestFirst(brands) {
    return (brands || []).slice().sort(function (a, b) {
      var ta = Number((a && a.priceTier) != null ? a.priceTier : 999);
      var tb = Number((b && b.priceTier) != null ? b.priceTier : 999);
      if (ta !== tb) return ta - tb;
      return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), undefined, { sensitivity: 'base' });
    });
  }

  /**
   * Helper: sorts products by cheapest price range first.
   * Expects product.priceMin (number) or product.priceRangeMin (number)
   */
  function sortProductsCheapestFirst(products) {
    return (products || []).slice().sort(function (a, b) {
      var pa = Number((a && (a.priceMin != null ? a.priceMin : a.priceRangeMin)) != null ? (a.priceMin != null ? a.priceMin : a.priceRangeMin) : Infinity);
      var pb = Number((b && (b.priceMin != null ? b.priceMin : b.priceRangeMin)) != null ? (b.priceMin != null ? b.priceMin : b.priceRangeMin) : Infinity);
      if (pa !== pb) return pa - pb;
      return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), undefined, { sensitivity: 'base' });
    });
  }

  global.KBWGPriceTier = {
    priceTierFromUsd: priceTierFromUsd,
    renderPriceTier: renderPriceTier,
    sortBrandsCheapestFirst: sortBrandsCheapestFirst,
    sortProductsCheapestFirst: sortProductsCheapestFirst
  };
})(window);
