/* Pharmacy page (2026-02-04-v16) */
(function(){
  const state = { q: '', store: 'all' };
  function $(sel, root=document){ return root.querySelector(sel); }
  function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
  function normalize(s){ return String(s||'').trim().toLowerCase(); }

  function storeLabel(id){
    if(id==='superpharm') return 'סופר-פארם';
    if(id==='be') return 'Be';
    if(id==='goodpharm') return 'Good Pharm';
    if(id==='shufersal') return 'שופרסל';
    return id;
  }

  function itemMatches(item){
    const q = normalize(state.q);
    if(q){
      const hay = normalize([item.name,item.brand,item.category,(item.tags||[]).join(' '),(item.notes||'')].join(' '));
      if(!hay.includes(q)) return false;
    }
    if(state.store==='all') return true;
    return (item.stores||[]).includes(state.store);
  }

  function brandMatches(b){
    const q = normalize(state.q);
    if(q){
      const hay = normalize([b.name,b.nameHe,(b.categories||[]).join(' '),(b.notes||''),(b.veganNotes||'')].join(' '));
      if(!hay.includes(q)) return false;
    }
    if(state.store==='all') return true;
    const stores = b.stores || Object.keys(b.storePages||{});
    return stores.includes(state.store);
  }

  function badgeHTML(t, cls){ return `<span class="pill ${cls||''}">${t}</span>`; }

  function cardHTML(item){
    const tags = (item.tags||[]).slice(0,3).map(t=>badgeHTML(t,'pill--soft')).join('');
    const stores = (item.stores||[]).map(s=>badgeHTML(storeLabel(s),'pill--muted')).join('');
    const brand = item.brand && item.brand !== '(הוסיפי מותג)' ? `<div class="muted">מותג: <b>${item.brand}</b></div>` : '';
    const notes = item.notes ? `<div class="muted" style="margin-top:6px;">${item.notes}</div>` : '';
    const link = item.link ? `<a class="btn ghost" href="${item.link}">חיפוש במאגר</a>` : '';
    return `
      <article class="phCard">
        <div class="phTop">
          <div>
            <h3 class="phTitle">${item.name}</h3>
            ${brand}
            <div class="phBadges">${tags}</div>
            <div class="phStores">${stores}</div>
            ${notes}
          </div>
        </div>
        <div class="phActions">
          ${link}
          <a class="btn ghost" href="ingredient-detective.html">בדיקת רכיבים</a>
        </div>
      </article>
    `;
  }

  function brandCardHTML(b){
    const cats = (b.categories||[]).slice(0,4).map(t=>badgeHTML(t,'pill--soft')).join('');
    const stores = (b.stores||Object.keys(b.storePages||{})).map(s=>badgeHTML(storeLabel(s),'pill--muted')).join('');

    const cf = b.crueltyFree ? badgeHTML('ללא ניסויים בבעלי חיים','pill--soft') : '';
    let veganPill = '';
    if(b.vegan===true) veganPill = badgeHTML('טבעוני','pill--soft');
    else if(b.vegan==='mostly') veganPill = badgeHTML('כמעט טבעוני','pill--soft');
    else if(b.vegan==='claimed') veganPill = badgeHTML('טבעוני (לפי המותג)','pill--soft');

    const notes = (b.veganNotes || b.notes) ? `<div class="muted" style="margin-top:6px;">${b.veganNotes || b.notes}</div>` : '';
    const storeBtns = Object.entries(b.storePages||{}).map(([id,url])=>(
      `<a class="btn ghost" href="${url}" target="_blank" rel="noopener">למותג ב‑${storeLabel(id)}</a>`
    )).join('');
    const siteBtn = b.website ? `<a class="btn ghost" href="${b.website}" target="_blank" rel="noopener">אתר רשמי</a>` : '';

    return `
      <article class="phCard">
        <div class="phTop">
          <div>
            <h3 class="phTitle">${b.nameHe || b.name}</h3>
            <div class="phBadges">${cf}${veganPill}${cats}</div>
            <div class="phStores">${stores}</div>
            ${notes}
          </div>
        </div>
        <div class="phActions">
          ${storeBtns}
          ${siteBtn}
        </div>
      </article>
    `;
  }

  function ensureBrandSection(){
    const list = $('#phList'); if(!list) return null;
    let wrap = $('#phBrandsWrap');
    if(!wrap){
      list.insertAdjacentHTML('beforebegin', `
        <section id="phBrandsWrap" class="contentCard" style="margin-bottom:16px;">
          <div class="phBrandHead" style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <h2 style="margin:0;font-size:1.05rem;">מותגים בולטים</h2>
            <div id="phBrandsCount" class="muted" style="margin:0;"></div>
          </div>
          <div id="phBrands" style="margin-top:12px;"></div>
        </section>
      `);
      wrap = $('#phBrandsWrap');
    }
    return { mount: $('#phBrands'), count: $('#phBrandsCount') };
  }

  function renderItems(items){
    const mount = $('#phList'); if(!mount) return;
    const filtered = (items||[]).filter(itemMatches);
    if($('#phCount')) $('#phCount').textContent = filtered.length ? `${filtered.length} תוצאות` : 'אין תוצאות';
    mount.innerHTML = filtered.map(cardHTML).join('') || `<div class="contentCard"><p class="muted" style="margin:0;">לא מצאנו התאמות. נסי מילה אחרת או החליפי רשת.</p></div>`;
  }

  function renderBrands(brands){
    const ui = ensureBrandSection(); if(!ui) return;
    const filtered = (brands||[]).filter(brandMatches);
    if(ui.count) ui.count.textContent = filtered.length ? `${filtered.length} מותגים` : 'אין מותגים';
    ui.mount.innerHTML = filtered.map(brandCardHTML).join('') || `<p class="muted" style="margin:0;">אין מותגים להצגה לפי הסינון הנוכחי.</p>`;
  }

  function renderAll(data){
    renderBrands(data.brands||[]);
    renderItems(data.items||[]);
  }

  function setActiveStoreButtons(){
    $all('[data-store]').forEach(btn=>{
      const on = btn.getAttribute('data-store')===state.store;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  async function init(){
    try{
      const url = new URL('data/pharmacy.json', location.href);
      const v = String(window.KBWG_BUILD || '2026-02-04-v16') + '-' + Date.now();
      url.searchParams.set('v', v);

      const res = await fetch(url.toString(), { cache: 'no-store' });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const lu = data.updated ? new Date(data.updated).toLocaleDateString('he-IL', {year:'numeric',month:'2-digit',day:'2-digit'}) : '';
      if($('#phUpdated') && lu) $('#phUpdated').textContent = `עודכן לאחרונה: ${lu}`;

      const storeRow = $('#storeRow');
      if(storeRow){
        if(!storeRow.querySelector('[data-store="all"]')){
          storeRow.insertAdjacentHTML('beforeend', `<button class="pillBtn is-active" type="button" data-store="all" aria-pressed="true">הכל</button>`);
        }

        // Primary stores from JSON
        const seen = new Set(['all']);
        (data.stores||[]).forEach(s=>{
          if(seen.has(s.id)) return;
          seen.add(s.id);
          storeRow.insertAdjacentHTML('beforeend', `<button class="pillBtn" type="button" data-store="${s.id}" aria-pressed="false">${s.name || storeLabel(s.id)}</button>`);
        });

        // Extra stores mentioned by brand pages (e.g., shufersal)
        (data.brands||[]).forEach(b=>{
          Object.keys(b.storePages||{}).forEach(id=>{
            if(seen.has(id)) return;
            seen.add(id);
            storeRow.insertAdjacentHTML('beforeend', `<button class="pillBtn" type="button" data-store="${id}" aria-pressed="false">${storeLabel(id)}</button>`);
          });
        });

        storeRow.addEventListener('click', (e)=>{
          const b = e.target.closest('[data-store]'); if(!b) return;
          state.store = b.getAttribute('data-store');
          setActiveStoreButtons();
          renderAll(data);
        });
      }

      const q = $('#phSearch');
      if(q){
        q.addEventListener('input', ()=>{ state.q = q.value; renderAll(data); });
      }

      try{
        const faqScript = document.getElementById('kbwgFaqData');
        if(faqScript && !faqScript.textContent.trim()){
          faqScript.textContent = JSON.stringify(data.faqs||[]);
        }
      }catch(_ ){}

      renderAll(data);
    }catch(err){
      const mount = $('#phList');
      if(mount){
        mount.innerHTML = `<div class="contentCard"><p class="muted" style="margin:0;">שגיאה בטעינת הנתונים. נסי לרענן.</p></div>`;
      }
      console.error('[pharmacy] load failed', err);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
