/* Peppynose pregnancy week tracker (V3). Vanilla JS, no libraries.
   Privacy: the date is kept ONLY in this browser's localStorage (key "pn_preg"). Nothing is sent anywhere; no analytics.
   Page text (all languages) comes from <script type="application/json" id="trk-data"> on each page. */
(() => {
  const dataEl = document.getElementById('trk-data');
  if (!dataEl) return;
  const D = JSON.parse(dataEl.textContent), S = D.s;
  const KEY = 'pn_preg', DAY = 864e5;
  const $ = id => document.getElementById(id);
  const form = $('trk-form'), dateIn = $('trk-date'), err = $('trk-err'), res = $('trk-result');
  const lang = (document.documentElement.lang || 'en').slice(0, 2);
  const locale = { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN' }[lang] || 'en-IN';
  const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
  const ymd = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  const parse = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  const diff = (a, b) => Math.round((a - b) / DAY);
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  const mode = () => (form.querySelector('input[name="mode"]:checked') || {}).value || 'due';

  // Keep the date picker within a sensible range for the chosen mode.
  const setBounds = () => {
    const t = today();
    if (mode() === 'due') { dateIn.min = ymd(addDays(t, -21)); dateIn.max = ymd(addDays(t, 280)); }
    else { dateIn.min = ymd(addDays(t, -301)); dateIn.max = ymd(t); }
  };

  const show = (m, v, store) => {
    const d = parse(v);
    if (!d) { err.textContent = S.tr_err_empty; res.hidden = true; return false; }
    const lmp = m === 'due' ? addDays(d, -280) : d;
    const due = addDays(lmp, 280);
    const ga = diff(today(), lmp);               // days since the first day of the last period
    if (ga < 0 || ga > 301) { err.textContent = S.tr_err_range; res.hidden = true; return false; }
    err.textContent = '';
    if (store) save({ mode: m, date: v });
    const w = Math.floor(ga / 7), dd = ga % 7, left = diff(due, today());
    $('r-week').textContent = fmt(S.tr_week_big, { w });
    $('r-tri').textContent = w < 14 ? S.tr_tri1 : w < 28 ? S.tr_tri2 : S.tr_tri3;
    $('r-age').textContent = fmt(S.tr_age, { w, d: dd });
    $('r-left').textContent = left > 0 ? fmt(S.tr_days_left, { n: left }) : S.tr_due_reached;
    $('r-prog').textContent = fmt(S.tr_progress, { w: Math.min(w, 40) });
    $('r-due').textContent = fmt(S.tr_due, { date: due.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) });
    const bar = $('r-barwrap');
    bar.setAttribute('aria-valuenow', String(Math.min(w, 40)));
    bar.setAttribute('aria-valuetext', $('r-prog').textContent);
    $('r-bar').style.width = Math.min(100, (ga / 280) * 100).toFixed(1) + '%';
    $('r-tip').textContent = w < 4 ? S.tr_tip_early : w > 40 ? S.tr_tip_late : D.tips[String(w)];
    $('n-mob').hidden = !(w >= 14 && w <= 33);   // Mom on Board sign: 2nd trimester onwards
    $('n-bob').hidden = !(w >= 34);              // Baby on Board sign: near the due date
    $('n-teeth').hidden = !(w >= 28);            // teethers: "for later" mention in the 3rd trimester
    const text = left > 0 ? fmt(S.tr_share_text, { w, n: left, url: D.url }) : fmt(S.tr_share_text_due, { url: D.url });
    $('r-share').href = 'https://wa.me/?text=' + encodeURIComponent(text);   // no phone number: the user picks the chat
    res.hidden = false;
    return true;
  };

  form.addEventListener('change', e => { if (e.target.name === 'mode') setBounds(); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (show(mode(), dateIn.value, true)) $('r-week').closest('.trk-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('r-change').addEventListener('click', () => { dateIn.focus(); form.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('r-clear').addEventListener('click', () => {
    try { localStorage.removeItem(KEY); } catch (e) {}
    res.hidden = true; dateIn.value = ''; err.textContent = ''; dateIn.focus();
  });

  // Restore a saved date (this device only).
  const saved = load();
  if (saved && saved.date && (saved.mode === 'due' || saved.mode === 'lmp')) {
    const r = form.querySelector(`input[name="mode"][value="${saved.mode}"]`);
    if (r) r.checked = true;
    dateIn.value = saved.date;
    show(saved.mode, saved.date, false);
  }
  setBounds();
})();
