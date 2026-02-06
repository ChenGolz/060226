


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

(function () {
  // --- Helpers ---
  function safeText(v) { return (v == null) ? '' : String(v); }
  function esc(s) {
    return safeText(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function isFileProtocol() { try { return location && location.protocol === 'file:'; } catch (e) { return false; } }
  function nowISO() { try { return new Date().toISOString(); } catch (e) { return '' + Date.now(); } }
  function toLower(s) { return safeText(s).toLowerCase(); }
  function uniqId() { return 'p' + Math.random().toString(16).slice(2) + Date.now().toString(16); }

  // --- Optional: Public UGC backend hookup (recommended for “real” community pages)
  // If you later create an endpoint that accepts JSON {id,type,name,location,caption,imageDataUrl,createdAt},
  // put its URL here. Example: '/api/wall-submit' or a Netlify Function URL.
  // When set, we POST in the background after local save.
  var SUBMISSION_ENDPOINT = ''; // e.g. 'https://your-site.netlify.app/.netlify/functions/wall-submit'

  // --- Storage keys ---
  var LS_POSTS = 'kb_wall_posts_v1';
  var LS_LIKES = 'kb_wall_likes_v1';

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // --- Seed (shown only if user has no local posts yet) ---
  var SEED = [
    {
      id: 'seed-1',
      type: 'haul',
      name: '@example',
      location: 'Tel Aviv, IL',
      caption: 'דוגמה לפוסט 🛍️\nהחליפי עם פוסטים אמיתיים דרך הטופס.',
      imageDataUrl: 'assets/img/photos/hero-top.jpg',
      createdAt: '2026-01-01T10:00:00.000Z',
      likes: 2
    },
    {
      id: 'seed-2',
      type: 'pet',
      name: '@example',
      location: '—',
      caption: 'דוגמה לפוסט 🐾\nתעלי תמונה של החבר/ה החדש/ה 💛',
      imageDataUrl: 'assets/img/photos/dogs-cuddle.jpg',
      createdAt: '2026-01-02T10:00:00.000Z',
      likes: 5
    }
  ];

  // --- UI refs ---
  var el = {};
  var state = {
    page: 1,
    per: 0,
    pagerEl: null,

    tab: 'all',
    search: '',
    sort: 'new',
    posts: [],
    likes: {}
  };

  function typeLabel(t) {
    return t === 'pet' ? 'Rescue' : 'Haul';
  }

  function typePillClass(t) {
    return t === 'pet' ? 'postType typePet' : 'postType typeHaul';
  }

  function formatDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      // local-ish short
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
    } catch (e) { return ''; }
  }

  function currentURLForPost(id) {
    try {
      var base = (location && location.href) ? String(location.href) : '';
      base = base.split('#')[0];
      base = base.replace(/[?].*$/, '');
      return base + '?post=' + encodeURIComponent(id);
    } catch (e) {
      return '?post=' + encodeURIComponent(id);
    }
  }

  function postHTML(p) {
    var liked = !!state.likes[p.id];
    var media = '';
    if (p.imageDataUrl) {
      media = '<img alt="" loading="lazy" decoding="async" src="' + esc(p.imageDataUrl) + '"/>';
    } else {
      media = '<div class="emoji" aria-hidden="true">💛</div>';
    }

    var name = safeText(p.name).trim();
    var loc = safeText(p.location).trim();
    var subtitle = [];
    if (name) subtitle.push(name);
    if (loc) subtitle.push(loc);
    var created = formatDate(p.createdAt);

    return (
      '<article class="post" id="post-' + esc(p.id) + '" data-id="' + esc(p.id) + '">' +
        '<div class="postMedia">' + media + '</div>' +
        '<div class="postBody">' +
          '<div class="postMeta">' +
            '<div>' +
              '<div class="postName">' + esc(name || 'חבר/ת קהילה') + '</div>' +
              '<div class="postSub">' + esc(subtitle.join(' · ') || '') + (created ? (' · ' + esc(created)) : '') + '</div>' +
            '</div>' +
            '<div class="' + esc(typePillClass(p.type)) + '">' + esc(typeLabel(p.type)) + '</div>' +
          '</div>' +
          '<div class="postText">' + esc(safeText(p.caption)) + '</div>' +
          '<div class="postActions">' +
            '<button class="postBtn" type="button" data-like aria-pressed="' + (liked ? 'true' : 'false') + '">💗 ' + esc(String(p.likes || 0)) + '</button>' +
            '<button class="postBtn postBtnLink" type="button" data-share>שיתוף</button>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function matchesFilters(p) {
    if (state.tab !== 'all' && p.type !== state.tab) return false;

    var q = toLower(state.search).trim();
    if (q) {
      var hay = toLower([p.caption, p.name, p.location, p.type].join(' '));
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function sortPosts(list) {
    var out = list.slice();
    if (state.sort === 'top') {
      out.sort(function (a, b) {
        var al = (a.likes || 0), bl = (b.likes || 0);
        if (bl !== al) return bl - al;
        // tie: newest first
        return (safeText(b.createdAt) > safeText(a.createdAt)) ? 1 : -1;
      });
    } else {
      out.sort(function (a, b) {
        return (safeText(b.createdAt) > safeText(a.createdAt)) ? 1 : -1;
      });
    }
    return out;
  }

  function render() {
    var list = [];
    for (var i = 0; i < state.posts.length; i++) {
      if (matchesFilters(state.posts[i])) list.push(state.posts[i]);
    }
    list = sortPosts(list);

    state.per = kbPerPage('posts');
    if (el.postsGrid && !state.pagerEl) state.pagerEl = kbEnsurePager(el.postsGrid, 'wokPager');

    // Deep-link: ensure the requested post is on the current page
    var deepId = '';
    try {
      var mm = location.search.match(/[?&]post=([^&]+)/);
      deepId = mm ? decodeURIComponent(mm[1] || '') : '';
    } catch(e) { deepId = ''; }
    if (deepId) {
      for (var di = 0; di < list.length; di++) {
        if (String(list[di].id || '') === deepId) {
          state.page = Math.floor(di / state.per) + 1;
          break;
        }
      }
    }

    kbRenderPager(state.pagerEl, state.page, list.length, state.per, function(n){ state.page=n; render(); });

    var start = (state.page - 1) * state.per;
    var end = start + state.per;
    var pageList = (list.length > state.per) ? list.slice(start, end) : list;

    if (el.postsGrid) {
      if (!list.length) {
        el.postsGrid.innerHTML = '<div class="muted" style="grid-column:1/-1; padding: 12px 4px">אין פוסטים לפי הסינון. נסי לחפש אחרת או לפרסם פוסט חדש 💛</div>';
      } else {
        var html = '';
        for (var j = 0; j < pageList.length; j++) html += postHTML(pageList[j]);
        el.postsGrid.innerHTML = html;
      }
    }

    if (el.feedCount) {
      el.feedCount.textContent = list.length ? kbRangeText(state.page, list.length, state.per) : 'אין תוצאות';
    }

    // Let Weglot refresh (optional)
    try { window.dispatchEvent(new Event('kbwg:content-rendered')); } catch (e) {}

    // focus deep-link if present
    focusFromQuery();
  }

  function setTab(tab) {
    state.tab = tab;
    state.page = 1;
    setTabSelected('tabAll', tab === 'all');
    setTabSelected('tabHaul', tab === 'haul');
    setTabSelected('tabPet', tab === 'pet');
    render();
  }

  function setTabSelected(id, yes) {
    var b = document.getElementById(id);
    if (!b) return;
    b.setAttribute('aria-selected', yes ? 'true' : 'false');
  }

  function savePosts() {
    saveJSON(LS_POSTS, state.posts);
  }

  function loadPosts() {
    var posts = loadJSON(LS_POSTS, null);
    if (!Array.isArray(posts) || !posts.length) posts = SEED.slice();
    // normalize
    var out = [];
    for (var i = 0; i < posts.length; i++) {
      var p = posts[i] || {};
      out.push({
        id: safeText(p.id || uniqId()),
        type: (p.type === 'pet') ? 'pet' : 'haul',
        name: safeText(p.name || ''),
        location: safeText(p.location || ''),
        caption: safeText(p.caption || ''),
        imageDataUrl: safeText(p.imageDataUrl || ''),
        createdAt: safeText(p.createdAt || nowISO()),
        likes: (typeof p.likes === 'number' && isFinite(p.likes)) ? p.likes : 0
      });
    }
    state.posts = out;
  }

  function loadLikes() {
    var likes = loadJSON(LS_LIKES, {});
    if (!likes || typeof likes !== 'object') likes = {};
    state.likes = likes;
  }

  function saveLikes() {
    saveJSON(LS_LIKES, state.likes);
  }

  function toggleLike(postId) {
    var liked = !!state.likes[postId];
    state.likes[postId] = !liked;
    saveLikes();

    for (var i = 0; i < state.posts.length; i++) {
      if (state.posts[i].id === postId) {
        state.posts[i].likes = Math.max(0, (state.posts[i].likes || 0) + (liked ? -1 : 1));
        break;
      }
    }
    savePosts();
    render();
  }

  function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
    } catch (e) {}
    // fallback
    return new Promise(function (resolve) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      resolve();
    });
  }

  function sharePost(postId) {
    var url = currentURLForPost(postId);
    try {
      if (navigator.share) {
        navigator.share({ title: 'Wall of Kindness', url: url });
        return;
      }
    } catch (e) {}
    copyToClipboard(url).then(function () {
      setFormMsg('הקישור הועתק ללוח. שתפי באהבה 💛', 'ok');
    });
  }

  function setFormMsg(text, kind) {
    if (!el.formMsg) return;
    el.formMsg.className = 'kbSmall ' + (kind === 'err' ? 'kbError' : (kind === 'ok' ? 'kbOk' : ''));
    el.formMsg.textContent = text || '';
  }

  // --- Image resize/compress to keep localStorage reasonable ---
  function readAndCompressImage(file, cb) {
    if (!file) return cb(null, 'לא נבחרה תמונה.');
    if (!/^image\//i.test(file.type || '')) return cb(null, 'נא לבחור קובץ תמונה.');
    var maxBytes = 6 * 1024 * 1024; // 6MB input limit
    if (file.size > maxBytes) return cb(null, 'הקובץ גדול מדי (עד ~6MB).');

    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        // scale down to max 1200px
        var maxDim = 1200;
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (!w || !h) return cb(reader.result, null);

        var scale = Math.min(1, maxDim / Math.max(w, h));
        var tw = Math.round(w * scale);
        var th = Math.round(h * scale);

        var canvas = document.createElement('canvas');
        canvas.width = tw; canvas.height = th;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, tw, th);

        // export as jpeg for size (unless transparent png is needed)
        var quality = 0.82;
        var out = '';
        try { out = canvas.toDataURL('image/jpeg', quality); } catch (e) { out = reader.result; }

        // if still huge, lower quality a bit
        if (out && out.length > 850000) { // ~0.85MB in base64-ish
          try { out = canvas.toDataURL('image/jpeg', 0.72); } catch (e2) {}
        }
        cb(out, null);
      };
      img.onerror = function () { cb(reader.result, null); };
      img.src = reader.result;
    };
    reader.onerror = function () { cb(null, 'לא הצלחנו לקרוא את הקובץ.'); };
    reader.readAsDataURL(file);
  }

  function updatePreviewFromFile(file) {
    if (!el.photoPreview || !el.photoPreviewImg) return;
    if (!file) {
      el.photoPreview.style.display = 'none';
      el.photoPreviewImg.src = '';
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      el.photoPreviewImg.src = safeText(reader.result);
      el.photoPreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }

  function postToServerApi(p) {
    if (!SUBMISSION_ENDPOINT) return;
    try {
      if (typeof fetch !== 'function') return;
      fetch(SUBMISSION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
      }).catch(function () { /* ignore */ });
    } catch (e) {}
  }

  function onSubmit(ev) {
    ev.preventDefault();
    setFormMsg('', '');

    var type = safeText(el.postType && el.postType.value).trim() || 'haul';
    var name = safeText(el.postName && el.postName.value).trim();
    var locationTxt = safeText(el.postLocation && el.postLocation.value).trim();
    var caption = safeText(el.postCaption && el.postCaption.value).trim();
    var consent = !!(el.postConsent && el.postConsent.checked);
    var file = (el.postPhoto && el.postPhoto.files && el.postPhoto.files[0]) ? el.postPhoto.files[0] : null;

    if (!caption) return setFormMsg('נא לכתוב טקסט קצר.', 'err');
    if (!file) return setFormMsg('נא לבחור תמונה.', 'err');
    if (!consent) return setFormMsg('נא לאשר את תיבת ההסכמה.', 'err');

    var btn = document.getElementById('btnSubmitPost');
    if (btn) { btn.disabled = true; btn.textContent = 'מפרסם…'; }

    readAndCompressImage(file, function (dataUrl, err) {
      if (btn) { btn.disabled = false; btn.textContent = 'פרסום 💛'; }
      if (err) return setFormMsg(err, 'err');

      var post = {
        id: uniqId(),
        type: (type === 'pet') ? 'pet' : 'haul',
        name: name,
        location: locationTxt,
        caption: caption,
        imageDataUrl: safeText(dataUrl || ''),
        createdAt: nowISO(),
        likes: 0
      };

      state.posts.unshift(post);
      savePosts();

      // optional backend submit
      postToשרת (API)(post);

      // reset UI
      try { el.wallForm.reset(); } catch (e) {}
      updatePreviewFromFile(null);
      setFormMsg('פורסם! תודה על שיתוף 💛', 'ok');

      state.page = 1;
      render();
    });
  }

  function exportPosts() {
    var blob = new Blob([JSON.stringify(state.posts, null, 2)], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wall-of-kindness-posts.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 8000);
    setFormMsg('הורד קובץ JSON.', 'ok');
  }

  function clearLocal() {
    // Keep it simple: clear only our keys
    try { localStorage.removeItem(LS_POSTS); } catch (e) {}
    try { localStorage.removeItem(LS_LIKES); } catch (e) {}
    loadPosts();
    loadLikes();
    setFormMsg('אופס מקומי הושלם.', 'ok');
    render();
  }

  function bindFeedActions() {
    if (!el.postsGrid) return;

    el.postsGrid.addEventListener('click', function (ev) {
      var node = ev.target;
      // like/share buttons live inside a post
      if (node && node.getAttribute) {
        if (node.hasAttribute('data-like')) {
          var postNode = node;
          while (postNode && postNode !== el.postsGrid) {
            if (postNode.getAttribute && postNode.getAttribute('data-id')) {
              toggleLike(postNode.getAttribute('data-id'));
              return;
            }
            postNode = postNode.parentNode;
          }
        }
        if (node.hasAttribute('data-share')) {
          var postNode2 = node;
          while (postNode2 && postNode2 !== el.postsGrid) {
            if (postNode2.getAttribute && postNode2.getAttribute('data-id')) {
              sharePost(postNode2.getAttribute('data-id'));
              return;
            }
            postNode2 = postNode2.parentNode;
          }
        }
      }
    });
  }

  function focusFromQuery() {
    // only do once per render, and only if query exists
    if (!location || !location.search) return;
    var m = location.search.match(/[?&]post=([^&]+)/);
    if (!m) return;
    var id = decodeURIComponent(m[1] || '');
    if (!id) return;

    var node = document.getElementById('post-' + id);
    if (!node) return;

    // highlight
    try {
      var olds = document.querySelectorAll('.post.highlight');
      for (var i = 0; i < olds.length; i++) olds[i].classList.remove('highlight');
    } catch (e) {}

    node.classList.add('highlight');
    try { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e2) { node.scrollIntoView(); }
  }

  function init() {
    // refs
    el.wallForm = document.getElementById('wallForm');
    el.postType = document.getElementById('postType');
    el.postName = document.getElementById('postName');
    el.postLocation = document.getElementById('postLocation');
    el.postCaption = document.getElementById('postCaption');
    el.postPhoto = document.getElementById('postPhoto');
    el.postConsent = document.getElementById('postConsent');
    el.photoPreview = document.getElementById('photoPreview');
    el.photoPreviewImg = document.getElementById('photoPreviewImg');
    el.formMsg = document.getElementById('formMsg');

    el.tabAll = document.getElementById('tabAll');
    el.tabHaul = document.getElementById('tabHaul');
    el.tabPet = document.getElementById('tabPet');

    el.feedSearch = document.getElementById('feedSearch');
    el.feedSort = document.getElementById('feedSort');
    el.feedCount = document.getElementById('feedCount');
    el.postsGrid = document.getElementById('postsGrid');

    // state
    loadPosts();
    loadLikes();

    // bind
    if (el.wallForm) el.wallForm.addEventListener('submit', onSubmit);

    if (el.postPhoto) {
      el.postPhoto.addEventListener('change', function () {
        var file = (el.postPhoto.files && el.postPhoto.files[0]) ? el.postPhoto.files[0] : null;
        updatePreviewFromFile(file);
      });
    }

    if (el.tabAll) el.tabAll.addEventListener('click', function () { setTab('all'); });
    if (el.tabHaul) el.tabHaul.addEventListener('click', function () { setTab('haul'); });
    if (el.tabPet) el.tabPet.addEventListener('click', function () { setTab('pet'); });

    if (el.feedSearch) el.feedSearch.addEventListener('input', function () { state.search = safeText(el.feedSearch.value || ''); render(); });
    if (el.feedSort) el.feedSort.addEventListener('change', function () { state.sort = safeText(el.feedSort.value || 'new'); render(); });

    var btnExport = document.getElementById('btnExportPosts');
    if (btnExport) btnExport.addEventListener('click', exportPosts);

    var btnClear = document.getElementById('btnClearLocal');
    if (btnClear) btnClear.addEventListener('click', clearLocal);

    bindFeedActions();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();