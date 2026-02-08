// Build: 2026-02-07-v27
try { window.KBWG_PRODUCTS_BUILD = '2026-02-07-v27'; console.info('[KBWG] KBWG_PRODUCTS_BUILD ' + window.KBWG_PRODUCTS_BUILD); } catch(e) {}

/*
  Loads products from data/products.json (+ loads intl brands from data/intl-brands.json),
  enriches product badges from intl-brands (when product flags are missing),
  then bootstraps assets/js/products.js.

  Works on GitHub Pages (no build step).
*/
(function () {
  'use strict';

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.defer = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function isFileProtocol() {
    try { return location && location.protocol === 'file:'; } catch (e) { return false; }
  }

  // Resolve URLs correctly when Weglot serves pages under /en/... (or when hosted under a subpath).
  function siteBaseFromScript() {
    // Prefer global helper from site.js if it exists.
    try {
      if (typeof window.__kbwgSiteBase === 'string' && window.__kbwgSiteBase) return window.__kbwgSiteBase;
      if (typeof window.__kbwgResolveFromSiteBase === 'function') return window.__kbwgResolveFromSiteBase('');
    } catch (e) {}

    try {
      var src = '';
      try { src = (document.currentScript && document.currentScript.src) ? document.currentScript.src : ''; } catch (e) { src = ''; }
      if (!src) {
        var scripts = document.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i--) {
          var ssrc = scripts[i] && scripts[i].src ? String(scripts[i].src) : '';
          if (ssrc.indexOf('products-json-loader.js') !== -1) { src = ssrc; break; }
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

  function withCacheBust(url) {
    var u = String(url || '');
    if (!u) return u;
    return u + (u.indexOf('?') > -1 ? '&' : '?') + 'v=' + Date.now();
  }

  function fetchJson(path) {
    var url = withCacheBust(path);
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // ---------- Brand badge enrichment ----------
  function stripDiacritics(s) {
    var str = String(s || '');
    try {
      return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (e) {
      return str;
    }
  }

  function brandKey(name) {
    return stripDiacritics(String(name || ''))
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9\u0590-\u05FF]+/g, '');
  }

  function buildBrandIndex(brands) {
    var byKey = Object.create(null);
    var list = [];
    var suffixes = ['beauty','cosmetics','skincare','skincare','skinc','skin','care','company','co','labs','lab'];

    (brands || []).forEach(function (b) {
      if (!b) return;
      var name = b.name || b.website || b.site || '';
      var k = brandKey(name);
      if (!k) return;
      if (!byKey[k]) byKey[k] = b;
      list.push({ k: k, b: b });

      // Add a couple of helpful aliases (e.g. "UpCircle" -> "UpCircle Beauty")
      for (var i = 0; i < suffixes.length; i++) {
        var suf = suffixes[i];
        if (k.length > suf.length + 3 && k.slice(-suf.length) === suf) {
          var k2 = k.slice(0, -suf.length);
          if (k2 && !byKey[k2]) byKey[k2] = b;
        }
      }
    });

    return { byKey: byKey, list: list };
  }

  function findBrand(index, name) {
    if (!index) return null;
    var k = brandKey(name);
    if (!k) return null;

    if (index.byKey[k]) return index.byKey[k];

    // Fuzzy: prefix/contains match (safe for longer keys)
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
      if (score < bestScore) {
        best = it.b;
        bestScore = score;
      }
    }
    return best;
  }

  function brandFlags(brand) {
    var badges = (brand && Array.isArray(brand.badges)) ? brand.badges : [];
    var set = Object.create(null);
    for (var i = 0; i < badges.length; i++) {
      var v = String(badges[i] || '').toLowerCase().trim();
      if (v) set[v] = true;
    }
    return {
      isVegan: !!(brand && (brand.vegan === true || set['vegan'])),
      isLB: !!(set['leaping bunny'] || set['leapingbunny']),
      isPeta: !!(set['peta'])
    };
  }

  function isUnsetBool(v) {
    // treat undefined/null as unset (but keep explicit true/false)
    return v === undefined || v === null;
  }

  function enrichProductsFromBrands(products, brands) {
    if (!Array.isArray(products) || !Array.isArray(brands) || !brands.length) return;
    var index = buildBrandIndex(brands);

    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      if (!p || typeof p !== 'object') continue;
      var b = findBrand(index, p.brand);
      if (!b) continue;
      var f = brandFlags(b);

      if (isUnsetBool(p.isVegan) && isUnsetBool(p.vegan)) p.isVegan = f.isVegan;
      if (isUnsetBool(p.isLB) && isUnsetBool(p.lb) && isUnsetBool(p.isLeapingBunny)) p.isLB = f.isLB;
      if (isUnsetBool(p.isPeta) && isUnsetBool(p.peta)) p.isPeta = f.isPeta;
    }
  }

  // ---------- Empty state for local file:// ----------
  function setHelpfulEmptyStateMessage() {
    var grid = document.getElementById('grid');
    if (!grid) return;
    grid.innerHTML =
      '<div class="emptyState">' +
      '<h3>לא ניתן לטעון את המוצרים מקובץ מקומי (file://)</h3>' +
      '<p>הדפדפן חוסם טעינת JSON מקומית (CORS). כדי לבדוק מקומית, הריצי שרת קטן ואז פתחי דרך <code>http://localhost</code>.</p>' +
      '<p><strong>Windows:</strong> בתיקייה של הפרויקט הריצי: <code>py -m http.server 8000</code></p>' +
      '<p>ואז פתחי: <code>http://localhost:8000/products.html</code></p>' +
      '</div>';
  }

  // ---------- Run ----------
  var productsPath = resolveFromBase('data/products.json');
  var intlBrandsPath = resolveFromBase('data/intl-brands.json');

  var productsReq = fetchJson(productsPath);
  var brandsReq = fetchJson(intlBrandsPath).catch(function () { return []; });

  Promise.all([productsReq, brandsReq])
    .then(function (res) {
      var products = Array.isArray(res[0]) ? res[0] : [];
      var brands = Array.isArray(res[1]) ? res[1] : [];

      // Expose globals expected by products.js
      window.PRODUCTS = products;
      window.INTL_BRANDS = brands;

      // Ensure products inherit badges from brands when product flags are missing
      enrichProductsFromBrands(window.PRODUCTS, window.INTL_BRANDS);
    })
    .catch(function (err) {
      console.warn('[products-json-loader] Loader error', err);
      window.PRODUCTS = [];
      window.INTL_BRANDS = [];
      if (isFileProtocol()) {
        window.__KBWG_FILE_FETCH_BLOCKED = true;
        setHelpfulEmptyStateMessage();
      }
    })
    .finally(function () {
      // The main page logic expects window.PRODUCTS to exist.
      loadScript(resolveFromBase('assets/js/products.js?v=2026-02-07-v27')).catch(function (e) {
        console.error('[products-json-loader] Could not start products.js', e);
      });
    });
})();
