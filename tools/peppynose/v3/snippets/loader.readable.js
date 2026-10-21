// Readable version of the inline loader script (the minified copy sits right after <div id="pn-loader"> at the top of <body>).
(function () {
  var l = document.getElementById('pn-loader');
  if (!l) return;
  var seen = false;
  try { seen = sessionStorage.getItem('pn_loader_seen') === '1'; sessionStorage.setItem('pn_loader_seen', '1'); } catch (e) {}
  // Only on the first page view in this tab, and never for visitors who prefer reduced motion.
  if (seen || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { l.remove(); return; }
  var done = false;
  function hide() { if (done) return; done = true; l.classList.add('pn-out'); setTimeout(function () { l.remove(); }, 220); }
  document.addEventListener('DOMContentLoaded', hide); // fade out as soon as the HTML is ready
  setTimeout(hide, 600);                                // hard cap: fade starts by 600 ms, gone by ~800 ms
})();
