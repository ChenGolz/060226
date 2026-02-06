/* ללא ניסויים / KBWG – Shopping Calendar renderer (RTL) */
(() => {
  const root = document.getElementById('agenda');

  const monthNamesHe = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

  const pad2 = (n) => String(n).padStart(2, '0');
  const parseISO = (s) => {
    if (!s) return null;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const monthStartISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-01`;

  const escapeHtml = (str) => String(str ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');

  const monthLabelFromISO = (iso) => {
    const d = parseISO(iso);
    if (!d) return '';
    return `${monthNamesHe[d.getMonth()]} ${d.getFullYear()}`;
  };

  const asArray = (x) => Array.isArray(x) ? x : (x ? [x] : []);
  const sortISO = (a, b) => String(a).localeCompare(String(b));

  const splitFocus = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean).map(String);
    const s = String(val)
      .replace(/\s*&\s*/g, ',')
      .replace(/\s+and\s+/gi, ',')
      .replace(/[.]/g, '');
    return s.split(',').map(x => x.trim()).filter(Boolean);
  };

  const inferTag = (title) => {
    const t = String(title || '').toLowerCase();
    if (/(black\s*friday|cyber\s*monday|11\.11|singles)/.test(t)) return { text: 'סייל ענק', cls: 'tag-major' };
    if (/(prime|amazon\s+prime|big\s+deal|memorial|labor|presidents)/.test(t)) return { text: 'מבצע גדול', cls: 'tag-mid' };
    if (/(spring|easter|back\s*to\s*school|valentine|mother|father|boxing|green\s+monday)/.test(t)) return { text: 'מבצע עונתי', cls: 'tag-note' };
    return { text: 'תזכורת', cls: 'tag-note' };
  };

  const normalizeData = (raw) => {
    // Accept both shapes:
    // 1) [{monthStart:'YYYY-MM-01', events:[...]}]
    // 2) flat array of events with date/startDate/month fields
    const arr = asArray(raw);

    if (arr.length && typeof arr[0] === 'object' && arr[0].monthStart && arr[0].events) {
      return arr.map(m => ({
        monthStart: String(m.monthStart),
        events: asArray(m.events),
      }));
    }

    // flat -> group by month
    const groups = new Map();
    for (const ev of arr) {
      if (!ev || typeof ev !== 'object') continue;
      const d = parseISO(ev.startDate || ev.date || ev.monthStart || ev.month || '');
      if (!d) continue;
      const key = monthStartISO(d);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(ev);
    }
    return Array.from(groups.entries()).map(([monthStart, events]) => ({ monthStart, events }));
  };

  const render = () => {
    if (!root) return;

    const data = window.SALES_DATA || window.salesData || [];
    const months = normalizeData(data);
    months.sort((a, b) => sortISO(a.monthStart, b.monthStart));

    // Hide past months (start from the current month)
    // NOTE: Do NOT use toISOString() here (it converts to UTC and can shift the date to the previous month).
    const now = new Date();
    const currentISO = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-01`;
    const filteredMonths = months.filter((m) => sortISO(m.monthStart, currentISO) >= 0);
    const monthsToRender = filteredMonths.length ? filteredMonths : months;

    root.innerHTML = monthsToRender.map((m) => {
      const label = monthLabelFromISO(m.monthStart);
      const events = asArray(m.events);

      const list = events.map((ev) => {
        const title = escapeHtml(ev.title || ev.name || 'מבצע');
        const when = escapeHtml(ev.when || ev.dateRange || ev.dates || ev.date || '');
        const desc = escapeHtml(ev.description || ev.details || ev.typicalFocus || '');
        const focus = splitFocus(ev.focus || ev.typicalFocus || ev.whatToBuy || ev.focusItems);
        const tag = ev.tag ? { text: String(ev.tag), cls: 'tag-note' } : inferTag(title);

        const focusHtml = focus.length ? `
          <div class="eventBuy">
            ${focus.slice(0, 6).map(f => `<span class="buyChip">🛒 ${escapeHtml(f)}</span>`).join('')}
          </div>` : '';

        return `
          <article class="eventItem">
            <div class="eventLeft">
              ${when ? `<span class="datePill">${when}</span>` : ''}
              <span class="tagPill ${tag.cls}">${escapeHtml(tag.text)}</span>
            </div>
            <div class="eventBody">
              <div class="eventName">${title}</div>
              ${desc ? `<div class="eventDesc">${desc}</div>` : ''}
              ${focusHtml}
            </div>
          </article>
        `;
      }).join('') || `<div class="noEvents">אין מבצעים בחודש הזה.</div>`;

      return `
        <section class="monthCard">
          <div class="monthTop">
            <div class="monthMeta">${events.length} אירועים</div>
            <div class="monthTitle">${escapeHtml(label)}</div>
          </div>
          <div class="eventList">
            ${list}
          </div>
        </section>
      `;
    }).join('');
  };

  document.addEventListener('DOMContentLoaded', render);
})();
