/* Peppynose V4 scroll motion. Vanilla JS: IntersectionObserver + CSS transforms + one requestAnimationFrame loop.
   - Everything is OFF when the phone/computer asks for reduced motion, or when IntersectionObserver is missing.
   - Only elements BELOW the first screen are animated, so the first paint and the hero image (LCP) are never delayed or hidden.
   - Transforms/opacity only: no layout shift. Headline words are split by SPACES only (Tamil/Hindi letters stay joined). */
(() => {
  const rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  if (!('IntersectionObserver' in window) || (rm && rm.matches)) return;
  const html = document.documentElement, vh = () => innerHeight;
  html.classList.add('pn-motion');

  // 1) Thin scroll progress bar in brand colours (always visible at the very top).
  const bar = document.createElement('div'); bar.className = 'pn-progress'; bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);

  // 2) Logo birds that fly gently down the left edge while you scroll (wide screens only, never over text or buttons).
  let birds = null;
  if (innerWidth >= 1200 && !document.querySelector('.buy-page')) {
    birds = document.createElement('div'); birds.className = 'pn-fly'; birds.setAttribute('aria-hidden', 'true');
    birds.innerHTML = '<img class="pn-fly-m" src="/images/loader/bird-mother.webp" alt="" width="322" height="346"><img class="pn-fly-b" src="/images/loader/bird-baby.webp" alt="" width="322" height="346">';
    document.body.appendChild(birds);
  }

  // 3) Reveal targets (below the first screen only).
  const below = el => el.getBoundingClientRect().top > vh() * 0.92;
  const mark = (el, cls, i) => { if (el.dataset.pnRv || !below(el)) return; el.dataset.pnRv = '1'; el.classList.add('pn-rv', cls); el.style.setProperty('--pn-d', ((i || 0) % 6) * 70 + 'ms'); io.observe(el); };
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('pn-in'); io.unobserve(e.target); if (e.target.dataset.pnCount) countUp(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  // 3a) Headlines word by word (split by spaces only; inner tags like <em> are kept).
  document.querySelectorAll('main section h2, .tracker-teaser h2, .band2 h2').forEach(h => {
    if (!below(h) || h.dataset.pnWords) return; h.dataset.pnWords = '1';
    let n = 0;
    const walk = node => [...node.childNodes].forEach(c => {
      if (c.nodeType === 3) {
        const parts = c.textContent.split(/(\s+)/); const f = document.createDocumentFragment();
        parts.forEach(p => { if (!p) return; if (/^\s+$/.test(p)) f.appendChild(document.createTextNode(p)); else { const s = document.createElement('span'); s.className = 'pn-wd'; s.style.setProperty('--pn-i', Math.min(n++, 12)); s.textContent = p; f.appendChild(s); } });
        c.replaceWith(f);
      } else if (c.nodeType === 1 && c.tagName !== 'BR') walk(c);
    });
    walk(h); h.classList.add('pn-words'); mark(h, 'pn-up', 0);
  });
  // 3b) Sections, cards and grids fade up, staggered within each group.
  ['main section .center-head p', '.card', '.tt', '.ig-grid > *', '.agegrid-p > a', '.trust-badges li', '.band2-txt > p', 'details', '.trk-card', 'footer .foot > div', '.contact-grid > *', '.page-body p']
    .forEach(sel => document.querySelectorAll(sel).forEach(el => mark(el, 'pn-up', [...el.parentNode.children].indexOf(el))));
  // 3c) Product photos slide in from alternating sides (inside their own frame, so nothing pokes out sideways).
  document.querySelectorAll('.card .ph img').forEach((img, i) => mark(img, i % 2 ? 'pn-sr' : 'pn-sl', 1));

  // 4) Count-up for number badges ("4.4/5", "140 ratings"): only when the number scrolls into view.
  function countUp(el) {
    const m = el.textContent.match(/(\d+(?:\.\d+)?)/); if (!m) return;
    const end = parseFloat(m[1]), dec = (m[1].split('.')[1] || '').length, pre = el.textContent.slice(0, m.index), post = el.textContent.slice(m.index + m[1].length);
    const t0 = performance.now(), dur = 900;
    const step = t => { const k = Math.min(1, (t - t0) / dur), v = end * (1 - Math.pow(1 - k, 3)); el.textContent = pre + v.toFixed(dec) + post; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  document.querySelectorAll('[data-count], .card .rating, .proof b').forEach(el => {
    if (el.children.length && !el.matches('.rating')) return;
    const tn = [...el.childNodes].find(c => c.nodeType === 3 && /\d/.test(c.textContent));
    if (!tn || !below(el)) return;
    const s = document.createElement('span'); s.textContent = tn.textContent; s.dataset.pnCount = '1'; tn.replaceWith(s); io.observe(s);
  });

  // 5) One rAF loop for progress bar, hero parallax and the flying birds.
  const shapes = [...document.querySelectorAll('.hero2 .blob, .hero2 .spark')];
  let ticking = false;
  const frame = () => {
    ticking = false;
    const y = scrollY, max = Math.max(1, document.documentElement.scrollHeight - vh()), p = Math.min(1, y / max);
    bar.style.transform = `scaleX(${p})`;
    if (y < vh() * 1.2) shapes.forEach((s, i) => { s.style.transform = `translate3d(0, ${(y * (0.08 + i * 0.05)).toFixed(1)}px, 0)`; });
    if (birds) {
      const top = 90 + p * (vh() - 220), sway = Math.sin(y / 140) * 10;
      birds.style.transform = `translate3d(${sway.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
      birds.style.setProperty('--pn-flap', (Math.sin(y / 60) * 6).toFixed(1) + 'deg');
    }
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); frame();
  if (rm && rm.addEventListener) rm.addEventListener('change', e => { if (e.matches) location.reload(); });
})();
