/* Peppynose pregnancy tracker dashboard. Vanilla JS, no libraries.
   Fills the week ring and the 6 tiles from tracker.js (window.pnTrk, 'pn-week') and weight.js (window.pnWeightSum,
   'pn-weight'), and opens the detail cards (My weight, This week, Checkups, To-do) as full-screen panels.
   The phone's Back button closes an open panel (history entry "#p-…"). Nothing is stored or sent here. */
(() => {
  const dataEl = document.getElementById('trk-data');
  if (!dataEl || !document.querySelector('.dash-tiles')) return;
  const D = JSON.parse(dataEl.textContent), S = D.s;
  const $ = id => document.getElementById(id);
  const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
  const lang = (document.documentElement.lang || 'en').slice(0, 2);
  const locale = { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN' }[lang] || 'en-IN';
  const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  const html = document.documentElement;

  // ---- Ring and tiles ----
  const ring = $('r-ring'), C = 2 * Math.PI * 52;
  const update = () => {
    const t = window.pnTrk; if (!t) return;
    const p = Math.max(0, Math.min(100, Math.round(t.ga / 280 * 100)));
    ring.style.strokeDasharray = C.toFixed(1); ring.style.strokeDashoffset = (C * (1 - p / 100)).toFixed(1);
    set('r-pct', fmt(S.d_pct, { p }));
    const w = Math.max(0, Math.min(t.w, 40));
    set('dt-size', (D.emoji[String(w)] ? D.emoji[String(w)] + ' ' : '') + (t.w < 4 ? S.v4_size_early : t.w > 40 ? S.v4_size_late : D.sizes[String(w)]));
    set('dt-size-s', fmt(S.tr_week_big, { w: t.w }));
    const next = D.checks.find(c => t.w <= c.b);
    set('dt-check', next ? next.t.charAt(0).toUpperCase() + next.t.slice(1) : S.d_all_done); set('dt-check-s', next ? fmt(S.d_weeks, { a: next.a, b: next.b }) : '');
    set('dt-due', t.due.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }));
    set('dt-due-s', t.left > 0 ? fmt(S.tr_days_left, { n: t.left }) : S.tr_due_reached);
    set('dt-tip', ($('r-tip') || {}).textContent || ''); set('dt-tip-s', '');
    todo(); weight();
  };
  const todo = () => {
    const boxes = [...document.querySelectorAll('#r-todo input[type="checkbox"]')];
    set('dt-todo', fmt(S.d_todo_n, { d: boxes.filter(b => b.checked).length, n: boxes.length }));
    set('dt-todo-s', ($('r-todo-h') || {}).textContent || '');
  };
  const weight = () => {
    const w = window.pnWeightSum, tile = document.querySelector('[data-open="p-weight"].dash-tile');
    tile.classList.remove('dt-ok', 'dt-low', 'dt-high');
    if (!w) { set('dt-weight', S.d_weight_empty); set('dt-weight-s', ''); return; }
    set('dt-weight', w.kg + ' kg'); set('dt-weight-s', S['w_st_' + w.st]); tile.classList.add('dt-' + w.st);
  };
  document.addEventListener('pn-week', update);
  document.addEventListener('pn-weight', weight);
  const todoList = $('r-todo'); if (todoList) todoList.addEventListener('change', todo);

  // ---- Full-screen panels ----
  let open = null, opener = null;
  const show = (id, push) => {
    const panel = $(id); if (!panel) return;
    if (open && open !== panel) open.hidden = true;
    panel.hidden = false; open = panel; html.classList.add('dash-open');
    panel.scrollTop = 0;
    const h = panel.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    if (push) history.pushState({ pnDash: id }, '', '#' + id);
    document.dispatchEvent(new CustomEvent('pn-panel', { detail: id }));
  };
  const hide = () => {
    if (!open) return;
    open.hidden = true; open = null; html.classList.remove('dash-open');
    if (opener) { opener.focus({ preventScroll: true }); opener = null; }
    update();
  };
  const back = () => { if (history.state && history.state.pnDash) history.back(); else hide(); };
  document.querySelector('#trk-result').addEventListener('click', e => {
    const o = e.target.closest('[data-open]'); if (o) { opener = o; show(o.dataset.open, true); if (o.classList.contains('dash-add')) { const k = $('wt-kg'); if (k && !k.closest('[hidden]')) k.focus(); } return; }
    if (e.target.closest('[data-close]')) back();
  });
  addEventListener('popstate', e => { if (e.state && e.state.pnDash) show(e.state.pnDash, false); else hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open && !document.querySelector('.trk-zoom')) back(); });
  const clr = $('r-clear'); if (clr) clr.addEventListener('click', hide);

  if (window.pnTrk) update(); else weight();
  if (history.state && history.state.pnDash && window.pnTrk) show(history.state.pnDash, false);   // reload while a panel was open
})();
