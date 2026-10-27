/* Landing pages only: send a first-time visitor to the login page before the
   home page paints. Guests (pn_guest) and a logged-in hint (pn_logged_in) stay.
   The session cookie is HttpOnly, so this hint is only a fast check; auth.js
   confirms it with /api/auth/me. Known crawlers are not redirected.
   This file is a classic script in the browser and a CommonJS module in tests. */
(function (root) {
  var HOMES = { en: '/index.html', hi: '/hi/index.html', ta: '/ta/index.html' };
  var LOGINS = { en: '/login.html', hi: '/hi/login.html', ta: '/ta/login.html' };
  var CRAWLER = /googlebot|bingbot|duckduckbot|baiduspider|yandex|slurp|facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|applebot|semrush|ahrefs|petalbot|sogou|exabot|ia_archiver|mj12bot|dotbot|rogerbot|embedly|pinterestbot|slackbot|discordbot|google-inspectiontool|adsbot-google|mediapartners-google|storebot-google/i;

  function safeNext(raw) {
    if (typeof raw !== 'string') return '';
    var value = raw.trim();
    if (!value || value.length > 400) return '';
    for (var i = 0; i < 3 && /%[0-9a-fA-F]{2}/.test(value); i++) {
      try {
        var decoded = decodeURIComponent(value);
        if (decoded === value) break;
        value = decoded;
      } catch (e) {
        return '';
      }
    }
    if (value.charAt(0) !== '/' || value.charAt(1) === '/' || value.charAt(1) === '\\') return '';
    if (/[:\\\s\u0000-\u001f\u007f]/.test(value) || value.indexOf('//') !== -1 || value.indexOf('%') !== -1) return '';
    return value;
  }

  function normalizePath(path) {
    var raw = String(path || '/').split('#')[0].split('?')[0];
    if (raw.charAt(0) !== '/') return '';
    var p = raw.replace(/\/{2,}/g, '/');
    if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1);
    return p || '/';
  }

  function pageLang(path) {
    var p = normalizePath(path);
    if (p === '/hi' || p.indexOf('/hi/') === 0) return 'hi';
    if (p === '/ta' || p.indexOf('/ta/') === 0) return 'ta';
    return 'en';
  }

  function isLanding(path) {
    var p = normalizePath(path);
    return p === '/' || p === '/index.html' || p === '/hi' || p === '/hi/index.html' || p === '/ta' || p === '/ta/index.html';
  }

  function isAuthPath(path) {
    return /\/(?:login|signup)(\.html)?$/i.test(normalizePath(path));
  }

  function isCrawler(userAgent) {
    return CRAWLER.test(String(userAgent || ''));
  }

  function flag(name) {
    try {
      if (root.localStorage && root.localStorage.getItem(name) === '1') return true;
      if (root.sessionStorage && root.sessionStorage.getItem(name) === '1') return true;
    } catch (e) { /* private mode */ }
    var cookie = '';
    try { cookie = root.document && root.document.cookie || ''; } catch (e) { cookie = ''; }
    return new RegExp('(?:^|;\\s*)' + name + '=1(?:;|$)').test(cookie);
  }

  // Pure decision. redirect is a same-site login URL, or null to stay.
  function decide(state) {
    state = state || {};
    var path = state.path || '/';
    if (!isLanding(path)) return { redirect: null };
    if (state.guest || state.loggedInHint || isCrawler(state.userAgent)) return { redirect: null };
    var saved = state.langSaved === 'en' || state.langSaved === 'hi' || state.langSaved === 'ta' ? state.langSaved : '';
    var lang = saved || pageLang(path);
    var localized = state.localizedLogin !== false;
    var login = localized || lang === 'en' ? LOGINS[lang] : LOGINS.en;
    var home = safeNext(HOMES[lang]);
    if (!home || isAuthPath(home) || isAuthPath(login) && normalizePath(login) === normalizePath(path)) return { redirect: null };
    if (normalizePath(login) === normalizePath(path)) return { redirect: null };
    return { redirect: login + '?next=' + encodeURIComponent(home) };
  }

  function readState() {
    var lang = '';
    try { lang = root.localStorage ? (root.localStorage.getItem('pn_lang') || '') : ''; } catch (e) { lang = ''; }
    return {
      path: root.location ? root.location.pathname : '/',
      guest: flag('pn_guest'),
      loggedInHint: flag('pn_logged_in'),
      langSaved: lang,
      userAgent: root.navigator ? root.navigator.userAgent : ''
    };
  }

  function apply() {
    var choice = decide(readState());
    if (!choice.redirect) return;
    root.__pnLoginLeaving = true;
    root.location.replace(choice.redirect);
  }

  var api = {
    decide: decide,
    safeNext: safeNext,
    isCrawler: isCrawler,
    isLanding: isLanding,
    isAuthPath: isAuthPath,
    readState: readState,
    apply: apply
  };
  root.pnLoginGate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined' && root.location && !root.__pnLoginGateNoAuto) apply();
})(typeof globalThis !== 'undefined' ? globalThis : this);
