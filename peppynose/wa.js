/* G. WhatsApp button: fade it out whenever a buy button, any .btn, the Instagram grid or the footer
   passes underneath it, so it never covers them (all screen sizes). */
(() => {
  const wa = document.querySelector('.wa-float');
  if (!wa || !('IntersectionObserver' in window)) return;
  let io; const hits = new Set();
  const setup = () => {
    if (io) io.disconnect(); hits.clear(); wa.classList.remove('wa-hide');
    const r = wa.getBoundingClientRect(), pad = 12;
    const top = Math.max(0, Math.floor(r.top - pad)), left = Math.max(0, Math.floor(r.left - pad));
    io = new IntersectionObserver(es => {
      es.forEach(e => e.isIntersecting ? hits.add(e.target) : hits.delete(e.target));
      wa.classList.toggle('wa-hide', hits.size > 0);
    }, { rootMargin: `-${top}px 0px 0px -${left}px` });
    document.querySelectorAll('.buy, .actions, .btn, .ig-grid, .agebar, .chips, footer').forEach(el => io.observe(el));
  };
  setup();
  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(setup, 150); });
})();
