/* Header account link, and the login / sign-up / account pages.
   Talks to the shop Worker (see shop/src/auth.js). Cookies are HttpOnly;
   this file only keeps the CSRF token in memory, from GET /api/auth/me. */
(() => {
  if (window.__pnAuthInit) return;
  window.__pnAuthInit = true;

  const lang = (document.documentElement.lang || 'en').slice(0, 2);
  const L = ['en', 'ta', 'hi'].includes(lang) ? lang : 'en';
  const COPY = {
    en: {
      login: 'Log in', signup: 'Sign up', logout: 'Log out', account: 'Your account',
      notSetup: 'Accounts are not connected on this server yet. The site owner still needs to turn on the account service.',
      network: 'We could not reach the account service. Please try again.',
      invalid: 'Please check the highlighted fields.',
      email_taken: 'An account with this email already exists. Try logging in.',
      bad_login: 'Wrong email or password.',
      rate_limited: 'Too many tries. Please wait and try again.',
      csrf: 'This page is out of date. Please refresh and try again.',
      forbidden_origin: 'This site cannot do that.',
      not_configured: 'Accounts are not set up yet.',
      server: 'Something went wrong. Please try again.',
      fields: {
        name: 'Please enter your name (at least 2 letters).',
        email: 'Please enter a valid email.',
        short: 'Use at least 10 characters.',
        common: 'Please choose a less common password, and not your name or email.'
      },
      out: 'You are not logged in.',
      hello: (name, email) => 'Logged in as ' + name + ' (' + email + ').',
      deleted: 'Your account has been deleted.',
      working: 'Please wait…'
    },
    hi: {
      login: 'लॉग इन', signup: 'साइन अप', logout: 'लॉग आउट', account: 'आपका खाता',
      notSetup: 'इस सर्वर पर खाते अभी जुड़े नहीं हैं। साइट के मालिक को खाता सेवा चालू करनी होगी।',
      network: 'खाता सेवा तक नहीं पहुँच सके। कृपया फिर कोशिश करें।',
      invalid: 'कृपया हाइलाइट किए गए खाने जाँचें।',
      email_taken: 'इस ईमेल पर पहले से खाता है। लॉग इन करके देखें।',
      bad_login: 'ईमेल या पासवर्ड ग़लत है।',
      rate_limited: 'बहुत बार कोशिश हो चुकी है। थोड़ी देर बाद फिर कोशिश करें।',
      csrf: 'यह पेज पुराना हो गया है। रिफ़्रेश करके फिर कोशिश करें।',
      forbidden_origin: 'यह साइट यह नहीं कर सकती।',
      not_configured: 'खाते अभी सेट नहीं हैं।',
      server: 'कुछ गड़बड़ हो गई। कृपया फिर कोशिश करें।',
      fields: {
        name: 'कृपया अपना नाम लिखें (कम से कम 2 अक्षर)।',
        email: 'कृपया सही ईमेल लिखें।',
        short: 'कम से कम 10 अक्षर इस्तेमाल करें।',
        common: 'कृपया एक कम आम पासवर्ड चुनें, और वह आपका नाम या ईमेल न हो।'
      },
      out: 'आप लॉग इन नहीं हैं।',
      hello: (name, email) => name + ' के रूप में लॉग इन हैं (' + email + ')।',
      deleted: 'आपका खाता मिटा दिया गया है।',
      working: 'कृपया इंतज़ार करें…'
    },
    ta: {
      login: 'நுழை', signup: 'பதிவு', logout: 'வெளியேறு', account: 'உங்கள் கணக்கு',
      notSetup: 'இந்த சேவையகத்தில் கணக்குகள் இன்னும் இணைக்கப்படவில்லை. தள உரிமையாளர் கணக்கு சேவையை இயக்க வேண்டும்.',
      network: 'கணக்கு சேவையை அடைய முடியவில்லை. மீண்டும் முயலவும்.',
      invalid: 'குறிக்கப்பட்ட இடங்களைச் சரிபார்க்கவும்.',
      email_taken: 'இந்த மின்னஞ்சலில் ஏற்கெனவே ஒரு கணக்கு உள்ளது. உள்நுழைந்து பாருங்கள்.',
      bad_login: 'மின்னஞ்சல் அல்லது கடவுச்சொல் தவறு.',
      rate_limited: 'பல முறை முயன்றுவிட்டீர்கள். சிறிது நேரம் கழித்து மீண்டும் முயலவும்.',
      csrf: 'இந்தப் பக்கம் பழையது. புதுப்பித்து மீண்டும் முயலவும்.',
      forbidden_origin: 'இந்தத் தளத்தால் இதைச் செய்ய முடியாது.',
      not_configured: 'கணக்குகள் இன்னும் அமைக்கப்படவில்லை.',
      server: 'ஏதோ தவறு நேர்ந்தது. மீண்டும் முயலவும்.',
      fields: {
        name: 'உங்கள் பெயரை உள்ளிடுங்கள் (குறைந்தது 2 எழுத்துகள்).',
        email: 'சரியான மின்னஞ்சலை உள்ளிடுங்கள்.',
        short: 'குறைந்தது 10 எழுத்துகள் பயன்படுத்துங்கள்.',
        common: 'குறைவாகப் பயன்படும் கடவுச்சொல்லைத் தேர்ந்தெடுங்கள்; பெயரோ மின்னஞ்சலோ வேண்டாம்.'
      },
      out: 'நீங்கள் உள்நுழையவில்லை.',
      hello: (name, email) => name + ' ஆக உள்நுழைந்துள்ளீர்கள் (' + email + ').',
      deleted: 'உங்கள் கணக்கு நீக்கப்பட்டது.',
      working: 'காத்திருக்கவும்…'
    }
  };
  const t = COPY[L];

  const apiBase = () => String(window.PN_AUTH_API || '').replace(/\/$/, '');
  const api = p => apiBase() + p;
  const root = L === 'en' ? '' : '/' + L;
  const path = file => root + '/' + file;

  function safeNext(raw) {
    if (!raw || raw[0] !== '/' || raw[1] === '/' || raw.includes('\\') || raw.includes(':')) return '';
    return raw;
  }

  function explain(data) {
    if (!data || typeof data !== 'object') return t.notSetup;
    if (data.fields) {
      const code = data.fields.password || data.fields.email || data.fields.name;
      if (code && t.fields[code]) return t.fields[code];
    }
    return t[data.code] || data.error || t.server;
  }

  async function read(res) {
    const text = await res.text();
    try { return JSON.parse(text); } catch { return null; }
  }

  function ensureSlot() {
    const bar = document.querySelector('header .bar');
    if (!bar || bar.querySelector('.pn-auth')) return bar && bar.querySelector('.pn-auth');
    const slot = document.createElement('span');
    slot.className = 'pn-auth';
    const nav = bar.querySelector('nav');
    if (nav && nav.nextSibling) bar.insertBefore(slot, nav.nextSibling);
    else bar.appendChild(slot);
    return slot;
  }

  async function logout(csrf) {
    const slot = document.querySelector('.pn-auth button');
    if (slot) slot.disabled = true;
    try {
      await fetch(api('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf || '' },
        body: '{}'
      });
    } catch { /* still leave the page; the cookie may already be gone */ }
    location.assign(path('login.html'));
  }

  function paintHeader(me) {
    const slot = ensureSlot();
    if (!slot) return;
    slot.replaceChildren();
    if (me && me.user) {
      const a = document.createElement('a');
      a.className = 'pn-account';
      a.href = path('account.html');
      a.textContent = me.user.name;
      a.title = me.user.email;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pn-logout';
      b.textContent = t.logout;
      b.addEventListener('click', () => logout(me.csrf));
      slot.append(a, b);
    } else {
      const a = document.createElement('a');
      a.className = 'pn-account';
      a.href = path('login.html');
      if (/(login|signup|account)\.html$/.test(location.pathname)) a.setAttribute('aria-current', 'page');
      a.textContent = t.login;
      slot.append(a);
    }
  }

  function paintAccount(me) {
    const inn = document.getElementById('account-in');
    const out = document.getElementById('account-out');
    if (!inn || !out) return;
    const status = document.getElementById('auth-status');
    if (status) status.hidden = true;
    const who = document.getElementById('who');
    if (me && me.user) {
      inn.hidden = false;
      out.hidden = true;
      if (who) who.textContent = t.hello(me.user.name, me.user.email);
      const btn = document.getElementById('logout');
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => logout(me.csrf));
      }
      const del = document.getElementById('delete-form');
      if (del && !del.dataset.bound) {
        del.dataset.bound = '1';
        del.addEventListener('submit', async ev => {
          ev.preventDefault();
          const err = document.getElementById('err');
          const submit = del.querySelector('button');
          if (err) err.textContent = '';
          if (submit) submit.disabled = true;
          try {
            const res = await fetch(api('/api/auth/delete'), {
              method: 'POST',
              credentials: 'include',
              headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrf || '' },
              body: JSON.stringify({ password: del.password.value })
            });
            const data = await read(res);
            if (!res.ok || !data) {
              if (err) err.textContent = data ? explain(data) : t.notSetup;
              if (submit) submit.disabled = false;
              return;
            }
            location.assign(path('login.html') + '?deleted=1');
          } catch {
            if (err) err.textContent = t.network;
            if (submit) submit.disabled = false;
          }
        });
      }
    } else {
      inn.hidden = true;
      out.hidden = false;
    }
  }

  function bindForm() {
    const form = document.getElementById('auth-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';
    const err = document.getElementById('err');
    const mode = form.dataset.mode === 'signup' ? 'signup' : 'login';
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (err) err.textContent = '';
      const submit = form.querySelector('button[type="submit"]');
      if (submit) { submit.disabled = true; submit.dataset.label = submit.dataset.label || submit.textContent; submit.textContent = t.working; }
      const body = { email: form.email.value, password: form.password.value };
      if (mode === 'signup') body.name = form.name.value;
      try {
        const res = await fetch(api('/api/auth/' + mode), {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await read(res);
        if (!res.ok || !data || !data.user) {
          if (err) err.textContent = data ? explain(data) : t.notSetup;
          return;
        }
        const next = safeNext(new URLSearchParams(location.search).get('next')) || path('account.html');
        location.assign(next);
      } catch {
        if (err) err.textContent = t.network;
      } finally {
        if (submit) { submit.disabled = false; submit.textContent = submit.dataset.label || submit.textContent; }
      }
    });
  }

  async function start() {
    bindForm();
    if (new URLSearchParams(location.search).get('deleted') === '1') {
      const note = document.getElementById('deleted-note');
      if (note) { note.hidden = false; note.textContent = t.deleted; }
    }
    let me = null;
    try {
      const res = await fetch(api('/api/auth/me'), { credentials: 'include' });
      if (res.ok) me = await read(res);
    } catch { me = null; }
    paintHeader(me);
    paintAccount(me);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
