// // Build: 2026-02-06-v21
try { window.KBWG_BRANDS_BUILD = '2026-02-06-v21'; console.info('[KBWG] KBWG_BRANDS_BUILD ' + window.KBWG_BRANDS_BUILD); } catch(e) {}

// Resolve URLs correctly when Weglot serves pages under /en/ (or when hosted under a subpath, e.g. GitHub Pages).
// If you fetch("data/...") from /en/page.html the browser will request /en/data/... (404). We normalize to the true site base.
function __kbwgSiteBaseFromScript(scriptName) {
  try {
    var src = '';
    try { src = (document.currentScript && document.currentScript.src) ? document.currentScript.src : ''; } catch (e) { src = ''; }
    if (!src) {
      // Fallback: find the script tag by name
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        var ssrc = scripts[i] && scripts[i].src ? String(scripts[i].src) : '';
        if (ssrc.indexOf(scriptName) !== -1) { src = ssrc; break; }
      }
    }
    if (!src) return '/';

    var u = new URL(src, location.href);
    var p = u.pathname || '/';
    var idx = p.indexOf('/assets/js/');
    var base = idx >= 0 ? p.slice(0, idx) : p.replace(/\/[\w\-.]+$/, '');
    base = base.replace(/\/+$/, '');

    // Strip language segment at the end (e.g. /en, /he) so data files resolve to the real site root.
    var parts = base.split('/').filter(Boolean);
    var langs = { en: 1, he: 1, iw: 1, ar: 1, fr: 1, es: 1, de: 1, ru: 1 };
    if (parts.length && langs[parts[parts.length - 1]]) parts.pop();

    return '/' + parts.join('/');
  } catch (e) {
    return '/';
  }
}

function __kbwgResolveFromSiteBase(relPath, scriptName) {
  try {
    if (!relPath) return relPath;
    var p = String(relPath);
    if (/^https?:\/\//i.test(p)) return p;

    // Trim leading ./
    p = p.replace(/^\.\//, '');

    var base = __kbwgSiteBaseFromScript(scriptName) || '/';
    if (base === '/') return '/' + p.replace(/^\//, '');
    return base + '/' + p.replace(/^\//, '');
  } catch (e) {
    return relPath;
  }
}

/*
  Brands pages (intl + israel) JSON loader + renderer.
  Works on GitHub Pages (no build step).

  HTML requirements:
    - A container element with id="brandGrid" and data-json="data/xxx.json"
    - Controls (optional but supported):
        #brandSearch (search)
        #brandCategoryFilter (category select)
        #brandPriceFilter (price tier select)
        #brandVeganOnly (checkbox)
    - A count element: [data-brands-count]

  Data format (array of objects):
    {
      name: string,
      website?: string,
      amazonUk?: string,
      amazonUs?: string,
      categories?: string[],
      badges?: string[],
      vegan?: boolean,
      priceTier?: number (1..5)
    }

  Notes:
    - If priceTier is missing, we infer it from categories (intl keys) or default to 3.
    - Card click opens Amazon (prefer UK) if available; otherwise opens website.
*/
(function () {
  'use strict';

  var PT = (window.KBWGPriceTier || {});

  // Unified categories – must match the Products page filters.
  var CAT_LABELS = {
    face: 'טיפוח פנים',
    hair: 'שיער',
    body: 'גוף ורחצה',
    makeup: 'איפור',
    fragrance: 'בישום',
    'mens-care': 'גברים',
    baby: 'תינוקות',
    health: 'בריאות'
  };

  // Map legacy/varied categories from JSON into the unified set.
  var INTL_TO_UNIFIED = {
    skincare: 'face',
    'natural-skin': 'face',
    eyes: 'face',

    haircare: 'hair',
    'curly-hair': 'hair',
    'hair-color': 'hair',

    'body-care': 'body',
    deodorant: 'body',
    soap: 'body',
    'soap-bars': 'body',
    sun: 'body',
    tanning: 'body',
    'tattoo-care': 'body',

    cosmetics: 'makeup',
    'makeup tools': 'makeup',
    'makeup tools ': 'makeup',
    nails: 'makeup',

    fragrance: 'fragrance',

    'mens-care': 'mens-care',

    'baby-child': 'baby',

    wellness: 'health',
    health: 'health',
    'personal care': 'health',
    'personal-care': 'health',
    cleaning: 'health',
    paper: 'health',
    wipes: 'health',
    'pet-care': 'health'
  };

  var CAT_PRICE_TIER = {
    face: 3,
    hair: 3,
    body: 3,
    makeup: 3,
    fragrance: 4,
    'mens-care': 3,
    baby: 2,
    health: 2
  };

  function toUnifiedCat(pageKind, raw) {
    var k = String(raw || '').trim();
    if (!k) return '';

    // Already unified?
    if (CAT_LABELS[k]) return k;

    var lower = k.toLowerCase().trim();
    if (CAT_LABELS[lower]) return lower;

    if (pageKind === 'intl') {
      return INTL_TO_UNIFIED[lower] || '';
    }

    // Israel page categories are Hebrew labels; map by keywords.
    var he = k;
    if (he.indexOf('פנים') !== -1 || he.indexOf('עור') !== -1) return 'face';
    if (he.indexOf('שיער') !== -1) return 'hair';
    if (he.indexOf('גוף') !== -1 || he.indexOf('רחצה') !== -1 || he.indexOf('סבון') !== -1 || he.indexOf('דאוד') !== -1) return 'body';
    if (he.indexOf('איפור') !== -1 || he.indexOf('ציפור') !== -1) return 'makeup';
    if (he.indexOf('בישום') !== -1 || he.indexOf('בושם') !== -1 || he.indexOf('בושמי') !== -1) return 'fragrance';
    if (he.indexOf('גבר') !== -1) return 'mens-care';
    if (he.indexOf('תינוק') !== -1 || he.indexOf('ילד') !== -1) return 'baby';
    if (he.indexOf('בריאות') !== -1 || he.indexOf('שיניים') !== -1 || he.indexOf('היגיינ') !== -1 || he.indexOf('וולנס') !== -1) return 'health';
    return '';
  }

  function normalizeCats(pageKind, cats) {
    var out = [];
    (cats || []).forEach(function (c) {
      var u = toUnifiedCat(pageKind, c);
      if (u) out.push(u);
    });
    return uniq(out);
  }

  function norm(s) {
    return String(s || '').toLowerCase().trim();
  }

  // Normalize brand names so products.json and brands JSON can match reliably
  // even when spacing/punctuation differs (e.g. "grace&stella" vs "grace & stella").
  function brandKey(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9\u0590-\u05FF]/g, '');
  }

  function uniq(arr) {
    var seen = Object.create(null);
    var out = [];
    (arr || []).forEach(function (x) {
      var k = String(x || '').trim();
      if (!k) return;
      if (seen[k]) return;
      seen[k] = 1;
      out.push(k);
    });
    return out;
  }

  function inferTierFromCategories(cats) {
    var tiers = [];
    (cats || []).forEach(function (k) {
      var t = CAT_PRICE_TIER[k];
      if (t) tiers.push(t);
    });
    if (!tiers.length) return 3;
    var sum = tiers.reduce(function (a, b) { return a + b; }, 0);
    var avg = sum / tiers.length;
    var r = Math.round(avg);
    return Math.max(1, Math.min(5, r));
  }

  function inferTierIsrael(cats) {
    // Light heuristic from Hebrew category labels.
    var label = (cats && cats[0]) ? String(cats[0]) : '';
    if (!label) return 3;
    if (label.indexOf('תינוק') !== -1) return 2;
    if (label.indexOf('בישום') !== -1 || label.indexOf('בושם') !== -1) return 4;
    if (label.indexOf('איפור') !== -1) return 3;
    if (label.indexOf('שיער') !== -1) return 3;
    if (label.indexOf('רחצה') !== -1 || label.indexOf('גוף') !== -1) return 3;
    if (label.indexOf('טיפוח') !== -1) return 3;
    return 3;
  }

  function bestAmazonLink(b) {
    return b.amazonUk || b.amazonUs || null;
  }

  
  function formatLastUpdated(d){
    if(!d) return '';
    try{
      var dt = (d instanceof Date) ? d : new Date(String(d));
      if(!isFinite(dt.getTime())) return '';
      // he-IL date
      return dt.toLocaleDateString('he-IL', { year:'numeric', month:'2-digit', day:'2-digit' });
    }catch(e){ return ''; }
  }
  function pickLastUpdated(brand){
    return brand.lastUpdated || brand.last_updated || brand.updatedAt || brand.updated_at || brand.modifiedAt || brand.modified_at || '';
  }

// Fetch JSON robustly. If the JSON contains unescaped ASCII quotes inside Hebrew abbreviations (e.g. ארה"ב / ע"י),
// JSON.parse will fail. We try a safe, minimal fix by converting those internal quotes to Hebrew gershayim (״).
function __kbwgParseJsonWithHebrewQuoteFix(rawText, debugLabel, debugUrl) {
  var t = rawText;
  // Strip UTF-8 BOM if present
  if (t && t.charCodeAt(0) === 0xFEFF) t = t.slice(1);

  try {
    return JSON.parse(t);
  } catch (e1) {
    try {
      // Only affects patterns like <hebrew_letter>"<hebrew_letter>, common in Hebrew abbreviations.
      var fixed = t.replace(/([\u0590-\u05FF])"([\u0590-\u05FF])/g, '$1\u05F4$2');
      return JSON.parse(fixed);
    } catch (e2) {
      console.error('[KBWG] JSON parse failed for ' + debugLabel + ' (' + debugUrl + ')');
      console.error(e2);
      throw e1;
    }
  }
}

function __kbwgFetchJson(url, debugLabel) {
  return fetch(url, { cache: 'force-cache' }).then(function (r) {
    if (!r.ok) throw new Error('Failed to load ' + url + ' (from ' + debugLabel + ')');
    return r.text().then(function (txt) {
      return __kbwgParseJsonWithHebrewQuoteFix(txt, debugLabel, url);
    });
  });
}


function stopLinkPropagation(el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  }

  function logoTextFromName(name) {
    var s = String(name || '').trim();
    if (!s) return '•';
    // take first visible char
    return s[0].toUpperCase();
  }

  function normalizeCats(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    if (typeof raw === 'string') {
      // Allow comma / slash separated strings.
      return raw.split(/[,/]/g).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    }
    // Handle objects like {a:true, b:true}
    if (typeof raw === 'object') {
      return Object.keys(raw).map(function (k) { return String(k || '').trim(); }).filter(Boolean);
    }
    return [String(raw).trim()].filter(Boolean);
  }

  // ------------------------------
  // Product-type alignment (match Products page "כל סוגי המוצרים" dropdown)
  // We derive the same optgroup + sub-type structure from data/products.json,
  // and also compute, for each brand, which type-keys it has products for.
  // typeKey format: "<Group>::<SubType>"

  function containsAny(haystackLower, words) {
    if (!haystackLower) return false;
    for (var i = 0; i < words.length; i++) {
      if (haystackLower.indexOf(String(words[i]).toLowerCase()) !== -1) return true;
    }
    return false;
  }

  function getCatsRawFromProduct(p) {
    if (!p) return [];
    var raw = [];
    if (Array.isArray(p.categories)) raw = p.categories;
    else if (p.category != null) raw = [p.category];
    else if (p.cat != null) raw = [p.cat];
    return raw.map(function (x) { return String(x || '').toLowerCase().trim(); }).filter(Boolean);
  }

  function getPrimaryCategoryKeyFromProduct(p) {
    var cats = getCatsRawFromProduct(p);
    return cats[0] || '';
  }

  function getTypeGroupLabelFromProduct(p) {
    var catKey = getPrimaryCategoryKeyFromProduct(p);
    var nameLower = String(p.productTypeLabel || p.name || '').toLowerCase();

    // Teeth / whitening
    var isTeeth = containsAny(nameLower, ['tooth','teeth','שן','שיניים','toothpaste','whitening']);
    if (isTeeth) return 'הלבנה וטיפוח השיניים';

    var isMen = /גבר|גברים|men's|for men|for him|pour homme/i.test(nameLower);

    if (catKey === 'makeup') return 'מוצרי איפור';
    if (catKey === 'face') return isMen ? 'טיפוח לגבר' : 'טיפוח לפנים';
    if (catKey === 'body') return isMen ? 'טיפוח לגבר' : 'טיפוח לגוף';
    if (catKey === 'hair') return isMen ? 'טיפוח לגבר' : 'עיצוב שיער';
    if (catKey === 'fragrance') return 'בשמים';
    if (catKey === 'sun' || catKey === 'suncare' || catKey === 'spf') return 'הגנה מהשמש';
    if (isMen) return 'טיפוח לגבר';
    return 'אחר';
  }

  function getTypeDisplayLabelFromProduct(p) {
    var group = getTypeGroupLabelFromProduct(p);
    var name = String(p.productTypeLabel || p.name || '').trim();
    if (!name) return '';
    var lower = name.toLowerCase();

    // Makeup
    if (group === 'מוצרי איפור') {
      if (containsAny(lower, ['lip','שפתיים','שפתון','gloss'])) return 'שפתיים';
      if (containsAny(lower, ['eye','eyes','עיניים','ריסים','מסקרה','eyeliner','brow'])) return 'עיניים';
      if (containsAny(lower, ['nail','ציפורניים','לק'])) return 'ציפורניים';
      if (containsAny(lower, ['brush','מברשת','sponge','applicator','tools','אביזר'])) return 'אביזרי איפור';
      if (containsAny(lower, ['kit','מארז','ערכת'])) return 'סטים ומארזים';
      if (containsAny(lower, ['palette','פלטה'])) return 'פנים';
      return 'פנים';
    }

    // Face care
    if (group === 'טיפוח לפנים') {
      if (containsAny(lower, ['eye','eyes','עיניים','אזור העיניים','שפתיים','lip'])) return 'עיניים ושפתיים';
      if (containsAny(lower, ['mask','מסכה','peel','פילינג','exfoli','scrub'])) return 'מסכות ופילינג';
      if (containsAny(lower, ['cleanser','clean','wash','soap','סבון','ניקוי','cleansing'])) return 'ניקוי פנים';
      if (containsAny(lower, ['moist','cream','קרם','hydr'])) return 'קרמים ולחות';
      if (containsAny(lower, ['serum','סרום'])) return 'סרומים';
      if (containsAny(lower, ['toner','essence','מי פנים','טונר','אסנס'])) return 'טונרים ואסנס';
      return 'טיפוח כללי';
    }

    // Teeth
    if (group === 'הלבנה וטיפוח השיניים') return 'טיפוח השיניים';

    // Body
    if (group === 'טיפוח לגוף') {
      if (containsAny(lower, ['deodor','דאודורנט'])) return 'דאודורנט';
      if (containsAny(lower, ['body','גוף','lotion','קרם','butter','oil','שמן'])) return 'לחות וגוף';
      if (containsAny(lower, ['scrub','פילינג','exfoli'])) return 'פילינג גוף';
      if (containsAny(lower, ['soap','wash','gel','סבון','רחצה'])) return 'רחצה';
      return 'טיפוח כללי';
    }

    // Hair
    if (group === 'עיצוב שיער') {
      if (containsAny(lower, ['shampoo','שמפו'])) return 'שמפו';
      if (containsAny(lower, ['condition','מרכך'])) return 'מרכך';
      if (containsAny(lower, ['mask','מסכה'])) return 'מסכה לשיער';
      if (containsAny(lower, ['serum','oil','שמן','סרום'])) return 'שמנים וסרומים';
      return 'טיפוח/עיצוב';
    }

    // Sun
    if (group === 'הגנה מהשמש') return 'SPF';
    if (group === 'בשמים') return 'בישום';
    if (group === 'טיפוח לגבר') return 'טיפוח לגבר';

    return 'אחר';
  }

  function buildTypeSelect(selectEl, groupsByType) {
    if (!selectEl) return;

    var prev = String(selectEl.value || '');
    selectEl.innerHTML = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'כל סוגי המוצרים';
    selectEl.appendChild(placeholder);

    var groupOrder = [
      'מוצרי איפור',
      'טיפוח לפנים',
      'הלבנה וטיפוח השיניים',
      'טיפוח לגוף',
      'עיצוב שיער',
      'הגנה מהשמש',
      'בשמים',
      'טיפוח לגבר',
      'אחר'
    ];

    groupOrder.forEach(function (groupLabel) {
      var set = groupsByType.get(groupLabel);
      if (!set || !set.size) return;
      var optGroup = document.createElement('optgroup');
      optGroup.label = groupLabel;
      Array.from(set)
        .sort(function (a, b) { return String(a).localeCompare(String(b), 'he'); })
        .forEach(function (typeLabel) {
          var o = document.createElement('option');
          o.value = groupLabel + '::' + typeLabel;
          o.textContent = typeLabel;
          optGroup.appendChild(o);
        });
      selectEl.appendChild(optGroup);
    });

    selectEl.value = prev;
    if (String(selectEl.value || '') !== prev) selectEl.value = '';
  }

  function buildTypesIndexFromProducts(products) {
    var groupsByType = new Map(); // group -> Set(subType)
    var brandTypeKeys = new Map(); // brand -> Set(typeKey)

    (products || []).forEach(function (p) {
      if (!p) return;
      // Site policy: vegan-only
      if (p.isVegan === false) return;

      var brand = String(p.brand || '').trim();
      if (!brand) return;
      var bkey = brandKey(brand);
      if (!bkey) return;

      var group = getTypeGroupLabelFromProduct(p);
      var sub = getTypeDisplayLabelFromProduct(p);
      if (!group || !sub) return;
      if (!groupsByType.has(group)) groupsByType.set(group, new Set());
      groupsByType.get(group).add(sub);

      var key = group + '::' + sub;
      if (!brandTypeKeys.has(bkey)) brandTypeKeys.set(bkey, new Set());
      brandTypeKeys.get(bkey).add(key);
    });

    return { groupsByType: groupsByType, brandTypeKeys: brandTypeKeys };
  }

  // =============================
  // Brand categories
  // =============================
  // The Brands pages must show categories in Hebrew and align with the filter.
  // We derive categories primarily from products.json (brand -> product types),
  // and only fall back to the brand JSON categories if the brand has no products.

  // Top-level category labels (must match across the site).
  // ✅ REQUIRED by nocrueltyil.com: brands must be categorized into one (or more) of these TOP LEVEL types.
  // These names are shown in the filter and on the brand cards.
  // Canonical top-level categories used site-wide (Hebrew)
  // NOTE: “ילדים ותינוקות” is a first-class category for both brands + products.
  var TOP_LEVEL_ORDER = [
    'מוצרי איפור',
    'טיפוח לפנים',
    'הלבנה וטיפוח השיניים',
    'טיפוח לגוף',
    'לבית',
    'עיצוב שיער',
    'הגנה מהשמש',
    'בשמים',
    'טיפוח לגבר',
    'ילדים ותינוקות'
  ];

  function uniqStrings(arr) {
    var seen = Object.create(null);
    var out = [];
    (arr || []).forEach(function (s) {
      var v = String(s || '').trim();
      if (!v) return;
      if (seen[v]) return;
      seen[v] = 1;
      out.push(v);
    });
    return out;
  }

  // Map raw categories coming from brands JSON (often English) into the TOP LEVEL Hebrew list.
  // Used only as fallback when a brand has no matching products in products.json.
  function mapBrandJsonCategoryToTop(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    var lower = s.toLowerCase();

    // Hebrew already
    if (s.indexOf('איפור') !== -1) return 'מוצרי איפור';
    if (s.indexOf('פנים') !== -1 || s.indexOf('עור') !== -1) return 'טיפוח לפנים';
    if (s.indexOf('שיניים') !== -1 || s.indexOf('פה') !== -1) return 'הלבנה וטיפוח השיניים';
    if (s.indexOf('גוף') !== -1 || s.indexOf('רחצה') !== -1) return 'טיפוח לגוף';
    if (s.indexOf('בית') !== -1 || s.indexOf('ניקיון') !== -1) return 'לבית';
    if (s.indexOf('שיער') !== -1) return 'עיצוב שיער';
    if (s.indexOf('שמש') !== -1 || s.indexOf('spf') !== -1) return 'הגנה מהשמש';
    if (s.indexOf('ילדים') !== -1 || s.indexOf('תינוק') !== -1) return 'ילדים ותינוקות';
    if (s.indexOf('בושם') !== -1 || s.indexOf('בשמים') !== -1 || s.indexOf('בישום') !== -1) return 'בשמים';
    if (s.indexOf('גבר') !== -1 || s.indexOf('לגבר') !== -1) return 'טיפוח לגבר';

    // English / sluggy keys
    if (/(makeup|cosmetic|cosmetics|nails|lip|eye)/.test(lower)) return 'מוצרי איפור';
    if (/(skin|skincare|face|serum|cleanser|toner|moistur)/.test(lower)) return 'טיפוח לפנים';
    if (/(tooth|teeth|dental|oral|floss)/.test(lower)) return 'הלבנה וטיפוח השיניים';
    if (/(body|personal\s*-?care|bath|soap|deodor)/.test(lower)) return 'טיפוח לגוף';
    if (/(home|house|household|cleaning|laundry|dish)/.test(lower)) return 'לבית';
    if (/(hair|shampoo|conditioner|styling)/.test(lower)) return 'עיצוב שיער';
    if (/(sun|suncare|spf|sunscreen)/.test(lower)) return 'הגנה מהשמש';
    if (/(baby|babies|kid|kids|children|child)/.test(lower)) return 'ילדים ותינוקות';
    if (/(fragrance|perfume|cologne)/.test(lower)) return 'בשמים';
    if (/(men|mens|man|beard|shave|groom|pour\s*homme)/.test(lower)) return 'טיפוח לגבר';

    return '';
  }

  function inferTopLevelsFromBrandJson(pageKind, brandObj) {
    var raw = [];
    if (brandObj) {
      if (Array.isArray(brandObj.categories)) raw = raw.concat(brandObj.categories);
      if (brandObj.category != null) raw.push(brandObj.category);
      if (brandObj.cat != null) raw.push(brandObj.cat);
    }
    var out = [];
    raw.forEach(function (c) {
      var m = mapBrandJsonCategoryToTop(c);
      if (m) out.push(m);
    });
    return uniqStrings(out);
  }

  // Derive brand top-level categories. Primary source: products.json.
  function deriveBrandTopLevels(pageKind, brandObj, brandTypeKeys) {
    var bkey = brandKey(brandObj && brandObj.name ? brandObj.name : '');
    var set = bkey ? brandTypeKeys.get(bkey) : null;

    // From products.json (most accurate)
    if (set && set.size) {
      var groups = Array.from(set)
        .map(function (typeKey) { return String(typeKey || '').split('::')[0].trim(); })
        .filter(Boolean);

      // Keep only our allowed top-level groups
      groups = groups.filter(function (g) { return TOP_LEVEL_ORDER.indexOf(g) !== -1; });
      groups = uniqStrings(groups);
      if (groups.length) return groups;
    }

    // Fallback: infer from the brand JSON categories (mapped into our top-level list)
    var fromBrand = inferTopLevelsFromBrandJson(pageKind, brandObj);
    if (fromBrand.length) return fromBrand;

    // Last resort heuristic: if absolutely nothing is known, avoid “אחר” and pick a conservative default.
    // (Prefer “טיפוח לפנים”, since most brands in our DB are skincare-forward.)
    return ['טיפוח לפנים'];
  }

  function labelForTopLevels(topLevels) {
    var arr = uniqStrings(topLevels);
    if (!arr.length) return '';
    // Sort by our canonical order
    arr.sort(function (a, b) {
      var ia = TOP_LEVEL_ORDER.indexOf(a);
      var ib = TOP_LEVEL_ORDER.indexOf(b);
      if (ia === -1) ia = 999;
      if (ib === -1) ib = 999;
      if (ia !== ib) return ia - ib;
      return String(a).localeCompare(String(b), 'he');
    });
    return arr.join(' / ');
  }

  function buildPriceSelect(selectEl) {
    if (!selectEl) return;

    // מחיר filter UX: selecting $$ should show brands up to that tier (<=),
    // not only the exact tier.
    var prev = String(selectEl.value || '');

    // Rebuild options deterministically (avoid duplicates / partial lists)
    selectEl.innerHTML = '';

    var all = document.createElement('option');
    all.value = '';
    all.textContent = 'כל הרמות';
    selectEl.appendChild(all);

    for (var t = 1; t <= 5; t++) {
      var op = document.createElement('option');
      op.value = String(t);
      op.textContent = '$'.repeat(t) + ' ומטה';
      selectEl.appendChild(op);
    }

    // Restore previous selection if possible
    selectEl.value = prev;
    if (String(selectEl.value || '') !== prev) {
      selectEl.value = '';
    }
  }


  // =============================
  // Product-type dropdown (align with products page)
  // =============================
  function containsAny(haystackLower, words) {
    for (var i = 0; i < words.length; i++) {
      if (haystackLower.indexOf(String(words[i]).toLowerCase()) !== -1) return true;
    }
    return false;
  }

  function getCatsRawFromProduct(p) {
    if (!p) return [];
    if (Array.isArray(p.categories)) return p.categories.map(function(x){ return String(x||'').toLowerCase().trim(); }).filter(Boolean);
    if (p.category != null) return [String(p.category).toLowerCase().trim()].filter(Boolean);
    if (p.cat != null) return [String(p.cat).toLowerCase().trim()].filter(Boolean);
    return [];
  }

  function getPrimaryCategoryKeyFromProduct(p) {
    var cats = getCatsRawFromProduct(p);
    return cats[0] || '';
  }

  function getTypeGroupLabelFromProduct(p) {
    var catKey = getPrimaryCategoryKeyFromProduct(p); // face/hair/body/makeup/fragrance...
    var nameLower = String((p.productTypeLabel || p.name || '')).toLowerCase();

    var isTeeth = containsAny(nameLower, ['tooth','teeth','שן','שיניים','toothpaste','whitening']);
    if (isTeeth) return 'הלבנה וטיפוח השיניים';

    var isMen = /גבר|גברים|men's|for men|for him|pour homme/i.test(nameLower);

    if (catKey === 'makeup') return 'מוצרי איפור';
    if (catKey === 'face') return isMen ? 'טיפוח לגבר' : 'טיפוח לפנים';
    if (catKey === 'body') return isMen ? 'טיפוח לגבר' : 'טיפוח לגוף';
    if (catKey === 'hair') return isMen ? 'טיפוח לגבר' : 'עיצוב שיער';
    if (catKey === 'fragrance') return 'בשמים';
    if (catKey === 'sun' || catKey === 'suncare' || catKey === 'spf') return 'הגנה מהשמש';
    if (isMen) return 'טיפוח לגבר';
    return 'אחר';
  }

  function getTypeDisplayLabelFromProduct(p) {
    var group = getTypeGroupLabelFromProduct(p);
    var name = String((p.productTypeLabel || p.name || '')).trim();
    if (!name) return '';
    var lower = name.toLowerCase();

    if (group === 'מוצרי איפור') {
      if (containsAny(lower, ['lip','שפתיים','שפתון','gloss'])) return 'שפתיים';
      if (containsAny(lower, ['eye','eyes','עיניים','ריסים','מסקרה','eyeliner','brow'])) return 'עיניים';
      if (containsAny(lower, ['nail','ציפורניים','לק'])) return 'ציפורניים';
      if (containsAny(lower, ['brush','מברשת','sponge','applicator','tools','אביזר'])) return 'אביזרי איפור';
      if (containsAny(lower, ['kit','מארז','ערכת'])) return 'סטים ומארזים';
      if (containsAny(lower, ['palette','פלטה'])) return 'פנים';
      return 'פנים';
    }

    if (group === 'טיפוח לפנים') {
      if (containsAny(lower, ['eye','eyes','עיניים','אזור העיניים','שפתיים','lip'])) return 'עיניים ושפתיים';
      if (containsAny(lower, ['mask','מסכה','peel','פילינג','exfoli','scrub'])) return 'מסכות ופילינג';
      if (containsAny(lower, ['serum','סרום','ampoule'])) return 'סרומים';
      if (containsAny(lower, ['cleanser','wash','soap','clean','gel','foam','micellar','מים מיסלריים','ניקוי'])) return 'ניקוי פנים';
      if (containsAny(lower, ['toner','טונר','essence','מיסט'])) return 'טונרים ומיסט';
      if (containsAny(lower, ['cream','קרם','moistur'])) return 'קרמים ולחות';
      if (containsAny(lower, ['oil','שמן'])) return 'שמנים';
      return 'כללי';
    }

    if (group === 'טיפוח לגוף') {
      if (containsAny(lower, ['deodor','דאודורנט'])) return 'דאודורנט';
      if (containsAny(lower, ['body wash','shower','bath','soap','סבון','רחצה'])) return 'רחצה';
      if (containsAny(lower, ['lotion','קרם גוף','body cream','butter','moistur'])) return 'לחות לגוף';
      if (containsAny(lower, ['hand','ידיים'])) return 'ידיים';
      if (containsAny(lower, ['foot','feet','רגל'])) return 'רגליים';
      return 'כללי';
    }

    if (group === 'עיצוב שיער') {
      if (containsAny(lower, ['shampoo','שמפו'])) return 'שמפו';
      if (containsAny(lower, ['conditioner','מרכך'])) return 'מרכך';
      if (containsAny(lower, ['mask','מסכה'])) return 'מסכה לשיער';
      if (containsAny(lower, ['serum','oil','שמן'])) return 'שמנים וסרומים';
      if (containsAny(lower, ['spray','ספריי','gel','wax','cream','mousse'])) return 'עיצוב';
      return 'כללי';
    }

    if (group === 'הגנה מהשמש') {
      return 'SPF';
    }

    if (group === 'בשמים') {
      return 'בישום';
    }

    if (group === 'הלבנה וטיפוח השיניים') {
      return 'שיניים';
    }

    if (group === 'טיפוח לגבר') {
      if (containsAny(lower, ['beard','זקן'])) return 'זקן';
      if (containsAny(lower, ['shave','גילוח'])) return 'גילוח';
      return 'כללי';
    }

    return 'אחר';
  }

  // Brands pages: category filter is TOP LEVEL ONLY (e.g. "איפור") and must be in Hebrew.
  // We build the options based on what actually exists on the page (so it's never empty).
  function buildTypeSelect(selectEl) {
    if (!selectEl) return;

    var prev = String(selectEl.value || '');
    selectEl.innerHTML = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'כל סוגי המוצרים';
    selectEl.appendChild(placeholder);

    // TOP LEVEL ONLY (no sub-categories)
    TOP_LEVEL_ORDER.forEach(function (label) {
      var o = document.createElement('option');
      o.value = label;
      o.textContent = label;
      selectEl.appendChild(o);
    });

    // Restore previous selection if possible
    selectEl.value = prev;
    if (String(selectEl.value || '') !== prev) selectEl.value = '';
  }

  function createBrandCard(brand, pageKind, brandTypeKeysMap) {
    var article = document.createElement('article');
    article.className = 'brandCard';

    // Derive Hebrew top-level categories per brand.
    var topCats = Array.isArray(brand.__topCats) && brand.__topCats.length
      ? brand.__topCats
      : deriveBrandTopLevels(pageKind, brand, brandTypeKeysMap);
    article.setAttribute('data-topcats', topCats.join('|'));

    // Categories in brand JSON are optional and may be empty; pass pageKind for correct normalization.
    var rawCats = [];
    if (Array.isArray(brand.categories)) rawCats = rawCats.concat(brand.categories);
    if (brand.category != null) rawCats.push(brand.category);
    if (brand.cat != null) rawCats.push(brand.cat);
    var cats = normalizeCats(pageKind, rawCats);
    var tier = Number(brand.priceTier);
    if (!(tier >= 1 && tier <= 5)) {
      tier = pageKind === 'intl' ? inferTierFromCategories(cats) : inferTierIsrael(cats);
    }

    article.setAttribute('data-price-tier', String(tier));
    // No need for sub-type keys on brands pages; filter uses top-level categories only.

    var badges = Array.isArray(brand.badges) ? brand.badges.slice() : [];
    // Remove any "מאומת" badge if it exists
    badges = badges.filter(function (x) { return String(x).indexOf('מאומת') === -1; });

    var vegan = Boolean(brand.vegan);
    if (!vegan) {
      vegan = badges.some(function (b) {
        var t = String(b || '').toLowerCase();
        return t.indexOf('טבעוני') !== -1 || t.indexOf('vegan') !== -1;
      });
    }

    var targetUrl = bestAmazonLink(brand) || brand.website || '#';
    if (targetUrl && targetUrl !== '#') {
      article.tabIndex = 0;
      article.setAttribute('role', 'link');
      article.setAttribute('aria-label', 'פתחי ' + (brand.name || 'מותג'));
      article.addEventListener('click', function () {
        window.open(targetUrl, '_blank', 'noopener');
      });
      article.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.open(targetUrl, '_blank', 'noopener');
        }
      });
    }

    // מותג top wrapper
    var top = document.createElement('div');
    top.className = 'brandTop';

    // Header
    var header = document.createElement('div');
    header.className = 'brandHeader';

    var logo = document.createElement('div');
    logo.className = 'brandLogo brandLogo--fallback';
    logo.textContent = logoTextFromName(brand.name);

    var titleBlock = document.createElement('div');
    titleBlock.className = 'brandTitleBlock';

    var nameLink = document.createElement('a');
    nameLink.className = 'brandName';
    // Brand names should remain as-is (Weglot should not translate them)
    nameLink.setAttribute('data-wg-notranslate', 'true');
    nameLink.textContent = brand.name || '';
    nameLink.href = brand.website || targetUrl || '#';
    nameLink.target = '_blank';
    nameLink.rel = 'nofollow noopener';
    stopLinkPropagation(nameLink);

    var catsInline = document.createElement('div');
    catsInline.className = 'brandCatsInline';
    var catText = labelForTopLevels(topCats);
    catsInline.textContent = catText;

    titleBlock.appendChild(nameLink);
    if (catsInline.textContent) titleBlock.appendChild(catsInline);

    header.appendChild(logo);
    header.appendChild(titleBlock);

    // מחיר tier UI
    if (PT && typeof PT.renderPriceTier === 'function') {
      var tierEl = PT.renderPriceTier(tier, { size: 'sm' });
      tierEl.classList.add('brandPriceTier');
      header.appendChild(tierEl);
    }

    // Badges row
    var badgesWrap = document.createElement('div');
    badgesWrap.className = 'brandBadges brandBadges--tight';

    function addBadge(text, cls) {
      if (!text) return;
      var s = document.createElement('span');
      s.className = 'brandBadge' + (cls ? (' ' + cls) : '');
      s.textContent = text;
      // Avoid Weglot translating certification program names.
      if (/\bLeaping\s*Bunny\b/i.test(text) || /\bPETA\b/i.test(text)) {
        s.setAttribute('data-wg-notranslate', 'true');
        s.classList.add('wg-notranslate');
      }
      badgesWrap.appendChild(s);
    }

    // Keep a short, consistent set in compact cards
    // 1) cruelty-free program badge if present
    var progBadges = badges
      .filter(function (b) {
        var t = String(b || '').toLowerCase();
        return t.indexOf('peta') !== -1 || t.indexOf('leaping') !== -1 || t.indexOf('cruelty') !== -1;
      })
      .map(function (b) {
        var lbl = String(b || '');
        if (/leaping\s*bunny/i.test(lbl)) return 'Leaping Bunny';
        if (/peta/i.test(lbl)) return 'PETA';
        return lbl;
      })
      .filter(function (lbl, idx, arr) {
        return lbl && arr.indexOf(lbl) === idx; // dedupe
      });

    progBadges.forEach(function (lbl) {
      addBadge(lbl, 'brandBadge--approved');
    });
    if (vegan) addBadge('טבעוני', 'brandBadge--vegan');
    var lu = formatLastUpdated(pickLastUpdated(brand));
    if (lu) addBadge('עודכן: ' + lu, 'brandBadge--muted');

    // Links row
    var links = document.createElement('div');
    links.className = 'brandLinks';

    function addLink(label, url, extraCls) {
      if (!url || url === '#') return;
      var a = document.createElement('a');
      a.className = 'btn small' + (extraCls ? (' ' + extraCls) : '');
      a.href = url;
      a.target = '_blank';
      a.rel = 'nofollow noopener';
      a.textContent = label;
      stopLinkPropagation(a);
      links.appendChild(a);
    }

    addLink('אתר המותג', brand.website || null, 'brandLink--site');
    addLink('אמזון UK', brand.amazonUk || null, 'brandLink--amazon');
    addLink('אמזון US', brand.amazonUs || null, 'brandLink--amazon');

    top.appendChild(header);
    if (badgesWrap.childNodes.length) top.appendChild(badgesWrap);
    if (links.childNodes.length) top.appendChild(links);

    article.appendChild(top);

    // חיפוש haystack for filtering
    var hay = [brand.name, catText].concat(badges).join(' ');
    article.setAttribute('data-search', hay);

    // Filtering attributes
    if (vegan) article.setAttribute('data-vegan', '1');

    return { el: article, tier: tier, cats: cats };
  }

  function initPage() {
    var grid = document.getElementById('brandGrid');
    if (!grid) return;

    var jsonPath = grid.getAttribute('data-json');
    if (!jsonPath) return;

    // Normalize JSON URL so it works under Weglot language paths (/en/...) and under subpaths.
    var jsonUrl = __kbwgResolveFromSiteBase(jsonPath, 'brands-json.js');

    var pageKind = grid.getAttribute('data-kind') || (document.documentElement.classList.contains('page-recommended-brands') ? 'intl' : 'israel');

    var searchInput = document.getElementById('brandSearch');
    var categorySelect = document.getElementById('brandCategoryFilter');
    var priceSelect = document.getElementById('brandPriceFilter');
    var countEl = document.querySelector('[data-brands-count]');

    buildPriceSelect(priceSelect);

    // Pagination (v10)
    var page = 1;
    var per = 0;
    var pagerEl = null;

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


    function setCount(n, total) {
      if (!countEl) return;
      if (typeof total === 'number') {
        countEl.textContent = 'מציג ' + n + ' מתוך ' + total;
      } else {
        countEl.textContent = 'מציג ' + n;
      }
    }

    
    function readState(state) {
      state.q = searchInput ? norm(searchInput.value) : '';
      state.cat = categorySelect ? String(categorySelect.value || '').trim() : '';
      state.priceTier = priceSelect ? Number(priceSelect.value || '') : 0;
      // Vegan-only filter removed (all brands on the site are 100% vegan + no animal testing)
    }

    function filterBrands(state) {
      var out = [];
      for (var i = 0; i < state.brands.length; i++) {
        var b = state.brands[i];
        if (!b) continue;

        // search
        if (state.q) {
          var hay = b.__searchN || norm(b.__searchRaw || b.name || '');
          if (hay.indexOf(state.q) === -1) continue;
        }

        // top-level category filter (Hebrew)
        if (state.cat) {
          var tops = Array.isArray(b.__topCats) ? b.__topCats : [];
          var hit = false;
          for (var j = 0; j < tops.length; j++) {
            if (String(tops[j] || '').trim() === state.cat) { hit = true; break; }
          }
          if (!hit) continue;
        }

        // price tier: show up to selected tier (cheap -> expensive)
        if (state.priceTier) {
          var t = Number(b.__tier) || 3;
          if (t > state.priceTier) continue;
        }

        out.push(b);
      }
      return out;
    }

    function setCountText(shownStart, shownEnd, total) {
      if (!countEl) return;
      if (!total) { countEl.textContent = 'אין תוצאות'; return; }
      if (shownStart === 1 && shownEnd === total) {
        countEl.textContent = 'מציג ' + total;
      } else {
        countEl.textContent = 'מציג ' + shownStart + '–' + shownEnd + ' מתוך ' + total;
      }
    }

    function renderPaged(state) {
      if (!grid) return;

      var filtered = filterBrands(state);
      per = kbPerPage('brands');
      if (!pagerEl) pagerEl = kbEnsurePager(grid, 'brandsPager');

      // clamp current page
      var total = filtered.length;
      var totalPages = Math.max(1, Math.ceil(total / per));
      if (page > totalPages) page = totalPages;
      if (page < 1) page = 1;

      kbRenderPager(pagerEl, page, total, per, function(n){ page = n; renderPaged(state); });

      if (!total) {
        grid.innerHTML = '<div class="infoCard" style="grid-column:1/-1;">לא מצאנו מותגים לפי הסינון. נסי לשנות חיפוש/קטגוריה.</div>';
        setCountText(0, 0, 0);
        return;
      }

      var start = (page - 1) * per;
      var end = Math.min(total, start + per);
      var slice = filtered.slice(start, end);

      // render only the slice (much faster on mobile)
      grid.innerHTML = '';
      var frag = document.createDocumentFragment();
      for (var i = 0; i < slice.length; i++) {
        var card = createBrandCard(slice[i], state.pageKind, state.brandTypeKeysMap);
        frag.appendChild(card.el);
      }
      grid.appendChild(frag);

      setCountText(start + 1, end, total);
    }

    function bind(state) {
      var handler = function () {
        readState(state);
        page = 1;
        renderPaged(state);
      };

      if (searchInput) searchInput.addEventListener('input', handler);
      if (categorySelect) categorySelect.addEventListener('change', handler);
      if (priceSelect) priceSelect.addEventListener('change', handler);

      // resize: adjust per-page and keep page clamped
      var lastW = window.innerWidth || 0;
      window.addEventListener('resize', function () {
        var w = window.innerWidth || 0;
        if (Math.abs(w - lastW) < 40) return;
        lastW = w;
        renderPaged(state);
      });

      // initial
      handler();
    }
    // Load brand JSON and products.json (for shared category/type dropdown + brand->types index)
    var productsPath = 'data/products.json';
    var productsUrl = __kbwgResolveFromSiteBase(productsPath, 'brands-json.js');

    Promise.all([
      __kbwgFetchJson(jsonUrl, jsonPath),
      __kbwgFetchJson(productsUrl, productsPath)
    ])
      .then(function (arr) {
        var brands = arr[0];
        var products = arr[1];

        products = Array.isArray(products) ? products : [];
        var idx = buildTypesIndexFromProducts(products);

        brands = Array.isArray(brands) ? brands : [];

        // Ensure normalization
        brands = brands.map(function (b) {
          var out = b || {};
          out.name = String(out.name || '').trim();
          out.categories = Array.isArray(out.categories) ? out.categories.filter(Boolean) : [];
          out.badges = Array.isArray(out.badges) ? out.badges.filter(Boolean) : [];
          return out;
        }).filter(function (b) { return b.name; });

        // Policy: show only Vegan-labeled brands.
        // Primary signal: boolean `vegan` in JSON. Fallback: a badge that contains "Vegan".
        brands = brands.filter(function (b) {
          if (b && b.vegan === true) return true;
          try {
            return Array.isArray(b.badges) && b.badges.some(function (x) {
              return String(x || '').toLowerCase().indexOf('vegan') !== -1;
            });
          } catch (e) { return false; }
        });

        // מיון default: cheapest tier first (then name)
        if (PT && typeof PT.sortBrandsCheapestFirst === 'function') {
          brands = PT.sortBrandsCheapestFirst(brands);
        } else {
          brands = brands.slice().sort(function (a, b) {
            var ta = Number(a.priceTier) || 3;
            var tb = Number(b.priceTier) || 3;
            if (ta !== tb) return ta - tb;
            return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
          });
        }

        // Compute per-brand TOP categories (Hebrew, aligned) and populate the category dropdown.
        var presentTopCatsSet = new Set();
        brands.forEach(function (b) {
          try {
            var tops = deriveBrandTopLevels(pageKind, b, idx.brandTypeKeys);
            b.__topCats = tops;
            (tops || []).forEach(function (t) { presentTopCatsSet.add(String(t || '').trim()); });
          } catch (e) {
            b.__topCats = ['אחר'];
            presentTopCatsSet.add('אחר');
          }
        });
        buildTypeSelect(categorySelect, Array.from(presentTopCatsSet));

        // Render (paged)
        grid.innerHTML = '';

        // Precompute searchable fields (faster filtering)
        brands.forEach(function (b) {
          try {
            var rawCats = [];
            if (Array.isArray(b.categories)) rawCats = rawCats.concat(b.categories);
            if (b.category != null) rawCats.push(b.category);
            if (b.cat != null) rawCats.push(b.cat);
            var cats = normalizeCats(pageKind, rawCats);
            b.__cats = cats;

            var tier = Number(b.priceTier);
            if (!(tier >= 1 && tier <= 5)) {
              tier = pageKind === 'intl' ? inferTierFromCategories(cats) : inferTierIsrael(cats);
            }
            b.__tier = tier;

            // Search haystack
            var catText = (cats || []).join(' ');
            var badges = Array.isArray(b.badges) ? b.badges.slice() : [];
            badges = badges.filter(function (x) { return String(x).indexOf('מאומת') === -1; });
            var hay = [b.name, catText].concat(badges).join(' ');
            b.__searchRaw = hay;
            b.__searchN = norm(hay);

            // Top-cats already computed above
          } catch (e) {}
        });

        var state = { brands: brands, q: '', cat: '', priceTier: 0, pageKind: pageKind, brandTypeKeysMap: idx.brandTypeKeys };
        bind(state);

        // Let Weglot (and other listeners) know dynamic content is ready.
        try { window.dispatchEvent(new Event('kbwg:content-rendered')); } catch (e) {}
      })
      .catch(function (err) {
        console.error(err);
        // Show a friendly message
        var isFile = false;
        try { isFile = location && location.protocol === 'file:'; } catch (e) { isFile = false; }

        if (isFile) {
          grid.innerHTML = [
            '<div class="infoCard">',
            '<strong>האתר רץ כרגע מקובץ מקומי (file://),</strong> ולכן הדפדפן חוסם טעינת JSON (CORS).',
            '<br>כדי שזה יעבוד מקומית, תריצי שרת קטן (Local Server) ואז תפתחי את האתר דרך <code>http://localhost</code>.',
            '<br><br><strong>Windows:</strong> בתיקייה של הפרויקט הריצי:',
            '<br><code>py -m http.server 8000</code>',
            '<br>ואז פתחי: <code>http://localhost:8000/recommended-brands.html</code>',
            '<br><br>ב־GitHub Pages / אתר אמיתי (https) זה יעבוד בלי בעיה.',
            '</div>'
          ].join('');
        } else {
          grid.innerHTML = '<div class="infoCard">לא הצלחנו לטעון את הרשימה כרגע.</div>';
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }
})();
