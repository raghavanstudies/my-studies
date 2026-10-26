/* Peppynose pregnancy tracker: "My weight" tab. Vanilla JS, no libraries.
   The card sits right under the week picture: one "Today's weight" box (for this week; "Different week?" opens a week box),
   three tiles (latest, gained so far, healthy range), a small chart, and the full week-wise / month-wise list under "See all weights".
   Privacy: height, starting weight and weekly weights are kept ONLY in this browser's localStorage ("pn_weight");
   nothing is sent anywhere, not even to analytics. The tracker's "Clear my data" deletes them too.
   Healthy range: US Institute of Medicine (2009) total gain by BMI before pregnancy, one baby.
   0.5–2 kg in the first 13 weeks, then a straight line to the week-40 total. */
(() => {
  const dataEl = document.getElementById('trk-data'), box = document.getElementById('p-weight');
  if (!dataEl || !box) return;
  const S = JSON.parse(dataEl.textContent).s, KEY = 'pn_weight';
  const $ = id => document.getElementById(id);
  const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lang = (document.documentElement.lang || 'en').slice(0, 2);
  const nf = new Intl.NumberFormat({ en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN' }[lang] || 'en-IN', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const kg = n => nf.format(n);
  const get = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };
  const put = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  const num = el => { const v = parseFloat(String(el.value).replace(',', '.')); return isFinite(v) ? Math.round(v * 10) / 10 : NaN; };

  // Total gain for the whole pregnancy (kg) by BMI before pregnancy.
  const BANDS = [[18.5, 'under', 12.5, 18], [25, 'normal', 11.5, 16], [30, 'over', 7, 11.5], [Infinity, 'obese', 5, 9]];
  const band = d => { const b = d.pre / Math.pow(d.h / 100, 2); const r = BANDS.find(x => b < x[0]); return { bmi: b, cat: r[1], lo: r[2], hi: r[3] }; };
  const range = (B, w) => w <= 13
    ? [0.5 * w / 13, 2 * w / 13]
    : [0.5 + (B.lo - 0.5) * (w - 13) / 27, 2 + (B.hi - 2) * (w - 13) / 27];
  const status = (B, w, k, pre) => { const [a, b] = range(B, w), g = k - pre; return g < a - 0.05 ? 'low' : g > b + 0.05 ? 'high' : 'ok'; };
  // Pregnancy months by week, as commonly counted in India.
  const MONTHS = [[1, 4], [5, 8], [9, 13], [14, 17], [18, 22], [23, 27], [28, 31], [32, 35], [36, 42]];

  let view = 'week', wkOpen = false;   // wkOpen: she tapped "Different week?" 
  const entries = d => Object.keys(d.e || {}).map(Number).filter(w => w >= 1 && w <= 42).sort((a, b) => a - b).map(w => ({ w, k: d.e[w] }));

  const chart = (d, B, list) => {
    const W = 340, H = 220, L = 40, R = 10, T = 12, Bm = 30, maxW = 42;
    const ys = [d.pre, d.pre + range(B, maxW)[1], ...list.map(e => e.k)];
    const lo = Math.floor(Math.min(...ys) - 1), hi = Math.ceil(Math.max(...ys) + 1);
    const x = w => L + (W - L - R) * w / maxW, y = k => T + (H - T - Bm) * (hi - k) / (hi - lo);
    const up = [], dn = [];
    for (let w = 0; w <= maxW; w++) { const [a, b] = range(B, w); up.push(`${x(w).toFixed(1)},${y(d.pre + b).toFixed(1)}`); dn.unshift(`${x(w).toFixed(1)},${y(d.pre + a).toFixed(1)}`); }
    const step = Math.max(1, Math.ceil((hi - lo) / 5));
    let g = '';
    for (let k = Math.ceil(lo / step) * step; k <= hi; k += step) g += `<line class="wt-grid" x1="${L}" x2="${W - R}" y1="${y(k)}" y2="${y(k)}"/><text class="wt-ax" x="${L - 6}" y="${y(k) + 4}" text-anchor="end">${k}</text>`;
    [0, 10, 20, 30, 40].forEach(w => { g += `<text class="wt-ax" x="${x(w)}" y="${H - 12}" text-anchor="middle">${w}</text>`; });
    g += `<text class="wt-ax" x="${W - R}" y="${H - 1}" text-anchor="end">${esc(S.w_axis_week)}</text><text class="wt-ax" x="${L - 6}" y="${T - 2}" text-anchor="end">kg</text>`;
    const pts = list.map(e => `${x(e.w).toFixed(1)},${y(e.k).toFixed(1)}`);
    $('wt-svg').innerHTML = g + `<polygon class="wt-band" points="${up.concat(dn).join(' ')}"/>`
      + (pts.length > 1 ? `<polyline class="wt-line" points="${pts.join(' ')}"/>` : '')
      + list.map((e, i) => `<circle class="wt-dot wt-${status(B, e.w, e.k, d.pre)}" style="--i:${i}" cx="${x(e.w).toFixed(1)}" cy="${y(e.k).toFixed(1)}" r="4"><title>${esc(S.w_col_week)} ${e.w}: ${kg(e.k)} kg</title></circle>`).join('');
    const line = $('wt-svg').querySelector('.wt-line');   // the line draws itself (CSS, only when motion is on)
    if (line) line.style.setProperty('--len', Math.ceil(list.reduce((t, e, i) => i ? t + Math.hypot(x(e.w) - x(list[i - 1].w), y(e.k) - y(list[i - 1].k)) : 0, 0)));   // works while the card is hidden too
  };

  const row = (B, d, label, e, del) => {
    const [a, b] = range(B, e.w), st = status(B, e.w, e.k, d.pre), g = e.k - d.pre;
    // Three columns so it fits a phone: when · weight (gain under it) · status (healthy gain under it)
    return `<tr><th scope="row">${label}</th><td><b>${kg(e.k)} kg</b><small>${esc(S.w_col_gain)} ${g >= 0 ? '+' : '−'}${kg(Math.abs(g))}</small></td>`
      + `<td><span class="wt-st wt-${st}">${esc(S['w_st_' + st])}</span><small>${esc(S.w_col_range)} +${kg(a)}–${kg(b)}</small></td>`
      + (del ? `<td><button type="button" class="wt-del" data-w="${e.w}" aria-label="${esc(fmt(S.w_del, { w: e.w }))}">✕</button></td>` : '') + '</tr>';
  };
  const table = (d, B, list) => {
    if (!list.length) { $('wt-table').innerHTML = `<p class="trk-sub">${esc(S.w_none)}</p>`; return; }
    const wk = view === 'week';
    const head = `<tr><th scope="col">${esc(wk ? S.w_col_week : S.w_col_month)}</th><th scope="col">${esc(S.w_col_weight)}</th><th scope="col">${esc(S.w_legend_range)}</th>${wk ? '<th scope="col"><span class="sr-only">✕</span></th>' : ''}</tr>`;
    const rows = wk
      ? list.map(e => row(B, d, String(e.w), e, true))
      : MONTHS.map(([a, b], i) => { const inM = list.filter(e => e.w >= a && e.w <= b); return inM.length ? row(B, d, esc(fmt(S.w_month_n, { m: i + 1, a, b })), inM[inM.length - 1], false) : ''; }); // latest weight in that month
    $('wt-table').innerHTML = `<div class="wt-scroll"><table class="wt-tbl"><thead>${head}</thead><tbody>${rows.join('')}</tbody></table></div>`;
  };

  const tiles = (d, B, list) => {
    if (!list.length) { $('wt-stats').innerHTML = `<p class="trk-sub">${esc(S.w_none)}</p>`; return; }
    const e = list[list.length - 1], g = e.k - d.pre, st = status(B, e.w, e.k, d.pre), [a, b] = range(B, e.w);
    const tile = (h, v, sub, cls = '') => `<div class="wt-tile${cls}"><span class="wt-t-h">${esc(h)}</span><b>${v}</b><span class="wt-t-s">${sub}</span></div>`;
    $('wt-stats').innerHTML = tile(S.w_tile_latest, `${kg(e.k)} kg`, esc(fmt(S.w_week_of, { w: e.w })))
      + tile(S.w_tile_gain, `${g >= 0 ? '+' : '−'}${kg(Math.abs(g))} kg`, esc(fmt(S.w_week_of, { w: e.w })))
      + tile(S.w_tile_status, esc(S['w_st_' + st]), `+${kg(a)}–${kg(b)} kg`, ' wt-' + st);
  };
  const weekLabel = () => { const w = Math.round(num($('wt-week'))); $('wt-forweek').textContent = w >= 1 && w <= 42 ? fmt(S.w_for_week, { w }) : ''; };

  const render = () => {
    const d = get(), ok = d.h >= 120 && d.h <= 220 && d.pre >= 30 && d.pre <= 200;
    $('wt-setup').hidden = ok; $('wt-main').hidden = !ok;
    if (!ok) { $('wt-h').value = d.h || ''; $('wt-pre').value = d.pre || ''; window.pnWeightSum = null; document.dispatchEvent(new CustomEvent('pn-weight')); return; }
    const B = band(d), list = entries(d);
    $('wt-bmi').textContent = fmt(S.w_bmi, { b: nf.format(B.bmi), c: S['w_cat_' + B.cat], lo: B.lo, hi: B.hi });
    const wk = $('wt-week'), now = window.pnWeek >= 1 ? Math.min(42, window.pnWeek) : 0;
    if (!wkOpen && now) wk.value = now;                     // "Today's weight" is for this week
    $('wt-wk-l').hidden = !(wkOpen || !wk.value);           // the week box shows only when asked for (or no week is known)
    $('wt-wk-btn').hidden = !$('wt-wk-l').hidden;
    weekLabel(); tiles(d, B, list); chart(d, B, list); table(d, B, list);
    const last = list[list.length - 1];   // for the dashboard tile (dash.js)
    window.pnWeightSum = last ? { kg: kg(last.k), st: status(B, last.w, last.k, d.pre) } : null;
    document.dispatchEvent(new CustomEvent('pn-weight'));
  };

  const motionOK = () => document.documentElement.classList.contains('pn-motion') || (!!window.matchMedia && !matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window);   // same rule as motion.js (which loads later)
  // A few little hearts float up from "Add" (only when motion is on).
  const cheer = btn => {
    if (!btn || !motionOK()) return;
    $('wt-stats').classList.remove('wt-pop'); void $('wt-stats').offsetWidth; $('wt-stats').classList.add('wt-pop');
    const r = btn.getBoundingClientRect();
    for (let i = 0; i < 6; i++) {
      const h = document.createElement('span'); h.className = 'wt-heart'; h.setAttribute('aria-hidden', 'true'); h.textContent = i % 2 ? '💗' : '💖';
      h.style.left = (r.left + r.width / 2 + (i - 2.5) * 10) + 'px'; h.style.top = r.top + 'px';   // fixed to the screen: never makes the page wider
      h.style.setProperty('--dx', ((i - 2.5) * 14) + 'px'); h.style.animationDelay = (i * 60) + 'ms';
      document.body.appendChild(h); setTimeout(() => h.remove(), 1400);
    }
  };
  $('wt-setup').addEventListener('submit', e => {
    e.preventDefault();
    const h = num($('wt-h')), pre = num($('wt-pre')), err = $('wt-setup-err');
    if (!(h >= 120 && h <= 220)) { err.textContent = S.w_err_height; $('wt-h').focus(); return; }
    if (!(pre >= 30 && pre <= 200)) { err.textContent = S.w_err_kg; $('wt-pre').focus(); return; }
    err.textContent = ''; const d = get(); d.h = h; d.pre = pre; d.e = d.e || {}; put(d); render(); $('wt-kg').focus();
  });
  $('wt-add').addEventListener('submit', e => {
    e.preventDefault();
    const w = Math.round(num($('wt-week'))), k = num($('wt-kg')), err = $('wt-err');
    if (!(w >= 1 && w <= 42)) { err.textContent = S.w_err_week; wkOpen = true; $('wt-wk-l').hidden = false; $('wt-wk-btn').hidden = true; $('wt-week').focus(); return; }
    if (!(k >= 30 && k <= 200)) { err.textContent = S.w_err_kg; $('wt-kg').focus(); return; }
    err.textContent = ''; const d = get(); d.e = d.e || {}; d.e[w] = k; put(d); $('wt-kg').value = ''; render(); cheer(e.submitter || $('wt-add').querySelector('button[type="submit"]'));
  });
  $('wt-wk-btn').addEventListener('click', () => { wkOpen = true; $('wt-wk-l').hidden = false; $('wt-wk-btn').hidden = true; $('wt-week').focus(); });
  $('wt-week').addEventListener('input', weekLabel);
  $('wt-table').addEventListener('click', e => {
    const b = e.target.closest('.wt-del'); if (!b) return;
    const d = get(); if (d.e) delete d.e[b.dataset.w]; put(d); render();
  });
  box.querySelectorAll('.wt-views button').forEach(b => b.addEventListener('click', () => {
    view = b.dataset.view; box.querySelectorAll('.wt-views button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render();
  }));
  $('wt-edit').addEventListener('click', () => { const d = get(); $('wt-all').open = false; $('wt-setup').hidden = false; $('wt-main').hidden = true; $('wt-h').value = d.h || ''; $('wt-pre').value = d.pre || ''; $('wt-h').focus(); });
  const clr = $('r-clear'); if (clr) clr.addEventListener('click', () => { wkOpen = false; $('wt-week').value = ''; render(); });   // tracker.js already removed the data
  document.addEventListener('pn-week', render);
  document.addEventListener('pn-panel', e => { if (e.detail === 'p-weight') render(); });   // dashboard opened the card: draw the chart again
  render();
})();
