/* Peppynose V4 analytics: consent banner + Google Analytics 4 + Microsoft Clarity + named click events.
   - Nothing is loaded and no request goes to Google or Microsoft until the visitor taps "Accept".
   - IDs come from /analytics-config.js. Placeholders (G-XXXXXXXXXX / CLARITY_PROJECT_ID) = that tool never loads.
   - Choice saved in localStorage "pn_consent" = "granted" | "denied". Footer link "Cookie settings" reopens the banner.
   - GA4 Consent Mode v2: all four signals default to "denied"; on Accept only analytics_storage becomes "granted" (no ads).
   - Every event is also kept in window.pnEvents (this tab only, for testing). Vanilla JS, no libraries. */
(() => {
  const C = window.PN_ANALYTICS || {}, KEY = 'pn_consent';
  const GA = /^G-[A-Z0-9]{4,}$/.test(C.ga4 || '') && C.ga4 !== 'G-XXXXXXXXXX' ? C.ga4 : '';
  const CL = /^[a-z0-9]{6,}$/i.test(C.clarity || '') && C.clarity !== 'CLARITY_PROJECT_ID' ? C.clarity : '';
  const lang = (document.documentElement.lang || 'en').slice(0, 2);
  const NO_CL = /pregnancy-tracker/.test(location.pathname);   // V4.1: never load Microsoft Clarity on the tracker pages (EN/TA/HI)
  const get = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const set = v => { try { localStorage.setItem(KEY, v); } catch (e) {} };
  const T = {
    en: { msg: 'We use Google Analytics and Microsoft Clarity to see which pages and buttons help moms most. They only run if you accept. No ads.', yes: 'Accept', no: 'Decline', more: 'Privacy policy', label: 'Cookie choice', settings: 'Cookie settings' },
    ta: { msg: 'எந்தப் பக்கங்களும் பொத்தான்களும் அம்மாக்களுக்கு அதிகம் உதவுகின்றன என்று அறிய Google Analytics, Microsoft Clarity பயன்படுத்துகிறோம். நீங்கள் ஏற்றால் மட்டுமே இவை இயங்கும். விளம்பரம் இல்லை.', yes: 'ஏற்கிறேன்', no: 'வேண்டாம்', more: 'தனியுரிமைக் கொள்கை', label: 'குக்கீ தேர்வு', settings: 'குக்கீ அமைப்புகள்' },
    hi: { msg: 'कौन-से पेज और बटन माँओं के सबसे ज़्यादा काम आते हैं, यह जानने के लिए हम Google Analytics और Microsoft Clarity इस्तेमाल करते हैं। ये तभी चलते हैं जब आप स्वीकार करें। कोई विज्ञापन नहीं।', yes: 'स्वीकार करें', no: 'मना करें', more: 'गोपनीयता नीति', label: 'कुकी विकल्प', settings: 'कुकी सेटिंग्स' }
  }[lang] || null;
  const L = T || {};
  const base = (document.querySelector('link[rel="canonical"]') || {}).href || '';
  const privacyHref = (lang === 'en' ? '/' : '/' + lang + '/') + 'privacy.html';

  // ---- GA4 / Clarity loaders (only called after Accept) ----
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { dataLayer.push(arguments); };
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });
  let loaded = false;
  const load = () => {
    if (loaded) return; loaded = true;
    gtag('consent', 'update', { analytics_storage: 'granted' });
    if (GA) {
      const s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA;
      document.head.appendChild(s);
      gtag('js', new Date()); gtag('config', GA, { anonymize_ip: true, site_language: lang });
    }
    if (CL && !NO_CL) {
      (function (c, l, a, r, i, t, y) { c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
        t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i; y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
      })(window, document, 'clarity', 'script', CL);
      window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
    }
    (window.pnEvents || []).forEach(e => e.sent || send(e));      // events from this page view before Accept
  };
  const send = e => { e.sent = true; if (GA) gtag('event', e.name, e.params); if (CL && !NO_CL && window.clarity) window.clarity('event', e.name); };

  // ---- Public helper: window.pnTrack('event_name', {params}) ----
  window.pnEvents = window.pnEvents || [];
  window.pnTrack = (name, params) => {
    const e = { name, params: Object.assign({ language: lang, page_path: location.pathname }, params || {}), sent: false };
    window.pnEvents.push(e);
    if (loaded) send(e);
  };

  // ---- Banner ----
  let bar = null;
  // Move the floating buttons above the banner, then let wa.js / chatbot.js re-measure where they now sit (they listen to resize).
  let lifted = 0;
  const lift = h => { document.documentElement.style.setProperty('--pn-lift', h + 'px'); if (h !== lifted) { lifted = h; dispatchEvent(new Event('resize')); } };
  const close = () => { if (bar) { bar.remove(); bar = null; } lift(0); };
  const choose = v => {
    const before = get(); set(v); close();
    if (v === 'granted') load();
    else if (before === 'granted' || loaded) {                       // changed mind: stop and delete GA/Clarity cookies, then reload clean
      gtag('consent', 'update', { analytics_storage: 'denied' });
      document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(n => /^(_ga|_gid|_clck|_clsk|CLID|ANONCHK|MR|MUID|SM)/.test(n))
        .forEach(n => { ['', '; domain=.peppynose.com', '; domain=' + location.hostname].forEach(d => { document.cookie = n + '=; Max-Age=0; path=/' + d; }); });
      location.reload();
    }
  };
  const open = () => {
    if (bar || !T) return;
    bar = document.createElement('div');
    bar.className = 'pn-consent'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', L.label); bar.lang = lang;
    bar.innerHTML = `<p>${L.msg} <a href="${privacyHref}">${L.more}</a></p><div class="pn-consent-b"><button type="button" class="pn-c-no">${L.no}</button><button type="button" class="pn-c-yes">${L.yes}</button></div>`;
    bar.querySelector('.pn-c-yes').addEventListener('click', () => choose('granted'));
    bar.querySelector('.pn-c-no').addEventListener('click', () => choose('denied'));
    document.body.appendChild(bar);
    const fit = () => bar && lift(bar.offsetHeight + 12);           // banner height + its 12 px gap
    fit(); if ('ResizeObserver' in window) new ResizeObserver(fit).observe(bar);
  };

  // ---- Click tracking (one listener for the whole page) ----
  const slugOf = a => {
    const m = location.pathname.match(/\/buy\/([a-z0-9-]+)\.html$/); if (m) return m[1];
    const card = a.closest('.card, .buy-box, .fcard'); const q = card && card.querySelector('a.pn-qr');
    const n = q && q.getAttribute('href').match(/buy\/([a-z0-9-]+)\.html/); if (n) return n[1];
    const asin = a.href.match(/\/dp\/([A-Z0-9]{10})/); return asin ? 'asin_' + asin[1] : 'store';
  };
  document.addEventListener('click', ev => {
    const a = ev.target.closest('a[href], button'); if (!a) return;
    if (a.matches('[data-pn-cookie-settings]')) { ev.preventDefault(); open(); return; }
    if (a.tagName !== 'A') return;
    const href = a.href, host = (() => { try { return new URL(href).hostname; } catch (e) { return ''; } })();
    const text = (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (/(^|\.)amazon\.in$/.test(host)) pnTrack('amazon_click', { product_slug: slugOf(a), link_url: href });
    else if (/(^|\.)flipkart\.com$/.test(host)) pnTrack('flipkart_click', { product_slug: slugOf(a), link_url: href });
    else if (host === 'wa.me' || host === 'api.whatsapp.com') { if (!a.closest('.pn-chat')) pnTrack('whatsapp_click', { placement: a.classList.contains('wa-float') ? 'float' : (a.id === 'r-share' ? 'tracker_share' : 'page') }); }
    else if (/instagram\.com$/.test(host)) pnTrack('instagram_click', { link_url: href });
    else if (a.closest('.lang-switch') && a.hasAttribute('hreflang')) pnTrack('language_switch', { from_language: lang, to_language: a.getAttribute('hreflang') });
    else if (host && host !== location.hostname && /^https?:/.test(href)) pnTrack('outbound_click', { link_url: href });
    else if (a.closest('header, .nav, footer')) pnTrack('nav_click', { link_text: text, link_url: a.getAttribute('href'), area: a.closest('footer') ? 'footer' : 'header' });
  }, true);

  // ---- Buy page opened (from a QR scan or a link) ----
  const bm = location.pathname.match(/\/buy\/([a-z0-9-]+)\.html$/);
  if (bm) pnTrack('qr_buy_page_view', { product_slug: bm[1], arrived_from: document.referrer ? 'link' : 'direct_or_qr' });

  // ---- Start ----
  const go = () => {
    document.querySelectorAll('[data-pn-cookie-settings]').forEach(a => { if (!a.textContent.trim()) a.textContent = L.settings; });
    const c = get();
    if (c === 'granted') load(); else if (c !== 'denied') open();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
