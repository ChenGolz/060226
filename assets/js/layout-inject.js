// Build: 2026-02-04-v20
// Shared layout injector (header + footer) for KBWG static pages
// Loads partials/header.html into #siteHeaderMount and partials/footer.html into #siteFooterMount
(function () {

const KBWG_LAYOUT_BUILD = '2026-02-04-v20';
const KBWG_HEADER_KEY = 'kbwg_header_' + KBWG_LAYOUT_BUILD;
const KBWG_FOOTER_KEY = 'kbwg_footer_' + KBWG_LAYOUT_BUILD;

// Keep the menu/footer fresh (users were seeing old cached partials).
// Remove any cached header/footer partials from older builds.
try {
  const keys = Object.keys(sessionStorage || {});
  keys.forEach(k => {
    if (!k.startsWith('kbwg:partial:')) return;
    const isLayoutPartial = (k.includes('partials/header.html') || k.includes('partials/footer.html'));
    const isCurrentBuild = k.includes('v=' + KBWG_LAYOUT_BUILD);
    if (isLayoutPartial && !isCurrentBuild) sessionStorage.removeItem(k);
  });
} catch (e) {}
const scriptEl = document.currentScript;
  const base = (scriptEl && scriptEl.dataset && scriptEl.dataset.base) ? scriptEl.dataset.base : '';
  const HEADER_URL = base + 'partials/header.html?v=' + KBWG_LAYOUT_BUILD;
  const FOOTER_URL = base + 'partials/footer.html?v=' + KBWG_LAYOUT_BUILD;

  function cacheKey(url){ return 'kbwg:partial:' + url; }

  async function inject(url, mountSelector) {
  const mount = document.querySelector(mountSelector);
  if (!mount) return false;

  const key = cacheKey(url);

  // 1) Paint from session cache immediately (fast navigation)
  let paintedFromCache = false;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      mount.innerHTML = cached;
      paintedFromCache = true;
    }
  } catch (e) {}

  // 2) Always try to fetch the latest (avoid 'stuck' header/footer)
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();

    // Update only if different (prevents flicker)
    if (!paintedFromCache || mount.innerHTML !== html) {
      mount.innerHTML = html;
    }
    try { sessionStorage.setItem(key, html); } catch (e) {}
    return true;
  } catch (e) {
    return paintedFromCache;
  }
}

  function fireReady() {
    try { window.dispatchEvent(new CustomEvent('kbwg:layout-ready')); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('kbwg:content-rendered')); } catch (e) {}
    try { if (window.Weglot && typeof Weglot.refresh === 'function') Weglot.refresh(); } catch (e) {}
  }

  Promise.all([
    inject(HEADER_URL, '#siteHeaderMount'),
    inject(FOOTER_URL, '#siteFooterMount')
  ]).then(fireReady);
})();
