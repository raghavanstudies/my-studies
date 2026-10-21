/* Peppynose language choice: EN is the default. The switch is on the HOME PAGE ONLY (index.html, /ta/, /hi/).
   The visitor's choice is saved in localStorage and applied site-wide: any page opened in another language
   is replaced by the same page in the saved language, so every internal link leads to that language's version. No automatic redirect by browser language;
   if the browser is Tamil or Hindi and no choice has been made, a small dismissible suggestion is shown once. */
(() => {
  const KEY = 'pn_lang', DISMISS = 'pn_lang_hint_dismissed';
  const cur = (document.documentElement.lang || 'en').slice(0, 2);
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const alt = l => document.querySelector(`link[rel="alternate"][hreflang="${l}"]`);
  const go = l => { const a = alt(l); if (a) location.replace(new URL(a.href).pathname + location.search + location.hash); };
  const saved = get(KEY);
  // 1) A saved choice wins: send the visitor to the same page in their language (runs in <head>, before paint).
  if (saved && saved !== cur && ['en', 'ta', 'hi'].includes(saved) && alt(saved)) { go(saved); return; }
  document.addEventListener('DOMContentLoaded', () => {
    // 2) Remember the choice whenever the switch is used (header or mobile menu).
    document.querySelectorAll('.lang-switch a[hreflang]').forEach(a =>
      a.addEventListener('click', () => set(KEY, a.getAttribute('hreflang'))));
    // 3) One-time suggestion banner (English home page only, no saved choice, browser language ta/hi, not dismissed).
    const bl = (navigator.languages && navigator.languages[0] || navigator.language || '').slice(0, 2).toLowerCase();
    if (cur !== 'en' || !document.querySelector('.lang-switch') || saved || get(DISMISS) || !['ta', 'hi'].includes(bl) || !alt(bl)) return;
    const T = { ta: ['இந்தத் தளம் தமிழிலும் உள்ளது.', 'தமிழில் பார்க்க', 'மூடு'],
                hi: ['यह साइट हिंदी में भी है।', 'हिंदी में देखें', 'बंद करें'] }[bl];
    const b = document.createElement('div');
    b.className = 'lang-hint'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Language suggestion'); b.lang = bl;
    b.innerHTML = `<span>${T[0]}</span> <a href="${new URL(alt(bl).href).pathname}" hreflang="${bl}">${T[1]}</a> <button type="button" aria-label="${T[2]}">✕</button>`;
    b.querySelector('a').addEventListener('click', () => set(KEY, bl));
    b.querySelector('button').addEventListener('click', () => { set(DISMISS, '1'); b.remove(); });
    set(DISMISS, '1'); // shown once only, even if ignored
    document.body.prepend(b);
  });
})();
