// Home page helpers (v14) — fast, minimal, non-salesy
(function(){
  function qs(sel){ return document.querySelector(sel); }
  function esc(s){
    return String(s||'').replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);
    });
  }

  function isValidImg(u){
    if(typeof u !== 'string') return false;
    var s = u.trim();
    return s.length > 6;
  }

  function idle(fn){
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(fn, { timeout: 1800 });
    } else {
      setTimeout(fn, 650);
    }
  }


  function onVisible(el, fn){
    if(!el || typeof fn !== 'function') return;
    var done = false;
    function run(){
      if(done) return;
      done = true;
      fn();
    }
    if(!('IntersectionObserver' in window)){
      run();
      return;
    }
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){
          io.disconnect();
          run();
        }
      });
    }, { rootMargin: '200px 0px' });
    io.observe(el);
  }

  function bindHomeSearch(){
    var form = qs('#homeSearchForm');
    var input = qs('#homeSearchInput');
    if(!form || !input) return;

    form.addEventListener('submit', function(e){
      e.preventDefault();
      var q = (input.value || '').trim();
      window.location.href = q ? ('products.html?q=' + encodeURIComponent(q)) : 'products.html';
    });
  }

  function pickBestOffer(p){
    var offers = Array.isArray(p && p.offers) ? p.offers : [];
    // prefer offers with a numeric price
    var best = null;
    for (var i=0;i<offers.length;i++){
      var o = offers[i] || {};
      var price = (typeof o.priceUSD === 'number' && isFinite(o.priceUSD)) ? o.priceUSD
                : (typeof o.price === 'number' && isFinite(o.price)) ? o.price
                : null;
      if (price == null) continue;
      if (!best || price < best._price) {
        best = { _price: price, currency: o.currency || 'USD' };
      }
    }
    return best;
  }

  function formatMoney(amount, currency){
    if (typeof amount !== 'number' || !isFinite(amount)) return '';
    currency = currency || 'USD';
    try{
      return new Intl.NumberFormat('he-IL', { style:'currency', currency: currency, maximumFractionDigits: 0 }).format(amount);
    }catch(e){
      return '$' + Math.round(amount);
    }
  }

  function renderDealsTeaser(list){
    var grid = qs('#homeDealsGrid');
    var loading = qs('#homeDealsLoading');
    var empty = qs('#homeDealsEmpty');
    if(!grid || !loading) return;

    // discounted flag variations
    var deals = (list || []).filter(function(p){
      return p && (p.isDiscounted === true || p.discounted === true || p.is_discounted === true);
    });

    // Prefer items with image & price
    deals.sort(function(a,b){
      var ai = a && (a.image ? 1 : 0);
      var bi = b && (b.image ? 1 : 0);
      if (bi !== ai) return bi - ai;
      var ap = pickBestOffer(a);
      var bp = pickBestOffer(b);
      var av = ap ? ap._price : 999999;
      var bv = bp ? bp._price : 999999;
      return av - bv;
    });

    var top = deals.slice(0, 4);
    loading.style.display = 'none';
    grid.innerHTML = '';
    if (empty) empty.textContent = '';

    if(!top.length){
      if (empty) empty.textContent = 'לא מצאנו כרגע דילים להצגה.';
      return;
    }

    var html = '';
    top.forEach(function(p){
      var brand = esc(p.brand || '');
      var name = esc(p.name || '');
      var img = isValidImg(p.image) ? esc(p.image) : '';
      var best = pickBestOffer(p);
      var priceText = best ? formatMoney(best._price, best.currency) : '';
      html += (
        '<article class="dealCard">' +
          '<a class="dealMedia" href="todays-top-deals.html" aria-label="לכל הדילים">' +
            (img ? '<img class="dealImg" src="' + img + '" alt="' + name + '" loading="lazy" decoding="async" width="640" height="640" />'
                 : '<div class="dealPlaceholder" aria-hidden="true">🧴</div>') +
          '</a>' +
          '<div class="dealTop">' +
            '<div class="dealBrandRow">' +
              '<div>' +
                (brand ? '<div class="dealBrand wg-notranslate" data-wg-notranslate="true">' + brand + '</div>' : '') +
                '<div class="dealName">' + name + '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="dealCta">' +
            '<div class="dealPrice">' + esc(priceText) + '</div>' +
            '<a class="dealBtn" href="todays-top-deals.html">לפרטים</a>' +
          '</div>' +
        '</article>'
      );
    });
    grid.innerHTML = html;
  }

  function renderProductsTeaser(list){
    var grid = qs('#homeProductsGrid');
    var loading = qs('#homeProductsLoading');
    var empty = qs('#homeProductsEmpty');
    if(!grid || !loading) return;

    // Prefer Israel items, then with image, avoid duplicates and avoid discounted to keep variety
    var products = (list || []).filter(function(p){
      return p && p.name && p.brand && !(p.isDiscounted === true || p.discounted === true || p.is_discounted === true);
    });

    products.sort(function(a,b){
      var aIs = a && a.isIsrael ? 1 : 0;
      var bIs = b && b.isIsrael ? 1 : 0;
      if (bIs !== aIs) return bIs - aIs;
      var ai = a && a.image ? 1 : 0;
      var bi = b && b.image ? 1 : 0;
      if (bi !== ai) return bi - ai;
      return 0;
    });

    var top = products.slice(0, 4);
    loading.style.display = 'none';
    grid.innerHTML = '';
    if (empty) empty.textContent = '';

    if(!top.length){
      if (empty) empty.textContent = 'לא מצאנו כרגע מוצרים להצגה.';
      return;
    }

    var html = '';
    top.forEach(function(p){
      var brand = esc(p.brand || '');
      var name = esc(p.name || '');
      var img = isValidImg(p.image) ? esc(p.image) : '';
      var q = encodeURIComponent((p.brand || '') + ' ' + (p.name || ''));
      html += (
        '<article class="productCard">' +
          '<div class="pMedia">' +
            (img ? '<img src="' + img + '" alt="' + name + '" loading="lazy" decoding="async" width="640" height="640" />'
                 : '<div class="pPlaceholder" aria-hidden="true">🧴</div>') +
          '</div>' +
          '<div class="pContent">' +
            '<div class="pHeader">' +
              '<div class="pTitleWrap">' +
                '<div class="pBrand">' + brand + '</div>' +
                '<div class="pName">' + name + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="actions" style="margin-top:10px;">' +
              '<a class="btn ghost" href="products.html?q=' + q + '">לפרטים</a>' +
            '</div>' +
          '</div>' +
        '</article>'
      );
    });
    grid.innerHTML = html;
  }

  function loadTeasers(){
    var dealsGrid = qs('#homeDealsGrid');
    var productsGrid = qs('#homeProductsGrid');
    if (!dealsGrid && !productsGrid) return;

    var productsUrl = 'data/products.json?v=2026-02-02-v19';
    fetch(productsUrl, { cache: 'force-cache' })
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(data){
        var list = Array.isArray(data) ? data : (Array.isArray(data.products) ? data.products : []);
        renderDealsTeaser(list);
        renderProductsTeaser(list);
      })
      .catch(function(){
        // Hide loaders if fetch fails (file might not exist in dev)
        var l1 = qs('#homeDealsLoading'); if(l1) l1.style.display='none';
        var l2 = qs('#homeProductsLoading'); if(l2) l2.style.display='none';
        var e1 = qs('#homeDealsEmpty'); if(e1) e1.textContent = '';
        var e2 = qs('#homeProductsEmpty'); if(e2) e2.textContent = '';
      });
  }

  function init(){
    bindHomeSearch();
    onVisible(qs('#homeTeasers') || qs('#homeDealsGrid') || qs('#homeProductsGrid'), function(){ idle(loadTeasers); });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, { once:true });
  }else{
    init();
  }
})();
