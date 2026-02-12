/* Vegan in Israel page logic (page-only) */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const DATA_PATH = 'data/vegan-in-israel.json';
  const BUILD = (window.KBWG_BUILD || window.KBWG_SITE_BUILD || window.KBWG_PRODUCTS_BUILD || '').toString();
  const DATA_URL = BUILD ? `${DATA_PATH}?v=${encodeURIComponent(BUILD)}` : DATA_PATH;
  const STATE = {
    listPage: 1,
    listPer: 0,
    listPagerEl: null,

    mobileView: 'list',

    places: [],
    filter: {
      q: '',
      region: 'all',
      type: 'all' // restaurant | shop | all
    },
    map: null,
    markers: []
  };

  const I18N = {
    he: {
      maps: 'מפות',
      website: 'אתר',
      instagram: 'אינסטגרם',
      showOnMap: 'הצג במפה',
      openInMaps: 'פתח במפות',
      loading: 'טוען…',
      noMatchTitle: 'לא מצאנו התאמה',
      noMatchText: 'נסו לשנות חיפוש/אזור או להסיר פילטרים.',
      allIsrael: 'כל הארץ',
      prev: 'הקודם',
      next: 'הבא',
      page: 'עמוד',
      of: 'מתוך',
      noResults: 'אין תוצאות',
      showing: 'מציגים'
    },
    en: {
      maps: 'Maps',
      website: 'Website',
      instagram: 'Instagram',
      showOnMap: 'Show on map',
      openInMaps: 'Open in Maps',
      loading: 'Loading…',
      noMatchTitle: 'No matches found',
      noMatchText: 'Try adjusting your search/region or removing filters.',
      allIsrael: 'All Israel',
      prev: 'Previous',
      next: 'Next',
      page: 'Page',
      of: 'of',
      noResults: 'No results',
      showing: 'Showing'
    }
  };

  function getLang() {
    // Prefer Weglot if available
    try {
      if (window.Weglot && typeof Weglot.getCurrentLang === 'function') {
        const wl = String(Weglot.getCurrentLang() || '').toLowerCase();
        if (wl.startsWith('en')) return 'en';
        if (wl.startsWith('he')) return 'he';
      }
    } catch {}
    const l = String(document.documentElement.getAttribute('lang') || 'he').toLowerCase();
    return l.startsWith('en') ? 'en' : 'he';
  }

  function isHe() { return getLang() === 'he'; }

  function t(key) {
    const lang = getLang();
    return (I18N[lang] && I18N[lang][key]) || I18N.he[key] || key;
  }

  function ensureDirByLang() {
    const lang = getLang();
    const want = (lang === 'en') ? 'ltr' : 'rtl';
    if (document.documentElement.getAttribute('dir') !== want) {
      document.documentElement.setAttribute('dir', want);
    }
  }

  function normalize(str) {
    return (str || '')
      .toString()
      .toLowerCase()
      .trim();
  }


const VIEW_BREAKPOINT = 820;
const VIEW_STORAGE_KEY = 'vii_view_v1';

function isMobileViewport() {
  return (window.innerWidth || 1024) <= VIEW_BREAKPOINT;
}

function getStoredView() {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    return (v === 'map' || v === 'list') ? v : null;
  } catch {
    return null;
  }
}

function setMobileView(view) {
  const v = (view === 'map') ? 'map' : 'list';
  STATE.mobileView = v;

  if (!isMobileViewport()) {
    document.body.classList.remove('vii-view-list', 'vii-view-map');
    return;
  }

  document.body.classList.toggle('vii-view-list', v === 'list');
  document.body.classList.toggle('vii-view-map', v === 'map');

  const btnList = $('#viewListBtn');
  const btnMap = $('#viewMapBtn');
  if (btnList) btnList.setAttribute('aria-pressed', v === 'list' ? 'true' : 'false');
  if (btnMap) btnMap.setAttribute('aria-pressed', v === 'map' ? 'true' : 'false');

  try { localStorage.setItem(VIEW_STORAGE_KEY, v); } catch {}

  // Leaflet needs a resize recalculation when becoming visible
  if (v === 'map') {
    // Ensure the map exists; render if needed
    if (!STATE.map) renderMap({ fit: true });
    setTimeout(() => {
      try { STATE.map?.invalidateSize?.(); } catch {}
    }, 220);
  }
}

function shouldRenderMapNow() {
  return !isMobileViewport() || STATE.mobileView === 'map';
}

function wireViewToggle() {
  const btnList = $('#viewListBtn');
  const btnMap = $('#viewMapBtn');
  const scrollToList = $('#scrollToListBtn');

  if (btnList) btnList.addEventListener('click', () => setMobileView('list'));
  if (btnMap) btnMap.addEventListener('click', () => setMobileView('map'));

  if (scrollToList) {
    scrollToList.addEventListener('click', () => {
      if (isMobileViewport()) setMobileView('list');
      $('#placesGrid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Keep UI sane when rotating / resizing
  window.addEventListener('resize', () => {
    if (!isMobileViewport()) {
      document.body.classList.remove('vii-view-list', 'vii-view-map');
      // ensure map renders on desktop after a resize from mobile
      if (!STATE.map) renderMap({ fit: true });
      setTimeout(() => { try { STATE.map?.invalidateSize?.(); } catch {} }, 120);
    } else {
      // entering mobile: apply stored view (or keep current)
      setMobileView(STATE.mobileView || 'list');
    }
  }, { passive: true });
}

  // Client-side geocoding for places missing coordinates (cached in localStorage)
  // This lets you add new places by address only, and the map will pin them automatically.
  const GEO_CACHE_KEY = 'vii_geocode_cache_v1';
  const GEO = {
    cache: loadGeoCache(),
    pending: new Set(),
    running: false
  };

  function loadGeoCache() {
    try {
      const raw = localStorage.getItem(GEO_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveGeoCache() {
    try {
      localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(GEO.cache || {}));
    } catch {
      // ignore (private mode / storage disabled)
    }
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function hasCoords(p) {
    return Number.isFinite(p.lat) && Number.isFinite(p.lng);
  }

  function applyCachedCoords(p) {
    if (hasCoords(p)) return;
    const cached = GEO.cache?.[p.id];
    if (cached && Number.isFinite(cached.lat) && Number.isFinite(cached.lng)) {
      p.lat = Number(cached.lat);
      p.lng = Number(cached.lng);
    }
  }

  function buildGeocodeQuery(p) {
    const addr = (p.address_he || p.address || '').trim();
    const city = (p.city_he || p.city || '').trim();
    // Keep it simple and robust for Hebrew/English inputs
    return [addr, city, 'ישראל'].filter(Boolean).join(', ');
  }

  async function geocodePlace(p) {
    if (!p || hasCoords(p)) return;
    if (GEO.pending.has(p.id)) return;
    GEO.pending.add(p.id);

    const q = buildGeocodeQuery(p);
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=il&accept-language=he&q=${encodeURIComponent(q)}`;

    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error('Geocode failed');
      const data = await res.json();
      const hit = Array.isArray(data) ? data[0] : null;
      const lat = hit ? Number(hit.lat) : NaN;
      const lng = hit ? Number(hit.lon) : NaN;

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        p.lat = lat;
        p.lng = lng;
        GEO.cache[p.id] = { lat, lng, ts: Date.now() };
        saveGeoCache();
      }
    } catch (e) {
      // silent fail — the list still works even without a pin
      console.warn('Geocode failed for', p?.id, q);
    } finally {
      GEO.pending.delete(p.id);
    }
  }

  async function geocodeMissing() {
    if (GEO.running) return;
    GEO.running = true;

    // First, apply cache to everything
    STATE.places.forEach(applyCachedCoords);

    // Then, geocode missing items slowly (polite to the free service)
    const missing = STATE.places.filter(p => !hasCoords(p));
    for (const p of missing) {
      await geocodePlace(p);
      // Re-render progressively so pins appear quickly
      renderMap({ fit: false });
      renderList();
      await sleep(350);
    }

    GEO.running = false;
  }

  function formatAddress(p) {
    return isHe() ? (p.address_he || p.address || '') : (p.address || p.address_he || '');
  }

  function formatName(p) {
    return isHe() ? (p.name_he || p.name || '') : (p.name || p.name_he || '');
  }

  function formatNotes(p) {
    return isHe() ? (p.notes_he || '') : (p.notes_en || p.notes_he || '');
  }

  function mapQueryLink(p) {
    const addr = encodeURIComponent(p.address || p.address_he || p.name || '');
    return `https://www.google.com/maps/search/?api=1&query=${addr}`;
  }

  function passesFilter(p) {
    const q = normalize(STATE.filter.q);
    const regionOk = (STATE.filter.region === 'all') || (normalize(p.region) === STATE.filter.region);
    const typeOk = (STATE.filter.type === 'all') || (p.type === STATE.filter.type);

    if (!regionOk || !typeOk) return false;
    if (!q) return true;

    const hay = [
      p.name, p.name_he, p.city, p.city_he, p.address, p.address_he,
      p.region, p.region_he, p.typeLabel_he, p.notes_he, p.notes_en
    ].filter(Boolean).map(normalize).join(' ');
    return hay.includes(q);
  }

  function pill(label) {
    return `<span class="pill">${label}</span>`;
  }

  function typeLabel(p) {
    if (isHe()) {
      return p.typeLabel_he || (p.type === 'shop' ? 'חנות' : 'מסעדה');
    }
    return p.typeLabel_en || (p.type === 'shop' ? 'Shop' : 'Restaurant');
  }

  function renderList() {
    const grid = $('#placesGrid');    const itemsAll = STATE.places.filter(passesFilter);
    // Meta
    const countEl = $('#placesCount');
    if (countEl) countEl.textContent = String(itemsAll.length);
    STATE.listPer = kbPerPage('places');
    if (!STATE.listPagerEl) STATE.listPagerEl = kbEnsurePager(grid, 'placesPager');
    kbRenderPager(STATE.listPagerEl, STATE.listPage, itemsAll.length, STATE.listPer, function(n){ STATE.listPage = n; renderList(); });
    const rangeEl = $('#placesRange');
    if (rangeEl) rangeEl.textContent = kbRangeText(STATE.listPage, itemsAll.length, STATE.listPer);
    const start = (STATE.listPage - 1) * STATE.listPer;
    const end = start + STATE.listPer;
    const items = (itemsAll.length > STATE.listPer) ? itemsAll.slice(start, end) : itemsAll;

    if (!itemsAll.length) {
      if (STATE.listPagerEl) { STATE.listPagerEl.innerHTML=''; STATE.listPagerEl.style.display='none'; }
      
      grid.innerHTML = `
        <div class="contentCard" style="grid-column:1/-1;">
          <h3 style="margin:0 0 .25rem;">${escapeHtml(t('noMatchTitle'))}</h3>
          <p style="margin:0;">${escapeHtml(t('noMatchText'))}</p>
        </div>`;
      return;
    }

    grid.innerHTML = items.map(p => {
      const name = formatName(p);
      const addr = formatAddress(p);
      const notes = formatNotes(p);
      const city = isHe() ? (p.city_he || p.city) : (p.city || p.city_he);
      const region = isHe() ? (p.region_he || p.region) : (p.region || p.region_he);

      const pills = [
        pill(typeLabel(p)),
        city ? pill(city) : '',
        region ? pill(region) : '',
      ].join('');

      const siteLink = p.website ? `<a class="btnSmall" href="${p.website}" target="_blank" rel="noopener">${escapeHtml(t('website'))}</a>` : '';
      const igLink = p.instagram ? `<a class="btnSmall" href="${p.instagram}" target="_blank" rel="noopener">${escapeHtml(t('instagram'))}</a>` : '';
      const mapsLink = `<a class="btnSmall" href="${mapQueryLink(p)}" target="_blank" rel="noopener">${escapeHtml(t('maps'))}</a>`;

      return `
        <article class="placeCard contentCard">
          <div class="placeCardTop">
            <h3 class="placeTitle">${escapeHtml(name)}</h3>
            <div class="pillRow">${pills}</div>
          </div>

          <p class="placeAddr">${escapeHtml(addr)}</p>
          ${notes ? `<p class="placeNotes">${escapeHtml(notes)}</p>` : ''}

          <div class="placeActions">
            ${mapsLink}
            ${siteLink}
            ${igLink}
            <button class="btnSmall btnGhost" data-focus="${p.id}">${escapeHtml(t('showOnMap'))}</button>
          </div>
        </article>`;
    }).join('');

    // attach handlers
    $$('#placesGrid [data-focus]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-focus');
        focusOn(id);
      });
    });
  }

  function clearMarkers() {
    STATE.markers.forEach(m => m.remove());
    STATE.markers = [];
  }

  function renderMap(opts = {}) {
    const mapEl = $('#veganMap');
    if (!mapEl) return;

    if (!STATE.map) {
      // Leaflet must exist
      if (!window.L) {
        mapEl.innerHTML = '<p style="margin:0;">המפה לא נטענה (Leaflet לא זמין).</p>';
        return;
      }
      STATE.map = L.map('veganMap', { scrollWheelZoom: false }).setView([31.7, 34.8], 7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(STATE.map);
    }

    clearMarkers();

    const items = STATE.places.filter(passesFilter).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    items.forEach(p => {
      const marker = L.marker([p.lat, p.lng]).addTo(STATE.map);
      marker.bindPopup(`
        <div style="min-width:180px;">
          <strong>${escapeHtml(formatName(p))}</strong><br/>
          <small>${escapeHtml(formatAddress(p))}</small><br/>
          <a href="${mapQueryLink(p)}" target="_blank" rel="noopener">${escapeHtml(t('openInMaps'))}</a>
        </div>
      `);
      marker.__placeId = p.id;
      STATE.markers.push(marker);
    });

    // Fit bounds only when filters change (or first render). Avoid overriding a focused view.
    const key = JSON.stringify([STATE.filter.q, STATE.filter.region, STATE.filter.type, items.length]);
    const wantFit = (opts.fit === true) || (opts.fit !== false && key !== STATE.fitKey);

    if (STATE.markers.length) {
      if (wantFit) {
        const group = new L.featureGroup(STATE.markers);
        STATE.map.fitBounds(group.getBounds().pad(0.2));
        STATE.fitKey = key;
      }
    } else {
      if (wantFit) {
        STATE.map.setView([31.7, 34.8], 7);
        STATE.fitKey = key;
      }
    }
  }

  async function focusOn(placeId) {
    const pid = String(placeId);
    const p = STATE.places.find(x => String(x.id) === pid);
    if (!p) return;

    // Mobile: switch to map view first so Leaflet gets the correct size
    if (isMobileViewport()) {
      setMobileView('map');
      await new Promise(r => setTimeout(r, 80));
    }

    if (!STATE.map) { renderMap({ fit: true }); }
    if (!STATE.map) return;

    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) {
      // Try to geocode on-demand if coordinates are missing
      await geocodePlace(p);
      if (shouldRenderMapNow()) renderMap({ fit: false });
    }
    if (!p || !STATE.map || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;

    try { STATE.map.invalidateSize?.(); } catch {}
    STATE.map.setView([p.lat, p.lng], 15, { animate: true });
    const m = STATE.markers.find(mm => String(mm.__placeId) === pid);
    if (m) m.openPopup();

    // Scroll the visible map into view
    const target = $('#veganMap') || $('#mapSection');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function wireFilters() {
    const q = $('#searchInput');
    const region = $('#regionSelect');
    const type = $('#typeSelect');
    const reset = $('#resetFilters');
    const loadCoords = $('#btnLoadCoords');

    if (q) q.addEventListener('input', () => {
      STATE.filter.q = q.value || '';
      STATE.listPage = 1;
      if (shouldRenderMapNow()) renderMap(); // auto-fit when filter changes
      renderList();
    });

    if (region) region.addEventListener('change', () => {
      STATE.filter.region = region.value;
      STATE.listPage = 1;
      if (shouldRenderMapNow()) renderMap();
      renderList();
    });

    if (type) type.addEventListener('change', () => {
      STATE.filter.type = type.value;
      STATE.listPage = 1;
      if (shouldRenderMapNow()) renderMap();
      renderList();
    });

    if (reset) reset.addEventListener('click', () => {
      STATE.filter = { q: '', region: 'all', type: 'all' };
      if (q) q.value = '';
      if (region) region.value = 'all';
      if (type) type.value = 'all';
      STATE.listPage = 1;
      if (shouldRenderMapNow()) {
        renderMap({ fit: true });
      } else {
        STATE.fitKey = null;
      }
      renderList();
    });

    if (loadCoords) {
      loadCoords.addEventListener('click', async () => {
        if (GEO.running) return;
        const prev = loadCoords.textContent;
        loadCoords.disabled = true;
        loadCoords.textContent = t('loading');
        try {
          await geocodeMissing(); // progressive render inside
        } finally {
          loadCoords.textContent = prev;
          loadCoords.disabled = false;
        }
      });
    }
  }

  async function load() {
    try {
      ensureDirByLang();
      const res = await fetch(DATA_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('Bad response');
      const json = await res.json();
      STATE.places = (json.places || []).map(p => ({
        ...p,
        lat: (p.lat === null || p.lat === undefined) ? null : Number(p.lat),
        lng: (p.lng === null || p.lng === undefined) ? null : Number(p.lng),
      }));
      // Apply cached coordinates (if any)
      STATE.places.forEach(applyCachedCoords);
      const stamp = $('#dataStamp');
      if (stamp && json.updatedAt) stamp.textContent = json.updatedAt;
    } catch (e) {
      console.warn('Vegan in Israel: failed to load data/vegan-in-israel.json', e);
      STATE.places = [];
    }

    // Regions dropdown options based on data
    const region = $('#regionSelect');
    const regions = Array.from(new Set(STATE.places.map(p => normalize(p.region)).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));

    function regionLabelKey(key) {
      const k = String(key || '').toLowerCase();
      if (isHe()) {
        switch (k) {
          case 'jerusalem': return 'ירושלים';
          case 'center': return 'מרכז';
          case 'south': return 'דרום';
          case 'north': return 'צפון';
          case 'online': return 'אונליין';
          default: return key || '';
        }
      }
      // English labels
      switch (k) {
        case 'jerusalem': return 'Jerusalem';
        case 'center': return 'Center';
        case 'south': return 'South';
        case 'north': return 'North';
        case 'online': return 'Online';
        default: return (k ? (k.charAt(0).toUpperCase() + k.slice(1)) : '');
      }
    }

    if (region) {
      region.innerHTML = [
        `<option value="all">${escapeHtml(t('allIsrael'))}</option>`,
        ...regions.map(r => `<option value="${r}">${escapeHtml(regionLabelKey(r))}</option>`)
      ].join('');
    }

    // Initial view (mobile): list-first with a toggle to map
    STATE.mobileView = getStoredView() || 'list';
    setMobileView(STATE.mobileView);

    renderList();
    wireFilters();
    wireViewToggle();

    if (shouldRenderMapNow() && !STATE.map) renderMap({ fit: true });

    // Re-render dynamic content when language changes (e.g. Weglot switch)
    let __lastLang = getLang();
    const __langObserver = new MutationObserver(() => {
      const now = getLang();
      if (now === __lastLang) return;
      __lastLang = now;
      ensureDirByLang();

      // Rebuild region dropdown labels
      if (region) {
        region.innerHTML = [
          `<option value="all">${escapeHtml(t('allIsrael'))}</option>`,
          ...regions.map(r => `<option value="${r}">${escapeHtml(regionLabelKey(r))}</option>`)
        ].join('');
        region.value = STATE.filter.region || 'all';
      }

      renderList();
      if (shouldRenderMapNow()) renderMap({ fit: true });
    });
    __langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
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
      + '<button class="btnSmall btnGhost" type="button" ' + (prevDisabled ? 'disabled aria-disabled="true"' : '') + ' data-kbprev>' + escapeHtml(t('prev')) + '</button>'
      + '<span class="kbPagerInfo">' + escapeHtml(t('page')) + ' ' + page + ' ' + escapeHtml(t('of')) + ' ' + totalPages + '</span>'
      + '<button class="btnSmall btnGhost" type="button" ' + (nextDisabled ? 'disabled aria-disabled="true"' : '') + ' data-kbnext>' + escapeHtml(t('next')) + '</button>';

    var prevBtn = pagerEl.querySelector('[data-kbprev]');
    var nextBtn = pagerEl.querySelector('[data-kbnext]');
    if(prevBtn) prevBtn.onclick = function(){ if(page>1) onPage(page-1); };
    if(nextBtn) nextBtn.onclick = function(){ if(page<totalPages) onPage(page+1); };
  }

  function kbRangeText(page, totalItems, perPage){
    if(!totalItems) return t('noResults');
    var start = (page-1)*perPage + 1;
    var end = Math.min(totalItems, page*perPage);
    return t('showing') + ' ' + start + '–' + end + ' ' + t('of') + ' ' + totalItems;
  }



  document.addEventListener('DOMContentLoaded', load);
})();
