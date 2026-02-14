// Build: 2026-02-06-v24
// Renders "Today's Top Deals" from data/products.json by selecting products where isDiscounted === true.
// Enriches badge flags from data/intl-brands.json when available.
// Matches the "Products" page UI badges (tags + meta pills) but does NOT show the price-range/tier UI.
(function () {
  'use strict';

  // --- Config ---
  var AMAZON_TAG = 'nocrueltyil-20'; // used only if a link is missing a tag=
  var MAX_DEALS = 60;

  // Boolean helper (accepts true/"true"/1)
  function isTrueFlag(v) {
    if (v === true) return true;
    if (v === 1) return true;
    if (v === "1") return true;
    if (typeof v === "string") {
      var s = v.trim().toLowerCase();
      if (s === "true" || s === "yes") return true;
    }
    return false;
  }


  // Pagination (v10)
  var KB_PAGE = 1;
  var KB_PER = 0;
  var KB_DEALS = [];
  var KB_PAGER = null;

  function kbPerPage(kind){
    var w = window.innerWidth || 1024;
    if(kind === 'posts'){ return w <= 640 ? 6 : (w <= 1024 ? 9 : 12); }
    if(kind === 'bundles'){ return w <= 640 ? 4 : (w <= 1024 ? 6 : 8); }
    if(kind === 'picker'){ return w <= 640 ? 10 : (w <= 1024 ? 14 : 18); }
    if(kind === 'places'){ return w <= 640 ? 10 : (w <= 1024 ? 14 : 16); }
    if(kind === 'deals'){ return w <= 640 ? 12 : (w <= 1024 ? 18 : 24); }
    if(kind === 'brands'){ return w <= 640 ? 12 : (w <= 1024 ? 18 : 24); }
    if(kind === 'hg'){ return w <= 640 ? 3 : (w <= 1024 ? 5 : 8); } // groups per page
    // default grid
    return w <= 640 ? 12 : (w <= 1024 ? 18 : 24);
  }

  function kbEnsurePager(afterEl, id){
    if(!afterEl) return null;
    var ex = document.getElementById(id);
    if(ex) return ex;
    var wrap = document.createElement('div');
    wrap.className = 'kbPager';
    wrap.id = id;
    afterEl.insertAdjacentElement('afterend', wrap);
    return wrap;
  }

  function kbRenderPager(pagerEl, page, totalItems, perPage, onPage){
    if(!pagerEl) return;
    var totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    // show pager only when it actually saves work (2+ pages)
    if(totalPages <= 1){
      pagerEl.innerHTML = '';
      pagerEl.style.display = 'none';
      return;
    }
    pagerEl.style.display = 'flex';

    // clamp
    if(page < 1) page = 1;
    if(page > totalPages) page = totalPages;

    var prevDisabled = page <= 1;
    var nextDisabled = page >= totalPages;

    pagerEl.innerHTML = ''
      + '<button class="btnSmall btnGhost" type="button" ' + (prevDisabled ? 'disabled aria-disabled="true"' : '') + ' data-kbprev>הקודם</button>'
      + '<span class="kbPagerInfo">עמוד ' + page + ' מתוך ' + totalPages + '</span>'
      + '<button class="btnSmall btnGhost" type="button" ' + (nextDisabled ? 'disabled aria-disabled="true"' : '') + ' data-kbnext>הבא</button>';

    var prevBtn = pagerEl.querySelector('[data-kbprev]');
    var nextBtn = pagerEl.querySelector('[data-kbnext]');
    if(prevBtn) prevBtn.onclick = function(){ if(page>1) onPage(page-1); };
    if(nextBtn) nextBtn.onclick = function(){ if(page<totalPages) onPage(page+1); };
  }

  function kbRangeText(page, totalItems, perPage){
    if(!totalItems) return 'אין תוצאות';
    var start = (page-1)*perPage + 1;
    var end = Math.min(totalItems, page*perPage);
    return 'מציגים ' + start + '–' + end + ' מתוך ' + totalItems;
  }


  // Ensure the image area renders nicely even if your global CSS doesn't style it yet.
  (function injectDealMediaStyles() {
    var STYLE_ID = 'todaysDealsMediaStyles';
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.dealMedia{display:block;overflow:hidden;border-radius:14px;}',
      '.dealImg{display:block;width:100%;height:auto;aspect-ratio:1/1;object-fit:cover;}',
      '.dealPlaceholder{display:flex;align-items:center;justify-content:center;aspect-ratio:1/1;font-size:34px;}',
      '.dealCard .dealTop{margin-top:10px;}',
      '.dealCard .pMeta.dealPills{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;}',
      '.dealMeta.tags{margin-top:10px;}'
    ].join('');
    document.head.appendChild(style);
  })();

  // --- Helpers ---
  function hasOwn(obj, k) {
    return Object.prototype.hasOwnProperty.call(obj || {}, k);
  }

  function safeText(v) {
    return (v == null) ? '' : String(v);
  }

  function esc(s) {
    return safeText(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isFileProtocol() {
    try { return location && location.protocol === 'file:'; } catch (e) { return false; }
  }

  // Resolve correctly when Weglot serves pages under /en/... (or when hosted under a subpath).
  function siteBaseFromScript() {
    // Prefer global helper from site.js if it exists.
    try {
      if (typeof window.__kbwgSiteBase === 'string' && window.__kbwgSiteBase) return window.__kbwgSiteBase;
      if (typeof window.__kbwgResolveFromSiteBase === 'function') {
        // We'll still compute base here for our own resolveFromBase; helper resolves directly.
        // fall through.
      }
    } catch (e) {}

    try {
      var src = '';
      try { src = (document.currentScript && document.currentScript.src) ? document.currentScript.src : ''; } catch (e) { src = ''; }
      if (!src) {
        var scripts = document.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i--) {
          var ssrc = scripts[i] && scripts[i].src ? String(scripts[i].src) : '';
          if (ssrc.indexOf('todays-deals.js') !== -1) { src = ssrc; break; }
        }
      }
      if (!src) return '/';
      var u = new URL(src, location.href);
      var p = u.pathname || '/';
      var idx = p.indexOf('/assets/js/');
      var base = idx >= 0 ? p.slice(0, idx) : p.replace(/\/[^\/]+$/, '');
      base = base.replace(/\/+$/, '');
      var parts = base.split('/').filter(Boolean);
      var langs = { en: 1, he: 1, iw: 1, ar: 1, fr: 1, es: 1, de: 1, ru: 1 };
      if (parts.length && langs[parts[parts.length - 1]]) parts.pop();
      return '/' + parts.join('/');
    } catch (e) {
      return '/';
    }
  }

  function resolveFromBase(rel) {
    try {
      if (!rel) return rel;
      // If site.js exposes a resolver, prefer it.
      if (typeof window.__kbwgResolveFromSiteBase === 'function') return window.__kbwgResolveFromSiteBase(rel);
      var p = String(rel).replace(/^\.\//, '');
      if (/^https?:\/\//i.test(p)) return p;
      var base = siteBaseFromScript() || '/';
      if (base === '/') return '/' + p.replace(/^\//, '');
      return base + '/' + p.replace(/^\//, '');
    } catch (e) {
      return rel;
    }
  }

  function stripDiacritics(s) {
    var str = safeText(s);
    try {
      return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (e) {
      return str;
    }
  }

  function brandKey(name) {
    // Keep Hebrew chars too (for safety), normalize punctuation/spaces/diacritics.
    return stripDiacritics(name)
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9\u0590-\u05FF]+/g, '');
  }

  function buildBrandIndex(brands) {
    var byKey = {};
    var list = [];
    var suffixes = ['beauty','cosmetics','skincare','skinc','skin','care','company','co','labs','lab'];

    for (var i = 0; i < (brands || []).length; i++) {
      var b = brands[i];
      if (!b) continue;
      var k = brandKey(b.name || b.website || b.site || '');
      if (!k) continue;

      if (!byKey[k]) byKey[k] = b;
      list.push({ k: k, b: b });

      // aliases (e.g. "UpCircle" -> "UpCircle Beauty")
      for (var s = 0; s < suffixes.length; s++) {
        var suf = suffixes[s];
        if (k.length > suf.length + 3 && k.slice(-suf.length) === suf) {
          var k2 = k.slice(0, -suf.length);
          if (k2 && !byKey[k2]) byKey[k2] = b;
        }
      }
    }
    return { byKey: byKey, list: list };
  }

  function findBrand(index, name) {
    if (!index) return null;
    var k = brandKey(name);
    if (!k) return null;

    if (index.byKey[k]) return index.byKey[k];

    if (k.length < 5) return null;
    var best = null;
    var bestScore = Infinity;

    for (var i = 0; i < index.list.length; i++) {
      var it = index.list[i];
      var bk = it.k;
      if (!bk) continue;

      var ok = (bk.indexOf(k) === 0) || (k.indexOf(bk) === 0) || (bk.indexOf(k) !== -1);
      if (!ok) continue;

      var score = Math.abs(bk.length - k.length);
      if (score < bestScore) { best = it.b; bestScore = score; }
    }

    return best;
  }

  // --- Category + meta helpers (match products page) ---
  var CAT_ALIASES = { fragrances: 'fragrance', perfume: 'fragrance', perfumes: 'fragrance', frag: 'fragrance' };
  function normCat(v) {
    var s = safeText(v).trim().toLowerCase();
    return CAT_ALIASES[s] || s;
  }
  function getCatsRaw(p) {
    if (p && Array.isArray(p.categories)) return p.categories.map(normCat).filter(Boolean);
    if (p && p.category != null) return [normCat(p.category)].filter(Boolean);
    if (p && p.cat != null) return [normCat(p.cat)].filter(Boolean);
    return [];
  }

  var CATEGORY_LABELS = {
    face: 'פנים',
    hair: 'שיער',
    body: 'גוף',
    makeup: 'איפור',
    fragrance: 'בישום',
    sun: 'שמש',
    teeth: 'שיניים',
    baby: 'ילדים',
    'mens-care': 'גברים',
    "health": "\u05d1\u05e8\u05d9\u05d0\u05d5\u05ea"
};
  var CATEGORY_PRIORITY = [
    "makeup",
    "hair",
    "body",
    "sun",
    "teeth",
    "fragrance",
    "baby",
    "mens-care",
    "health",
    "face"
  ];
  var CATEGORY_SYNONYMS = {
    skincare: 'face',
    cleanser: 'face',
    clean: 'face',
    facewash: 'face',
    face_wash: 'face',
    soap: 'body',
    suncare: 'sun',
    spf: 'sun',
    oral: 'teeth',
    dental: 'teeth',
    "skin": "face",
    "skincare": "face",
    "cleaning": "health",
    "household": "health",
    "hygiene": "health",
    "paper": "health",
    "wipes": "health",
    "laundry": "health",
    "dish": "health"
};

  function getPrimaryCategoryKey(p) {
    var cats = getCatsRaw(p);
    if (!cats.length) return '';
    var normed = cats.map(function (c) { return CATEGORY_SYNONYMS[c] || c; }).filter(Boolean);
    for (var i = 0; i < CATEGORY_PRIORITY.length; i++) {
      if (normed.indexOf(CATEGORY_PRIORITY[i]) !== -1) return CATEGORY_PRIORITY[i];
    }
    if (normed.indexOf('body') !== -1) return 'body';
    if (normed.indexOf('face') !== -1) return 'face';
    return '';
  }

  function getCategoryLabelFromProduct(p) {
    if (p && p.categoryLabel && p.categoryLabel !== 'אחר') return p.categoryLabel;
    var key = getPrimaryCategoryKey(p);
    return key ? (CATEGORY_LABELS[key] || '') : '';
  }

  function getOfferWithMinFreeShip(p) {
    var offers = (p && Array.isArray(p.offers)) ? p.offers : [];
    if (!offers.length) return null;

    var freeTo = [];
    for (var i = 0; i < offers.length; i++) {
      var o = offers[i];
      if (o && isTrueFlag(o.freeShipToIsrael)) freeTo.push(o);
    }
    var pool = freeTo.length ? freeTo : offers;

    var best = null;
    for (var j = 0; j < pool.length; j++) {
      var oo = pool[j];
      if (!oo) continue;
      var v = (typeof oo.freeShipOver === 'number' && isFinite(oo.freeShipOver)) ? oo.freeShipOver : null;
      if (v == null) {
        if (!best) best = oo;
        continue;
      }
      var bv = (best && typeof best.freeShipOver === 'number' && isFinite(best.freeShipOver)) ? best.freeShipOver : null;
      if (!best || bv == null || v < bv) best = oo;
    }

    if (!best && freeTo.length) return freeTo[0];
    return best;
  }

  function formatFreeShipText(o) {
    if (!o) return '';

    // Prefer a numeric threshold when available (e.g., Amazon US $49)
    if (o.freeShipOver != null && isFinite(o.freeShipOver)) {
      var usd = o.freeShipOver;
      var ILS_PER_USD = 3.27;
      var ilsApprox = Math.round((usd * ILS_PER_USD) / 5) * 5;
      return 'משלוח חינם לישראל מעל ' + ilsApprox + ' ש"ח';
    }

    if (isTrueFlag(o.freeShipToIsrael)) return 'משלוח חינם לישראל';
    return '';
  }

  function formatSizeForIsrael(rawSize) {
    var original = safeText(rawSize).trim();
    if (!original) return '';
    var lower = original.toLowerCase();

    if (
      lower.indexOf('ml') !== -1 ||
      lower.indexOf('מ"ל') !== -1 ||
      lower.indexOf('מ״ל') !== -1 ||
      lower.indexOf('גרם') !== -1 ||
      (/\bg\b/.test(lower))
    ) {
      return original;
    }

    var ozMatch = lower.match(/(\d+(?:\.\d+)?)\s*(fl\.?\s*)?oz/);
    if (ozMatch) {
      var qty = parseFloat(ozMatch[1]);
      if (!isNaN(qty)) {
        var ml = qty * 29.5735;
        var rounded = Math.round(ml / 5) * 5;
        return rounded + ' מ״ל';
      }
    }

    return original;
  }

  function formatMoney(amount, currency) {
    if (typeof amount !== 'number' || !isFinite(amount)) return '';
    var cur = safeText(currency).toUpperCase();
    var symbol = '$';
    if (cur === 'GBP') symbol = '£';
    else if (cur === 'EUR') symbol = '€';
    else if (cur && cur !== 'USD') symbol = cur + ' ';
    return symbol + amount.toFixed(2).replace(/\.00$/, '');
  }

  function ensureAmazonTag(url) {
    try {
      var u = new URL(url, location.href);
      // Only for Amazon US (do not touch amazon.co.uk etc)
      var host = String(u.hostname || '').toLowerCase();
      if (!(host === 'amazon.com' || host.slice(-10) === '.amazon.com')) return url;
      if (u.searchParams.get('tag')) return url;
      u.searchParams.set('tag', AMAZON_TAG);
      return u.toString();
    } catch (e) {
      // fallback string operations
      if (!url || url.indexOf('amazon.com') === -1) return url;
      if (url.indexOf('tag=') !== -1) return url;
      return url + (url.indexOf('?') === -1 ? '?' : '&') + 'tag=' + encodeURIComponent(AMAZON_TAG);
    }
  }

  function pickBestOffer(p) {
    var offers = Array.isArray(p && p.offers) ? p.offers : [];
    if (!offers.length) return null;
    // Prefer Amazon US if exists
    for (var i = 0; i < offers.length; i++) {
      var store = safeText(offers[i] && offers[i].store).toLowerCase();
      var region = safeText(offers[i] && offers[i].region).toLowerCase();
      if (store.indexOf('amazon-us') !== -1 || region === 'us') return offers[i];
    }
    return offers[0];
  }

  function resolveProductImage(p, offer) {
    // Prefer explicit product image (used in products.json)
    var img = safeText(p && p.image);
    if (img) return resolveFromBase(img);

    // Fallback: convention used across the site assets/img/products/<ASIN>.jpg
    var asin = safeText(offer && offer.asin);
    if (asin) return resolveFromBase('assets/img/products/' + asin + '.jpg');

    return '';
  }

  function resolveLabels(p, brand) {
    // Match Products page behavior, but also support legacy keys and array badges.
    // Rules:
    // - If product explicitly sets a flag (true/false) via isVegan/isLB/isPeta or legacy keys, that wins.
    // - Else, inherit from intl-brands.json (brand.badges + brand.vegan).
    // - If brand not found and no product flags, default is no badges.

    function isSet(obj, key) {
      return hasOwn(obj, key) && obj[key] !== null && obj[key] !== undefined;
    }

    function arrayHas(arr, needleLower) {
      if (!Array.isArray(arr)) return false;
      for (var i = 0; i < arr.length; i++) {
        if (safeText(arr[i]).toLowerCase() === needleLower) return true;
      }
      return false;
    }

    function getBoolFromProduct(keys, badgeNeedles) {
      // keys: explicit boolean keys (support explicit false)
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (isSet(p, k)) return !!p[k];
      }
      // badges array on product (infer)
      if (badgeNeedles && badgeNeedles.length) {
        for (var j = 0; j < badgeNeedles.length; j++) {
          if (arrayHas(p && p.badges, badgeNeedles[j])) return true;
        }
      }
      return undefined; // not set
    }

    // Brand defaults
    var brandBadges = (brand && Array.isArray(brand.badges)) ? brand.badges : [];
    var badgeSet = {};
    for (var b = 0; b < brandBadges.length; b++) badgeSet[safeText(brandBadges[b]).toLowerCase()] = true;

    var brandIsVegan = !!(brand && (brand.vegan === true || badgeSet['vegan']));
    var brandIsLB = !!(brand && (badgeSet['leaping bunny'] || badgeSet['leapingbunny']));
    var brandIsPeta = !!(brand && badgeSet['peta']);

    // Product overrides (support legacy keys + product.badges)
    var prodVegan = getBoolFromProduct(['isVegan', 'vegan'], ['vegan']);
    var prodLB = getBoolFromProduct(['isLB', 'lb', 'isLeapingBunny'], ['leaping bunny', 'leapingbunny']);
    var prodPeta = getBoolFromProduct(['isPeta', 'peta'], ['peta']);

    return {
      isVegan: (prodVegan !== undefined) ? prodVegan : brandIsVegan,
      isLB: (prodLB !== undefined) ? prodLB : brandIsLB,
      isPeta: (prodPeta !== undefined) ? prodPeta : brandIsPeta
    };
  }


  // --- Meta pills (match products page) ---
function getOfferWithMinFreeShip(p) {
  var offers = (p && Array.isArray(p.offers)) ? p.offers : [];
  if (!offers.length) return null;

  // Prefer offers that explicitly ship free to Israel
  var freeTo = [];
  for (var i = 0; i < offers.length; i++) {
    var o = offers[i];
    if (o && isTrueFlag(o.freeShipToIsrael)) freeTo.push(o);
  }
  var pool = freeTo.length ? freeTo : offers;

  // Pick the lowest freeShipOver threshold among the pool.
  // If no numeric threshold exists, fall back to the first offer.
  var best = null;
  for (var j = 0; j < pool.length; j++) {
    var oo = pool[j];
    if (!oo) continue;
    var v = (typeof oo.freeShipOver === 'number' && isFinite(oo.freeShipOver)) ? oo.freeShipOver : null;
    if (v == null) {
      if (!best) best = oo;
      continue;
    }
    var bv = (best && typeof best.freeShipOver === 'number' && isFinite(best.freeShipOver)) ? best.freeShipOver : null;
    if (!best || bv == null || v < bv) best = oo;
  }

  if (!best && freeTo.length) return freeTo[0];
  return best;
}

function formatFreeShipText(o) {
  if (!o) return '';

  // Prefer a numeric threshold when available (e.g., Amazon US $49)
  if (o.freeShipOver != null && isFinite(o.freeShipOver)) {
    var usd = o.freeShipOver;
    var ILS_PER_USD = 3.27;
    var ilsApprox = Math.round((usd * ILS_PER_USD) / 5) * 5;
    return 'משלוח חינם לישראל מעל ' + ilsApprox + ' ש"ח';
  }

  // Otherwise show explicit free shipping to Israel
  if (isTrueFlag(o.freeShipToIsrael)) return 'משלוח חינם לישראל';

  return '';
}

  function formatSizeForIsrael(rawSize) {
    var original = safeText(rawSize).trim();
    if (!original) return '';
    var lower = original.toLowerCase();
    if (lower.indexOf('ml') !== -1 || lower.indexOf('מ"ל') !== -1 || lower.indexOf('מ״ל') !== -1 || lower.indexOf('גרם') !== -1 || /\bg\b/.test(lower)) {
      return original;
    }
    var m = lower.match(/(\d+(?:\.\d+)?)\s*(fl\.?\s*)?oz/);
    if (m) {
      var qty = parseFloat(m[1]);
      if (!isNaN(qty)) {
        var ml = qty * 29.5735;
        var rounded = Math.round(ml / 5) * 5;
        return rounded + ' מ״ל';
      }
    }
    return original;
  }

  function buildTags(p, labels) {
    var out = [];
    // Match Products page tag labels + Weglot behavior
    if (labels.isLB) out.push('<span class="tag wg-notranslate" data-wg-notranslate="true">Leaping Bunny</span>');
    if (labels.isPeta) out.push('<span class="tag wg-notranslate" data-wg-notranslate="true">PETA</span>');
    if (labels.isVegan) out.push('<span class="tag">טבעוני</span>');
    if (p && p.isIsrael) out.push('<span class="tag">אתר ישראלי</span>');
    return out.join('');
  }

  function dealCardHTML(p, brand) {
    var brandName = safeText(p.brand);

    var offer = pickBestOffer(p) || {};
    var url = ensureAmazonTag(safeText(offer.url || ''));
    var imgSrc = resolveProductImage(p, offer);
    var price = null;
    var currency = offer.currency || 'USD';
    // Prefer explicit offer priceUSD (site convention)
    if (typeof offer.priceUSD === 'number' && isFinite(offer.priceUSD)) price = offer.priceUSD;
    else if (typeof offer.price === 'number' && isFinite(offer.price)) price = offer.price;

    var labels = resolveLabels(p, brand);

    // Meta pills like products page (category / size / free ship)
    var pills = [];
    var catLabel = getCategoryLabelFromProduct(p);
    if (catLabel) pills.push('<span class="pMetaPill">' + esc(catLabel) + '</span>');
    var sizeText = formatSizeForIsrael(p && p.size);
    if (sizeText) pills.push('<span class="pMetaPill">' + esc(sizeText) + '</span>');
    var fsOffer = getOfferWithMinFreeShip(p);
    var fsText = formatFreeShipText(fsOffer);
    if (fsText) pills.push('<span class="pMetaPill pMetaPill--freeShip">' + esc(fsText) + '</span>');
    var pillsHtml = pills.length ? ('<div class="pMeta dealPills">' + pills.join('') + '</div>') : '';

    return (
      '<article class="dealCard">' +
        // Image (clickable)
        '<a class="dealMedia" href="' + esc(url || '#') + '" rel="noopener" target="_blank">' +
          (imgSrc
            ? '<img class="dealImg" src="' + esc(imgSrc) + '" alt="' + esc(safeText(p.name)) + '" loading="lazy" decoding="async" width="640" height="640" onerror="this.onerror=null;this.src=\'assets/img/icons/bag-heart.png\';" />'
            : '<img class="dealImg" src="assets/img/icons/bag-heart.png" alt="" loading="lazy" decoding="async" width="640" height="640" />'
          ) +
        '</a>' +
        '<div class="dealTop">' +
          '<div class="dealBrandRow">' +
            '<div>' +
              '<div class="dealBrand wg-notranslate" data-wg-notranslate="true">' + esc(brandName) + '</div>' +
              '<div class="dealName">' + esc(safeText(p.name)) + '</div>' +
              pillsHtml +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="dealMeta tags">' + buildTags(p, labels) + '</div>' +
        '<div class="dealCta">' +
          '<div class="dealPrice">' + esc(formatMoney(price, currency) || '') + '</div>' +
          (url
            ? '<a class="dealBtn" href="' + esc(url) + '" rel="noopener" target="_blank">קנו באמזון</a>'
            : ''
          ) +
        '</div>' +
      '</article>'
    );
  }

  function setLoading(on) {
    var el = document.getElementById('dealsLoading');
    if (!el) return;
    el.style.display = on ? '' : 'none';
  }

  function showEmpty(on, msgHtml) {
    var el = document.getElementById('dealsEmpty');
    if (!el) return;
    if (msgHtml) el.innerHTML = msgHtml;
    el.style.display = on ? '' : 'none';
  }

  function main() {
    var grid = document.getElementById('dealsGrid');
    if (!grid) return;

    setLoading(true);
    showEmpty(false);

    var productsPath = resolveFromBase('data/products.json');
    var brandsPath = resolveFromBase('data/intl-brands.json');

    function withCacheBust(url){
      var v = String(window.KBWG_BUILD || '2026-02-11-v1');
      if (/[?&]v=/.test(url)) return url;
      return url + (url.indexOf('?')>-1 ? '&' : '?') + 'v=' + encodeURIComponent(v || String(Date.now()));
    }

    var productsReq = fetch(withCacheBust(productsPath), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });

    var brandsReq = fetch(withCacheBust(brandsPath), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function () {
      // intl-brands is optional for the deals page
      return [];
    });

    Promise.all([productsReq, brandsReq])
      .then(function (res) {
        var products = Array.isArray(res[0]) ? res[0] : [];
        var brands = Array.isArray(res[1]) ? res[1] : [];

        var brandIndex = buildBrandIndex(brands);

        // Auto-detect isDiscounted param: only show true, absent/false -> hidden.
        var deals = products.filter(function (p) { return p && p.isDiscounted === true; });

        // Keep the list stable (in JSON order), but cap size.
        deals = deals.slice(0, MAX_DEALS);

        KB_DEALS = deals;
        KB_PAGE = 1;

        function renderDealsPage() {
          KB_PER = kbPerPage('deals');
          if (!KB_PAGER) KB_PAGER = kbEnsurePager(grid, 'dealsPager');
          kbRenderPager(KB_PAGER, KB_PAGE, KB_DEALS.length, KB_PER, function (n) { KB_PAGE = n; renderDealsPage(); });

          var start = (KB_PAGE - 1) * KB_PER;
          var end = start + KB_PER;
          var pageItems = (KB_DEALS.length > KB_PER) ? KB_DEALS.slice(start, end) : KB_DEALS;

          var htmlOut = '';
          for (var jj = 0; jj < pageItems.length; jj++) {
            var pp = pageItems[jj];
            var bb = findBrand(brandIndex, pp.brand) || null;
            htmlOut += dealCardHTML(pp, bb);
          }

          grid.innerHTML = htmlOut;
          setLoading(false);
          showEmpty(false);
          try { window.dispatchEvent(new Event('kbwg:content-rendered')); } catch (e) {}
        }

        if (!deals.length) {
          grid.innerHTML = '';
          setLoading(false);

          if (isFileProtocol()) {
            showEmpty(true, [
              '<strong>הדף פתוח מקובץ מקומי (file://)</strong> ולכן הדפדפן חוסם טעינת JSON (CORS).',
              '<br>כדי שזה יעבוד מקומית, תריצי שרת קטן ואז תפתחי דרך <code>http://localhost</code>.',
              '<br><br><strong>Windows:</strong> בתיקייה של הפרויקט הריצי:',
              '<br><code>py -m http.server 8000</code>',
              '<br>ואז פתחי: <code>http://localhost:8000/todays-top-deals.html</code>',
              '<br><br>ב־GitHub Pages / אתר אמיתי (https) זה יעבוד בלי בעיה.'
            ].join(''));
          } else {
            showEmpty(true);
          }

          // Let Weglot refresh (optional)
          try { window.dispatchEvent(new Event('kbwg:content-rendered')); } catch (e) {}
          return;
        }

        renderDealsPage();
})
      .catch(function (err) {
        console.warn('[todays-deals] Could not render deals', err);
        setLoading(false);

        if (isFileProtocol()) {
          showEmpty(true, [
            '<strong>הדף פתוח מקובץ מקומי (file://)</strong> ולכן הדפדפן חוסם טעינת JSON (CORS).',
            '<br>כדי שזה יעבוד מקומית, תריצי שרת קטן ואז תפתחי דרך <code>http://localhost</code>.',
            '<br><br><strong>Windows:</strong> בתיקייה של הפרויקט הריצי:',
            '<br><code>py -m http.server 8000</code>',
            '<br>ואז פתחי: <code>http://localhost:8000/todays-top-deals.html</code>'
          ].join(''));
        } else {
          showEmpty(true, 'שגיאה בטעינת המבצעים. נסי לרענן את הדף.');
        }
      });
  }

  // Run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
