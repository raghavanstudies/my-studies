/* Header account link, and the login / sign-up / account pages.
   Talks to the shop Worker (see shop/src/auth.js). Cookies are HttpOnly;
   this file only keeps the CSRF token in memory, from GET /api/auth/me.
   Guests who skip login are not sent back to this page. Shopping does not
   require an account. */
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
      username_taken: 'That username is already taken.',
      mobile_taken: 'An account with this mobile number already exists.',
      bad_login: 'Invalid credentials.',
      rate_limited: 'Too many tries. Please wait and try again.',
      csrf: 'This page is out of date. Please refresh and try again.',
      forbidden_origin: 'This site cannot do that.',
      not_configured: 'Accounts are not set up yet.',
      otp_not_configured: 'Code login is not available yet.',
      otp_soon: 'Code login is coming soon.',
      otp_needs_contact: 'A code can be sent to a mobile number or an email, not a username.',
      otp_sent: 'If an account exists, we sent a code.',
      otp_invalid: 'That code is wrong or has expired.',
      otp_locked: 'Too many tries for this code. Request a new one.',
      server: 'Something went wrong. Please try again.',
      fields: {
        name: 'Please enter your name (at least 2 letters).',
        username: 'Use 3 to 30 letters, digits, underscores or dots. Not only digits.',
        username_taken: 'That username is already taken.',
        mobile: 'Enter a 10-digit Indian mobile number.',
        mobile_taken: 'An account with this mobile number already exists.',
        email: 'Please enter a valid email.',
        email_taken: 'An account with this email already exists. Try logging in.',
        identifier: 'Enter a username, a 10-digit mobile number, or an email.',
        short: 'Use at least 10 characters.',
        common: 'Please choose a less common password, and not your name, username, mobile or email.',
        mismatch: 'Password and confirm password do not match.'
      },
      out: 'You are not logged in.',
      hello: u => 'Logged in as ' + u.name + ' (' + u.username + ', ' + u.mobile + ', ' + u.email + ').',
      deleted: 'Your account has been deleted.',
      working: 'Please wait…',
      resend: 'Resend code',
      resendIn: n => 'Resend code (' + n + 's)'
    },
    hi: {
      login: 'लॉग इन', signup: 'साइन अप', logout: 'लॉग आउट', account: 'आपका खाता',
      notSetup: 'इस सर्वर पर खाते अभी जुड़े नहीं हैं। साइट के मालिक को खाता सेवा चालू करनी होगी।',
      network: 'खाता सेवा तक नहीं पहुँच सके। कृपया फिर कोशिश करें।',
      invalid: 'कृपया हाइलाइट किए गए खाने जाँचें।',
      email_taken: 'इस ईमेल पर पहले से खाता है। लॉग इन करके देखें।',
      username_taken: 'यह उपयोगकर्ता नाम पहले से लिया जा चुका है।',
      mobile_taken: 'इस मोबाइल नंबर पर पहले से खाता है।',
      bad_login: 'यह जानकारी सही नहीं है।',
      rate_limited: 'बहुत बार कोशिश हो चुकी है। थोड़ी देर बाद फिर कोशिश करें।',
      csrf: 'यह पेज पुराना हो गया है। रिफ़्रेश करके फिर कोशिश करें।',
      forbidden_origin: 'यह साइट यह नहीं कर सकती।',
      not_configured: 'खाते अभी सेट नहीं हैं।',
      otp_not_configured: 'कोड से लॉग इन अभी उपलब्ध नहीं है।',
      otp_soon: 'कोड से लॉग इन जल्द आ रहा है।',
      otp_needs_contact: 'कोड मोबाइल नंबर या ईमेल पर भेजा जा सकता है, उपयोगकर्ता नाम पर नहीं।',
      otp_sent: 'अगर खाता है, तो हमने एक कोड भेज दिया है।',
      otp_invalid: 'यह कोड ग़लत है या इसकी समय-सीमा खत्म हो गई है।',
      otp_locked: 'इस कोड की कोशिशें खत्म हो गईं। नया कोड माँगें।',
      server: 'कुछ गड़बड़ हो गई। कृपया फिर कोशिश करें।',
      fields: {
        name: 'कृपया अपना नाम लिखें (कम से कम 2 अक्षर)।',
        username: '3 से 30 अक्षर, अंक, अंडरस्कोर या बिंदु। सिर्फ़ अंक नहीं।',
        username_taken: 'यह उपयोगकर्ता नाम पहले से लिया जा चुका है।',
        mobile: '10 अंकों का भारतीय मोबाइल नंबर लिखें।',
        mobile_taken: 'इस मोबाइल नंबर पर पहले से खाता है।',
        email: 'कृपया सही ईमेल लिखें।',
        email_taken: 'इस ईमेल पर पहले से खाता है। लॉग इन करके देखें।',
        identifier: 'उपयोगकर्ता नाम, 10 अंकों का मोबाइल नंबर, या ईमेल लिखें।',
        short: 'कम से कम 10 अक्षर इस्तेमाल करें।',
        common: 'कृपया एक कम आम पासवर्ड चुनें। वह आपका नाम, उपयोगकर्ता नाम, मोबाइल या ईमेल न हो।',
        mismatch: 'पासवर्ड और पुष्टि वाला पासवर्ड एक जैसे नहीं हैं।'
      },
      out: 'आप लॉग इन नहीं हैं।',
      hello: u => u.name + ' के रूप में लॉग इन हैं (' + u.username + ', ' + u.mobile + ', ' + u.email + ')।',
      deleted: 'आपका खाता मिटा दिया गया है।',
      working: 'कृपया इंतज़ार करें…',
      resend: 'कोड फिर भेजें',
      resendIn: n => 'कोड फिर भेजें (' + n + ' सेकंड)'
    },
    ta: {
      login: 'நுழை', signup: 'பதிவு', logout: 'வெளியேறு', account: 'உங்கள் கணக்கு',
      notSetup: 'இந்த சேவையகத்தில் கணக்குகள் இன்னும் இணைக்கப்படவில்லை. தள உரிமையாளர் கணக்கு சேவையை இயக்க வேண்டும்.',
      network: 'கணக்கு சேவையை அடைய முடியவில்லை. மீண்டும் முயலவும்.',
      invalid: 'குறிக்கப்பட்ட இடங்களைச் சரிபார்க்கவும்.',
      email_taken: 'இந்த மின்னஞ்சலில் ஏற்கெனவே ஒரு கணக்கு உள்ளது. உள்நுழைந்து பாருங்கள்.',
      username_taken: 'இந்தப் பயனர் பெயர் ஏற்கெனவே உள்ளது.',
      mobile_taken: 'இந்தக் கைபேசி எண்ணில் ஏற்கெனவே ஒரு கணக்கு உள்ளது.',
      bad_login: 'இந்த விவரங்கள் தவறானவை.',
      rate_limited: 'பல முறை முயன்றுவிட்டீர்கள். சிறிது நேரம் கழித்து மீண்டும் முயலவும்.',
      csrf: 'இந்தப் பக்கம் பழையது. புதுப்பித்து மீண்டும் முயலவும்.',
      forbidden_origin: 'இந்தத் தளத்தால் இதைச் செய்ய முடியாது.',
      not_configured: 'கணக்குகள் இன்னும் அமைக்கப்படவில்லை.',
      otp_not_configured: 'குறியீட்டுடன் உள்நுழைவு இன்னும் இல்லை.',
      otp_soon: 'குறியீட்டு உள்நுழைவு விரைவில் வரும்.',
      otp_needs_contact: 'குறியீட்டைக் கைபேசி எண் அல்லது மின்னஞ்சலுக்கு அனுப்பலாம்; பயனர் பெயருக்கு அல்ல.',
      otp_sent: 'கணக்கு இருந்தால், ஒரு குறியீட்டை அனுப்பியுள்ளோம்.',
      otp_invalid: 'அந்தக் குறியீடு தவறு அல்லது காலாவதியாகிவிட்டது.',
      otp_locked: 'இந்தக் குறியீட்டுக்கான முயற்சிகள் முடிந்தன. புதிய குறியீட்டைக் கோருங்கள்.',
      server: 'ஏதோ தவறு நேர்ந்தது. மீண்டும் முயலவும்.',
      fields: {
        name: 'உங்கள் பெயரை உள்ளிடுங்கள் (குறைந்தது 2 எழுத்துகள்).',
        username: '3 முதல் 30 எழுத்து, எண், அடிக்கோடு அல்லது புள்ளி. எண்கள் மட்டும் வேண்டாம்.',
        username_taken: 'இந்தப் பயனர் பெயர் ஏற்கெனவே உள்ளது.',
        mobile: '10 இலக்க இந்தியக் கைபேசி எண்ணை உள்ளிடுங்கள்.',
        mobile_taken: 'இந்தக் கைபேசி எண்ணில் ஏற்கெனவே ஒரு கணக்கு உள்ளது.',
        email: 'சரியான மின்னஞ்சலை உள்ளிடுங்கள்.',
        email_taken: 'இந்த மின்னஞ்சலில் ஏற்கெனவே ஒரு கணக்கு உள்ளது. உள்நுழைந்து பாருங்கள்.',
        identifier: 'பயனர் பெயர், 10 இலக்கக் கைபேசி எண் அல்லது மின்னஞ்சலை உள்ளிடுங்கள்.',
        short: 'குறைந்தது 10 எழுத்துகள் பயன்படுத்துங்கள்.',
        common: 'குறைவாகப் பயன்படும் கடவுச்சொல்லைத் தேர்ந்தெடுங்கள்; பெயர், பயனர் பெயர், கைபேசி எண், மின்னஞ்சல் வேண்டாம்.',
        mismatch: 'கடவுச்சொல்லும் உறுதிப்படுத்தலும் ஒன்றாக இல்லை.'
      },
      out: 'நீங்கள் உள்நுழையவில்லை.',
      hello: u => u.name + ' ஆக உள்நுழைந்துள்ளீர்கள் (' + u.username + ', ' + u.mobile + ', ' + u.email + ').',
      deleted: 'உங்கள் கணக்கு நீக்கப்பட்டது.',
      working: 'காத்திருக்கவும்…',
      resend: 'குறியீட்டை மீண்டும் அனுப்பு',
      resendIn: n => 'குறியீட்டை மீண்டும் அனுப்பு (' + n + ' வி)'
    }
  };
  const t = COPY[L];

  const apiBase = () => String(window.PN_AUTH_API || '').replace(/\/$/, '');
  const api = p => apiBase() + p;
  const root = L === 'en' ? '' : '/' + L;
  const path = file => root + '/' + file;
  const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

  function safeNext(raw) {
    if (typeof raw !== 'string') return '';
    let value = raw.trim();
    if (!value || value.length > 400) return '';
    for (let i = 0; i < 3 && /%[0-9a-fA-F]{2}/.test(value); i++) {
      try {
        const decoded = decodeURIComponent(value);
        if (decoded === value) break;
        value = decoded;
      } catch {
        return '';
      }
    }
    if (value[0] !== '/' || value[1] === '/' || value[1] === '\\') return '';
    if (/[:\\\s\u0000-\u001f\u007f]/.test(value) || value.includes('//') || value.includes('%')) return '';
    return value;
  }

  function normalizeMobile(raw) {
    let s = String(raw || '').replace(/[\s-]/g, '');
    if (s.startsWith('+91')) s = s.slice(3);
    else if (s.startsWith('+')) return '';
    if (s.startsWith('91') && s.length === 12) s = s.slice(2);
    else if (s.startsWith('0') && s.length === 11) s = s.slice(1);
    return /^[6-9]\d{9}$/.test(s) ? s : '';
  }

  function contactKind(raw) {
    const text = String(raw || '').trim();
    if (!text || text.length > 120) return '';
    if (text.includes('@')) {
      const email = text.replace(/\s+/g, '').toLowerCase();
      if (!EMAIL.test(email) || email.includes('..') || email.startsWith('.') || email.includes('.@')) return '';
      return 'email';
    }
    const compact = text.replace(/[\s-]/g, '');
    if (/^\+?\d+$/.test(compact)) return normalizeMobile(text) ? 'mobile' : '';
    return '';
  }

  function explain(data) {
    if (!data || typeof data !== 'object') return t.notSetup;
    if (data.code && data.code !== 'invalid' && t[data.code]) return t[data.code];
    if (data.fields) {
      const order = ['name', 'username', 'mobile', 'email', 'identifier', 'password', 'confirm'];
      const msgs = [];
      for (const key of order) {
        const code = data.fields[key];
        const msg = code && t.fields[code];
        if (msg && !msgs.includes(msg)) msgs.push(msg);
      }
      if (msgs.length) return msgs.join(' ');
    }
    return t[data.code] || data.error || t.server;
  }

  function showFields(form, data) {
    if (!form) return;
    form.querySelectorAll('.auth-field-err').forEach(el => { el.textContent = ''; });
    form.querySelectorAll('input').forEach(el => el.removeAttribute('aria-invalid'));
    if (!data || !data.fields) return;
    for (const [name, code] of Object.entries(data.fields)) {
      const input = form.elements[name];
      if (input) input.setAttribute('aria-invalid', 'true');
      const slot = form.querySelector('[data-for="' + name + '"]');
      if (slot) slot.textContent = (code && t.fields[code]) || '';
    }
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
    clearLogin();
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
      a.title = me.user.email || '';
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
      if (who) who.textContent = t.hello(me.user);
      const user = me.user;
      const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value || ''; };
      set('who-username', user.username);
      set('who-mobile', user.mobile);
      set('who-email', user.email);
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
            clearLogin();
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

  function browserCookie(name, value, maxAge) {
    const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    document.cookie = name + '=' + value + '; Path=/; Max-Age=' + maxAge + '; SameSite=Lax' + (secure ? '; Secure' : '');
  }

  function rememberFlag(name) {
    try { sessionStorage.setItem(name, '1'); } catch { /* private mode */ }
    try { localStorage.setItem(name, '1'); } catch { /* private mode */ }
    browserCookie(name, '1', 60 * 60 * 24 * 14);
  }

  function clearFlag(name) {
    try { sessionStorage.removeItem(name); } catch { /* private mode */ }
    try { localStorage.removeItem(name); } catch { /* private mode */ }
    browserCookie(name, '', 0);
  }

  function rememberGuest() { rememberFlag('pn_guest'); }
  function rememberLogin() { rememberFlag('pn_logged_in'); }
  function clearLogin() { clearFlag('pn_logged_in'); }

  function carryNext() {
    const next = safeNext(new URLSearchParams(location.search).get('next'));
    if (!next || /\/(?:login|signup)(\.html)?$/i.test(next.split('?')[0])) return;
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (!/(^|\/)signup\.html(?:\?|$)/.test(href)) return;
      const base = href.split('?')[0];
      a.setAttribute('href', base + '?next=' + encodeURIComponent(next));
    });
  }

  // A stale pn_logged_in hint is corrected from /api/auth/me. A real session
  // that hits the login page with a safe next goes back to that page.
  function leaveForGate(meKnown, me) {
    const loggedIn = !!(meKnown && me && me.user);
    if (loggedIn && /\/login(\.html)?$/i.test(location.pathname)) {
      const next = safeNext(new URLSearchParams(location.search).get('next'));
      if (next && !/\/(?:login|signup)(\.html)?$/i.test(next.split('?')[0])) {
        location.replace(next);
        return true;
      }
    }
    if (!window.pnLoginGate || !meKnown || loggedIn) return false;
    const state = window.pnLoginGate.readState();
    state.loggedInHint = false;
    const choice = window.pnLoginGate.decide(state);
    if (!choice.redirect) return false;
    globalThis.__pnLoginLeaving = true;
    location.replace(choice.redirect);
    return true;
  }

  function guestTarget() {
    const q = new URLSearchParams(location.search);
    const picked = safeNext(q.get('next')) || safeNext(q.get('returnTo'));
    if (picked) return picked;
    try {
      if (document.referrer) {
        const u = new URL(document.referrer);
        if (u.origin === location.origin) {
          const ref = safeNext(u.pathname + u.search);
          if (ref && !/(login|signup)\.html$/.test(u.pathname)) return ref;
        }
      }
    } catch { /* ignore a bad referrer */ }
    return path('index.html');
  }

  function bindSkip() {
    const btn = document.getElementById('skip-login');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      rememberGuest();
      location.assign(guestTarget());
    });
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
      showFields(form, null);
      const submit = form.querySelector('button[type="submit"]');
      if (submit) { submit.disabled = true; submit.dataset.label = submit.dataset.label || submit.textContent; submit.textContent = t.working; }
      const body = mode === 'signup'
        ? { name: form.name.value, username: form.username.value, mobile: form.mobile.value, email: form.email.value, password: form.password.value, confirm: form.confirm.value }
        : { identifier: form.identifier.value, password: form.password.value };
      try {
        const res = await fetch(api('/api/auth/' + mode), {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await read(res);
        if (!res.ok || !data || !data.user) {
          showFields(form, data);
          if (err) err.textContent = data ? explain(data) : t.notSetup;
          return;
        }
        rememberLogin();
        const next = safeNext(new URLSearchParams(location.search).get('next')) || path('account.html');
        location.assign(next);
      } catch {
        if (err) err.textContent = t.network;
      } finally {
        if (submit) { submit.disabled = false; submit.textContent = submit.dataset.label || submit.textContent; }
      }
    });
  }

  function bindOtp() {
    const requestBtn = document.getElementById('otp-request');
    const form = document.getElementById('auth-form');
    if (!requestBtn || !form || requestBtn.dataset.bound) return;
    requestBtn.dataset.bound = '1';
    const input = form.identifier;
    const hint = document.getElementById('otp-hint');
    const panel = document.getElementById('otp-panel');
    const sent = document.getElementById('otp-sent');
    const code = document.getElementById('otp-code');
    const verify = document.getElementById('otp-verify');
    const resend = document.getElementById('otp-resend');
    const err = document.getElementById('err');
    const hintText = hint ? hint.textContent : '';
    let clock = 0;
    let settled = false;
    let otpOn = false;

    function refresh() {
      if (!settled) return;
      const kind = otpOn ? contactKind(input.value) : '';
      requestBtn.disabled = !otpOn || !kind;
      requestBtn.hidden = !otpOn;
      requestBtn.style.display = otpOn ? '' : 'none';
      requestBtn.setAttribute('aria-hidden', otpOn ? 'false' : 'true');
      if (hint) {
        if (!otpOn) {
          hint.hidden = false;
          hint.textContent = t.otp_soon;
        } else {
          hint.textContent = hintText;
          hint.hidden = !!kind;
        }
      }
      if (!otpOn && panel) panel.hidden = true;
    }
    input.addEventListener('input', refresh);

    async function loadOtpConfig() {
      try {
        const res = await fetch(api('/api/auth/config'), { credentials: 'include' });
        const data = res.ok ? await read(res) : null;
        otpOn = !!(data && data.otp);
      } catch {
        otpOn = false;
      }
      settled = true;
      refresh();
    }
    loadOtpConfig();

    function armResend() {
      if (!resend) return;
      let left = 30;
      resend.disabled = true;
      resend.textContent = t.resendIn(left);
      clearInterval(clock);
      clock = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          clearInterval(clock);
          resend.disabled = false;
          resend.textContent = t.resend;
          return;
        }
        resend.textContent = t.resendIn(left);
      }, 1000);
    }

    async function requestCode() {
      if (!otpOn) return;
      if (err) err.textContent = '';
      requestBtn.disabled = true;
      try {
        const res = await fetch(api('/api/auth/otp/request'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ identifier: input.value })
        });
        const data = await read(res);
        if (!res.ok || !data) {
          if (err) err.textContent = data ? explain(data) : t.notSetup;
          return;
        }
        if (panel) panel.hidden = false;
        if (sent) sent.textContent = t.otp_sent;
        if (code) code.value = '';
        armResend();
      } catch {
        if (err) err.textContent = t.network;
      } finally {
        refresh();
      }
    }

    requestBtn.addEventListener('click', requestCode);
    if (resend) resend.addEventListener('click', requestCode);
    if (verify) verify.addEventListener('click', async () => {
      if (err) err.textContent = '';
      verify.disabled = true;
      try {
        const res = await fetch(api('/api/auth/otp/verify'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ identifier: input.value, code: code ? code.value : '' })
        });
        const data = await read(res);
        if (!res.ok || !data || !data.user) {
          if (err) err.textContent = data ? explain(data) : t.notSetup;
          return;
        }
        rememberLogin();
        const next = safeNext(new URLSearchParams(location.search).get('next')) || path('account.html');
        location.assign(next);
      } catch {
        if (err) err.textContent = t.network;
      } finally {
        verify.disabled = false;
      }
    });
  }

  async function start() {
    bindForm();
    bindSkip();
    bindOtp();
    if (new URLSearchParams(location.search).get('deleted') === '1') {
      const note = document.getElementById('deleted-note');
      if (note) { note.hidden = false; note.textContent = t.deleted; }
    }
    let me = null;
    let meKnown = false;
    try {
      const res = await fetch(api('/api/auth/me'), { credentials: 'include' });
      if (res.ok) { me = await read(res); meKnown = true; }
    } catch { me = null; }
    if (meKnown && me && me.user) rememberLogin();
    else if (meKnown) clearLogin();
    carryNext();
    if (leaveForGate(meKnown, me)) return;
    paintHeader(me);
    paintAccount(me);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
