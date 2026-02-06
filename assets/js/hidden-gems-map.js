(function () {
  // Prevent double-load
  if (window.__kbHiddenGemsListLoaded) return;
  window.__kbHiddenGemsListLoaded = true;

  function $(sel){ return document.querySelector(sel); }
  function $$(sel){ return Array.from(document.querySelectorAll(sel)); }

  const DATA_URL = (function(){
    // Works on GitHub Pages + local
    const base = document.currentScript?.dataset?.base || '';
    return base + 'data/hidden-gems.json?v=2026-02-02-v19';
  })();

  const STATE = {
    items: [],
    filtered: [],
    country: 'all',
    q: '',
    sort: 'country',
    page: 1,
    per: 0,
    pagerEl: null,
  };

  function norm(s){
    return String(s ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[’']/g,'')
      .replace(/\s+/g,' ')
      .trim();
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }


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



  function googleMapsLink(item){
    const q = [item.name, item.address || '', item.city || '', item.country || ''].filter(Boolean).join(', ');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }

  function dedupe(items){
    const seen = new Map();
    for (const it of items) {
      const key = norm(it.name) + '|' + norm(it.address || (it.city + ',' + it.country));
      if (!seen.has(key)) seen.set(key, it);
    }
    return Array.from(seen.values());
  }

  function matches(item){
    if (STATE.country !== 'all' && norm(item.country) !== STATE.country) return false;

    const q = norm(STATE.q);
    if (!q) return true;

    const hay = norm([item.name, item.address, item.city, item.country, item.note].filter(Boolean).join(' | '));
    return hay.includes(q);
  }

  function sortItems(items){
    const byName = (a,b) => (a.name||'').localeCompare((b.name||''), undefined, {sensitivity:'base'});
    const byCity = (a,b) => (a.city||'').localeCompare((b.city||''), undefined, {sensitivity:'base'}) || byName(a,b);
    const byCountry = (a,b) =>
      (a.country||'').localeCompare((b.country||''), undefined, {sensitivity:'base'}) ||
      byCity(a,b) ||
      byName(a,b);

    if (STATE.sort === 'name') return items.slice().sort(byName);
    if (STATE.sort === 'city') return items.slice().sort(byCity);
    return items.slice().sort(byCountry);
  }

  function groupByCountry(items){
    const map = new Map();
    for (const it of items) {
      const c = it.country || 'Unknown';
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(it);
    }
    // Countries sorted A-Z
    return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0], undefined, {sensitivity:'base'}));
  }

  function render(){
    const groupsEl = $('#hgGroups');
    const countEl = $('#hgCount');
    if (!groupsEl) return;

    const filtered = STATE.items.filter(matches);
    const sorted = sortItems(filtered);

    countEl && (countEl.textContent = String(sorted.length));

    const grouped = groupByCountry(sorted);

    STATE.per = kbPerPage('hg');
    if (!STATE.pagerEl) STATE.pagerEl = kbEnsurePager(groupsEl, 'hgPager');
    kbRenderPager(STATE.pagerEl, STATE.page, grouped.length, STATE.per, function(n){ STATE.page=n; render(); });

    const gStart = (STATE.page - 1) * STATE.per;
    const gEnd = gStart + STATE.per;
    const pageGroups = (grouped.length > STATE.per) ? grouped.slice(gStart, gEnd) : grouped;

    groupsEl.innerHTML = pageGroups.map(([country, items]) => {
      // If sorting by name/city, still group by country for scanability.
      const cards = items.map(it => {
        const loc = [it.city, it.country].filter(Boolean).join(', ');
        const addr = it.address || '';
        const note = it.note || '';
        const url = (it.url || '').trim();

        const maps = `<a class="btnSmall" href="${googleMapsLink(it)}" target="_blank" rel="noopener">פתח במפות</a>`;
        const site = url ? `<a class="btnSmall btnGhost" href="${escapeHtml(url)}" target="_blank" rel="noopener">אתר</a>` : '';
        const copy = addr ? `<button class="btnSmall btnGhost" type="button" data-copy="${escapeHtml(addr)}">העתק כתובת</button>` : '';

        return `
          <article class="hgCard">
            <h4 class="hgName">${escapeHtml(it.name || '')}</h4>
            <p class="hgLoc">${escapeHtml(loc)}</p>
            ${addr ? `<p class="hgAddr">${escapeHtml(addr)}</p>` : ''}
            ${note ? `<p class="hgAddr" style="color:rgba(0,0,0,.72);">${escapeHtml(note)}</p>` : ''}
            <div class="hgActions">
              ${maps}
              ${site}
              ${copy}
            </div>
          </article>`;
      }).join('');

      return `
        <div class="contentCard">
          <div class="hgCountryHeader">
            <h3>${escapeHtml(country)}</h3>
            <div class="muted" style="margin:0;">${items.length} מקומות</div>
          </div>
          <div class="hgGrid">${cards}</div>
        </div>`;
    }).join('');

    // copy buttons
    $$('#hgGroups [data-copy]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const text = btn.getAttribute('data-copy') || '';
        try {
          await navigator.clipboard.writeText(text);
          btn.textContent = 'הועתק ✅';
          setTimeout(()=>btn.textContent='העתק כתובת', 1200);
        } catch(e){
          // fallback
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          btn.textContent = 'הועתק ✅';
          setTimeout(()=>btn.textContent='העתק כתובת', 1200);
        }
      });
    });
  }

  function wire(){
    const q = $('#hgSearch');
    const c = $('#hgCountry');
    const s = $('#hgSort');
    const r = $('#hgReset');

    q && q.addEventListener('input', () => { STATE.q = q.value || ''; STATE.page = 1; render(); });
    c && c.addEventListener('change', () => { STATE.country = c.value; STATE.page = 1; render(); });
    s && s.addEventListener('change', () => { STATE.sort = s.value; STATE.page = 1; render(); });
    r && r.addEventListener('click', () => {
      STATE.q = '';
      STATE.country = 'all';
      STATE.sort = 'country';
      STATE.page = 1;
      if (q) q.value = '';
      if (c) c.value = 'all';
      if (s) s.value = 'country';
      render();
    });
  }

  async function load(){
    try{
      const res = await fetch(DATA_URL, { cache: 'force-cache' });
      const json = await res.json();
      STATE.items = dedupe(Array.isArray(json) ? json : (json.places || []));
    }catch(e){
      STATE.items = [];
      console.warn('Hidden Gems: failed to load data/hidden-gems.json', e);
    }

    // Populate countries
    const countries = Array.from(new Set(STATE.items.map(it => norm(it.country)).filter(Boolean))).sort();
    const countrySel = $('#hgCountry');
    if (countrySel){
      const labelMap = new Map();
      // Use original country casing from data
      STATE.items.forEach(it => {
        const k = norm(it.country);
        if (k && !labelMap.has(k)) labelMap.set(k, it.country);
      });
      countrySel.innerHTML = [
        `<option value="all">כל המדינות</option>`,
        ...countries.map(k => `<option value="${k}">${escapeHtml(labelMap.get(k) || k)}</option>`)
      ].join('');
    }

    wire();
    render();
  }

  document.addEventListener('DOMContentLoaded', load);
})();
