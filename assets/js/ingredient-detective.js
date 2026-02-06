/* KBWG Ingredient Detective — JSON-backed (v30)
   Loads ingredients from assets/data/ingredient-db.json and matches by keys.
*/
(function () {
  'use strict';

  const BUILD = '2026-02-05-v25';
  console.log('[KBWG] Ingredient Detective build', BUILD);

  function siteBaseFromScript(){
    try{
      var src = '';
      try { src = (document.currentScript && document.currentScript.src) ? String(document.currentScript.src) : ''; } catch(e){ src=''; }
      if(!src){
        var scripts = document.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i--) {
          var ssrc = scripts[i] && scripts[i].src ? String(scripts[i].src) : '';
          if (ssrc.indexOf('ingredient-detective.js') !== -1) { src = ssrc; break; }
        }
      }
      if(!src) return '/';
      var u = new URL(src, location.href);
      var p = u.pathname || '/';
      var idx = p.indexOf('/assets/js/');
      var base = idx >= 0 ? p.slice(0, idx) : p.replace(/\/[^\/]+$/, '');
      base = base.replace(/\/+$/, '');
      var parts = base.split('/').filter(Boolean);
      var langs = { en: 1, he: 1, iw: 1, ar: 1, fr: 1, es: 1, de: 1, ru: 1 };
      if (parts.length && langs[parts[parts.length - 1]]) parts.pop();
      return '/' + parts.join('/');
    } catch(e){ return '/'; }
  }
  function resolveFromBase(rel){
    try{
      if(!rel) return rel;
      var p = String(rel).replace(/^\.\//,'');
      if (/^https?:\/\//i.test(p)) return p;
      var base = siteBaseFromScript() || '/';
      if (base === '/') return '/' + p.replace(/^\//,'');
      return base + '/' + p.replace(/^\//,'');
    } catch(e){ return rel; }
  }
function addParam(u, k, v){
  u = String(u || '');
  if (!u) return u;
  var sep = u.indexOf('?') >= 0 ? '&' : '?';
  return u + sep + k + '=' + encodeURIComponent(v);
}
const DB_URL = addParam(resolveFromBase('data/ingredient-db.json'), 'v', BUILD);



  // ----- utils
  const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

  function normalize(s) {
    return (s || '')
      .toString()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')     // diacritics
      .replace(/[’'"`]/g, '')             // quotes
      .replace(/\u200f/g, ' ')            // RTL marks
      .replace(/\s+/g, ' ')
      .trim();
  }

  function splitIngredients(raw) {
    if (!raw) return [];
    return uniq(
      raw
        .replace(/[\(\)\[\]\{\}]/g, ' ')
        .split(/[,;\n\r\/\|]+/g)
        .map((x) => x.trim())
        .filter(Boolean)
    );
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ----- db
  let DB = [];
  let DB_READY = false;

  function indexDb(list) {
    const out = [];
    (list || []).forEach((e) => {
      if (!e || !e.name || !Array.isArray(e.keys) || !e.status) return;
      const keysNorm = uniq(e.keys.map(normalize)).filter(Boolean);
      out.push({
        name: e.name,
        he: e.he || '',
        keys: e.keys,
        status: e.status,
        why: e.why || '',
        _name: normalize(e.name),
        _he: normalize(e.he || ''),
        _keys: keysNorm
      });
    });
    return out;
  }

  async function loadDb() {
    try {
      const res = await fetch(DB_URL, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list = Array.isArray(json) ? json : (json.ingredients || []);
      DB = indexDb(list);
      DB_READY = true;
      console.log('[KBWG] ingredient DB loaded:', DB.length);
    } catch (e) {
      DB = [];
      DB_READY = false;
      console.warn('[KBWG] ingredient DB load failed:', e);
    }
  }

  // ----- matching
  function matchOne(token) {
    const t = normalize(token);
    if (!t || !DB_READY) return null;

    let best = null;
    let bestScore = 0;

    for (const entry of DB) {
      for (const k of entry._keys) {
        if (!k) continue;

        let ok = false;
        // very short keys must match exactly (avoid accidental matches like "mel", "cera")
        if (k.length < 5) ok = (t === k);
        else ok = t.includes(k) || k.includes(t);

        if (!ok) continue;

        const score = Math.min(k.length, t.length);
        if (score > bestScore) {
          bestScore = score;
          best = entry;
        }
      }
    }
    return best;
  }

  function searchDb(query) {
    const q = normalize(query);
    if (!q || !DB_READY) return [];
    const results = [];
    for (const entry of DB) {
      if (entry._name.includes(q) || entry._he.includes(q) || entry._keys.some((k) => k.includes(q))) {
        results.push(entry);
      }
    }
    return results.slice(0, 12);
  }

  function statusChip(status) {
    // Keep the UI simple — status is already Hebrew
    return `<span class="small" style="font-weight:800;opacity:.85">${escapeHtml(status)}</span>`;
  }

  function cardHTML(entry) {
    return `
      <div class="resultCard">
        <h3 style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin:0 0 6px">
          <span>${escapeHtml(entry.name)}</span>
          ${entry.he ? `<span class="small" style="opacity:.85">${escapeHtml(entry.he)}</span>` : ''}
        </h3>
        <div class="small" style="margin:0 0 6px">${statusChip(entry.status)}</div>
        ${entry.why ? `<p style="margin:0;color:#334155">${escapeHtml(entry.why)}</p>` : ''}
      </div>
    `;
  }

  function noteBoxHTML(html) {
    return `<div class="noteBox">${html}</div>`;
  }

  // ----- UI
  function initUI() {
    const qInput = document.getElementById('qIng');
    const sugs = document.getElementById('sugs');
    const out = document.getElementById('out');
    const hint = document.getElementById('hint');

    const togglePaste = document.getElementById('togglePaste');
    const pasteBlock = document.getElementById('pasteBlock');
    const pasteIng = document.getElementById('pasteIng');
    const runPaste = document.getElementById('runPaste');

    if (!qInput || !sugs || !out) return;

    const clearSugs = () => { sugs.innerHTML = ''; };

    const showSugs = (items) => {
      if (!items.length) { clearSugs(); return; }
      sugs.innerHTML = items.map((e, i) => `
        <button type="button" class="sugBtn" data-i="${i}" title="${escapeHtml(e.name)}">
          ${escapeHtml(e.name)} ${e.he ? `· ${escapeHtml(e.he)}` : ''}
        </button>
      `).join('');

      sugs.querySelectorAll('button.sugBtn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-i'));
          const entry = items[idx];
          if (!entry) return;
          qInput.value = entry.name;
          clearSugs();
          if (hint) hint.textContent = '';
          out.innerHTML = cardHTML(entry);
        });
      });
    };

    qInput.addEventListener('input', () => {
      const q = (qInput.value || '').trim();
      if (!DB_READY) {
        out.innerHTML = noteBoxHTML('המאגר עדיין נטען… נסי שוב עוד רגע.');
        clearSugs();
        return;
      }
      if (q.length < 2) {
        clearSugs();
        if (hint) hint.textContent = '';
        return;
      }
      const items = searchDb(q);
      showSugs(items);
      if (hint) hint.textContent = items.length ? `נמצאו ${items.length} הצעות` : 'לא נמצאו הצעות';
    });

    document.addEventListener('click', (e) => {
      if (e.target !== qInput && !sugs.contains(e.target)) clearSugs();
    });

    // Paste mode
    if (togglePaste && pasteBlock) {
      pasteBlock.style.display = 'none';
      togglePaste.addEventListener('click', () => {
        const isHidden = pasteBlock.style.display === 'none';
        pasteBlock.style.display = isHidden ? '' : 'none';
        togglePaste.textContent = isHidden ? 'הסתר' : 'הדבק רשימת רכיבים (INCI)';
      });
    }

    if (runPaste && pasteIng) {
      runPaste.addEventListener('click', () => {
        if (!DB_READY) {
          out.innerHTML = noteBoxHTML('המאגר עדיין נטען… נסי שוב עוד רגע.');
          return;
        }

        const tokens = splitIngredients(pasteIng.value);
        if (!tokens.length) {
          out.innerHTML = noteBoxHTML('לא זוהו רכיבים בטקסט שהדבקת.');
          return;
        }

        const found = [];
        const unknown = [];
        const seen = new Set();

        tokens.forEach((t) => {
          const m = matchOne(t);
          if (m) {
            if (!seen.has(m.name)) {
              found.push(m);
              seen.add(m.name);
            }
          } else {
            unknown.push(t);
          }
        });

        const order = { 'רכיב מן החי': 0, 'תלוי מקור': 1, 'טבעוני': 2 };
        found.sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99) || a.name.localeCompare(b.name));

        const cards = found.length
          ? `<div class="resultGrid">${found.map(cardHTML).join('')}</div>`
          : noteBoxHTML('לא נמצאו התאמות במאגר.');

        const unknownBox = unknown.length
          ? noteBoxHTML(`<details><summary>לא נמצאו במאגר (${unknown.length})</summary><div class="small" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px">${unknown.map((x)=>`<span style="background:rgba(15,23,42,.06);border-radius:999px;padding:6px 10px">${escapeHtml(x)}</span>`).join('')}</div></details>`)
          : '';

        out.innerHTML = cards + unknownBox;
      });
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await loadDb();
    initUI();
  });
})();
