/* Peppynose pregnancy week tracker (V4). Vanilla JS, no libraries.
   Privacy: the date ("pn_preg"), the to-do ticks ("pn_todo") and the weights ("pn_weight", see weight.js) are kept ONLY
   in this browser's localStorage.
   The WhatsApp family card is drawn on the phone with <canvas>; nothing is uploaded.
   Page text (all languages) comes from <script type="application/json" id="trk-data"> on each page.
   ---------------------------------------------------------------------------------------------
   WEEK IMAGES: the approved image set goes in /assets/tracker/week04.webp ... week40.webp (800x800).
   Until those files are uploaded, keep ready:false. A soft circle with the week number is shown instead
   (no 404s, no broken images). When the approved files are in the repo, set ready:true and, if needed, the credit line. */
const PN_TRACKER_IMAGES = { ready: true, path: '/assets/tracker/week', ext: '.webp', credit: '' };
(() => {
  const dataEl = document.getElementById('trk-data');
  if (!dataEl) return;
  const D = JSON.parse(dataEl.textContent), S = D.s;
  const KEY = 'pn_preg', TODO_KEY = 'pn_todo', DAY = 864e5;
  const $ = id => document.getElementById(id);
  const form = $('trk-form'), dateIn = $('trk-date'), err = $('trk-err'), res = $('trk-result');
  const lang = (document.documentElement.lang || 'en').slice(0, 2);
  const locale = { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN' }[lang] || 'en-IN';
  // English: "1 week" / "1 day", never "1 weeks" / "1 days"
  const fmt = (s, o) => { const t = s.replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m)); return lang === 'en' ? t.replace(/\b1 (week|day)s\b/g, '1 $1') : t; };
  const ymd = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  const parse = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getMonth() === +m[2] - 1 ? d : null; };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  const diff = (a, b) => Math.round((a - b) / DAY);
  const jget = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const mode = () => (form.querySelector('input[name="mode"]:checked') || {}).value || 'due';
  const track = (n, p) => window.pnTrack && window.pnTrack(n, p);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const imgUrl = w => PN_TRACKER_IMAGES.path + String(w).padStart(2, '0') + PN_TRACKER_IMAGES.ext;
  let cur = null;   // { w, left } of the result on screen
  let shareText = '';   // kept out of the link's href, so analytics never sees the week (opened on click instead)

  const setBounds = () => {
    const t = today();
    if (mode() === 'due') { dateIn.min = ymd(addDays(t, -21)); dateIn.max = ymd(addDays(t, 280)); }
    else { dateIn.min = ymd(addDays(t, -301)); dateIn.max = ymd(t); }
  };
  const sizeLine = w => w < 4 ? S.v4_size_early : w > 40 ? S.v4_size_late : fmt(S.v4_size, { x: D.sizes[String(w)] });
  const meetLine = left => left > 0 ? fmt(S.v4_card_meet, { n: left }) : S.v4_card_due;

  // ---- Week image or neutral placeholder ----
  const showImage = w => {
    pic.off();                                                   // also for weeks without a picture: no stale zoom or label
    const img = $('r-img'), ph = $('r-ph'), cr = $('r-credit');
    $('r-ph-n').textContent = String(Math.max(0, w));   // the same week number as everywhere else (also 41, 42)
    img.hidden = true; ph.hidden = false; cr.hidden = true;
    if (!PN_TRACKER_IMAGES.ready || w < 4 || w > 40) return;
    // Lazy-loaded, so it must stay in the layout while loading: it sits invisible over the circle until it arrives.
    img.onload = () => { img.classList.remove('trk-loading'); ph.hidden = true; pic.on(); if (PN_TRACKER_IMAGES.credit) { cr.textContent = PN_TRACKER_IMAGES.credit; cr.hidden = false; } };
    img.onerror = () => { img.hidden = true; img.classList.remove('trk-loading'); ph.hidden = false; pic.off(); };
    img.loading = 'lazy'; img.alt = fmt(S.v4_img_alt, { w }); img.classList.add('trk-loading'); img.hidden = false; img.src = imgUrl(w);
  };

  // ---- Week picture: light 3D tilt (mouse, drag, phone motion) and tap to zoom ----
  // Plain JS, transform/opacity only, one requestAnimationFrame per change. Off with reduced motion (zoom still works).
  const pic = (() => {
    const box = document.querySelector('.trk-hero-img'), img = $('r-img');
    const still = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    const T = { en: ['Tap to zoom', 'Close'], ta: ['பெரிதாக்க தட்டவும்', 'மூடு'], hi: ['बड़ा करने के लिए टैप करें', 'बंद करें'] }[lang] || ['Tap to zoom', 'Close'];
    const MAX = 12, PHONE = 8;                                     // max tilt in degrees (pointer / phone motion)
    let rx = 0, ry = 0, raf = 0, active = false, down = null, moved = false, base = null, inView = true, listening = false;
    const clamp = (v, m) => Math.max(-m, Math.min(m, v));
    const paint = () => {
      raf = 0;
      box.style.setProperty('--rx', rx.toFixed(2) + 'deg'); box.style.setProperty('--ry', ry.toFixed(2) + 'deg');
      box.style.setProperty('--gx', (50 + ry * 3).toFixed(1) + '%'); box.style.setProperty('--gy', (50 - rx * 3).toFixed(1) + '%');
      box.style.setProperty('--sx', (-ry * .9).toFixed(1) + 'px'); box.style.setProperty('--sy', (10 + rx * .9).toFixed(1) + 'px');
    };
    const tilt = (x, y) => { if (still || !active) return; rx = clamp(x, MAX); ry = clamp(y, MAX); if (!raf) raf = requestAnimationFrame(paint); };
    const reset = () => { box.classList.remove('tilting'); rx = ry = 0; if (!raf) raf = requestAnimationFrame(paint); };
    const fromPointer = e => {
      const r = box.getBoundingClientRect();
      tilt(-((e.clientY - r.top) / r.height - .5) * 2 * MAX, ((e.clientX - r.left) / r.width - .5) * 2 * MAX);
    };
    box.addEventListener('pointermove', e => {
      if (!active) return;
      if (down) { if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 6) moved = true; }
      else if (e.pointerType !== 'mouse') return;                  // touch tilts only while dragging
      box.classList.add('tilting'); fromPointer(e);
    });
    box.addEventListener('pointerdown', e => { if (!active) return; down = { x: e.clientX, y: e.clientY }; moved = false; if (e.pointerType !== 'mouse') { box.classList.add('tilting'); fromPointer(e); } });
    box.addEventListener('pointerup', e => { if (!down) return; down = null; if (e.pointerType !== 'mouse') reset(); });
    // Open on click (not pointerup): on phones the click that follows a tap would otherwise land on the new layer and close it.
    box.addEventListener('click', () => { if (!active || moved) return; motion(); zoom(); });
    box.addEventListener('pointercancel', () => { down = null; reset(); });   // the page scrolled instead
    box.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { down = null; reset(); } });
    box.addEventListener('keydown', e => { if (active && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); zoom(); } });

    // Phone motion: a gentle tilt that follows how the phone is held (relative to the first reading).
    const onTurn = e => {
      if (down || e.beta == null || e.gamma == null) return;
      if (!base) base = { b: e.beta, g: e.gamma };
      rx = clamp((base.b - e.beta) * .35, PHONE); ry = clamp((e.gamma - base.g) * .35, PHONE);
      if (active && !raf) raf = requestAnimationFrame(paint);
    };
    const listen = on => {
      if (on === listening || !coarse || still || !('DeviceOrientationEvent' in window)) return;
      listening = on; base = null;
      if (on) addEventListener('deviceorientation', onTurn); else { removeEventListener('deviceorientation', onTurn); reset(); }
    };
    let asked = false;
    const motion = () => {                                          // iPhone asks permission once, on the first tap
      const D = window.DeviceOrientationEvent;
      if (asked || !coarse || still || !D || typeof D.requestPermission !== 'function') return;
      asked = true; D.requestPermission().then(r => { if (r === 'granted') listen(active && inView); }).catch(() => {});
    };
    // Only iPhone and iPad need a tap before motion can be read. Chrome also
    // has requestPermission, and treating that as iOS leaves the picture flat
    // until it is tapped.
    const needsAsk = () => {
      const D = window.DeviceOrientationEvent;
      if (!D || typeof D.requestPermission !== 'function') return false;
      const ua = navigator.userAgent || '';
      return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    };
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { inView = es[0].isIntersecting; if (!needsAsk() || asked) listen(active && inView); }).observe(box);

    // Tap to zoom: the same picture, large, over the page. Tap anywhere, the ✕ button or Escape closes it.
    let layer = null;
    const close = () => { if (!layer) return; layer.remove(); layer = null; document.documentElement.classList.remove('trk-zoom-open'); box.focus({ preventScroll: true }); };
    const zoom = () => {
      if (!active || layer) return;
      layer = document.createElement('div');
      layer.className = 'trk-zoom'; layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-modal', 'true'); layer.setAttribute('aria-label', img.alt);
      const big = document.createElement('img'); big.src = img.currentSrc || img.src; big.alt = img.alt; big.width = 800; big.height = 800;
      const x = document.createElement('button'); x.type = 'button'; x.className = 'trk-zoom-x'; x.setAttribute('aria-label', T[1]); x.textContent = '✕';
      layer.append(big, x); layer.addEventListener('click', close);
      document.body.appendChild(layer); document.documentElement.classList.add('trk-zoom-open'); x.focus();
    };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    return {
      on() { active = true; box.classList.add('has-img'); box.tabIndex = 0; box.setAttribute('role', 'button'); box.setAttribute('aria-label', img.alt + ' · ' + T[0]); reset(); if (!needsAsk() || asked) listen(inView); },
      off() { active = false; down = null; listen(false); box.classList.remove('has-img', 'tilting'); box.removeAttribute('tabindex'); box.removeAttribute('role'); box.removeAttribute('aria-label'); close(); }
    };
  })();

  // ---- Checkups tab ----
  const renderChecks = w => {
    $('r-checks').innerHTML = D.checks.map(c => {
      const st = w > c.b ? 'past' : w >= c.a ? 'now' : 'next';
      return `<li class="ck-${st}"><span class="ck-tag">${esc(S['v4_' + st])}</span><span>${esc(fmt(S.v4_check_line, { a: c.a, b: c.b, x: c.t }))}</span></li>`;
    }).join('');
  };
  // ---- To-do tab (ticks saved per week in localStorage) ----
  const renderTodo = w => {
    const wk = Math.max(0, Math.min(w, 40)), t = D.todo.find(x => wk >= x.a && wk <= x.b) || D.todo[0];
    const items = t.items.slice();
    D.checks.filter(c => wk >= c.a && wk <= c.b).slice(0, 1).forEach(c => items.push(fmt(S.v4_todo_ask, { x: c.t })));
    const all = jget(TODO_KEY) || {}, ticks = all['w' + wk] || [];
    $('r-todo-h').textContent = fmt(S.v4_todo_h, { w: Math.max(0, w) });   // week 41/42 use the week-40 list, but say the real week
    $('r-todo').innerHTML = items.map((txt, i) => `<li><label><input type="checkbox" data-i="${i}"${ticks[i] ? ' checked' : ''}> <span>${esc(txt)}</span></label></li>`).join('');
    $('r-todo').onchange = e => {
      const i = +e.target.dataset.i, a = jget(TODO_KEY) || {}; a['w' + wk] = a['w' + wk] || [];
      a['w' + wk][i] = e.target.checked; jset(TODO_KEY, a);
    };
  };

  // The week number counts up from 0 (only when motion is on; see motion.js).
  const motionOK = () => document.documentElement.classList.contains('pn-motion') || (!!window.matchMedia && !matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window);   // same rule as motion.js (which loads later)
  let countRaf = 0;
  const countWeek = w => {
    const el = $('r-week'), ring = $('r-ring-n'), put = n => { el.textContent = fmt(S.tr_week_big, { w: n }); if (ring) ring.textContent = n; };
    cancelAnimationFrame(countRaf);
    if (!motionOK() || w < 2) return put(w);
    const t0 = performance.now(), ms = Math.min(900, 300 + w * 15);
    const step = t => { const k = Math.min(1, (t - t0) / ms); put(Math.round(w * (1 - Math.pow(1 - k, 3)))); if (k < 1) countRaf = requestAnimationFrame(step); };
    put(0); countRaf = requestAnimationFrame(step);
  };

  const show = (m, v, store) => {
    const d = parse(v);
    if (!d) { err.textContent = S.tr_err_empty; res.hidden = true; return false; }
    const lmp = m === 'due' ? addDays(d, -280) : d;
    const due = addDays(lmp, 280);
    const ga = diff(today(), lmp);
    if (ga < 0 || ga > 301) { err.textContent = S.tr_err_range; res.hidden = true; return false; }
    err.textContent = '';
    if (store) jset(KEY, { mode: m, date: v });
    const w = Math.floor(ga / 7), dd = ga % 7, left = diff(due, today());
    cur = { w, left };
    // First screen: week, image, size, days to go
    countWeek(w);
    $('r-size').textContent = sizeLine(w) + (D.emoji[String(w)] ? ' ' + D.emoji[String(w)] : '');
    $('r-left').textContent = left > 0 ? fmt(S.tr_days_left, { n: left }) : S.tr_due_reached;
    showImage(w);
    // "This week" tab (V3 details)
    $('r-tri').textContent = w < 14 ? S.tr_tri1 : w < 28 ? S.tr_tri2 : S.tr_tri3;
    $('r-age').textContent = fmt(S.tr_age, { w, d: dd });
    $('r-prog').textContent = w > 40 ? fmt(S.tr_week_big, { w }) + ' · ' + S.tr_due_reached : fmt(S.tr_progress, { w });   // never "Week 40 of 40" in week 41
    $('r-due').textContent = fmt(S.tr_due, { date: due.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) });
    const bar = $('r-barwrap');
    bar.setAttribute('aria-valuenow', String(Math.min(w, 40)));
    bar.setAttribute('aria-valuetext', $('r-prog').textContent);
    $('r-bar').style.width = Math.min(100, (ga / 280) * 100).toFixed(1) + '%';
    $('r-tip').textContent = w < 4 ? S.tr_tip_early : w > 40 ? S.tr_tip_late : D.tips[String(w)];
    $('n-mob').hidden = !(w >= 14 && w <= 33);
    $('n-bob').hidden = !(w >= 34);
    $('n-teeth').hidden = !(w >= 28);
    shareText = left > 0 ? fmt(S.tr_share_text, { w, n: left, url: D.url }) : fmt(S.tr_share_text_due, { url: D.url });
    renderChecks(w); renderTodo(w);
    window.pnWeek = w; window.pnTrk = { w, left, ga, due };   // for weight.js (this week) and dash.js (ring and tiles)
    document.dispatchEvent(new CustomEvent('pn-week'));
    form.hidden = true; res.hidden = false;
    if (store) track('tracker_used', {});   // V4.1: no pregnancy data in analytics
    return true;
  };

  // ---- WhatsApp family card (canvas, on the phone) ----
  const loadImg = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  const wrapText = (ctx, text, x, y, maxW, lh) => {
    const words = text.split(' '); let line = '', lines = [];
    words.forEach(wd => { const t = line ? line + ' ' + wd : wd; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = wd; } else line = t; });
    if (line) lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh)); return lines.length;
  };
  const makeCard = async () => {
    const { w, left } = cur, wk = Math.max(0, Math.min(w, 40));
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1080; const x = c.getContext('2d');
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const sans = '"DM Sans","Noto Sans Tamil","Noto Sans Devanagari",sans-serif', serif = 'Fraunces,"Noto Serif Tamil","Noto Serif Devanagari","Noto Sans Tamil","Noto Sans Devanagari",serif';
    const g = x.createLinearGradient(0, 0, 0, 1080); g.addColorStop(0, '#fff4ec'); g.addColorStop(1, '#ffe6dc');
    x.fillStyle = g; x.fillRect(0, 0, 1080, 1080);
    x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect ? x.roundRect(60, 60, 960, 960, 48) : x.rect(60, 60, 960, 960); x.fill();
    const logo = await loadImg(D.logo);
    if (logo) x.drawImage(logo, 540 - 230, 100, 460, 460 * logo.naturalHeight / logo.naturalWidth);
    // baby image or placeholder circle
    const pic = PN_TRACKER_IMAGES.ready && wk >= 4 ? await loadImg(imgUrl(wk)) : null;
    const cx = 540, cy = 395, r = 165;
    // Rounded square, not a circle, so the whole picture shows (a circle cut off the baby's head and feet).
    const frame = () => { x.beginPath(); if (x.roundRect) x.roundRect(cx - r, cy - r, 2 * r, 2 * r, 40); else x.rect(cx - r, cy - r, 2 * r, 2 * r); };
    if (pic) { x.save(); frame(); x.clip(); x.drawImage(pic, cx - r, cy - r, 2 * r, 2 * r); x.restore(); }
    else {
      const rg = x.createRadialGradient(cx - 50, cy - 60, 20, cx, cy, r * 1.3); rg.addColorStop(0, '#ffe9df'); rg.addColorStop(1, '#f9c7b4');
      x.fillStyle = rg; frame(); x.fill();
      x.fillStyle = '#9a4a33'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `700 130px ${serif}`; x.fillText(String(Math.max(0, w)), cx, cy + 6);
    }
    x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = '#1d2b4f';
    x.font = `700 80px ${serif}`; x.fillText(fmt(S.v4_card_week, { w }), 540, 660);
    x.font = `500 38px ${sans}`; x.fillStyle = '#4a4a55';
    const n = wrapText(x, sizeLine(w) + (D.emoji[String(w)] ? ' ' + D.emoji[String(w)] : ''), 540, 728, 860, 48);
    x.font = `700 46px ${sans}`; x.fillStyle = '#E51B00'; wrapText(x, meetLine(left), 540, 728 + n * 48 + 34, 860, 54);
    x.font = `700 32px ${sans}`; x.fillStyle = '#0083CF'; x.fillText('peppynose.com', 540, 992);
    return new Promise(r => c.toBlob(b => r(b), 'image/png'));
  };
  let cardBlob = null;
  const prepCard = async () => { cardBlob = null; try { cardBlob = await makeCard(); } catch (e) { cardBlob = null; } };
  $('r-card').addEventListener('click', async () => {
    if (!cur) return;
    const blob = cardBlob || await makeCard();
    const name = 'peppynose-week-' + cur.w + '.png';
    const text = fmt(S.v4_card_text, { w: cur.w, meet: meetLine(cur.left), url: D.url });
    const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); track('share_card_created', { method: 'web_share' }); } catch (e) { /* user closed the share sheet */ }
      return;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    $('r-card-msg').textContent = S.v4_card_saved;
    track('share_card_created', { method: 'download_whatsapp' });
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  });

  // "Share my week": the href stays https://wa.me/ (no text); the message is added only when it is clicked.
  $('r-share').addEventListener('click', e => { if (!shareText) return; e.preventDefault(); window.open('https://wa.me/?text=' + encodeURIComponent(shareText), '_blank', 'noopener'); });

  form.addEventListener('change', e => { if (e.target.name === 'mode') setBounds(); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (show(mode(), dateIn.value, true)) { prepCard(); $('r-week').closest('.trk-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  $('r-change').addEventListener('click', () => { form.hidden = false; dateIn.focus(); form.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('r-clear').addEventListener('click', () => {
    try { localStorage.removeItem(KEY); localStorage.removeItem(TODO_KEY); localStorage.removeItem('pn_weight'); } catch (e) {}
    res.hidden = true; form.hidden = false; dateIn.value = ''; err.textContent = ''; cur = null; window.pnTrk = null; dateIn.focus();
  });

  const saved = jget(KEY);
  if (saved && saved.date && (saved.mode === 'due' || saved.mode === 'lmp')) {
    const r = form.querySelector(`input[name="mode"][value="${saved.mode}"]`);
    if (r) r.checked = true;
    dateIn.value = saved.date;
    if (show(saved.mode, saved.date, false)) prepCard();
  }
  setBounds();
})();
