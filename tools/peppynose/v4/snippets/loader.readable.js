// Readable version of the inline loader script in snippets/loader.html (V4). Same logic as V3, new timing.
(function () {
  var l = document.getElementById('pn-loader');
  if (!l) return;
  var seen = false;
  try { seen = sessionStorage.getItem('pn_loader_seen') === '1'; sessionStorage.setItem('pn_loader_seen', '1'); } catch (e) {}
  // Once per tab, and never when the visitor asks for reduced motion.
  if (seen || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { l.remove(); return; }
  var t0 = 0, done = false;
  function hide() { if (done) return; done = true; l.classList.add('pn-out'); setTimeout(function () { l.remove(); }, 220); }
  // The clock starts at the FIRST PAINT (first animation frame), because the CSS animation can only start then.
  // Birds need ~560 ms to hop and show the lettering. Fade starts at max(DOMContentLoaded, 560 ms after first paint) and never
  // later than 680 ms after first paint, so the loader is gone by ~900 ms after it first appears. Safety cap: 2.5 s after the script runs.
  // pointer-events:none (V3 CSS) means taps always reach the page underneath.
  requestAnimationFrame(function () { t0 = Date.now(); setTimeout(hide, 680); });
  document.addEventListener('DOMContentLoaded', function () { setTimeout(hide, t0 ? Math.max(0, 560 - (Date.now() - t0)) : 560); });
  setTimeout(hide, 2500);
})();
