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
      google: 'Sign in with Google',
      google_invalid: 'Google sign-in failed. Please try again.',
      google_not_configured: 'Google sign-in is not available yet.',
      or: 'or',
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
      hello: u => 'Logged in as ' + (u.name || u.email || u.username) + '.',
      deleted: 'Your account has been deleted.',
      working: 'Please wait…',
      resend: 'Resend code',
      resendIn: n => 'Resend code (' + n + 's)',
      editDetails: 'Edit details',
      ordersTitle: 'Your orders',
      ordersNone: 'No orders on this account yet. Orders placed while logged in show here.',
      ordersError: 'We could not load your orders. Please refresh.',
      orderView: 'View order',
      orderItems: n => n === 1 ? '1 item' : n + ' items',
      status: { pending_payment: 'Waiting for payment', payment_failed: 'Payment failed', paid: 'Paid', paid_review: 'Paid, being checked', packed: 'Packed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded' },
      devicesTitle: 'Where you are logged in',
      thisDevice: 'This device',
      since: d => 'since ' + d,
      logoutDevice: 'Log out',
      logoutOthers: 'Log out all other devices',
      devicesDone: 'Other devices are logged out.',
      deleteConfirm: 'I understand my account will be deleted for good',
      confirm_needed: 'Please tick the box to confirm.',
      current_session: 'Use Log out for this device.'
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
      google: 'Google से साइन इन करें',
      google_invalid: 'Google से साइन इन नहीं हो सका। कृपया फिर कोशिश करें।',
      google_not_configured: 'Google से साइन इन अभी उपलब्ध नहीं है।',
      or: 'या',
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
      hello: u => (u.name || u.email || u.username) + ' के रूप में लॉग इन हैं।',
      deleted: 'आपका खाता मिटा दिया गया है।',
      working: 'कृपया इंतज़ार करें…',
      resend: 'कोड फिर भेजें',
      resendIn: n => 'कोड फिर भेजें (' + n + ' सेकंड)',
      editDetails: 'जानकारी बदलें',
      ordersTitle: 'आपके ऑर्डर',
      ordersNone: 'इस खाते में अभी कोई ऑर्डर नहीं है। लॉग इन रहकर किए गए ऑर्डर यहाँ दिखते हैं।',
      ordersError: 'आपके ऑर्डर लोड नहीं हो सके। कृपया पेज रिफ़्रेश करें।',
      orderView: 'ऑर्डर देखें',
      orderItems: n => n === 1 ? '1 सामान' : n + ' सामान',
      status: { pending_payment: 'भुगतान बाकी', payment_failed: 'भुगतान नहीं हुआ', paid: 'भुगतान हो गया', paid_review: 'भुगतान हुआ, जाँच जारी', packed: 'पैक हो गया', shipped: 'भेज दिया गया', delivered: 'पहुँच गया', cancelled: 'रद्द', refunded: 'पैसे वापस' },
      devicesTitle: 'आप कहाँ लॉग इन हैं',
      thisDevice: 'यह डिवाइस',
      since: d => d + ' से',
      logoutDevice: 'लॉग आउट',
      logoutOthers: 'बाकी सभी डिवाइस से लॉग आउट करें',
      devicesDone: 'बाकी डिवाइस से लॉग आउट हो गया।',
      deleteConfirm: 'मैं समझती/समझता हूँ कि मेरा खाता हमेशा के लिए मिट जाएगा',
      confirm_needed: 'पुष्टि के लिए बॉक्स पर टिक करें।',
      current_session: 'इस डिवाइस के लिए लॉग आउट बटन का इस्तेमाल करें।'
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
      google: 'Google மூலம் உள்நுழையுங்கள்',
      google_invalid: 'Google மூலம் உள்நுழைய முடியவில்லை. மீண்டும் முயலவும்.',
      google_not_configured: 'Google உள்நுழைவு இன்னும் இல்லை.',
      or: 'அல்லது',
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
      hello: u => (u.name || u.email || u.username) + ' ஆக உள்நுழைந்துள்ளீர்கள்.',
      deleted: 'உங்கள் கணக்கு நீக்கப்பட்டது.',
      working: 'காத்திருக்கவும்…',
      resend: 'குறியீட்டை மீண்டும் அனுப்பு',
      resendIn: n => 'குறியீட்டை மீண்டும் அனுப்பு (' + n + ' வி)',
      editDetails: 'விவரங்களை மாற்று',
      ordersTitle: 'உங்கள் ஆர்டர்கள்',
      ordersNone: 'இந்தக் கணக்கில் இன்னும் ஆர்டர் இல்லை. உள்நுழைந்து செய்த ஆர்டர்கள் இங்கே தெரியும்.',
      ordersError: 'உங்கள் ஆர்டர்களை ஏற்ற முடியவில்லை. பக்கத்தைப் புதுப்பிக்கவும்.',
      orderView: 'ஆர்டரைப் பார்',
      orderItems: n => n === 1 ? '1 பொருள்' : n + ' பொருட்கள்',
      status: { pending_payment: 'பணம் செலுத்த வேண்டும்', payment_failed: 'பணம் செலுத்துதல் தோல்வி', paid: 'பணம் பெறப்பட்டது', paid_review: 'பணம் பெறப்பட்டது, சரிபார்க்கப்படுகிறது', packed: 'பேக் செய்யப்பட்டது', shipped: 'அனுப்பப்பட்டது', delivered: 'வந்து சேர்ந்தது', cancelled: 'ரத்து செய்யப்பட்டது', refunded: 'பணம் திருப்பி அளிக்கப்பட்டது' },
      devicesTitle: 'நீங்கள் உள்நுழைந்துள்ள இடங்கள்',
      thisDevice: 'இந்தச் சாதனம்',
      since: d => d + ' முதல்',
      logoutDevice: 'வெளியேறு',
      logoutOthers: 'மற்ற எல்லாச் சாதனங்களிலிருந்தும் வெளியேறு',
      devicesDone: 'மற்ற சாதனங்களிலிருந்து வெளியேறிவிட்டீர்கள்.',
      deleteConfirm: 'என் கணக்கு நிரந்தரமாக நீக்கப்படும் என்பதைப் புரிந்துகொள்கிறேன்',
      confirm_needed: 'உறுதிப்படுத்தப் பெட்டியில் டிக் செய்யவும்.',
      current_session: 'இந்தச் சாதனத்துக்கு வெளியேறு பொத்தானைப் பயன்படுத்தவும்.'
    }
  };
  const t = COPY[L];

  const apiBase = () => String(window.PN_AUTH_API || '').replace(/\/$/, '');
  const api = p => apiBase() + p;
  const root = L === 'en' ? '' : '/' + L;
  const path = file => root + '/' + file;

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
      a.textContent = me.user.name || t.account;
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
      if (/\/(?:login|signup|account|details)(\.html)?$/i.test(location.pathname)) a.setAttribute('aria-current', 'page');
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
      set('who-username', user.username || '—');
      set('who-mobile', user.mobile || '—');
      set('who-email', user.email || '—');
      const btn = document.getElementById('logout');
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => logout(me.csrf));
      }
      const del = document.getElementById('delete-form');
      if (del && !user.has_password) passwordlessDelete(del);
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
              body: JSON.stringify(user.has_password ? { password: del.password.value } : { confirm: !!(del.confirm && del.confirm.checked) })
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
      paintAccountExtras(me);
    } else {
      inn.hidden = true;
      out.hidden = false;
    }
  }

  function el(tag, props, text) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') node.className = v;
      else node.setAttribute(k, v);
    }
    if (text != null) node.textContent = text;
    return node;
  }

  const LOCALE = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' }[L];
  const day = iso => { try { return new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
  const rupees = p => '₹' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: p % 100 ? 2 : 0 });

  // A Google-only account has no password: a tick box confirms the delete instead.
  function passwordlessDelete(form) {
    if (form.dataset.passwordless) return;
    form.dataset.passwordless = '1';
    const pw = form.elements.namedItem('password');
    const label = pw && pw.closest('label');
    if (label) label.remove();
    const tick = el('label', { class: 'auth-stay' });
    const box = el('input', { type: 'checkbox', name: 'confirm', required: '' });
    tick.append(box, document.createTextNode(' ' + t.deleteConfirm));
    form.prepend(tick);
  }

  async function getJson(p) {
    const res = await fetch(api(p), { credentials: 'include' });
    const data = await read(res);
    if (!res.ok || !data) throw new Error('failed');
    return data;
  }

  async function postJson(p, csrf, body) {
    const res = await fetch(api(p), {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf || '' },
      body: JSON.stringify(body || {})
    });
    return { res, data: await read(res) };
  }

  // Edit details, orders and devices, added under the facts on the account page.
  function paintAccountExtras(me) {
    const inn = document.getElementById('account-in');
    if (!inn || inn.dataset.extras) return;
    inn.dataset.extras = '1';
    const facts = inn.querySelector('.auth-facts');
    const edit = el('p', { class: 'auth-switch' });
    edit.append(el('a', { id: 'edit-details', href: path('details.html') + '?next=' + encodeURIComponent(path('account.html')) }, t.editDetails));
    if (facts) facts.after(edit);
    const anchor = inn.querySelector('.auth-delete');
    const orders = el('section', { class: 'auth-section', id: 'my-orders', 'aria-labelledby': 'my-orders-h' });
    orders.append(el('h2', { id: 'my-orders-h' }, t.ordersTitle), el('p', { class: 'auth-note' }, t.working));
    const devices = el('section', { class: 'auth-section', id: 'my-devices', 'aria-labelledby': 'my-devices-h' });
    devices.append(el('h2', { id: 'my-devices-h' }, t.devicesTitle), el('p', { class: 'auth-note' }, t.working));
    inn.insertBefore(orders, anchor);
    inn.insertBefore(devices, anchor);
    paintOrders(orders);
    paintDevices(devices, me.csrf);
  }

  async function paintOrders(box) {
    const note = box.querySelector('.auth-note');
    let list;
    try { list = (await getJson('/api/account/orders')).orders || []; } catch { note.textContent = t.ordersError; return; }
    if (!list.length) { note.textContent = t.ordersNone; return; }
    note.remove();
    const ul = el('ul', { class: 'auth-list' });
    for (const o of list) {
      const li = el('li');
      const top = el('div', { class: 'auth-list-top' });
      top.append(el('b', {}, o.number), el('span', { class: 'auth-badge', 'data-status': o.status }, (t.status && t.status[o.status]) || o.status));
      const meta = el('div', { class: 'auth-list-meta' }, [day(o.created_at), t.orderItems(o.items), rupees(o.total)].filter(Boolean).join(' · '));
      // The order page lives on the shop Worker, next to the API.
      const link = el('a', { href: apiBase() + o.link }, t.orderView);
      li.append(top, meta, link);
      ul.append(li);
    }
    box.append(ul);
  }

  async function paintDevices(box, csrf) {
    const note = box.querySelector('.auth-note');
    let list;
    try { list = (await getJson('/api/auth/sessions')).sessions || []; } catch { note.textContent = t.server; return; }
    note.textContent = '';
    note.setAttribute('role', 'status');
    box.querySelectorAll('.auth-list, .auth-others').forEach(n => n.remove());
    const ul = el('ul', { class: 'auth-list' });
    for (const s of list) {
      const li = el('li');
      const top = el('div', { class: 'auth-list-top' });
      top.append(el('b', {}, s.device));
      if (s.current) top.append(el('span', { class: 'auth-badge' }, t.thisDevice));
      li.append(top, el('div', { class: 'auth-list-meta' }, t.since(day(s.created_at))));
      if (!s.current) {
        const out = el('button', { type: 'button', class: 'auth-resend', 'data-session': s.id }, t.logoutDevice);
        out.addEventListener('click', async () => {
          out.disabled = true;
          const r = await postJson('/api/auth/sessions/revoke', csrf, { id: s.id }).catch(() => null);
          if (!r || !r.res.ok) { out.disabled = false; note.textContent = r && r.data ? explain(r.data) : t.network; return; }
          paintDevices(box, csrf);
        });
        li.append(out);
      }
      ul.append(li);
    }
    box.append(ul);
    if (list.some(s => !s.current)) {
      const all = el('button', { type: 'button', class: 'btn ghost auth-others', id: 'logout-others' }, t.logoutOthers);
      all.addEventListener('click', async () => {
        all.disabled = true;
        const r = await postJson('/api/auth/sessions/revoke', csrf, { id: 'others' }).catch(() => null);
        if (!r || !r.res.ok) { all.disabled = false; note.textContent = r && r.data ? explain(r.data) : t.network; return; }
        await paintDevices(box, csrf);
        box.querySelector('.auth-note').textContent = t.devicesDone;
      });
      box.append(all);
    }
  }

  // maxAge null is a cookie the browser drops when it closes.
  function browserCookie(name, value, maxAge) {
    const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    document.cookie = name + '=' + value + '; Path=/' + (maxAge == null ? '' : '; Max-Age=' + maxAge) + '; SameSite=Lax' + (secure ? '; Secure' : '');
  }

  function rememberFlag(name, maxAge = 60 * 60 * 24 * 14) {
    try { sessionStorage.setItem(name, '1'); } catch { /* private mode */ }
    try { localStorage.setItem(name, '1'); } catch { /* private mode */ }
    browserCookie(name, '1', maxAge);
  }

  function clearFlag(name) {
    try { sessionStorage.removeItem(name); } catch { /* private mode */ }
    try { localStorage.removeItem(name); } catch { /* private mode */ }
    browserCookie(name, '', 0);
  }

  function rememberGuest() { rememberFlag('pn_guest'); }
  // The logged-in hint lasts as long as the session cookie: 30 days with "Stay
  // logged in", otherwise until the browser closes. A hint that outlived the
  // session would skip the landing gate and then bounce to login after /me.
  function rememberLogin(stay) {
    if (stay) {
      rememberFlag('pn_logged_in', 60 * 60 * 24 * 30);
      return;
    }
    try { localStorage.removeItem('pn_logged_in'); } catch { /* private mode */ }
    try { sessionStorage.setItem('pn_logged_in', '1'); } catch { /* private mode */ }
    browserCookie('pn_logged_in', '1', null);
  }
  // After /me or a details save, keep whichever kind of hint this login made.
  function refreshLogin() {
    let stay = false;
    try { stay = localStorage.getItem('pn_logged_in') === '1'; } catch { /* private mode */ }
    rememberLogin(stay);
  }
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

  function pageKind() {
    const p = location.pathname;
    if (/\/details(\.html)?$/i.test(p)) return 'details';
    if (/\/login(\.html)?$/i.test(p)) return 'login';
    if (/\/signup(\.html)?$/i.test(p)) return 'signup';
    return '';
  }

  function safeHere() {
    const next = safeNext(new URLSearchParams(location.search).get('next'));
    if (next && !/\/(?:login|signup|details)(\.html)?$/i.test(next.split('?')[0])) return next;
    const here = safeNext(location.pathname + location.search);
    if (here && pageKind() === '') return here;
    return path('index.html');
  }

  function goDetails() {
    globalThis.__pnLoginLeaving = true;
    location.replace(path('details.html') + '?next=' + encodeURIComponent(safeHere()));
  }

  function goAfterAuth(user, stay) {
    rememberLogin(stay);
    const next = safeNext(new URLSearchParams(location.search).get('next')) || path('index.html');
    if (!user.profile_complete) {
      location.assign(path('details.html') + '?next=' + encodeURIComponent(next));
      return;
    }
    location.assign(next);
  }

  // A stale pn_logged_in hint is corrected from /api/auth/me. A real session
  // on the login page with a safe next goes back to that page. An incomplete
  // profile goes to the details page instead.
  function leaveForGate(meKnown, me) {
    const loggedIn = !!(meKnown && me && me.user);
    if (loggedIn && !me.user.profile_complete && pageKind() !== 'details') {
      goDetails();
      return true;
    }
    if (pageKind() === 'details' && meKnown && !loggedIn) {
      const next = safeNext(new URLSearchParams(location.search).get('next')) || path('index.html');
      location.replace(path('login.html') + '?next=' + encodeURIComponent(next));
      return true;
    }
    if (loggedIn && pageKind() === 'login' && me.user.profile_complete) {
      const next = safeNext(new URLSearchParams(location.search).get('next'));
      if (next && !/\/(?:login|signup|details)(\.html)?$/i.test(next.split('?')[0])) {
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
          if (ref && !/(login|signup|details)(\.html)?$/i.test(u.pathname)) return ref;
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
      const stayEl = document.getElementById('stay-logged-in');
      const stay = !!(stayEl && stayEl.checked);
      const body = mode === 'signup'
        ? { username: form.username.value, password: form.password.value, confirm: form.confirm.value, stay }
        : { identifier: form.identifier.value, password: form.password.value, stay };
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
        goAfterAuth(data.user, stay);
      } catch {
        if (err) err.textContent = t.network;
      } finally {
        if (submit) { submit.disabled = false; submit.textContent = submit.dataset.label || submit.textContent; }
      }
    });
  }

  async function sendGoogleCredential(credential) {
    const err = document.getElementById('err');
    if (err) err.textContent = '';
    const stayEl = document.getElementById('stay-logged-in');
    const stay = !!(stayEl && stayEl.checked);
    const btn = document.getElementById('google-signin');
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(api('/api/auth/google'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: credential, stay })
      });
      const data = await read(res);
      if (!res.ok || !data || !data.user) {
        if (err) err.textContent = data ? explain(data) : t.notSetup;
        return;
      }
      goAfterAuth(data.user, stay);
    } catch {
      if (err) err.textContent = t.network;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function bindGoogle(clientId) {
    const slot = document.getElementById('google-slot');
    if (!slot) return;
    const id = String(clientId || '');
    if (!/^[0-9A-Za-z._-]{10,200}$/.test(id)) { slot.hidden = true; return; }
    slot.hidden = false;
    const label = document.getElementById('google-signin');
    if (label) label.textContent = t.google;
    const or = document.getElementById('auth-or');
    if (or) or.textContent = t.or;
    if (slot.dataset.bound) return;
    slot.dataset.bound = '1';
    window.__pnGoogleCredential = resp => {
      if (resp && resp.credential) sendGoogleCredential(resp.credential);
    };
    if (label) label.addEventListener('click', () => {
      if (label.hidden) return;
      if (window.google && google.accounts && google.accounts.id) google.accounts.id.prompt();
    });
    const host = document.getElementById('google-btn');
    // One control only: the official button once it exists, otherwise this fallback.
    const useOfficial = () => {
      const official = host && host.querySelector('iframe, [role="button"]');
      if (!official) return false;
      if (label) label.hidden = true;
      slot.dataset.google = 'gis';
      return true;
    };
    const useFallback = () => {
      if (slot.dataset.google === 'gis') return;
      if (host) host.replaceChildren();
      if (label) label.hidden = false;
      slot.dataset.google = 'fallback';
    };
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      try {
        google.accounts.id.initialize({
          client_id: id,
          callback: resp => window.__pnGoogleCredential(resp),
          auto_select: false,
          cancel_on_tap_outside: true
        });
        if (host) {
          const form = document.getElementById('auth-form');
          const wide = Math.floor((form && form.clientWidth) || slot.clientWidth || 320);
          const width = Math.max(200, Math.min(400, wide));
          google.accounts.id.renderButton(host, {
            type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', width: width, shape: 'pill', logo_alignment: 'center'
          });
        }
      } catch { /* keep the single fallback */ }
      if (useOfficial()) return;
      requestAnimationFrame(() => {
        if (useOfficial()) return;
        setTimeout(() => { if (!useOfficial()) useFallback(); }, 400);
      });
    };
    s.onerror = () => useFallback();
    setTimeout(() => { if (!slot.dataset.google) useFallback(); }, 8000);
    document.head.appendChild(s);
  }

  function bindDetails() {
    const form = document.getElementById('details-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const err = document.getElementById('err');
      if (err) err.textContent = '';
      showFields(form, null);
      const submit = form.querySelector('button[type="submit"]');
      if (submit) { submit.disabled = true; submit.dataset.label = submit.dataset.label || submit.textContent; submit.textContent = t.working; }
      try {
        const meRes = await fetch(api('/api/auth/me'), { credentials: 'include' });
        const me = meRes.ok ? await read(meRes) : null;
        if (!me || !me.user || !me.csrf) {
          if (err) err.textContent = t.out;
          return;
        }
        const res = await fetch(api('/api/auth/profile'), {
          method: 'PUT',
          credentials: 'include',
          headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrf },
          body: JSON.stringify({
            name: fieldValue(form, 'name'),
            email: fieldValue(form, 'email'),
            mobile: fieldValue(form, 'mobile')
          })
        });
        const data = await read(res);
        if (!res.ok || !data || !data.user) {
          showFields(form, data);
          if (err) err.textContent = data ? explain(data) : t.notSetup;
          return;
        }
        refreshLogin();
        const next = safeNext(new URLSearchParams(location.search).get('next')) || path('index.html');
        location.assign(next);
      } catch {
        if (err) err.textContent = t.network;
      } finally {
        if (submit) { submit.disabled = false; submit.textContent = submit.dataset.label || submit.textContent; }
      }
    });
  }

  // An input named "name" shadows the form's own name property in some browsers.
  function fieldValue(form, name) {
    const el = form.elements.namedItem(name);
    return el && typeof el.value === 'string' ? el.value : '';
  }

  function setField(form, name, value) {
    const el = form.elements.namedItem(name);
    if (el && typeof el.value === 'string' && !el.value) el.value = value;
  }

  function paintDetails(me) {
    const form = document.getElementById('details-form');
    if (!form || !me || !me.user) return;
    if (me.user.name) setField(form, 'name', me.user.name);
    if (me.user.email) setField(form, 'email', me.user.email);
    if (me.user.mobile) setField(form, 'mobile', me.user.mobile);
  }

  async function start() {
    bindForm();
    bindSkip();
    bindDetails();
    if (new URLSearchParams(location.search).get('deleted') === '1') {
      const note = document.getElementById('deleted-note');
      if (note) { note.hidden = false; note.textContent = t.deleted; }
    }
    let me = null;
    let meKnown = false;
    let cfg = null;
    try {
      const [meRes, cfgRes] = await Promise.all([
        fetch(api('/api/auth/me'), { credentials: 'include' }),
        fetch(api('/api/auth/config'), { credentials: 'include' })
      ]);
      if (meRes.ok) { me = await read(meRes); meKnown = true; }
      if (cfgRes.ok) cfg = await read(cfgRes);
    } catch { me = null; }
    bindGoogle(cfg && cfg.google_client_id);
    if (meKnown && me && me.user) refreshLogin();
    else if (meKnown) clearLogin();
    carryNext();
    if (leaveForGate(meKnown, me)) return;
    // Other scripts (tracker-sync.js) read the login from here instead of asking again.
    window.pnAuth = { known: meKnown, me: me || null, api: apiBase() };
    window.dispatchEvent(new CustomEvent('pn:auth', { detail: window.pnAuth }));
    paintHeader(me);
    paintAccount(me);
    paintDetails(me);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
