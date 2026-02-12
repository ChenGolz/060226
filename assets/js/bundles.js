/* KBWG Bundles — Auto bundles from products.json (משלוח חינם מעל $49) — v4
   What’s new in v4:
   - Adds Kids/Family bundles for products with ילדים/לילדים/kids in the name (keeps them out of other bundles).
   - Popup filters:
       * “רמת מחיר” is now BRAND tier (not product). Options are in Hebrew (no $$$$$ UI).
       * Adds מינימום/מקסימום מחיר (USD) + קטגוריה.
   - Adds “בנו חבילה בעצמכם” (custom bundle builder) in Hebrew.
   - Generates many more bundles from remaining eligible products (cheapest-first), while keeping each product in only one bundle.
   - Always fetches latest data/products.json (cache-busting).
   Notes:
   - UI is Hebrew; brand names shown LTR/English.
*/

(function(){
  'use strict';

  try { window.KBWG_BUNDLES_BUILD = '2026-02-11-v8'; console.info('[KBWG] Bundles build', window.KBWG_BUNDLES_BUILD); } catch(e) {}

  var PRODUCTS_PATH = 'data/products.json';
  var BRANDS_PATH = 'data/intl-brands.json';
  var BRAND_INDEX = null;
  var FREE_SHIP_OVER_USD = 49;


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


  // Affiliate tag helper (adds tag only for Amazon US links at runtime)
  var AMAZON_TAG = 'nocrueltyil-20';
  function ensureAmazonComTag(url){
    var raw = String(url || '').trim();
    if (!raw) return raw;
    try{
      var u = new URL(raw, location.href);
      var host = String(u.hostname || '').toLowerCase();
      if (!(host === 'amazon.com' || host.slice(-10) === '.amazon.com')) return raw;
      if (u.searchParams.get('tag')) return u.toString();
      u.searchParams.set('tag', AMAZON_TAG);
      return u.toString();
    }catch(e){
      if (!raw || raw.indexOf('amazon.com') === -1) return raw;
      if (raw.indexOf('tag=') !== -1) return raw;
      return raw + (raw.indexOf('?') === -1 ? '?' : '&') + 'tag=' + encodeURIComponent(AMAZON_TAG);
    }
  }


  // שימו לב: מעל סך של $150 ייתכנו מיסים/עמלות יבוא (ישראל)
  var TAX_THRESHOLD_USD = 150;

  var BUNDLE_MIN = 52.00;
  var BUNDLE_MAX = 65.00;
  var BUNDLE_MIN_ITEMS = 3;
  var MORE_MERRIER_PREFER_MAX = 55.00;
  // יעד פנימי לאיזון חבילות (איפה נעדיף לנחות בתוך הטווח)
  var BUNDLE_TARGET = (BUNDLE_MIN + BUNDLE_MAX) / 2;

  // How many auto bundles to generate (to keep page usable)
  var MAX_KIDS_BUNDLES = 9999;
  var MAX_EXTRA_BUNDLES = 9999;

  var USD_TO_ILS_DEFAULT = 3.30;
  var FX_RATE = USD_TO_ILS_DEFAULT;

  function $(s,r){ return (r||document).querySelector(s); }
  function $all(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function isNum(x){ return typeof x === 'number' && isFinite(x); }


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


  function fmtUSD(n){
    var x = Number(n);
    if(!isFinite(x)) return '$—';
    var usd = '$' + x.toFixed(2);
    var ils = Math.round(x * (FX_RATE || USD_TO_ILS_DEFAULT));
    if(!isFinite(ils)) return usd;
    return usd + ' (₪' + ils + ')';
  }
  function fmtILS(n){
    var x = Number(n);
    if(!isFinite(x)) return '— ₪';
    return Math.round(x) + ' ₪';
  }

  function escapeHtml(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function normalizeText(s){ return String(s||'').toLowerCase(); }


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

  function kbEnsureLoadMore(afterEl, id, btnText){
    if(!afterEl) return null;
    var ex = document.getElementById(id);
    if(ex) return ex;
    var wrap = document.createElement('div');
    wrap.className = 'kbLoadMoreWrap';
    wrap.id = id;
    wrap.innerHTML = '<button class="btn primary" type="button" data-kbmore>' + (btnText || 'טעני עוד') + '</button>';
    afterEl.insertAdjacentElement('afterend', wrap);
    return wrap;
  }
  function kbSetLoadMoreVisible(wrap, visible){
    if(!wrap) return;
    wrap.style.display = visible ? 'flex' : 'none';
  }



  function isCampaignUrl(u){ return normalizeText(u).indexOf('campaign') !== -1; }

  // ===== Offer selection (must have משלוח חינם מעל $49) =====

  // ---------- Brand badge inheritance (from intl-brands.json) ----------
  function stripDiacritics(s){
    var str = String(s||'');
    try { return str.normalize('NFD').replace(/[\u0300-\u036f]/g,''); } catch(e){ return str; }
  }
  function brandKey(name){
    return stripDiacritics(String(name||''))
      .toLowerCase()
      .replace(/&/g,'and')
      .replace(/[^a-z0-9\u0590-\u05FF]+/g,'');
  }
  function buildBrandIndex(brands){
    var byKey = {};
    var list = [];
    var suffixes = ['beauty','cosmetics','skincare','skinc','skin','care','company','co','labs','lab'];

    for(var i=0;i<(brands||[]).length;i++){
      var b = brands[i];
      if(!b) continue;
      var k = brandKey(b.name || b.website || b.site || '');
      if(!k) continue;

      if(!byKey[k]) byKey[k] = b;
      list.push({ k:k, b:b });

      for(var s=0;s<suffixes.length;s++){
        var suf = suffixes[s];
        if(k.length > suf.length + 3 && k.slice(-suf.length) === suf){
          var k2 = k.slice(0, -suf.length);
          if(k2 && !byKey[k2]) byKey[k2] = b;
        }
      }
    }
    return { byKey: byKey, list: list };
  }
  function findBrand(name){
    if(!BRAND_INDEX) return null;
    var k = brandKey(name);
    if(!k) return null;

    if(BRAND_INDEX.byKey[k]) return BRAND_INDEX.byKey[k];

    if(k.length < 5) return null;
    var best = null, bestScore = Infinity;

    for(var i=0;i<BRAND_INDEX.list.length;i++){
      var it = BRAND_INDEX.list[i];
      var bk = it.k;
      if(!bk) continue;

      var ok = (bk.indexOf(k)===0) || (k.indexOf(bk)===0) || (bk.indexOf(k)!==-1);
      if(!ok) continue;

      var score = Math.abs(bk.length - k.length);
      if(score < bestScore){ best = it.b; bestScore = score; }
    }
    return best;
  }
  function brandFlags(brand){
    var badges = (brand && Array.isArray(brand.badges)) ? brand.badges : [];
    var set = {};
    for(var i=0;i<badges.length;i++){
      var v = String(badges[i]||'').toLowerCase().trim();
      if(v) set[v] = true;
    }
    return {
      isLB: !!(set['leaping bunny'] || set['leapingbunny']),
      isPeta: !!set['peta']
    };
  }
  function asBool(v){
    return (v === true || v === false) ? v : null;
  }
  function resolveBadgeFlags(product){
    var brand = findBrand(product && product.brand);
    var bf = brandFlags(brand);

    var prodLB = asBool(product && (product.isLB != null ? product.isLB : (product.lb != null ? product.lb : product.isLeapingBunny)));
    var prodP = asBool(product && (product.isPeta != null ? product.isPeta : product.peta));

    return {
      isLB: (prodLB != null) ? prodLB : bf.isLB,
      isPeta: (prodP != null) ? prodP : bf.isPeta
    };
  }


  
function offerFreeShip49(product){
  // STRICT: only offers with freeShipOver === 49 are eligible for bundles page
  if(!product || !Array.isArray(product.offers)) return null;

  var eligAmazon = [];
  var eligAny = [];

  for(var i=0;i<product.offers.length;i++){
    var o = product.offers[i];
    if(!o || !o.url || !isNum(o.priceUSD)) continue;

    var fsRaw = (o.freeShipOver != null) ? o.freeShipOver : (product && product.freeShipOver != null ? product.freeShipOver : null);
    var fs = Number(fsRaw);
    if(!isFinite(fs) || fs !== FREE_SHIP_OVER_USD) continue;

    // normalize
    o.freeShipOver = fs;

    if(o.store === 'amazon-us') eligAmazon.push(o);
    eligAny.push(o);
  }

  function pickBest(list){
    if(!list.length) return null;
    // prioritize "campaign" urls, then lower price
    list.sort(function(a,b){
      var ac = isCampaignUrl(a.url) ? 1 : 0;
      var bc = isCampaignUrl(b.url) ? 1 : 0;
      if(ac !== bc) return bc - ac;
      return a.priceUSD - b.priceUSD;
    });
    return list[0];
  }

  // 1) Prefer Amazon US eligible offer (campaign first)
  var bestA = pickBest(eligAmazon);
  if(bestA) return bestA;

  // 2) Any eligible offer (campaign first)
  return pickBest(eligAny);
}


function eligibleProduct(p){
    var o = offerFreeShip49(p);
    if(!o) return null;

    var price = Number(o.priceUSD);
    if(!isFinite(price)) return null;

    return {
      _id: p.id || ((p.brand||'') + '::' + (p.name||'')),
      id: (p.id || ((p.brand||'') + '::' + (p.name||''))),
      _brand: p.brand || '',
      _name: p.name || '',
      _image: p.image || '',
      _categories: getCatsRaw(p),
      _isPeta: resolveBadgeFlags(p).isPeta,
      _isLB: resolveBadgeFlags(p).isLB,
      _offer: o,
      _priceUSD: Math.round(price * 100) / 100,
      _brandTier: '', // computed later
      _raw: p
    };
  }

  // ===== Category + keyword helpers =====
  // Categories should match the products page logic (data/products.json categories).
  // Normalization + labels (Hebrew labels; keys remain as in data).
  var CAT_ALIASES = {
    fragrances: 'fragrance',
    perfume: 'fragrance',
    perfumes: 'fragrance',
    frag: 'fragrance',

    cosmetics: 'makeup',
    cosmetic: 'makeup',

    skincare: 'face',
    skin: 'face',

    oral: 'teeth',
    dental: 'teeth',

    suncare: 'sun',
    sunscreen: 'sun',
    spf: 'sun',

    haircare: 'hair',
    'hair-care': 'hair',

    mens: 'mens-care',
    men: 'mens-care',
    "men's": 'mens-care',
    grooming: 'mens-care',

    kids: 'baby',
    kid: 'baby',
    children: 'baby',
    child: 'baby',
    toddler: 'baby',
    family: 'baby',
    baby: 'baby',

    bodycare: 'body',
    'body-care': 'body'
  };
  function normCat(v){
    var s = String(v == null ? '' : v).trim().toLowerCase();
    return CAT_ALIASES[s] || s;
  }
  function getCatsRaw(p){
    if(!p) return [];
    if(Array.isArray(p.categories)) return p.categories.map(normCat).filter(Boolean);
    if(p.category != null) return [normCat(p.category)].filter(Boolean);
    if(p.cat != null) return [normCat(p.cat)].filter(Boolean);
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
    'mens-care': 'גברים'
  };

  var CATEGORY_ORDER = ['face','hair','body','makeup','fragrance','sun','teeth','baby','mens-care'];

  function hasCat(p, cat){
    return p._categories && p._categories.indexOf(cat) !== -1;
  }
  function hasAnyCat(p, cats){
    for(var i=0;i<cats.length;i++){ if(hasCat(p,cats[i])) return true; }
    return false;
  }

  function isKids(p){
    // user requirement: ילדים/לילדים in the name => kids/family
    return /(ילדים|לילדים|ילד|לתינוק|תינוק|בייבי)/.test(p._name || '') || /\bkids?\b|\bbaby\b|\btoddler\b/i.test(p._name || '') || (hasCat(p,'baby') || hasCat(p,'kids'));
  }

  function isMen(p){
  // Men bundle: match by name OR categories
  if(hasCat(p,'mens-care') || hasCat(p,'men') || hasCat(p,'mens') ) return true;
  var n = (p._name || '');
  var c = (Array.isArray(p._categories) ? p._categories.join(' ') : '');
  return /men/i.test(n) || /mens/i.test(n) || /men's/i.test(n) || /גברים|לגבר|לגברים/.test(n) ||
         /men/i.test(c) || /mens/i.test(c) || /גברים|לגבר|לגברים/.test(c);
}

  function isMakeup(p){
    if(hasCat(p,'makeup')) return true;
    return /\bmakeup\b|\blip\b|\blipstick\b|\bgloss\b|\bmascara\b|\beyeshadow\b|\bblush\b|\bfoundation\b|\bconcealer\b|\bbrow\b|\bbronzing\b|\bbronzer\b|\bhighlighter\b|\btint(ed)?\b/i.test(p._name || '');
  }

  function isHair(p){
  // Hair bundle: treat shampoo/conditioner/mask/styling/scalp as hair too
  if(hasCat(p,'hair')) return true;
  if(hasAnyCat(p,['shampoo','conditioner','hair-mask','mask','scalp','styling','haircare'])) return true;
  return /hair/i.test(p._name || '') || /שמפו|מרכך|מסכה|שיער|קרקפת/.test(p._name || '');
}
  function isShampoo(p){ return hasCat(p,'shampoo') || /\bshampoo\b/i.test(p._name || ''); }
  function isConditioner(p){ return hasCat(p,'conditioner') || /\bconditioner\b/i.test(p._name || ''); }
  function isHairMask(p){
    if(hasAnyCat(p,['mask']) && isHair(p)) return true;
    return (/\bmask\b|\bmasque\b/i.test(p._name || '') && isHair(p));
  }

  function isFace(p){ return hasCat(p,'face') || /\bface\b/i.test(p._name || '') || /פנים/.test(p._name || ''); }
  function isFaceCream(p){
    if(hasAnyCat(p,['moisturizer','cream']) && isFace(p)) return true;
    return (/\bcream\b|\bmoisturizer\b/i.test(p._name || '') && isFace(p));
  }
  function isFaceSerum(p){
    if(hasCat(p,'serum') && isFace(p)) return true;
    return (/\bserum\b/i.test(p._name || '') && isFace(p));
  }
  function isFaceMask(p){
    if(hasCat(p,'mask') && isFace(p)) return true;
    return (/\bmask\b/i.test(p._name || '') && isFace(p));
  }

  function isBody(p){
    // Body & hygiene products
    if(hasCat(p,'body')) return true;
    if(hasAnyCat(p,['soap','bath','shower','body-wash','lotion','deodorant','hand','foot'])) return true;
    var n = (p._name || '');
    return /\bbody\b|\bsoap\b|\bdeodorant\b|\bwash\b|\bbath\b|\bshower\b|\blotion\b|\bhand\b|\bfoot\b/i.test(n)
      || /(גוף|סבון|רחצה|מקלחת|דאודורנט|קרם גוף|קרם ידיים|קרם רגליים)/.test(n);
  }

  function isTeeth(p){
    if(hasAnyCat(p,['teeth','oral'])) return true;
    return /\btooth\b|\bteeth\b|\bdental\b|\bfloss\b|\bmouth\b|\bwhiten\b|\btoothpaste\b/i.test(p._name || '');
  }

  // ===== Bundle solving =====
  function sumUSD(items){
    var s=0;
    for(var i=0;i<items.length;i++) s += (items[i]._priceUSD || 0);
    return Math.round(s * 100) / 100;
  }

  function bestSubset(candidates, min, max, opts){
    opts = opts || {};
    var preferCloserTo = isNum(opts.preferCloserTo) ? opts.preferCloserTo : null;
    var hardMaxItems = isNum(opts.maxCandidates) ? opts.maxCandidates : 220;

    // sort candidates with preference for "campaign" urls, then cheapest (limit for performance)
    var c = candidates.slice().sort(function(a,b){
      var ac = (a && a._url && isCampaignUrl(a._url)) ? 1 : 0;
      var bc = (b && b._url && isCampaignUrl(b._url)) ? 1 : 0;
      if(ac !== bc) return bc - ac;
      return a._priceUSD - b._priceUSD;
    }).slice(0, hardMaxItems);

    var scale = 100; // cents
    var minC = Math.round(min * scale);
    var maxC = Math.round(max * scale);

    // dp[sum] = {count, camp, prev, idx}
    var dp = new Array(maxC + 1);
    dp[0] = { count: 0, camp: 0, prev: -1, idx: -1 };

    function better(newState, oldState, sumC){
      if(!oldState) return true;
      if(newState.count !== oldState.count) return newState.count > oldState.count;
      if(newState.camp !== oldState.camp) return newState.camp > oldState.camp;
      // tie-break: prefer closer to target, else smaller sum
      if(preferCloserTo != null){
        var t = Math.round(preferCloserTo * scale);
        var distNew = Math.abs(sumC - t);
        var distOld = Math.abs(sumC - t); // same sumC
        if(distNew < distOld) return true;
      }
      return false;
    }

    for(var i=0;i<c.length;i++){
      var w = Math.round(c[i]._priceUSD * scale);
      var isCamp = (c[i] && c[i]._url && isCampaignUrl(c[i]._url)) ? 1 : 0;
      for(var s=maxC; s>=w; s--){
        if(!dp[s-w]) continue;
        var prev = dp[s-w];
        var candState = { count: prev.count + 1, camp: prev.camp + isCamp, prev: s-w, idx: i };
        if(better(candState, dp[s], s)){
          dp[s] = candState;
        }
      }
    }

    var bestSum = -1;
    var bestCount = -1;
    var bestCamp = -1;

    for(var s2=minC; s2<=maxC; s2++){
      if(!dp[s2]) continue;
      var count = dp[s2].count;
      var camp = dp[s2].camp;

      if(count > bestCount){
        bestCount = count;
        bestCamp = camp;
        bestSum = s2;
      }else if(count === bestCount && bestSum !== -1){
        if(camp > bestCamp){
          bestCamp = camp;
          bestSum = s2;
        }else if(camp === bestCamp){
          if(preferCloserTo != null){
            var t2 = Math.round(preferCloserTo * scale);
            var distNew2 = Math.abs(s2 - t2);
            var distBest2 = Math.abs(bestSum - t2);
            if(distNew2 < distBest2) bestSum = s2;
            else if(distNew2 === distBest2 && s2 < bestSum) bestSum = s2;
          }else{
            if(s2 < bestSum) bestSum = s2;
          }
        }
      }
    }

    if(bestSum === -1) return [];

    // reconstruct
    var picked = [];
    var s3 = bestSum;
    while(s3 > 0){
      var st = dp[s3];
      if(!st) break;
      picked.push(c[st.idx]);
      s3 = st.prev;
    }
    return picked.reverse();
  }


  function pickTrioWithFill(pool, predA, predB, predC, fillPred){
    var A = pool.filter(predA).sort(function(a,b){ var ac=(a&&a._url&&isCampaignUrl(a._url))?1:0; var bc=(b&&b._url&&isCampaignUrl(b._url))?1:0; if(ac!==bc) return bc-ac; return a._priceUSD-b._priceUSD; }).slice(0, 50);
    var B = pool.filter(predB).sort(function(a,b){ var ac=(a&&a._url&&isCampaignUrl(a._url))?1:0; var bc=(b&&b._url&&isCampaignUrl(b._url))?1:0; if(ac!==bc) return bc-ac; return a._priceUSD-b._priceUSD; }).slice(0, 50);
    var C = pool.filter(predC).sort(function(a,b){ var ac=(a&&a._url&&isCampaignUrl(a._url))?1:0; var bc=(b&&b._url&&isCampaignUrl(b._url))?1:0; if(ac!==bc) return bc-ac; return a._priceUSD-b._priceUSD; }).slice(0, 50);

    var best = null;

    for(var i=0;i<A.length;i++){
      for(var j=0;j<B.length;j++){
        if(B[j]._id === A[i]._id) continue;
        for(var k=0;k<C.length;k++){
          if(C[k]._id === A[i]._id || C[k]._id === B[j]._id) continue;

          var base = [A[i], B[j], C[k]];
          var baseSum = sumUSD(base);
          if(baseSum > BUNDLE_MAX) continue;

          var remMin = BUNDLE_MIN - baseSum;
          var remMax = BUNDLE_MAX - baseSum;
          if(remMin < 0) remMin = 0;

          var usedIds = {};
          usedIds[A[i]._id]=1; usedIds[B[j]._id]=1; usedIds[C[k]._id]=1;

          var remPool = pool.filter(function(p){
            return !usedIds[p._id] && fillPred(p);
          });

          var fill = bestSubset(remPool, remMin, remMax, { preferCloserTo: 55.0 });
          var items = base.concat(fill);
          var total = sumUSD(items);

          if(total < BUNDLE_MIN || total > BUNDLE_MAX) continue;

          var score = { count: items.length, total: total };
          if(!best
            || score.count > best.score.count
            || (score.count === best.score.count && score.total < best.score.total)
          ){
            best = { items: items, score: score };
          }
        }
      }
    }

    return best ? best.items : [];
  }

  // ===== Popup-safe “open all” hub =====
  function ensureLinksModal(){
    var existing = $('#kbwgLinksModal');
    if(existing) return existing;

    var overlay = document.createElement('div');
    overlay.id = 'kbwgLinksModal';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,.55)';
    overlay.style.zIndex = '200000';
    overlay.style.display = 'none';
    overlay.style.padding = '18px';

    var box = document.createElement('div');
    box.style.maxWidth = '720px';
    box.style.margin = '0 auto';
    box.style.background = '#fff';
    box.style.borderRadius = '16px';
    box.style.padding = '16px';
    box.style.maxHeight = '85vh';
    box.style.overflow = 'auto';
    box.style.direction = 'rtl';

    var h = document.createElement('div');
    h.style.display = 'flex';
    h.style.alignItems = 'center';
    h.style.justifyContent = 'space-between';
    h.style.gap = '12px';

    var title = document.createElement('div');
    title.style.fontWeight = '700';
    title.style.fontSize = '18px';
    title.textContent = 'פתיחת לינקים';

    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'סגירה';
    close.style.border = '1px solid #ddd';
    close.style.borderRadius = '10px';
    close.style.padding = '8px 10px';
    close.style.cursor = 'pointer';
    close.addEventListener('click', function(){ overlay.style.display = 'none'; });

    h.appendChild(title);
    h.appendChild(close);

    var p = document.createElement('p');
    p.style.margin = '10px 0 12px';
    p.textContent = 'כדי לפתוח את כל הלינקים בבת אחת צריך לאפשר חלונות קופצים לאתר. אפשר קודם להעתיק את כל הלינקים, ואז ללחוץ על “פתיחת כל הלינקים”.';

    var actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.flexWrap = 'wrap';
    actions.style.gap = '8px';
    actions.style.marginBottom = '10px';

    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'העתקת כל הלינקים';
    copyBtn.style.border = '1px solid #ddd';
    copyBtn.style.borderRadius = '10px';
    copyBtn.style.padding = '8px 10px';
    copyBtn.style.cursor = 'pointer';

    var openOneBtn = document.createElement('button');
    openOneBtn.type = 'button';
    openOneBtn.textContent = 'פתיחת לינק ראשון';
    openOneBtn.style.border = '1px solid #ddd';
    openOneBtn.style.borderRadius = '10px';
    openOneBtn.style.padding = '8px 10px';
    openOneBtn.style.cursor = 'pointer';


    var openAllBtn = document.createElement('button');
    openAllBtn.type = 'button';
    openAllBtn.textContent = 'פתיחת כל הלינקים';
    openAllBtn.style.border = '1px solid #111';
    openAllBtn.style.background = '#111';
    openAllBtn.style.color = '#fff';
    openAllBtn.style.borderRadius = '10px';
    openAllBtn.style.padding = '8px 10px';
    openAllBtn.style.cursor = 'pointer';

    var status = document.createElement('div');
    status.id = 'kbwgLinksStatus';
    status.style.margin = '6px 0 12px';
    status.style.fontSize = '13px';
    status.style.color = '#666';


    actions.appendChild(openAllBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(openOneBtn);

    var list = document.createElement('div');
    list.id = 'kbwgLinksList';
    list.style.display = 'grid';
    list.style.gap = '6px';

    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(actions);
    box.appendChild(status);
    box.appendChild(list);
    overlay.appendChild(box);

    overlay.addEventListener('click', function(e){
      if(e.target === overlay) overlay.style.display = 'none';
    });

    document.body.appendChild(overlay);

    overlay._setLinks = function(items, modalTitle){
      var links = (items || []).map(function(x){
        if(typeof x === 'string') return { url: x, label: x };
        if(!x) return null;
        return { url: x.url || x.href || '', label: x.label || x.name || x.title || x.url || x.href || '' };
      }).filter(function(l){ return l && l.url; });

      if(modalTitle){ title.textContent = String(modalTitle); }

      list.innerHTML = '';
      var text = links.map(function(l){ return l.url; }).join('\n');

      copyBtn.onclick = async function(){
        try{
          await navigator.clipboard.writeText(text);
          copyBtn.textContent = 'הועתק ✓';
          setTimeout(function(){ copyBtn.textContent = 'העתקת כל הלינקים'; }, 1200);
        }catch(e){
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          try{ document.execCommand('copy'); copyBtn.textContent = 'הועתק ✓'; } catch(_e){}
          document.body.removeChild(ta);
          setTimeout(function(){ copyBtn.textContent = 'העתקת כל הלינקים'; }, 1200);
        }
      };

      openOneBtn.onclick = function(){
        if(links && links.length) window.open(ensureAmazonComTag(links[0].url), '_blank', 'noopener');
      };


      openAllBtn.onclick = function(){
        if(!links || !links.length) return;
        var opened = 0;
        for(var i=0;i<links.length;i++){
          var w = window.open(ensureAmazonComTag(links[i].url), '_blank', 'noopener');
          if(!w){
            status.textContent = 'הדפדפן חסם פתיחה אחרי ' + opened + ' טאבים. יש לאפשר חלונות קופצים לאתר ולנסות שוב.';
            return;
          }
          opened++;
        }
        status.textContent = 'נפתחו ' + opened + ' טאבים ✓';
      };


      links.forEach(function(l){
        var a = document.createElement('a');
        a.href = ensureAmazonComTag(l.url);
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = l.label || l.url;
        a.style.wordBreak = 'break-word';
        a.style.overflowWrap = 'anywhere';
        a.style.color = '#0b57d0';
        a.style.textDecoration = 'underline';
        list.appendChild(a);
      });
    };

    return overlay;
  }

  function openLinkHub(items, title){
    items = items || [];
    var links = items.map(function(x){
      if(typeof x === 'string') return { url: x, label: x };
      if(!x) return null;
      return { url: x.url || x.href || '', label: x.label || x.name || x.title || x.url || x.href || '' };
    }).filter(function(l){ return l && l.url; });

    if(!links.length) return;

    // Try opening ONE tab (allowed). It becomes a hub.
    var win = window.open('', '_blank', 'noopener');
    if(!win){
      var modal = ensureLinksModal();
      modal._setLinks(links);
      modal.style.display = 'block';
      return;
    }

    var safeTitle = escapeHtml(title || 'פתיחת לינקים');

    var list = links.map(function(l, i){
      var su = escapeHtml(ensureAmazonComTag(l.url));
      var sl = escapeHtml(l.label || l.url);
      return '<div class="row"><div class="num">'+(i+1)+'</div>'
        + '<a class="url" href="'+su+'" target="_blank" rel="noopener">'+sl+'</a>'
        + '<button class="btn openOne" data-i="'+i+'">פתיחה</button></div>';
    }).join('');

    var urls = links.map(function(l){ return ensureAmazonComTag(l.url); });

    var html = '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"/>'
      + '<meta name="viewport" content="width=device-width,initial-scale=1"/>'
      + '<title>'+safeTitle+'</title>'
      + '<style>'
      + 'body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; margin:0; background:#f7f7f8; color:#111;}'
      + '.wrap{max-width:860px; margin:0 auto; padding:18px;}'
      + '.card{background:#fff; border:1px solid #e8e8ee; border-radius:18px; padding:16px; box-shadow:0 2px 14px rgba(0,0,0,.05);}'
      + 'h1{font-size:20px; margin:0 0 8px;}'
      + 'p{margin:6px 0 0; line-height:1.45;}'
      + '.actions{display:flex; flex-wrap:wrap; gap:10px; margin-top:12px;}'
      + '.btn{border:1px solid #ddd; background:#fff; border-radius:12px; padding:10px 12px; cursor:pointer; font-size:14px;}'
      + '.btn.primary{background:#111; color:#fff; border-color:#111;}'
      + '.btn:active{transform:translateY(1px);} '
      + '.muted{color:#666; font-size:13px;}'
      + '.list{margin-top:14px; display:grid; gap:10px;}'
      + '.row{display:grid; grid-template-columns:42px 1fr 88px; gap:10px; align-items:center; padding:10px; border:1px solid #eee; border-radius:14px; background:#fff;}'
      + '.num{font-weight:700; color:#444; text-align:center;}'
      + '.url{word-break:break-word; overflow-wrap:anywhere; color:#0b57d0; text-decoration:underline;}'
      + '.toast{margin-top:10px; padding:10px 12px; border-radius:14px; background:#f1f5ff; border:1px solid #dfe7ff; display:none;}'
      + '</style></head><body><div class="wrap">'
      + '<div class="card">'
      + '<h1>'+safeTitle+'</h1>'
      + '<p class="muted">אם הדפדפן חוסם פתיחת הרבה טאבים בבת אחת, אפשר לפתוח כאן אחד־אחד (תמיד עובד), או לנסות “פתיחת כולם”.</p>'
      + '<div class="actions">'
      + '<button class="btn primary" id="openNext">פתיחת הלינק הבא</button>'
      + '<button class="btn" id="openAll">ניסיון לפתוח את כולם</button>'
      + '<button class="btn" id="copyAll">העתקת כל הלינקים</button>'
      + '</div>'
      + '<div class="toast" id="toast"></div>'
      + '</div>'
      + '<div class="list" id="list">'+list+'</div>'
      + '<p class="muted" style="margin-top:12px">טיפ: אפשר לאפשר חלונות קופצים לאתר בהגדרות הדפדפן/אתר ואז לנסות שוב.</p>'
      + '</div>'
      + '<script>'
      + 'const URLS=' + JSON.stringify(urls) + ';'
      + 'let idx=0;'
      + 'const toast=document.getElementById("toast");'
      + 'function show(msg){toast.textContent=msg; toast.style.display="block"; clearTimeout(window.__t); window.__t=setTimeout(()=>toast.style.display="none",2200);}'
      + 'function openOne(i){const w=window.open(URLS[i],"_blank","noopener"); if(!w) return false; return true;}'
      + 'document.getElementById("openNext").addEventListener("click",()=>{'
      + '  while(idx<URLS.length){'
      + '    const ok=openOne(idx); idx++;'
      + '    if(ok){ show("נפתח לינק "+idx+" מתוך "+URLS.length); return; }'
      + '    show("הדפדפן חסם פתיחה. אפשר לאפשר חלונות קופצים לאתר.");'
      + '    return;'
      + '  }'
      + '  show("אין עוד לינקים.");'
      + '});'
      + 'document.getElementById("openAll").addEventListener("click",()=>{'
      + '  let opened=0;'
      + '  for(let i=0;i<URLS.length;i++){'
      + '    const ok=openOne(i);'
      + '    if(!ok){ show("הדפדפן חסם פתיחה. אפשר לאפשר חלונות קופצים לאתר."); break; }'
      + '    opened++;'
      + '  }'
      + '  show("נפתחו "+opened+" טאבים.");'
      + '});'
      + 'document.getElementById("copyAll").addEventListener("click",async()=>{'
      + '  const text=URLS.join("\n");'
      + '  try{ await navigator.clipboard.writeText(text); show("הועתק ✓"); }catch(e){'
      + '    const ta=document.createElement("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.left="-9999px"; document.body.appendChild(ta); ta.select();'
      + '    try{ document.execCommand("copy"); show("הועתק ✓"); }catch(_e){}'
      + '    document.body.removeChild(ta);'
      + '  }'
      + '});'
      + 'document.querySelectorAll(".openOne").forEach(btn=>btn.addEventListener("click",()=>{'
      + '  const i=Number(btn.getAttribute("data-i"));'
      + '  const ok=openOne(i);'
      + '  if(ok) show("נפתח לינק "+(i+1)); else show("הדפדפן חסם פתיחה. אפשר לאפשר חלונות קופצים לאתר.");'
      + '}));'
      + '</'+'script>'
      + '</body></html>';

    try{
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
    }catch(e){
      try{ win.close(); }catch(_e){}
      var modal2 = ensureLinksModal();
      modal2._setLinks(links);
      modal2.style.display = 'block';
    }
  }

  function openAllLinks(items, title){
    var links = [];
    for(var i=0;i<(items||[]).length;i++){
      var it = items[i];
      var u = it && it._offer && it._offer.url;
      if(!u) continue;
      var label = '';
      if(it._brand) label += it._brand + ' — ';
      label += (it._name || u);
      links.push({ url: u, label: label });
    }
    if(!links.length) return;

    // Show a popup first (copy links + enable popups), then let the user open all.
    var modal = ensureLinksModal();
    modal._setLinks(links, title || 'פתיחת לינקים');
    modal.style.display = 'block';
  }

  // ===== App state =====
  var STATE = {
    // Load-more pagination (v10)
    bundlesPage: 1,
    bundlesPer: 0,
    bundlesWrap: null,
    pickerPage: 1,
    pickerPer: 0,
    pickerWrap: null,

    viewLimit: 0,
    pickerShown: 0,
    pickerLimit: 0,
    _pickerSig: '',

    all: [],             // all eligible products (normalized)
    bundles: [],         // bundle objects (includes custom builder)
    pool: [],            // unused products (eligible and not in any bundle)
    custom: { id:'custom', type:'builder', title:'בנו חבילה בעצמכם', subtitle:'בחרו מוצרים ובחרו יעד סכום משלכם. אפשר לבנות לכל סכום — והמערכת תציג אם אתם מעל/מתחת ליעד. (כל המוצרים כאן הם עם משלוח חינם מעל $49)', items: [], targetMin: BUNDLE_MIN, targetMax: BUNDLE_MAX },
    modalMode: 'swap',   // 'swap' | 'builder'
    activeBundleId: null,
    activeItemId: null,
    chips: { us: true, peta: false, lb: false },
    fxRate: USD_TO_ILS_DEFAULT,
    categories: []       // unique categories
  };
  

  // ===== שמירת חבילה מותאמת (LocalStorage) =====
  var LS_CUSTOM_KEY = 'kbwg_custom_bundle_v1';

  function saveCustomToStorage(){
    try{
      var c = STATE.custom || {};
      var ids = (c.items || []).map(function(p){ return p._id; });
      var payload = { ids: ids, targetMin: c.targetMin, targetMax: c.targetMax };
      window.localStorage.setItem(LS_CUSTOM_KEY, JSON.stringify(payload));
    }catch(e){}
  }

  function loadCustomFromStorage(){
    try{
      var raw = window.localStorage.getItem(LS_CUSTOM_KEY);
      if(!raw) return;
      var data = JSON.parse(raw);
      if(!data || !data.ids || !Array.isArray(data.ids)) return;

      // reconstruct items from STATE.all (eligible list)
      var idset = {};
      data.ids.forEach(function(id){ idset[id] = true; });

      var items = [];
      for(var i=0;i<STATE.all.length;i++){
        var p = STATE.all[i];
        if(idset[p._id]) items.push(p);
      }

      // keep unique
      var seen = {};
      var uniq = [];
      for(var j=0;j<items.length;j++){
        if(seen[items[j]._id]) continue;
        seen[items[j]._id] = true;
        uniq.push(items[j]);
      }

      var c = STATE.custom || {};
      c.items = uniq.sort(function(a,b){ return a._priceUSD - b._priceUSD; });
      if(isFinite(Number(data.targetMin))) c.targetMin = Number(data.targetMin);
      if(isFinite(Number(data.targetMax))) c.targetMax = Number(data.targetMax);
      if(data.targetMax === '' || data.targetMax === null) c.targetMax = '';
      STATE.custom = c;
    }catch(e){}
  }

  function clearCustomBundle(){
    var c = STATE.custom || {};
    c.items = [];
    STATE.custom = c;
    try{ window.localStorage.removeItem(LS_CUSTOM_KEY); }catch(e){}
    setModalHintText('');
    renderModal();
    render();
  }


  function bundleTotalUSD(bundle){ return sumUSD(bundle.items || []); }


  function getBuilderRange(){
    var c = STATE.custom || {};
    var mn = parseFloat(c.targetMin);
    var mx = parseFloat(c.targetMax);
    if(!isFinite(mn)) mn = 0;
    if(!isFinite(mx)) mx = Infinity;
    if(mx < mn){ var t = mx; mx = mn; mn = t; }
    return { min: mn, max: mx };
  }

  function ensureTaxNotice(){
    if($('#kbwgTaxNotice')) return;
    var grid = $('#bundleGrid');
    if(!grid || !grid.parentNode) return;
    var note = document.createElement('div');
    note.id = 'kbwgTaxNotice';
    note.style.direction = 'rtl';
    note.style.margin = '10px 0 14px';
    note.style.padding = '10px 12px';
    note.style.borderRadius = '14px';
    note.style.border = '1px solid rgba(0,0,0,.10)';
    note.style.background = 'rgba(0,0,0,.04)';
    note.innerHTML = '⚠️ <strong>שימו לב:</strong> בהזמנות בסך <strong>$' + TAX_THRESHOLD_USD + '+</strong> ייתכנו מיסים/עמלות יבוא בישראל (תלוי מוצר ושילוח).';
    grid.parentNode.insertBefore(note, grid);
  }

  function ensureBuilderBudgetUI(){
    var shopAllBtn = $('#shopAllBtn');
    if(!shopAllBtn) return;

    var host = $('#builderBudgetHost');

    if(STATE.modalMode !== 'builder'){
      if(host && host.parentNode) host.parentNode.removeChild(host);
      return;
    }

    if(!host){
      host = document.createElement('div');
      host.id = 'builderBudgetHost';
      host.style.margin = '10px 0 8px';
      host.style.padding = '10px 12px';
      host.style.border = '1px solid rgba(0,0,0,.10)';
      host.style.borderRadius = '14px';
      host.style.background = 'rgba(0,0,0,.03)';
      host.style.direction = 'rtl';
      shopAllBtn.parentNode.insertBefore(host, shopAllBtn);
    }

    // בונים את ה־UI פעם אחת בלבד כדי לא לאבד פוקוס בעת הקלדה
    if(!host.dataset.ready){
      host.innerHTML =
        '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end">'
        + '  <div style="display:flex;flex-direction:column;gap:4px">'
        + '    <label for="builderMinTotal" style="font-size:12px;color:#444">מינימום יעד ($)</label>'
        + '    <input id="builderMinTotal" type="number" step="0.01" inputmode="decimal" style="width:140px;padding:8px 10px;border:1px solid #ddd;border-radius:10px" />'
        + '  </div>'
        + '  <div style="display:flex;flex-direction:column;gap:4px">'
        + '    <label for="builderMaxTotal" style="font-size:12px;color:#444">מקסימום יעד ($)</label>'
        + '    <input id="builderMaxTotal" type="number" step="0.01" inputmode="decimal" style="width:140px;padding:8px 10px;border:1px solid #ddd;border-radius:10px" />'
        + '  </div>'
        + '  <button id="builderResetRange" type="button" style="padding:9px 12px;border:1px solid #ddd;border-radius:12px;background:#fff;cursor:pointer">איפוס ל־$52–$60</button>'
        + '</div>'
        + '<div style="margin-top:8px;font-size:12px;color:#555;line-height:1.45">'
        + 'טיפ: החבילות האוטומטיות באתר בנויות לטווח $52–$60, אבל כאן אפשר לבנות לכל סכום שתבחרו.'
        + '</div>'
        + '<div id="builderRemainingNote" style="margin-top:6px;font-size:12px;color:#444;line-height:1.45"></div>'
        + '<div id="builderTaxNote" style="margin-top:8px;font-size:12px;line-height:1.45;color:#7a3b00;background:#fff5e6;border:1px solid #ffd9ad;border-radius:12px;padding:8px 10px;display:none"></div>';

      var minInput = $('#builderMinTotal', host);
      var maxInput = $('#builderMaxTotal', host);
      var resetBtn = $('#builderResetRange', host);

      function applyRangeFromInputs(){
        var c = STATE.custom || {};
        var mn = minInput ? parseFloat(minInput.value) : NaN;
        var mx = maxInput ? parseFloat(maxInput.value) : NaN;
        c.targetMin = isFinite(mn) ? mn : '';
        c.targetMax = isFinite(mx) ? mx : '';
        STATE.custom = c;
        saveCustomToStorage();

        // נעדכן סיכום + רשימת מוצרים, בלי לבנות מחדש את ה־UI
        var b = activeBundle();
        if(b) updateModalSummary(b);
        STATE.pickerPage = 1;
    renderPicker();
      }

      if(minInput) minInput.addEventListener('input', applyRangeFromInputs);
      if(maxInput) maxInput.addEventListener('input', applyRangeFromInputs);

      if(resetBtn){
        resetBtn.addEventListener('click', function(){
          var c = STATE.custom || {};
          c.targetMin = BUNDLE_MIN;
          c.targetMax = BUNDLE_MAX;
          STATE.custom = c;
          saveCustomToStorage();
          if(minInput) minInput.value = String(BUNDLE_MIN);
          if(maxInput) maxInput.value = String(BUNDLE_MAX);
          var b = activeBundle();
          if(b) updateModalSummary(b);
          renderPicker();
        });
      }

      host.dataset.ready = '1';
    }

    // סנכרון ערכים מה־STATE (בלי לדרוס בזמן הקלדה)
    var c2 = STATE.custom || {};
    var minInput2 = $('#builderMinTotal', host);
    var maxInput2 = $('#builderMaxTotal', host);

    if(minInput2 && document.activeElement !== minInput2){
      minInput2.value = isFinite(parseFloat(c2.targetMin)) ? String(Number(c2.targetMin)) : '';
    }
    if(maxInput2 && document.activeElement !== maxInput2){
      maxInput2.value = isFinite(parseFloat(c2.targetMax)) ? String(Number(c2.targetMax)) : '';
    }
  }
  // ===== Brand tier computation (1..5) =====
  function computeBrandTiers(all){
    var sum = {};
    var cnt = {};
    for(var i=0;i<all.length;i++){
      var b = (all[i]._brand || '').trim();
      if(!b) b = '(ללא מותג)';
      if(!sum[b]){ sum[b]=0; cnt[b]=0; }
      sum[b] += all[i]._priceUSD;
      cnt[b] += 1;
    }
    var avgs = Object.keys(sum).map(function(b){
      return { brand:b, avg: sum[b]/cnt[b] };
    }).sort(function(a,b){ return a.avg - b.avg; });

    function pct(p){
      if(!avgs.length) return 0;
      var idx = Math.floor((avgs.length-1) * p);
      return avgs[idx].avg;
    }
    var q20 = pct(0.20), q40 = pct(0.40), q60 = pct(0.60), q80 = pct(0.80);

    var tierByBrand = {};
    for(var j=0;j<avgs.length;j++){
      var a = avgs[j].avg;
      var t = 5;
      if(a <= q20) t = 1;
      else if(a <= q40) t = 2;
      else if(a <= q60) t = 3;
      else if(a <= q80) t = 4;
      else t = 5;
      tierByBrand[avgs[j].brand] = String(t);
    }

    for(var k=0;k<all.length;k++){
      var bb = (all[k]._brand || '').trim();
      if(!bb) bb = '(ללא מותג)';
      all[k]._brandTier = tierByBrand[bb] || '';
    }
  }

  // ===== Bundles builder =====
  
function buildBundlesFromPool(allEligible){
  // Build ONLY the 4 requested bundles (plus the custom builder handled elsewhere).
  // Strict: allEligible already filtered to offers with freeShipOver === 49.

  var pool = allEligible.slice().sort(function(a,b){ return (a._priceUSD||0) - (b._priceUSD||0); });

  function pid(p){ return p && (p._id || p.id || (p._raw && p._raw.id) || (p._brand+'::'+p._name)); }
  function isCamp(p){ return !!(p && p._offer && isCampaignUrl(p._offer.url)); }

  function removeUsed(items){
    var used = {};
    items.forEach(function(it){ used[pid(it)] = true; });
    pool = pool.filter(function(p){ return !used[pid(p)]; });
  }

  function toBundle(id, title, subtitle, items){
    return { id: id, title: title, subtitle: subtitle, items: items.slice() };
  }

  function bestCandidates(list, k, preferCampaign){
    var arr = (list || []).slice();
    if(preferCampaign){
      var camp = arr.filter(isCamp);
      if(camp.length) arr = camp;
    }
    arr.sort(function(a,b){
      var ap = a._priceUSD || 0;
      var bp = b._priceUSD || 0;
      if(ap !== bp) return ap - bp;
      // tie-break: campaign
      var ac = isCamp(a)?1:0, bc=isCamp(b)?1:0;
      if(ac !== bc) return bc - ac;
      return String(a._name||'').localeCompare(String(b._name||''), 'en', {sensitivity:'base'});
    });
    return arr.slice(0, k || 12);
  }

  function fillToRange(baseItems, themePred){
    var items = baseItems.slice();
    var used = {};
    items.forEach(function(it){ used[pid(it)] = true; });

    function total(){ return sumUSD(items); }

    // Prefer campaign fillers first, then cheapest, within the theme.
    var fillers = pool.filter(function(p){ return !used[pid(p)] && themePred(p); });

    // two-pass: campaign then any
    var passLists = [fillers.filter(isCamp), fillers];
    for(var pass=0; pass<passLists.length; pass++){
      passLists[pass].sort(function(a,b){ return (a._priceUSD||0) - (b._priceUSD||0); });
    }

    var tries = 0;
    while(total() < BUNDLE_MIN && tries < 200){
      tries++;
      var added = null;
      // choose the cheapest candidate that keeps us <= BUNDLE_MAX
      for(var pass2=0; pass2<passLists.length && !added; pass2++){
        var arr = passLists[pass2];
        for(var i=0;i<arr.length;i++){
          var p = arr[i];
          if(used[pid(p)]) continue;
          var next = total() + (p._priceUSD||0);
          if(next <= BUNDLE_MAX + 1e-9){
            added = p;
            break;
          }
        }
      }
      if(!added) break;
      items.push(added);
      used[pid(added)] = true;
    }

    var t = total();
    if(t >= BUNDLE_MIN - 1e-9 && t <= BUNDLE_MAX + 1e-9) return items;
    return null;
  }

  function solveSlots(slotPreds, themePred, preferCampaign){
    // Build combinations of required slots from the cheapest candidates.
    var candLists = slotPreds.map(function(fn){
      return bestCandidates(pool.filter(themePred).filter(fn), 10, preferCampaign);
    });
    if(candLists.some(function(l){ return !l.length; })) return null;

    // brute force with pruning
    var best = null;
    function consider(items){
      // distinct
      var ids = {};
      for(var i=0;i<items.length;i++){
        var id = pid(items[i]);
        if(ids[id]) return;
        ids[id] = true;
      }
      var baseSum = sumUSD(items);
      if(baseSum > BUNDLE_MAX + 1e-9) return;

      // Fill up to range using themed fillers first
      var filled = fillToRange(items, themePred);
      if(!filled) return;

      var total = sumUSD(filled);
      if(total < BUNDLE_MIN - 1e-9 || total > BUNDLE_MAX + 1e-9) return;

      var campCount = filled.reduce(function(acc,p){ return acc + (isCamp(p)?1:0); }, 0);
      var score = {
        total: total,
        camp: campCount,
        items: filled.length
      };

      if(!best) { best = {score: score, items: filled}; return; }
      // Prefer: (1) lower total (cheapest) (2) more campaign (3) fewer items
      if(score.total < best.score.total - 1e-9) { best = {score: score, items: filled}; return; }
      if(Math.abs(score.total - best.score.total) < 1e-9){
        if(score.camp > best.score.camp) { best = {score: score, items: filled}; return; }
        if(score.camp === best.score.camp && score.items < best.score.items) { best = {score: score, items: filled}; return; }
      }
    }

    // iterate combos
    var A = candLists[0], B = candLists[1], C = candLists[2], D = candLists[3];
    if(candLists.length === 3){
      for(var i=0;i<A.length;i++){
        var ai = A[i]; var s1 = ai._priceUSD||0;
        if(s1 > BUNDLE_MAX) break;
        for(var j=0;j<B.length;j++){
          var bj = B[j]; var s2 = s1 + (bj._priceUSD||0);
          if(s2 > BUNDLE_MAX) break;
          for(var k=0;k<C.length;k++){
            var ck = C[k];
            consider([ai,bj,ck]);
          }
        }
      }
    }else if(candLists.length === 4){
      for(var i2=0;i2<A.length;i2++){
        var ai2 = A[i2]; var t1 = ai2._priceUSD||0;
        if(t1 > BUNDLE_MAX) break;
        for(var j2=0;j2<B.length;j2++){
          var bj2 = B[j2]; var t2 = t1 + (bj2._priceUSD||0);
          if(t2 > BUNDLE_MAX) break;
          for(var k2=0;k2<C.length;k2++){
            var ck2 = C[k2]; var t3 = t2 + (ck2._priceUSD||0);
            if(t3 > BUNDLE_MAX) break;
            for(var l2=0;l2<D.length;l2++){
              consider([ai2,bj2,ck2,D[l2]]);
            }
          }
        }
      }
    }

    return best ? best.items : null;
  }

  // Theme predicates
  function isBabyBundle(p){ return isKids(p) || hasCat(p,'baby') || /baby|kids/i.test(p._name||'') || /ילדים|תינוק|לתינוק|בייבי|לילדים/.test(p._name||''); }
  function isMenBundle(p){ return isMen(p) || hasCat(p,'mens-care') || /men|mens/i.test(p._name||'') || /גברים|לגבר|לגברים/.test(p._name||''); }
  function isHairBundle(p){ return isHair(p) || isShampoo(p) || isConditioner(p) || isHairMask(p); }
  function isMakeupBundle(p){ return isMakeup(p) || hasCat(p,'makeup'); }

  // Slot predicates
  function slotShampoo(p){ return isShampoo(p) || /שמפו/.test(p._name||''); }
  function slotConditioner(p){ return isConditioner(p) || /מרכך/.test(p._name||''); }
  function slotHairMask(p){ return isHairMask(p) || (/מסכה|mask|masque/i.test(p._name||'') && isHairBundle(p)); }

  function slotLipstick(p){ return hasAnyCat(p,['lipstick','lips','gloss']) || /lipstick|gloss|lip\b/i.test(p._name||'') || /שפתון|ליפסטיק|גלוס/.test(p._name||''); }
  function slotMascara(p){ return hasAnyCat(p,['mascara','eyes']) || /mascara|lash|eyeliner/i.test(p._name||'') || /מסקרה|ריסים|אייליינר/.test(p._name||''); }
  function slotPrimerShimmerBlush(p){
    return hasAnyCat(p,['primer','blush','shimmer','highlighter','bronzer']) ||
           /primer|blush|shimmer|highlighter|bronzer/i.test(p._name||'') ||
           /פריימר|סומק|שימר|היילייטר|ברונזר/.test(p._name||'');
  }
  function slotBaseMakeup(p){
    return hasAnyCat(p,['foundation','concealer','powder','eyeshadow','palette']) ||
           /foundation|concealer|powder|eyeshadow|palette/i.test(p._name||'') ||
           /מייקאפ|פאודר|קונסילר|צלליות|פלטה/.test(p._name||'') ||
           isMakeup(p);
  }

  function slotAnyBaby(p){ return isBabyBundle(p); }
  function slotAnyMen(p){ return isMenBundle(p); }

  var bundles = [];

  // 1) Hair bundle: Shampoo + Conditioner + Hair mask
  var hairItems = solveSlots([slotShampoo, slotConditioner, slotHairMask], isHairBundle, true) ||
                  solveSlots([slotShampoo, slotConditioner, slotHairMask], isHairBundle, false);
  if(hairItems){
    bundles.push(toBundle('bundle-hair', 'חבילת שיער', 'שמפו + מרכך + מסכת שיער (משלוח חינם מעל $49)', hairItems));
    removeUsed(hairItems);
  }

  // 2) Baby bundle: 3 baby/kids items
  var babyItems = solveSlots([slotAnyBaby, slotAnyBaby, slotAnyBaby], isBabyBundle, true) ||
                  solveSlots([slotAnyBaby, slotAnyBaby, slotAnyBaby], isBabyBundle, false);
  if(babyItems){
    bundles.push(toBundle('bundle-baby', 'חבילת תינוקות/ילדים', '3 מוצרים לתינוקות/ילדים (משלוח חינם מעל $49)', babyItems));
    removeUsed(babyItems);
  }

  // 3) Men bundle: 3 men items
  var menItems = solveSlots([slotAnyMen, slotAnyMen, slotAnyMen], isMenBundle, true) ||
                 solveSlots([slotAnyMen, slotAnyMen, slotAnyMen], isMenBundle, false);
  if(menItems){
    bundles.push(toBundle('bundle-men', 'חבילת גברים', '3 מוצרים לגבר (משלוח חינם מעל $49)', menItems));
    removeUsed(menItems);
  }

  // 4) Makeup bundle: base + primer/shimmer/blush + lipstick + mascara (and fill to price range)
  var makeupItems = solveSlots([slotBaseMakeup, slotPrimerShimmerBlush, slotLipstick, slotMascara], isMakeupBundle, true) ||
                    solveSlots([slotBaseMakeup, slotPrimerShimmerBlush, slotLipstick, slotMascara], isMakeupBundle, false);
  if(makeupItems){
    bundles.push(toBundle('bundle-makeup', 'חבילת איפור', 'מוצרי איפור (משלוח חינם מעל $49)', makeupItems));
    removeUsed(makeupItems);
  }

  // Return only these bundles; leave remaining products for the custom builder pool.
  return { bundles: bundles, unused: pool.slice() };
}

  // ===== Rendering =====
  function render(){
    var grid = $('#bundleGrid');
    if(!grid) return;

    grid.innerHTML = '';

    if(!STATE.bundles.length){
      grid.innerHTML = '<p class="muted">לא נמצאו מוצרים עם משלוח חינם מעל $49 לבניית באנדלים.</p>';
      return;
    }

    // Load-more for speed (v10): render only a slice
    STATE.bundlesPer = kbPerPage('bundles');
    var total = STATE.bundles.length;
    var shown = Math.min(total, STATE.bundlesPer * STATE.bundlesPage);
    if(shown < 1) shown = Math.min(total, STATE.bundlesPer);

    var frag = document.createDocumentFragment();
    for(var i=0;i<shown;i++){
      frag.appendChild(renderBundleCard(STATE.bundles[i]));
    }
    grid.appendChild(frag);

    // Load more button (only if needed)
    if(!STATE.bundlesWrap) STATE.bundlesWrap = kbEnsureLoadMore(grid, 'bundlesLoadMore', 'טעני עוד באנדלים');
    kbSetLoadMoreVisible(STATE.bundlesWrap, shown < total);
    if(STATE.bundlesWrap){
      var btn = STATE.bundlesWrap.querySelector('[data-kbmore]');
      if(btn && !btn.__kbBound){
        btn.__kbBound = true;
        btn.addEventListener('click', function(){
          STATE.bundlesPage += 1;
          render();
        });
      }
    }

    try{ window.dispatchEvent(new Event('kbwg:content-rendered')); }catch(e){}
  }

  function renderBundleCard(bundle){
    // Custom builder card
    if(bundle && bundle.id === 'custom'){
      var c = document.createElement('article');
      c.className = 'bundleCard card';

      var top = document.createElement('div');
      top.className = 'bundleTop';

      var left = document.createElement('div');

      var h = document.createElement('h3');
      h.className = 'bundleTitle';
      h.textContent = bundle.title || '';

      var sub = document.createElement('p');
      sub.className = 'bundleSubtitle';
      sub.textContent = bundle.subtitle || '';

      left.appendChild(h);
      left.appendChild(sub);

      var meta = document.createElement('div');
      meta.className = 'bundleMeta';

      var total = sumUSD(bundle.items || []);
      var tag1 = document.createElement('div');
      tag1.className = 'tag bundleTotal';
      tag1.textContent = 'סה״כ: ' + fmtUSD(total);

      var r = getBuilderRange();
      var tag2 = document.createElement('div');
      tag2.className = 'tag';
      if(isFinite(r.max)){
        tag2.textContent = 'יעד: $' + Number(r.min).toFixed(2) + '–$' + Number(r.max).toFixed(2);
      }else{
        tag2.textContent = 'יעד: מ־$' + Number(r.min).toFixed(2) + ' ומעלה';
      }

      meta.appendChild(tag1);
      meta.appendChild(tag2);

      if(total >= TAX_THRESHOLD_USD - 1e-9){
        var tag3 = document.createElement('div');
        tag3.className = 'tag';
        tag3.textContent = '⚠️ $' + TAX_THRESHOLD_USD + '+: ייתכנו מיסים/עמלות';
        meta.appendChild(tag3);
      }

      top.appendChild(left);
      top.appendChild(meta);

      var list = document.createElement('div');
      list.className = 'bundleProducts';

      if(!bundle.items || !bundle.items.length){
        var empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'עדיין לא בחרת מוצרים. לחצי על הכפתור למטה כדי להתחיל לבנות חבילה.';
        list.appendChild(empty);
      }else{
        bundle.items.forEach(function(p){
          list.appendChild(renderBundleProductRow(bundle, p));
        });
      }

      var cta = document.createElement('div');
      cta.className = 'bundleCTA';
      cta.style.gap = '10px';
      cta.style.flexWrap = 'wrap';

      var btnBuild = document.createElement('button');
      btnBuild.type = 'button';
      btnBuild.className = 'bundleBtn';
      btnBuild.textContent = 'פתיחת בנאי חבילה';
      btnBuild.addEventListener('click', function(){ openBundleModal('custom'); });

      var btnAll = document.createElement('button');
      btnAll.type = 'button';
      btnAll.className = 'bundleBtn';
      btnAll.textContent = 'לפתיחת כל הלינקים';
      btnAll.disabled = !(bundle.items && bundle.items.length);
      btnAll.style.opacity = btnAll.disabled ? '0.55' : '';
      btnAll.addEventListener('click', function(){
        if(btnAll.disabled) return;
        openAllLinks(bundle.items || [], bundle.title || 'פתיחת לינקים');
      });

      cta.appendChild(btnAll);

      var btnClear = document.createElement('button');
      btnClear.type = 'button';
      btnClear.className = 'bundleBtn';
      btnClear.textContent = 'נקה חבילה';
      btnClear.disabled = !(bundle.items && bundle.items.length);
      btnClear.style.opacity = btnClear.disabled ? '0.55' : '';
      btnClear.addEventListener('click', function(){
        if(btnClear.disabled) return;
        if(!confirm('לנקות את החבילה שבנית?')) return;
        clearCustomBundle();
      });

      cta.appendChild(btnClear);
      cta.appendChild(btnBuild);

      var footer = document.createElement('div');
      footer.className = 'bundleBottom';
      footer.appendChild(cta);

      c.appendChild(top);
      c.appendChild(list);
      c.appendChild(footer);

      return c;
    }

    // Normal bundle card
    var card = document.createElement('article');
    card.className = 'bundleCard card';

    var topN = document.createElement('div');
    topN.className = 'bundleTop';

    var leftN = document.createElement('div');

    var hN = document.createElement('h3');
    hN.className = 'bundleTitle';
    hN.textContent = bundle.title || '';

    var subN = document.createElement('p');
    subN.className = 'bundleSubtitle';
    subN.textContent = bundle.subtitle || '';

    leftN.appendChild(hN);
    leftN.appendChild(subN);

    var metaN = document.createElement('div');
    metaN.className = 'bundleMeta';

    var totalN = sumUSD(bundle.items || []);

    var tag1N = document.createElement('div');
    tag1N.className = 'tag bundleTotal';
    tag1N.textContent = 'סה״כ: ' + fmtUSD(totalN);

    var tag2N = document.createElement('div');
    tag2N.className = 'tag';
    tag2N.textContent = 'משלוח חינם מעל $' + FREE_SHIP_OVER_USD;

    metaN.appendChild(tag1N);
    metaN.appendChild(tag2N);

    topN.appendChild(leftN);
    topN.appendChild(metaN);

    var listN = document.createElement('div');
    listN.className = 'bundleProducts';

    if(!bundle.items || !bundle.items.length){
      var emptyN = document.createElement('p');
      emptyN.className = 'muted';
      emptyN.textContent = 'לא נמצאו מוצרים מתאימים לבאנדל הזה כרגע.';
      listN.appendChild(emptyN);
    }else{
      bundle.items.forEach(function(p){
        listN.appendChild(renderBundleProductRow(bundle, p));
      });
    }

    var ctaN = document.createElement('div');
    ctaN.className = 'bundleCTA';
    ctaN.style.gap = '10px';
    ctaN.style.flexWrap = 'wrap';

    var btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'bundleBtn';
    btnEdit.textContent = 'החלפה ובחירה';
    btnEdit.style.background = 'rgba(0,0,0,.08)';
    btnEdit.style.color = '#111';
    btnEdit.style.border = '1px solid rgba(0,0,0,.12)';
    btnEdit.addEventListener('click', function(){ openBundleModal(bundle.id); });

    var btnAllN = document.createElement('button');
    btnAllN.type = 'button';
    btnAllN.className = 'bundleBtn';
    btnAllN.textContent = 'לפתיחת כל הלינקים';
    btnAllN.addEventListener('click', function(){ openAllLinks(bundle.items || [], bundle.title || 'פתיחת לינקים'); });

    ctaN.appendChild(btnAllN);
    ctaN.appendChild(btnEdit);

    var footerN = document.createElement('div');
    footerN.className = 'bundleBottom';
    footerN.appendChild(ctaN);

    card.appendChild(topN);
    card.appendChild(listN);
    card.appendChild(footerN);

    return card;
  }

  function renderBundleProductRow(bundle, p){
    var row = document.createElement('div');
    row.className = 'bundleProduct';

    var img = document.createElement('img');
    img.className = 'bundleProductImg';
    img.loading = 'lazy';
    img.alt = (p._brand ? (p._brand + ' ') : '') + (p._name || '');
    if(p._image) img.src = p._image;
    img.onerror = function(){ this.onerror = null; this.src = 'assets/img/products/placeholder.jpg'; };

    var body = document.createElement('div');

    var title = document.createElement('div');
    title.className = 'bundleProductTitle';
    title.innerHTML = (p._brand ? ('<span dir="ltr">'+escapeHtml(p._brand)+'</span> · ') : '') + escapeHtml(p._name || '');

    var details = document.createElement('div');
    details.className = 'bundleProductDetails';
    details.innerHTML = 'מחיר: <strong>'+escapeHtml(fmtUSD(p._priceUSD))+'</strong>'
      + (p._isLB ? ' · Leaping Bunny' : '')
      + (p._isPeta ? ' · PETA' : '');

    body.appendChild(title);
    body.appendChild(details);

    var btnAmazon = document.createElement('button');
    btnAmazon.type = 'button';
    btnAmazon.className = 'openProductBtn';
    btnAmazon.textContent = 'פתיחה';
    btnAmazon.style.marginInlineStart = 'auto';
    btnAmazon.style.border = '1px solid #ddd';
    btnAmazon.style.background = '#fff';
    btnAmazon.style.borderRadius = '12px';
    btnAmazon.style.padding = '10px 12px';
    btnAmazon.style.cursor = 'pointer';
    btnAmazon.style.whiteSpace = 'nowrap';
    btnAmazon.addEventListener('click', function(){
      var url = p._offer && p._offer.url;
      if(url) window.open(ensureAmazonComTag(url), '_blank', 'noopener');
    });

    row.appendChild(img);
    row.appendChild(body);
    row.appendChild(btnAmazon);

    return row;
  }

  // ===== Modal =====
  function setModalOpen(isOpen){
    var overlay = $('#bundleOverlay');
    var modal = $('#bundleModal');
    if(!overlay || !modal) return;

    overlay.classList.toggle('isOpen', !!isOpen);
    modal.classList.toggle('isOpen', !!isOpen);

    overlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    modal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

    document.body.style.overflow = isOpen ? 'hidden' : '';
  }

  function getBundleById(id){
    for(var i=0;i<STATE.bundles.length;i++){
      if(STATE.bundles[i].id === id) return STATE.bundles[i];
    }
    return null;
  }

  function bundleTitleById(id){
    if(id === 'custom') return 'בנה בעצמך';
    var b = getBundleById(id);
    return (b && b.title) ? b.title : 'באנדל';
  }


  function openBundleModal(bundleId){
    STATE.activeBundleId = bundleId;
    STATE.activeItemId = null;

    STATE.modalMode = (bundleId === 'custom') ? 'builder' : 'swap';

    // בבנאי חבילה: ברירת־מחדל "הצגת כל המוצרים הזמינים" כדי שלא ייראה כאילו הכל חסום/אפור
    if(STATE.modalMode === 'builder' && (typeof STATE.pickerSeeAll !== 'boolean')){
      STATE.pickerSeeAll = true;
    }

    // בבאנדלים רגילים: בוחרים ברירת־מחדל פריט פעיל כדי שהחלפה תעבוד גם בלי לחיצה על "החליפי"
    if(STATE.modalMode === 'swap'){
      var b = getBundleById(bundleId);
      if(b && b.items && b.items.length){
        STATE.activeItemId = b.items[0]._id;
      }
    }

    // reset picker UI
    var q = $('#pickQ'); if(q) q.value = '';
    var tier = $('#pickTier'); if(tier) tier.value = '';
    var mn = $('#pickMin'); if(mn) mn.value = '';
    var mx = $('#pickMax'); if(mx) mx.value = '';
    var cat = $('#pickCat'); if(cat) cat.value = '';
    var seeAll = $('#pickSeeAll'); if(seeAll) seeAll.checked = true;
    STATE.pickerSeeAll = true;

    syncChipButtons();
    renderModal();
    setModalOpen(true);
  }

  function closeBundleModal(){
    setModalOpen(false);
    STATE.activeBundleId = null;
    STATE.activeItemId = null;
    STATE.modalMode = 'swap';
  }

  function activeBundle(){ return getBundleById(STATE.activeBundleId); }

  function syncChipButtons(){
    $all('.pickerChip').forEach(function(btn){
      var key = btn.getAttribute('data-chip');
      if(!key) return;
      btn.classList.toggle('active', !!STATE.chips[key]);
    });
  }

  function setModalHintText(text){
    // מציג הודעות/התראות בראש המודאל (מעל שני הטורים), ולא בצד
    var body = $('#bundleModal .modalBody');
    var top = $('#bundleModalHintTop');
    if(body && !top){
      top = document.createElement('div');
      top.id = 'bundleModalHintTop';
      top.className = 'noteTiny';
      // Full-width in both grid and flex layouts
      top.style.width = '100%';
      top.style.boxSizing = 'border-box';
      top.style.gridColumn = '1 / -1';
      top.style.justifySelf = 'stretch';
      top.style.flex = '0 0 100%';
      top.style.maxWidth = '100%';
      top.style.margin = '0 0 10px';
      top.style.padding = '10px 12px';
      top.style.borderRadius = '12px';
      top.style.background = 'rgba(255, 235, 235, 0.9)';
      top.style.border = '1px solid rgba(180, 0, 32, 0.25)';
      top.style.color = '#7a0016';
      top.style.fontWeight = '600';
      top.style.lineHeight = '1.45';
      top.style.whiteSpace = 'pre-line';
      top.style.overflowWrap = 'anywhere';
      top.style.wordBreak = 'break-word';
      // insert as first child so it stays on top
      body.insertBefore(top, body.firstChild);
    }

    // hide the side note to avoid "stretched" look
    var side = $('#bundleModal .summaryBox .noteTiny');
    if(side) side.style.display = 'none';

    if(!top){
      // fallback
      var el = side;
      if(!el) return;
      el.textContent = text || '';
      el.style.display = text ? 'block' : 'none';
      return;
    }

    top.textContent = text || '';
    top.style.display = text ? 'block' : 'none';
  }

  function updateModalSummary(bundle){
    var subtotal = bundleTotalUSD(bundle);
    var subEl = $('#bundleSubtotal');
    var toFreeEl = $('#bundleToFree');

    if(subEl) subEl.textContent = fmtUSD(subtotal);
    if(toFreeEl){
      var diff = Math.max(0, FREE_SHIP_OVER_USD - subtotal);
      toFreeEl.textContent = fmtUSD(diff);
    }

    // shopAllBtn -> open all links (enabled only if in range for custom builder)
    var shopAllBtn = $('#shopAllBtn');
    if(shopAllBtn){
      shopAllBtn.textContent = 'לפתיחת כל הלינקים';
      shopAllBtn.href = '#';
      shopAllBtn.onclick = function(e){
        e.preventDefault();
        openAllLinks(bundle.items || [], bundle.title || 'פתיחת לינקים');
      };
      shopAllBtn.style.opacity = '';
      shopAllBtn.style.pointerEvents = '';
    }

    // יעד סכום (בנאי) + אזהרת מסים
    if(STATE.modalMode === 'builder'){
      ensureBuilderBudgetUI();
      var r = getBuilderRange();
      var taxEl = $('#builderTaxNote');
      // תקציב שנשאר עד המקסימום (אם הוגדר)
      var remEl = $('#builderRemainingNote');
      if(remEl){
        var subtotalNow = subtotal;
        var remainNow = isFinite(r.max) ? Math.max(0, r.max - subtotalNow) : Infinity;
        remEl.textContent = isFinite(r.max) ? ('תקציב שנותר עד המקסימום: ' + fmtUSD(remainNow)) : 'אין מגבלת מקסימום – אפשר להוסיף חופשי.';
      }

      if(taxEl){
        if(subtotal >= TAX_THRESHOLD_USD - 1e-9){
          taxEl.style.display = '';
          taxEl.innerHTML = '⚠️ <strong>אזהרה:</strong> בסך ' + fmtUSD(subtotal) + ' ייתכנו מיסים/עמלות יבוא בישראל (מעל $' + TAX_THRESHOLD_USD + ').';
        }else{
          taxEl.style.display = 'none';
          taxEl.innerHTML = '';
        }
      }

      if(STATE.builderNoCandidatesMessage){
        setModalHintText(STATE.builderNoCandidatesMessage);
      }else if(subtotal < r.min - 1e-9){
        setModalHintText('חסר עוד בערך ' + fmtUSD(r.min - subtotal) + ' כדי להגיע למינימום היעד שבחרתם (' + fmtUSD(r.min) + ').');
      }else if(isFinite(r.max) && subtotal > r.max + 1e-9){
        setModalHintText('חרגתם מהמקסימום שבחרתם (' + fmtUSD(r.max) + '). הסירו פריט או בחרו מוצר זול יותר.');
      }else{
        if(isFinite(r.max)){
          setModalHintText('מצוין! הסכום בתוך טווח היעד שבחרתם (' + fmtUSD(r.min) + '–' + fmtUSD(r.max) + ').');
        }else{
          setModalHintText('מצוין! עברתם את מינימום היעד שבחרתם (' + fmtUSD(r.min) + ').');
        }
      }
    }else{
      ensureBuilderBudgetUI();
      setModalHintText('כדי להוסיף מוצר לבאנדל: לחצו על “הוספת מוצר לבאנדל” (או בטלו בחירה להחלפה) ואז בחרו מוצר מהרשימה משמאל כדי להוסיף אותו.\nכדי להחליף מוצר: לחצו על “החליפי” ליד הפריט שתרצו לשנות, ואז בחרו מוצר חדש מהרשימה משמאל.');
    }
  }

  function renderModal(){
    var bundle = activeBundle();
    if(!bundle) return;

    var title = $('#bundleModalTitle');
    if(title) title.textContent = bundle.title || 'באנדל';

    var itemsEl = $('#bundleItems');
    var pickerEl = $('#pickerGrid');
    if(itemsEl) itemsEl.innerHTML = '';
    if(pickerEl) pickerEl.innerHTML = '';

    // Right side (current bundle items)
    if(itemsEl){
      if(STATE.modalMode === 'swap'){
        var act = document.createElement('div');
        act.className = 'swapActionRow';
        act.style.display = 'flex';
        act.style.flexWrap = 'wrap';
        act.style.gap = '8px';
        act.style.margin = '0 0 10px';

        var btnAddMode = document.createElement('button');
        btnAddMode.type = 'button';
        btnAddMode.className = 'miniBtn';
        btnAddMode.textContent = 'הוספת מוצר לבאנדל';
        btnAddMode.addEventListener('click', function(){
          STATE.activeItemId = null;
          setModalHintText('מצב הוספה: בחרו מוצר מהרשימה משמאל כדי להוסיף אותו לבאנדל. כדי להחליף — לחצו על “החליפי” ליד פריט ואז בחרו מוצר.');
          renderModal();
          try{ var q=$('#pickQ'); if(q) q.focus(); }catch(e){}
        });

        var btnClearSel = document.createElement('button');
        btnClearSel.type = 'button';
        btnClearSel.className = 'miniBtn secondary';
        btnClearSel.textContent = 'ביטול בחירה להחלפה';
        btnClearSel.addEventListener('click', function(){
          STATE.activeItemId = null;
          renderModal();
          try{ var q=$('#pickQ'); if(q) q.focus(); }catch(e){}
        });

        act.appendChild(btnAddMode);
        act.appendChild(btnClearSel);
        itemsEl.appendChild(act);
      }
      (bundle.items || []).forEach(function(p){
        itemsEl.appendChild(renderModalBundleItem(bundle, p));
      });

      if(STATE.modalMode === 'builder' && (!bundle.items || !bundle.items.length)){
        var empty = document.createElement('p');
        empty.className = 'muted';
        empty.style.margin = '8px 0 0';
        empty.textContent = 'הוסיפו מוצרים מהרשימה משמאל כדי לבנות חבילה.';
        itemsEl.appendChild(empty);
      }
    }

    updateModalSummary(bundle);

    // Left side picker
    renderPicker();

    wireFxConverter();
  }

  function renderModalBundleItem(bundle, p){
    var wrap = document.createElement('div');
    wrap.className = 'bundleItem' + (STATE.activeItemId === p._id ? ' isActive' : '');
    wrap.setAttribute('data-id', p._id);

    var img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = (p._brand ? (p._brand + ' ') : '') + (p._name || '');
    if(p._image) img.src = p._image;
    img.onerror = function(){ this.onerror = null; this.src = 'assets/img/products/placeholder.jpg'; };

    var body = document.createElement('div');

    var name = document.createElement('p');
    name.className = 'bundleItemName';
    name.innerHTML = (p._brand ? ('<span dir="ltr">'+escapeHtml(p._brand)+'</span> · ') : '') + escapeHtml(p._name || '');

    var meta = document.createElement('div');
    meta.className = 'bundleItemMeta';

    var priceTag = document.createElement('span');
    priceTag.className = 'miniTag';
    priceTag.innerHTML = 'מחיר: <strong>'+escapeHtml(fmtUSD(p._priceUSD))+'</strong>';
    meta.appendChild(priceTag);

    if(p._isLB){
      var lb = document.createElement('span');
      lb.className = 'miniTag';
      lb.textContent = 'Leaping Bunny';
      meta.appendChild(lb);
    }
    if(p._isPeta){
      var pe = document.createElement('span');
      pe.className = 'miniTag';
      pe.textContent = 'PETA';
      meta.appendChild(pe);
    }

    var btnOpen = document.createElement('button');
    btnOpen.type = 'button';
    btnOpen.className = 'miniBtn';
    btnOpen.textContent = 'פתיחה';
    btnOpen.addEventListener('click', function(){
      var url = p._offer && p._offer.url;
      if(url) window.open(ensureAmazonComTag(url), '_blank', 'noopener');
    });

    meta.appendChild(btnOpen);

    if(STATE.modalMode === 'builder'){
      var btnRemove = document.createElement('button');
      btnRemove.type = 'button';
      btnRemove.className = 'miniBtn secondary';
      btnRemove.textContent = 'הסירי';
      btnRemove.addEventListener('click', function(){
        removeFromCustom(p._id);
      });
      meta.appendChild(btnRemove);
    }else{
      var btnReplace = document.createElement('button');
      btnReplace.type = 'button';
      btnReplace.className = 'miniBtn secondary';
      btnReplace.textContent = 'החליפי';
      btnReplace.addEventListener('click', function(){
        STATE.activeItemId = p._id;
        renderModal();
        try{ var q=$('#pickQ'); if(q) q.focus(); }catch(e){}
      });
      meta.appendChild(btnReplace);

      var btnRemove = document.createElement('button');
      btnRemove.type = 'button';
      btnRemove.className = 'miniBtn secondary';
      btnRemove.textContent = 'הסירי';
      btnRemove.addEventListener('click', function(){
        removeFromBundle(bundle.id, p._id);
      });
      meta.appendChild(btnRemove);
    }

    body.appendChild(name);
    body.appendChild(meta);

    wrap.appendChild(img);
    wrap.appendChild(body);
    return wrap;
  }

  // ===== Picker filters UI injection =====
  function ensurePickerFiltersUI(){
    // הסרת פילטר "רמת מחיר מותג" (לא רלוונטי לרמת מוצר)
    var tier = $('#pickTier');
    if(tier){
      var lbl = document.querySelector('label[for="pickTier"]');
      if(lbl) lbl.remove();
      var wrap = (tier.closest && tier.closest('.pickerField')) ? tier.closest('.pickerField') : null;
      if(wrap) wrap.style.display = 'none';
      tier.style.display = 'none';
    }

    // הוספת פילטרים: מינ׳/מקס׳/קטגוריה (בעברית)
    var row = $('#pickerFiltersRow') || document.querySelector('.pickerFilters') || document.querySelector('#pickerFilters') || document.querySelector('.picker-filters') || document.querySelector('.pickerTop');
    if(!row) return;

    function makeField(labelText, el){
      var w = document.createElement('div');
      w.className = 'pickerField';
      var lab = document.createElement('label');
      lab.textContent = labelText;
      lab.style.display = 'block';
      lab.style.fontSize = '12px';
      lab.style.opacity = '0.85';
      lab.style.marginBottom = '4px';
      w.appendChild(lab);
      w.appendChild(el);
      return w;
    }

    var min = $('#pickMin');
    if(!min){
      min = document.createElement('input');
      min.id = 'pickMin';
      min.type = 'number';
      min.inputMode = 'decimal';
      min.step = '0.01';
      min.placeholder = 'מינימום $';
      min.className = 'input';
      row.appendChild(makeField('מחיר מינ׳ ($)', min));
    } else {
      min.placeholder = 'מינימום $';
    }

    var max = $('#pickMax');
    if(!max){
      max = document.createElement('input');
      max.id = 'pickMax';
      max.type = 'number';
      max.inputMode = 'decimal';
      max.step = '0.01';
      max.placeholder = 'מקסימום $';
      max.className = 'input';
      row.appendChild(makeField('מחיר מקס׳ ($)', max));
    } else {
      max.placeholder = 'מקסימום $';
    }

    var cat = $('#pickCat');
    if(!cat){
      cat = document.createElement('select');
      cat.id = 'pickCat';
      cat.className = 'select';
      row.appendChild(makeField('קטגוריה', cat));
    }

    // Checkbox: לראות את כל המוצרים הזמינים (בלי סינון לפי התקציב שנשאר)
    var seeAll = $('#pickSeeAll');
    if(!seeAll){
      seeAll = document.createElement('input');
      seeAll.type = 'checkbox';
      seeAll.id = 'pickSeeAll';
      seeAll.style.transform = 'translateY(1px)';

      var wrap = document.createElement('div');
      wrap.className = 'pickerField';

      var lab = document.createElement('label');
      lab.style.display = 'flex';
      lab.style.alignItems = 'center';
      lab.style.gap = '8px';
      lab.style.cursor = 'pointer';
      lab.style.userSelect = 'none';
      lab.style.fontSize = '12px';
      lab.style.opacity = '0.9';

      var txt = document.createElement('span');
      txt.textContent = 'הצגת כל המוצרים הזמינים';

      lab.appendChild(seeAll);
      lab.appendChild(txt);

      wrap.appendChild(lab);
      row.appendChild(wrap);

      seeAll.addEventListener('change', function(){
        STATE.pickerSeeAll = !!seeAll.checked;
        renderPicker();
      });
    }
    seeAll.checked = !!STATE.pickerSeeAll;
  }

function ensureMobileBundleStyles(){
  if(document.getElementById('bundlesMobileFix')) return;
  var style = document.createElement('style');
  style.id = 'bundlesMobileFix';
  style.textContent = `
    /* Mobile-first fixes for bundles page */
    @media (max-width: 820px){
      /* Grid & container */
      #bundleGrid{
        grid-template-columns: 1fr !important;
        gap: 14px !important;
        padding: 0 10px !important;
      }

      /* Card header */
      .bundleCard{
        padding: 12px !important;
        border-radius: 14px !important;
      }
      .bundleTop{
        flex-direction: column !important;
        align-items: flex-start !important;
        gap: 8px !important;
      }
      .bundleTitle{
        font-size: 18px !important;
        line-height: 1.2 !important;
        margin: 0 !important;
      }
      .bundleSubtitle{
        font-size: 13px !important;
        line-height: 1.35 !important;
        margin: 4px 0 0 !important;
      }
      .bundleMeta{
        width: 100% !important;
        justify-content: flex-start !important;
        flex-wrap: wrap !important;
        gap: 10px !important;
      }
      .bundleMeta .tag{
        font-size: 12px !important;
        padding: 6px 9px !important;
        white-space: nowrap !important;
      }

      /* Product rows */
      .bundleProducts{ gap: 8px !important; }
      .bundleProduct{
        grid-template-columns: 56px 1fr !important;
        gap: 10px !important;
        align-items: center !important;
      }
      .bundleProductImg{
        width: 56px !important;
        height: 56px !important;
        object-fit: cover !important;
        border-radius: 12px !important;
      }
      .bundleProductTitle{
        font-size: 13px !important;
        line-height: 1.25 !important;
        overflow: hidden !important;
        display: -webkit-box !important;
        -webkit-line-clamp: 3 !important;
        -webkit-box-orient: vertical !important;
        word-break: break-word !important;
      }
      .bundleProductDetails{
        font-size: 12px !important;
        gap: 8px !important;
        flex-wrap: wrap !important;
      }

      /* CTA buttons (real class is bundleCTA/bundleBtn) */
      .bundleCTA{
        width: 100% !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 10px !important;
        align-items: stretch !important;
      }
      .bundleCTA .bundleBtn{
        width: 100% !important;
        min-height: 44px !important;
      }

      /* Modal */
      #bundleOverlay{
        padding: 12px !important;
      }
      #bundleOverlay .modalCard{
        width: min(520px, calc(100vw - 24px)) !important;
        max-height: calc(100vh - 24px) !important;
        border-radius: 14px !important;
      }

      /* Picker filters */
      .pickerFilters{ gap: 8px !important; }
      .pickerFilters .pickerInner{
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 8px !important;
      }
      .pickerFilters input,
      .pickerFilters select{
        width: 100% !important;
        min-width: 0 !important;
      }
      #pickerGrid{ grid-template-columns: 1fr 1fr !important; }

      @media (max-width: 520px){
        #bundleGrid{ padding: 0 8px !important; }
        .bundleCard{ padding: 10px !important; border-radius: 12px !important; }
        .bundleTitle{ font-size: 17px !important; }
        .bundleProduct{ grid-template-columns: 50px 1fr !important; }
        .bundleProductImg{ width: 50px !important; height: 50px !important; border-radius: 10px !important; }
        #pickerGrid{ grid-template-columns: 1fr !important; }
        #bundleOverlay{ padding: 10px !important; }
        #bundleOverlay .modalCard{ width: calc(100vw - 20px) !important; max-height: calc(100vh - 20px) !important; }
      }
    }
  `;
  document.head.appendChild(style);
}

  
  function translitLatinToHebrew(input){
    var s = String(input || '');
    // אם כבר יש עברית — נחזיר כמו שהוא
    if(/[\u0590-\u05FF]/.test(s)) return s;
    var map = {
      a:'א', b:'ב', c:'ק', d:'ד', e:'ה', f:'פ', g:'ג', h:'ה', i:'י', j:'ג׳', k:'ק', l:'ל',
      m:'מ', n:'נ', o:'ו', p:'פ', q:'ק', r:'ר', s:'ס', t:'ט', u:'ו', v:'ו', w:'ו', x:'קס', y:'י', z:'ז'
    };
    return s
      .replace(/[_\-]+/g,' ')
      .split(/\s+/)
      .filter(Boolean)
      .map(function(word){
        return word.toLowerCase().split('').map(function(ch){
          return map[ch] || '';
        }).join('');
      })
      .filter(Boolean)
      .join(' ');
  }

  function catLabel(code){
    var key = normCat(code);
    if(!key) return '';
    if(CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
    // fallback – keep Hebrew UI; show "אחר" if we can't label
    return translitLatinToHebrew(key) || 'אחר';
  }

  function populateCategoryOptions(){
    var sel = $('#pickCat');
    if(!sel) return;
    sel.innerHTML = '';

    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = 'כל הקטגוריות';
    sel.appendChild(opt0);

    (STATE.categories || []).forEach(function(c){
      var op = document.createElement('option');
      op.value = c;
      op.textContent = catLabel(c);
      sel.appendChild(op);
    });
  }

  // ===== Picker rendering =====
  
  function ensurePickerLoadMore(pickerEl, shown, total, onMore){
    if(!pickerEl) return;
    var wrap = document.getElementById('pickerLoadMoreWrap');
    if(!wrap){
      wrap = document.createElement('div');
      wrap.id = 'pickerLoadMoreWrap';
      wrap.className = 'kbLoadMoreWrap';
      pickerEl.insertAdjacentElement('afterend', wrap);
    }else{
      if (wrap.previousElementSibling !== pickerEl) {
        try { pickerEl.insertAdjacentElement('afterend', wrap); } catch(e) {}
      }
    }

    if(total > shown){
      wrap.style.display = 'flex';
      wrap.innerHTML = '';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = 'טעני עוד';
      btn.onclick = function(){ try{ onMore && onMore(); }catch(e){} };
      var info = document.createElement('span');
      info.className = 'kbPagerInfo';
      info.textContent = 'מוצגים ' + shown + ' מתוך ' + total;
      wrap.appendChild(btn);
      wrap.appendChild(info);
    }else{
      wrap.style.display = 'none';
      wrap.innerHTML = '';
    }
  }

function renderPicker(){
    var pickerEl = $('#pickerGrid');
    if(!pickerEl) return;

    var bundle = activeBundle();
    if(!bundle) return;

    var q = normalizeText($('#pickQ') && $('#pickQ').value);
    var brandTier = ''; // הוסר פילטר רמת מחיר מותג
    var minP = $('#pickMin') ? parseFloat($('#pickMin').value) : NaN;
    var maxP = $('#pickMax') ? parseFloat($('#pickMax').value) : NaN;
    var cat = $('#pickCat') ? $('#pickCat').value : '';

    // Candidate set depends on mode:
    // - swap mode: unused products only (keeps global uniqueness)
    // - builder mode: all eligible except already in custom, and will “steal” safely when needed
    var candidates = STATE.all.slice(); // תמיד מציגים את כל המוצרים עם משלוח חינם מעל $49

    // chips
    candidates = candidates.filter(function(p){
      if(STATE.chips.us && p._offer && p._offer.store && p._offer.store !== 'amazon-us') return false;
      if(STATE.chips.peta && !p._isPeta) return false;
      if(STATE.chips.lb && !p._isLB) return false;
      return true;
    });

    // Remove already-in-custom from picker in builder mode
    if(STATE.modalMode === 'builder'){
      var inCustom = {};
      (bundle.items || []).forEach(function(p){ inCustom[p._id]=1; });
      candidates = candidates.filter(function(p){ return !inCustom[p._id]; });
    }

    // search + brand tier + price min/max + category
    candidates = candidates.filter(function(p){
      
      if(isFinite(minP) && p._priceUSD < minP) return false;
      if(isFinite(maxP) && p._priceUSD > maxP) return false;

      if(cat){
        if(!p._categories || p._categories.indexOf(cat) === -1) return false;
      }

      if(q){
        var hay = normalizeText(p._brand + ' ' + p._name + ' ' + (p._categories||[]).join(' '));
        if(hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    // Swap mode: אפשר גם להחליף (כשנבחר פריט) וגם להוסיף (כשאין בחירה להחלפה)
    if(STATE.modalMode === 'swap'){
      // אם בחירה להחלפה לא תקפה — נבטל אותה
      if(STATE.activeItemId){
        var okSel = false;
        for(var ii=0; ii<(bundle.items||[]).length; ii++){
          if(bundle.items[ii]._id === STATE.activeItemId){ okSel = true; break; }
        }
        if(!okSel) STATE.activeItemId = null;
      }

      // בלי כפילויות בתוך אותו באנדל
      var inBundle = {};
      (bundle.items || []).forEach(function(p){ inBundle[p._id]=1; });
      candidates = candidates.filter(function(p){
        return !inBundle[p._id];
      });

      candidates.sort(function(a,b){ return a._priceUSD - b._priceUSD; });

      if(!candidates.length){
        pickerEl.innerHTML = '<p class="muted">לא נמצאו מוצרים לפי הפילטרים. נסי לנקות פילטרים או לחפש שם אחר.</p>';
        return;
      }

      // Load more in picker (swap mode)
      var sig = 'swap|' + (q||'') + '|' + (minP||'') + '|' + (maxP||'') + '|' + (cat||'') + '|' + (STATE.chips.us?1:0) + (STATE.chips.peta?1:0) + (STATE.chips.lb?1:0);
      var perPick = kbPerPage('picker');
      STATE.pickerLimit = perPick;
      if (STATE._pickerSig !== sig) { STATE._pickerSig = sig; STATE.pickerShown = perPick; }
      var showN = Math.min(candidates.length, STATE.pickerShown || perPick);
      var slice = candidates.slice(0, showN);

      var frag = document.createDocumentFragment();
      slice.forEach(function(p){ frag.appendChild(renderPickCard(p)); });
      pickerEl.innerHTML = '';
      pickerEl.appendChild(frag);

      ensurePickerLoadMore(pickerEl, showN, candidates.length, function(){
        STATE.pickerShown = (STATE.pickerShown || perPick) + perPick;
        renderPicker();
      });
      return;
    }

    // Builder mode: בנייה עצמית לפי המינימום/מקסימום שנבחרו
    var curTotal = bundleTotalUSD(bundle);
    var r = getBuilderRange();
    var remaining = isFinite(r.max) ? (r.max - curTotal) : Infinity;
    if(remaining < 0) remaining = 0;
    var seeAll = !!STATE.pickerSeeAll;

    candidates = candidates.filter(function(p){
      // כבר בפנים?
      for(var k=0;k<(bundle.items||[]).length;k++){
        if(bundle.items[k]._id === p._id) return false;
      }

      // אם לא מסומן “הצגת כל המוצרים הזמינים” — נסנן רק לפי התקציב שנשאר עד המקסימום
      if(!seeAll && (p._priceUSD > remaining + 1e-9)) return false;

      // אחרת (רואים הכל) — נציג הכל. ההוספה תטופל בלחיצה (עם אזהרות אם צריך)
      return true;
    });
;

    candidates.sort(function(a,b){ return a._priceUSD - b._priceUSD; });
    if(!candidates.length){
      var msg = 'לא נמצאו מוצרים לפי הפילטרים.';
      if(!seeAll && isFinite(r.max)){
        msg = 'אין כרגע מוצרים שנכנסים בתקציב שנשאר עד המקסימום שבחרתם (' + fmtUSD(r.max) + '). נסו להסיר מוצר, להגדיל את המקסימום, לנקות פילטרים, או לסמן “הצגת כל המוצרים הזמינים”.';
      }
      // להציג הודעה בראש המודאל (ולא ברשימה בצד)
      STATE.builderNoCandidatesMessage = msg;
      try{ setModalHintText(msg); }catch(e){}
      pickerEl.innerHTML = '';
      return;
    }else{
      STATE.builderNoCandidatesMessage = '';
    }

// Load more in picker (builder mode)
    var sig2 = 'builder|' + (q||'') + '|' + (minP||'') + '|' + (maxP||'') + '|' + (cat||'') + '|' + (STATE.chips.us?1:0) + (STATE.chips.peta?1:0) + (STATE.chips.lb?1:0) + '|' + (STATE.pickerSeeAll?1:0);
    var perPick2 = kbPerPage('picker');
    STATE.pickerLimit = perPick2;
    if (STATE._pickerSig !== sig2) { STATE._pickerSig = sig2; STATE.pickerShown = perPick2; }
    var showN2 = Math.min(candidates.length, STATE.pickerShown || perPick2);
    var slice2 = candidates.slice(0, showN2);

var frag2 = document.createDocumentFragment();
    slice2.forEach(function(p){ frag2.appendChild(renderPickCard(p)); });
    pickerEl.innerHTML = '';
    if(STATE.modalMode === 'builder'){
      // הודעת עזרה – תמיד מעל הרשימה ובמלוא רוחב הגריד
      var help = document.createElement('div');
      help.className = 'muted';
      help.style.margin = '0 0 10px';
      help.style.padding = '10px 12px';
      help.style.border = '1px dashed rgba(0,0,0,0.18)';
      help.style.borderRadius = '12px';
      help.style.whiteSpace = 'pre-line';
      help.style.lineHeight = '1.45';
      help.style.overflowWrap = 'anywhere';
      help.style.wordBreak = 'break-word';
      help.style.width = '100%';
      help.style.boxSizing = 'border-box';
      help.style.gridColumn = '1 / -1';
      help.style.justifySelf = 'stretch';

      var msg = 'כדי להוסיף מוצר לחבילה — לחצו על המוצר או על כפתור "הוספה". כפתור "פתיחה" יפתח את המוצר באמזון.';
      if(STATE.pickerSeeAll){
        msg += '\nמצב "הצגת כל המוצרים הזמינים" מאפשר להוסיף גם פריטים שלא נכנסים בתקציב שנשאר, וגם פריטים שנמצאים כבר בחבילות אחרות.';
      }
      help.textContent = msg;
      pickerEl.appendChild(help);
    }
    pickerEl.appendChild(frag2);
    // builder mode: keep the load-more counter consistent with the slice we rendered
    ensurePickerLoadMore(pickerEl, showN2, candidates.length, function(){
      // increment shown by one page
      STATE.pickerShown = (STATE.pickerShown || perPick2) + perPick2;
      renderPicker();
    });
  }

  // האם אפשר להוסיף מוצר לחבילה המותאמת (מבלי לחרוג מהמקסימום ומבלי לשבור באנגלית אחרים)
  function builderCanAddInfo(p){
    var custom = STATE.custom;
    if(!custom) return { ok:false, reason:'החבילה המותאמת לא נטענה.' };

    var cur = bundleTotalUSD(custom);
    var r = getBuilderRange();

    // מגבלת מקסימום לפי בחירת המשתמש/ת
    // אם סומן "הצגת כל המוצרים הזמינים" — לא חוסמים לפי מקסימום (רק נציג אזהרה לאחר הוספה)
    if(!STATE.pickerSeeAll && isFinite(r.max) && (cur + p._priceUSD > r.max + 1e-9)){
      var remaining = Math.max(0, r.max - cur);
      return { ok:false, reason:'המוצר חורג מהתקציב שנשאר (' + fmtUSD(remaining) + ').' };
    }
// מוצר שכבר בפנים
    for(var i=0;i<(custom.items||[]).length;i++){
      if(custom.items[i]._id === p._id) return { ok:false, reason:'המוצר כבר נמצא בחבילה.' };
    }

    // אם המוצר שייך לבאנדל אחר — בדיקת "תורם"
    var owner = findOwnerBundleId(p._id);
    if(owner && owner !== 'pool' && owner !== 'custom'){
      var donor = getBundleById(owner);
      if(!donor) return { ok:false, reason:'לא הצלחנו למצוא את הבאנדל התורם.' };

      var donorTotal = bundleTotalUSD(donor);
      var baseTotal = donorTotal - p._priceUSD;

      // אם התורם נשאר בטווח בלי המוצר — OK
      if(baseTotal >= BUNDLE_MIN - 1e-9 && baseTotal <= BUNDLE_MAX + 1e-9) return { ok:true };

      // אחרת חייבים תחליף מה־pool כדי לשמור את התורם בטווח
      var minR = Math.max(0, (BUNDLE_MIN - baseTotal));
      var maxR = Math.max(0, (BUNDLE_MAX - baseTotal));
      for(var j=0;j<(STATE.pool||[]).length;j++){
        var cand = STATE.pool[j];
        if(cand._priceUSD >= minR - 1e-9 && cand._priceUSD <= maxR + 1e-9) return { ok:true };
      }
      return { ok:true, warn:'שימו לב: המוצר נמצא כבר בחבילה אחרת, ואין כרגע תחליף מתאים ב־pool — החבילה האחרת עשויה לצאת מהטווח לאחר ההעברה.' };
    }

    return { ok:true };
  }

function renderPickCard(p){
    var card = document.createElement('div');
    card.className = 'pickCard';
    card.setAttribute('tabindex','0');
    card.setAttribute('role','button');
    var aria = (STATE.modalMode === 'builder') ? 'הוספת מוצר לחבילה' : (STATE.activeItemId ? 'בחירת מוצר להחלפה' : 'הוספת מוצר לבאנדל');
    card.setAttribute('aria-label', aria);
    // אם הפריט לא ניתן להוספה בחבילה המותאמת — לא נגרום לאפור/נעילה, רק נשמור את הסיבה להצגה בהודעה
    if(STATE.modalMode === 'builder' && !STATE.pickerSeeAll){
      var info0 = builderCanAddInfo(p);
      if(!info0.ok){
        card.dataset.disabledReason = info0.reason || '';
      }
    }
var img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = (p._brand ? (p._brand + ' ') : '') + (p._name || '');
    if(p._image) img.src = p._image;
    img.onerror = function(){ this.onerror = null; this.src = 'assets/img/products/placeholder.jpg'; };

    var body = document.createElement('div');

    var name = document.createElement('p');
    name.className = 'pickName';
    name.innerHTML = (p._brand ? ('<span dir="ltr">'+escapeHtml(p._brand)+'</span> · ') : '') + escapeHtml(p._name || '');

    var meta = document.createElement('div');
    meta.className = 'pickMeta';

    var price = document.createElement('span');
    price.className = 'pickPrice';
    price.textContent = fmtUSD(p._priceUSD);

    meta.appendChild(price);

    // מציג איפה המוצר נמצא כרגע (כדי להקל על החלפה/העברה)
    var owner = findOwnerBundleId(p._id);
    if(owner && owner !== 'pool'){
      var ot = document.createElement('span');
      ot.className = 'miniTag';
      ot.innerHTML = 'נמצא ב: <span dir="rtl">' + escapeHtml(bundleTitleById(owner)) + '</span>';
      meta.appendChild(ot);
    }

    if(p._isLB){
      var lb = document.createElement('span');
      lb.className = 'miniTag';
      lb.textContent = 'Leaping Bunny';
      meta.appendChild(lb);
    }
    if(p._isPeta){
      var pe = document.createElement('span');
      pe.className = 'miniTag';
      pe.textContent = 'PETA';
      meta.appendChild(pe);
    }

    body.appendChild(name);
    body.appendChild(meta);

    card.appendChild(img);
    card.appendChild(body);

    // כפתור "פתיחה" למוצר (ללא החלפה/הוספה)
    var btnOpen = document.createElement('button');
    btnOpen.type = 'button';
    btnOpen.className = 'miniBtn';
    btnOpen.textContent = 'פתיחה';
    btnOpen.addEventListener('click', function(e){
      e.stopPropagation();
      var url = (p._offer && p._offer.url) || p._url;
      if(url) window.open(ensureAmazonComTag(url), '_blank', 'noopener');
    });
    meta.appendChild(btnOpen);

    // כפתור ברור לבחירה/הוספה (בנוסף ללחיצה על כל הכרטיס)
    var btnSelect = document.createElement('button');
    btnSelect.type = 'button';
    btnSelect.className = 'miniBtn';
    btnSelect.textContent = (STATE.modalMode === 'builder') ? 'הוספה' : (STATE.activeItemId ? 'בחירה' : 'הוספה');
    btnSelect.addEventListener('click', function(e){
      e.stopPropagation();
      choose();
    });
    meta.appendChild(btnSelect);


    function choose(){
      if(STATE.modalMode === 'builder'){
        // במצב "הצגת כל המוצרים הזמינים" אנחנו לא חוסמים לפי תקציב/תורם — מוסיפים לחבילה גם אם המוצר מופיע כבר בבאנדל אחר.
        // במצב רגיל (ללא "הצגת כל המוצרים") נשמור על לוגיקת תקציב/תורם כדי לא לשבור חבילות אחרות.
        if(!STATE.pickerSeeAll){
          var info = builderCanAddInfo(p);
          if(!info.ok){
            setModalHintText(info.reason || 'אי אפשר להוסיף את המוצר הזה כרגע.');
            return;
          }
        }
        addToCustom(p._id);
      }else{
        if(STATE.modalMode === 'swap' && !STATE.activeItemId){
          doAddToActiveBundle(p);
        }else{
          doReplaceWith(p);
        }
      }
    }
card.addEventListener('click', choose);
    card.addEventListener('keydown', function(e){
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); choose(); }
    });

    return card;
  }

  
  // ===== איזון אוטומטי לבאנדלים (כדי לשמור על $52–$60 אחרי החלפות/העברות) =====
  function poolRemoveById(pid){
    var removed = null;
    var next = [];
    for(var i=0;i<(STATE.pool||[]).length;i++){
      var x = STATE.pool[i];
      if(x._id === pid) removed = x;
      else next.push(x);
    }
    STATE.pool = next;
    return removed;
  }

  function poolAdd(p){
    if(!p) return;
    STATE.pool.push(p);
  }

  function poolFindReplacement(minUSD, maxUSD){
    for(var i=0;i<(STATE.pool||[]).length;i++){
      var cand = STATE.pool[i];
      if(cand._priceUSD >= (minUSD - 1e-9) && cand._priceUSD <= (maxUSD + 1e-9)){
        return cand;
      }
    }
    return null;
  }

  function chooseRemovalSubset(items, minRemoveUSD, maxRemoveUSD){
    var scale = 100;
    var minC = Math.max(0, Math.round(minRemoveUSD * scale));
    var maxC = Math.max(0, Math.round(maxRemoveUSD * scale));
    if(maxC <= 0) return [];

    // מגבילים לפריטים הזולים קודם כדי לשמור על ביצועים
    var c = items.slice().sort(function(a,b){ return a._priceUSD - b._priceUSD; }).slice(0, 240);

    // dp[sum] = {count, prev, idx}
    var dp = new Array(maxC + 1);
    dp[0] = { count: 0, prev: -1, idx: -1 };

    for(var i=0;i<c.length;i++){
      var w = Math.round(c[i]._priceUSD * scale);
      for(var s=maxC; s>=w; s--){
        if(!dp[s-w]) continue;
        var prev = dp[s-w];
        var cand = { count: prev.count + 1, prev: s-w, idx: i };
        if(!dp[s] || cand.count < dp[s].count){
          dp[s] = cand;
        }
      }
    }

    var bestSum = -1;
    var bestCount = 1e9;
    for(var s=minC; s<=maxC; s++){
      if(!dp[s]) continue;
      if(dp[s].count < bestCount){
        bestCount = dp[s].count;
        bestSum = s;
      }else if(dp[s].count === bestCount && bestSum !== -1 && s < bestSum){
        bestSum = s;
      }
    }

    if(bestSum < 0) return null;

    var pickedIdxs = [];
    var cur = bestSum;
    while(cur > 0){
      var st = dp[cur];
      if(st.idx < 0) break;
      pickedIdxs.push(st.idx);
      cur = st.prev;
    }

    var used = {};
    var res = [];
    for(var j=0;j<pickedIdxs.length;j++){
      var idx = pickedIdxs[j];
      if(used[idx]) continue;
      used[idx] = 1;
      res.push(c[idx]);
    }
    return res;
  }

  function rebalanceBundle(bundle, protectedId){
    if(!bundle || !bundle.items) return false;

    // אם חסר כדי להגיע למינימום — נוסיף מה־pool
    var total = bundleTotalUSD(bundle);
    if(total < BUNDLE_MIN - 1e-9){
      var needMin = BUNDLE_MIN - total;
      var needMax = BUNDLE_MAX - total;

      var want = BUNDLE_TARGET - total;
      if(!isFinite(want)) want = needMax;
      want = Math.max(needMin, Math.min(needMax, want));

      var add = bestSubset(STATE.pool || [], needMin, needMax, { preferCloserTo: want, maxCandidates: 260 });
      if(add && add.length){
        add.forEach(function(p){
          bundle.items.push(p);
          poolRemoveById(p._id);
        });
      }
    }

    // אם חרגנו מהמקסימום — נוציא פריטים (למעט protected) ונחזיר ל־pool
    total = bundleTotalUSD(bundle);
    if(total > BUNDLE_MAX + 1e-9){
      var minRemove = total - BUNDLE_MAX;
      var maxRemove = total - BUNDLE_MIN;
      var removable = (bundle.items || []).filter(function(p){ return p._id !== protectedId; });

      var rm = chooseRemovalSubset(removable, minRemove, maxRemove);
      if(!rm || !rm.length) return false;

      var rmIds = {};
      rm.forEach(function(p){ rmIds[p._id] = 1; });

      bundle.items = (bundle.items || []).filter(function(p){ return !rmIds[p._id]; });
      rm.forEach(function(p){ poolAdd(p); });
    }

    bundle.items.sort(function(a,b){ return a._priceUSD - b._priceUSD; });
    STATE.pool.sort(function(a,b){ return a._priceUSD - b._priceUSD; });

    total = bundleTotalUSD(bundle);
    return (total >= BUNDLE_MIN - 1e-9) && (total <= BUNDLE_MAX + 1e-9);
  }

  function doReplaceWith(newP){
    var bundle = activeBundle();
    if(!bundle) return;

    // אם לא נבחר פריט פעיל — נשתמש בראשון בבאנדל כברירת מחדל
    if(!STATE.activeItemId){
      if(bundle.items && bundle.items.length){
        STATE.activeItemId = bundle.items[0]._id;
      }else{
        setModalHintText('אין פריטים בבאנדל להחלפה.');
        return;
      }
    }

    var oldIdx = -1;
    var oldP = null;
    for(var i=0;i<(bundle.items||[]).length;i++){
      if(bundle.items[i]._id === STATE.activeItemId){ oldIdx = i; oldP = bundle.items[i]; break; }
    }
    if(oldIdx < 0 || !oldP) return;

    if(!newP || !newP._id) return;
    if(newP._id === oldP._id) return;

    // אם המוצר כבר נמצא בבאנדל הזה — לא נייצר כפילות
    for(var z=0; z<(bundle.items||[]).length; z++){
      if(bundle.items[z]._id === newP._id){
        setModalHintText('המוצר שבחרת כבר נמצא בבאנדל הזה. בחרי מוצר אחר.');
        return;
      }
    }

    var owner = findOwnerBundleId(newP._id);
    var donor = (owner && owner !== 'pool') ? getBundleById(owner) : null;

    // snapshots for rollback (רק לשגיאות לוגיות)
    var savedPool = (STATE.pool || []).slice();
    var savedTarget = (bundle.items || []).slice();
    var savedDonor = donor ? (donor.items || []).slice() : null;

    function rollback(msg){
      STATE.pool = savedPool;
      bundle.items = savedTarget;
      if(donor) donor.items = savedDonor;
      if(msg) setModalHintText(msg);
      renderModal();
      render();
    }

    // acquire newP (keep global uniqueness) — בלי חסימת מחיר: ההחלפה תמיד מותרת
    if(owner === 'pool' || !owner){
      poolRemoveById(newP._id);
      poolAdd(oldP);
    }else if(donor){
      // swap: put oldP into donor at the position of newP
      var di = -1;
      for(var j=0;j<(donor.items||[]).length;j++){
        if(donor.items[j]._id === newP._id){ di = j; break; }
      }
      if(di < 0) return rollback('לא הצלחנו למצוא את המוצר בבאנדל התורם.');
      donor.items[di] = oldP;
      donor.items.sort(function(a,b){ return a._priceUSD - b._priceUSD; });
    }else{
      // fallback
      poolAdd(oldP);
    }

    // replace in target bundle
    bundle.items[oldIdx] = newP;
    bundle.items.sort(function(a,b){ return a._priceUSD - b._priceUSD; });

    STATE.pool.sort(function(a,b){ return a._priceUSD - b._priceUSD; });

    // עדכון פריט פעיל
    STATE.activeItemId = newP._id;

    // הודעת מידע אם יצאנו מטווח ה"חבילות האוטומטיות"
    var total = bundleTotalUSD(bundle);
    if(total < BUNDLE_MIN - 1e-9 || total > BUNDLE_MAX + 1e-9){
      setModalHintText('שימו לב: סכום הבאנדל עודכן ל-' + fmtUSD(total) +
        ' (הטווח המקורי של החבילות האוטומטיות הוא ' + fmtUSD(BUNDLE_MIN) + '–' + fmtUSD(BUNDLE_MAX) + ').');
    }else{
      setModalHintText('');
    }

    renderModal();
    render();
  }

  
  // ===== הוספה/הסרה לבאנדלים מוכנים (מצב החלפה) =====
  function doAddToActiveBundle(p){
    var bundle = activeBundle();
    if(!bundle || bundle.id === 'custom') return;
    if(!p || !p._id) return;

    // אין כפילויות בתוך אותו באנדל
    for(var i=0;i<(bundle.items||[]).length;i++){
      if(bundle.items[i]._id === p._id){
        setModalHintText('המוצר כבר נמצא בבאנדל.');
        return;
      }
    }

    // שמירה על ייחודיות גלובלית: אם המוצר נמצא בבאנדל אחר — "לוקחים" אותו (אבל לא נרד מתחת למינימום מוצרים)
    var owner = findOwnerBundleId(p._id);
    if(owner && owner !== 'pool' && owner !== bundle.id && owner !== 'custom'){
      var donor = getBundleById(owner);
      if(donor && donor.items){
        if(donor.items.length <= BUNDLE_MIN_ITEMS){
          setModalHintText('כדי לשמור על חבילות מוכנות עם לפחות ' + BUNDLE_MIN_ITEMS + ' מוצרים, אי אפשר לקחת מוצר מחבילה שיש בה בדיוק ' + BUNDLE_MIN_ITEMS + '. נסו להחליף במקום.');
          return;
        }
        donor.items = donor.items.filter(function(x){ return x._id !== p._id; });
      }
    }else{
      // אם המוצר ב־pool — מוציאים אותו משם
      poolRemoveById(p._id);
    }

    bundle.items = (bundle.items || []).concat([p]);
    // מיון להציג יפה
    bundle.items.sort(function(a,b){ return a._priceUSD - b._priceUSD; });

    STATE.activeItemId = null; // אחרי הוספה נחזור למצב הוספה/ללא בחירה
    renderModal();
    render();
  }

  function removeFromBundle(bundleId, pid){
    var b = getBundleById(bundleId);
    if(!b || !b.items) return;
    if(b.items.length <= BUNDLE_MIN_ITEMS){
      setModalHintText('כדי לשמור על חבילות מוכנות עם לפחות ' + BUNDLE_MIN_ITEMS + ' מוצרים, אי אפשר לרדת מתחת ל־' + BUNDLE_MIN_ITEMS + '. החליפו מוצר במקום להסיר.');
      return;
    }
    var removed = null;
    var next = [];
    for(var i=0;i<b.items.length;i++){
      var x = b.items[i];
      if(x._id === pid) removed = x;
      else next.push(x);
    }
    if(!removed){
      setModalHintText('לא הצלחנו להסיר את המוצר.');
      return;
    }
    b.items = next;
    poolAdd(removed);
    STATE.pool.sort(function(a,b){ return a._priceUSD - b._priceUSD; });
    if(STATE.activeItemId === pid) STATE.activeItemId = null;
    renderModal();
    render();
  }

// ===== Custom builder operations =====
  function findOwnerBundleId(productId){
    // returns 'pool' if in pool, bundle id if in bundle, or null if not found
    for(var i=0;i<STATE.pool.length;i++){
      if(STATE.pool[i]._id === productId) return 'pool';
    }
    for(var b=0;b<STATE.bundles.length;b++){
      var bun = STATE.bundles[b];
      if(!bun || bun.id === 'custom') continue;
      for(var j=0;j<(bun.items||[]).length;j++){
        if(bun.items[j]._id === productId) return bun.id;
      }
    }
    return null;
  }

  function findProductById(productId){
    for(var i=0;i<STATE.all.length;i++){
      if(STATE.all[i]._id === productId) return STATE.all[i];
    }
    return null;
  }

  function addToCustom(productId){
    var custom = STATE.custom;
    if(!custom) return;

    var p = findProductById(productId);
    if(!p) return;

    // אם סומן "הצגת כל המוצרים הזמינים" — מוסיפים את המוצר לחבילה *כהעתקה* (לא מסירים אותו מבאנדלים אחרים/מה־pool),
    // כדי שהמשתמש/ת יוכלו להוסיף כמה פריטים שירצו בלי חסימות.
    if(STATE.pickerSeeAll){
      // כבר בפנים?
      for(var k0=0;k0<(custom.items||[]).length;k0++){
        if(custom.items[k0]._id === p._id) return;
      }

      custom.items.push(p);
      custom.items.sort(function(a,b){ return a._priceUSD - b._priceUSD; });
      saveCustomToStorage();

      var r0 = getBuilderRange();
      var total0 = bundleTotalUSD(custom);

      if(isFinite(r0.max) && total0 > r0.max + 1e-9){
        setModalHintText('⚠️ שימו לב: סכום החבילה כעת ' + fmtUSD(total0) + ' — חורג מהמקסימום שבחרתם (' + fmtUSD(r0.max) + '). אפשר להסיר פריטים או להגדיל את המקסימום.');
      }else{
        setModalHintText('נוסף לחבילה. טיפ: במצב "הצגת כל המוצרים הזמינים" ההוספה לא משנה את החבילות האוטומטיות.');
      }

      renderModal();
      render();
      return;
    }

    var cur = bundleTotalUSD(custom);
    var r = getBuilderRange();

    // ברירת מחדל: לא מאפשרים לעבור את המקסימום שנבחר.
    // אם סומן "הצגת כל המוצרים הזמינים" — מאפשרים להוסיף גם אם עוברים את המקסימום, ומציגים אזהרה.
    if(!STATE.pickerSeeAll && isFinite(r.max) && (cur + p._priceUSD > r.max + 1e-9)){
      setModalHintText('אי אפשר להוסיף — זה יחרוג מהמקסימום שבחרתם (' + fmtUSD(r.max) + ').');
      return;
    }
    if(STATE.pickerSeeAll && isFinite(r.max) && (cur + p._priceUSD > r.max + 1e-9)){
      setModalHintText('⚠️ שימו לב: לאחר ההוספה תחרגו מהמקסימום שבחרתם (' + fmtUSD(r.max) + ').');
      // ממשיכים בכל זאת
    }
// כבר בפנים?
    for(var k=0;k<(custom.items||[]).length;k++){
      if(custom.items[k]._id === p._id) return;
    }

    var owner = findOwnerBundleId(p._id);
    var donor = (owner && owner !== 'pool') ? getBundleById(owner) : null;

    var savedPool = (STATE.pool || []).slice();
    var savedCustom = (custom.items || []).slice();
    var savedDonor = donor ? (donor.items || []).slice() : null;

    function rollback(msg){
      STATE.pool = savedPool;
      custom.items = savedCustom;
      if(donor) donor.items = savedDonor;
      if(msg) setModalHintText(msg);
      renderModal();
      render();
    }

    if(owner === 'pool' || !owner){
      poolRemoveById(p._id);
      custom.items.push(p);
      custom.items.sort(function(a,b){ return a._priceUSD - b._priceUSD; });
      saveCustomToStorage();
      setModalHintText('');
      renderModal(); render();
      return;
    }

    if(!donor) {
      // should not happen
      custom.items.push(p);
      renderModal(); render();
      return;
    }

    // locate inside donor
    var di = -1;
    for(var j=0;j<(donor.items||[]).length;j++){
      if(donor.items[j]._id === p._id){ di = j; break; }
    }
    if(di < 0) return rollback('לא הצלחנו למצוא את המוצר בבאנדל התורם.');

    var donorTotal = bundleTotalUSD(donor);
    var baseTotal = donorTotal - p._priceUSD;

    // אם התורם עדיין בטווח גם בלי הפריט — פשוט נוציא אותו
    if(baseTotal >= BUNDLE_MIN - 1e-9 && baseTotal <= BUNDLE_MAX + 1e-9){
      donor.items.splice(di, 1);
      custom.items.push(p);
      custom.items.sort(function(a,b){ return a._priceUSD - b._priceUSD; });
      saveCustomToStorage();
      setModalHintText('');
      renderModal(); render();
      return;
    }

    // אחרת נחפש תחליף מה־pool לתורם
    var minR = Math.max(0, (BUNDLE_MIN - baseTotal));
    var maxR = Math.max(0, (BUNDLE_MAX - baseTotal));
    var repl = poolFindReplacement(minR, maxR);
    if(!repl){
      // אין תחליף לתורם: עדיין נאפשר את ההעברה, ופשוט נעדכן שהבאנדל התורם עשוי לצאת מהטווח.
      donor.items.splice(di, 1);
      custom.items.push(p);
      custom.items.sort(function(a,b){ return a._priceUSD - b._priceUSD; });
      saveCustomToStorage();
      setModalHintText('⚠️ שימו לב: המוצר הועבר מהבאנדל האחר. אין כרגע תחליף מתאים ב־pool ולכן הבאנדל התורם עשוי לצאת מטווח $52–$60.');
      renderModal(); render();
      return;
    }

    donor.items[di] = repl;
    poolRemoveById(repl._id);

    custom.items.push(p);
    custom.items.sort(function(a,b){ return a._priceUSD - b._priceUSD; });
      saveCustomToStorage();

    donor.items.sort(function(a,b){ return a._priceUSD - b._priceUSD; });

    setModalHintText('');
    renderModal(); render();
  }

  function removeFromCustom(productId){
    var custom = STATE.custom;
    if(!custom) return;

    var removed = null;
    var next = [];
    for(var i=0;i<(custom.items||[]).length;i++){
      if(custom.items[i]._id === productId) removed = custom.items[i];
      else next.push(custom.items[i]);
    }
    if(!removed) return;

    custom.items = next;
    saveCustomToStorage();

    // return to pool (unused)
    STATE.pool.push(removed);
    STATE.pool.sort(function(a,b){ return a._priceUSD - b._priceUSD; });

    renderModal();
    render();
  }

  // ===== FX converter =====
  function wireFxConverter(){
    var usdInput = $('#usdInput');
    var ilsOut = $('#ilsOut');
    var fxNote = $('#fxNote');
    if(!usdInput || !ilsOut || !fxNote) return;

    function update(){
      var usd = parseFloat(usdInput.value);
      if(!isFinite(usd)) usd = 0;
      ilsOut.textContent = fmtILS(usd * (STATE.fxRate || USD_TO_ILS_DEFAULT));
    }

    usdInput.oninput = update;
    update();

    if(!STATE._fxFetched){
      STATE._fxFetched = true;
      fxNote.textContent = 'טוען שער USD/ILS…';
      fetch('https://api.exchangerate.host/latest?base=USD&symbols=ILS')
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(data){
          var rate = data && data.rates && data.rates.ILS;
          if(isNum(rate) && rate > 0){
            STATE.fxRate = rate;
            fxNote.textContent = 'שער עדכני נטען ✓';
            update();
            render();
          }else{
            fxNote.textContent = 'משתמש בשער ברירת מחדל';
          }
        })
        .catch(function(){ fxNote.textContent = 'משתמש בשער ברירת מחדל'; });
    }
  }

  // ===== Data loading =====
  async function fetchJson(path){
    var url = path + (path.indexOf('?')>-1 ? '&' : '?') + 'v=' + Date.now();
    var res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error('Failed to load ' + path + ' (' + res.status + ')');
    return await res.json();
  }

  function computeCategories(all){
  // Keep the same category list as the products page (no "אחר")
  return CATEGORY_ORDER.slice();
}

  async function init(){
    var grid = $('#bundleGrid');
    if(!grid) return;

    grid.innerHTML = '<p class="muted">טוען באנדלים…</p>';

    ensureTaxNotice();

    var brandsRaw = [];
    try { brandsRaw = await fetchJson(BRANDS_PATH); } catch(e) { brandsRaw = []; }
    BRAND_INDEX = buildBrandIndex(brandsRaw);

    var productsRaw = await fetchJson(PRODUCTS_PATH);

    var eligible = [];
    for(var i=0;i<(productsRaw||[]).length;i++){
      var ep = eligibleProduct(productsRaw[i]);
      if(ep) eligible.push(ep);
    }

    // Dedupe by id (keep cheapest if duplicates)
    var byId = {};
    for(var j=0;j<eligible.length;j++){
      var p = eligible[j];
      var id = p._id;
      if(!byId[id] || p._priceUSD < byId[id]._priceUSD) byId[id] = p;
    }

    var all = Object.keys(byId).map(function(k){ return byId[k]; })
      .sort(function(a,b){ return a._priceUSD - b._priceUSD; });

    computeBrandTiers(all);

    STATE.all = all;

    // Restore custom bundle from previous visit (if any)
    loadCustomFromStorage();

    STATE.categories = computeCategories(all);
    populateCategoryOptions();

    var built = buildBundlesFromPool(all);

    // Put custom builder first
    STATE.custom.items = STATE.custom.items || [];
    STATE.bundles = [STATE.custom].concat((built.bundles || []).slice(0, 4));
    STATE.viewLimit = kbPerPage('bundles');
    STATE.pool = built.unused;

    render();
  }

  // ===== Events wiring =====
  function wire(){
    ensurePickerFiltersUI();
    ensureMobileBundleStyles();

    var overlay = $('#bundleOverlay');
    var closeBtn = $('#bundleCloseBtn');
    if(overlay){ overlay.addEventListener('click', closeBundleModal); }
    if(closeBtn){ closeBtn.addEventListener('click', closeBundleModal); }

    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape') closeBundleModal();
    });

    function reRenderPicker(){ renderPicker(); }

    var q = $('#pickQ');
    var tier = $('#pickTier');
    var mn = $('#pickMin');
    var mx = $('#pickMax');
    var cat = $('#pickCat');

    if(q) q.addEventListener('input', reRenderPicker);
        if(mn) mn.addEventListener('input', reRenderPicker);
    if(mx) mx.addEventListener('input', reRenderPicker);
    if(cat) cat.addEventListener('change', reRenderPicker);

    // chip toggles
    $all('.pickerChip').forEach(function(btn){
      btn.addEventListener('click', function(){
        var key = btn.getAttribute('data-chip');
        if(!key) return;
        STATE.chips[key] = !STATE.chips[key];
        syncChipButtons();
        renderPicker();
      });
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      wire();
      init().catch(function(e){
        console.warn(e);
        var grid=$('#bundleGrid');
        if(grid) grid.innerHTML='<p class="muted">שגיאה בטעינת המוצרים. ודאי שקיים '+PRODUCTS_PATH+'</p>';
      });
    });
  }else{
    wire();
    init().catch(function(e){ console.warn(e); });
  }

})();
