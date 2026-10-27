/* Peppynose pregnancy tracker: optional copy in the customer's account.
   The tracker keeps pn_preg, pn_todo and pn_weight in localStorage only. Nothing
   leaves the browser unless a logged-in visitor taps "Save my tracker to my
   account". After that, changes are copied to the account (PUT /api/account/tracker)
   and another phone logged in to the same account gets them. "Stop saving"
   deletes the account copy. Whether a copy exists in the account is the choice,
   so it holds on every device.
   pn_trk_sync remembers, per browser, whose copy this is and what was last
   saved, so a change made here is sent and a change made elsewhere is loaded.
   Needs window.pnAuth from auth.js (event "pn:auth"). */
(() => {
  const box = document.querySelector('.privacy');
  const dataEl = document.getElementById('trk-data');
  if (!box || !dataEl) return;
  const S = JSON.parse(dataEl.textContent).s || {};
  const lang = (document.documentElement.lang || 'en').slice(0, 2);
  const T = {
    en: {
      out: 'Log in to keep your tracker in your Peppynose account and see it on another phone.',
      login: 'Log in',
      offer: 'Want to see your tracker on another phone? Save your date, weights and ticks in your Peppynose account. Only you can see them. You can stop at any time, and that deletes the saved copy.',
      start: 'Save my tracker to my account',
      on: 'You chose to save your tracker in your Peppynose account. Only you can see it.',
      stop: 'Stop saving to my account',
      saved: 'Saved to your account.',
      error: 'Could not save to your account. Your tracker is still on this phone.',
      big: 'Your tracker is too big to save to your account. It is still on this phone.',
      stopped: 'Your tracker is now saved on this phone only. The copy in your account was deleted.',
      note: 'Saved on this phone and in your account.'
    },
    hi: {
      out: 'अपना ट्रैकर Peppynose खाते में रखने और दूसरे फ़ोन पर देखने के लिए लॉग इन करें।',
      login: 'लॉग इन',
      offer: 'क्या आप अपना ट्रैकर दूसरे फ़ोन पर भी देखना चाहती हैं? अपनी तारीख, वज़न और टिक अपने Peppynose खाते में सेव करें। इन्हें सिर्फ़ आप देख सकती हैं। आप कभी भी रोक सकती हैं, इससे सेव की गई कॉपी मिट जाती है।',
      start: 'मेरा ट्रैकर मेरे खाते में सेव करें',
      on: 'आपने अपना ट्रैकर अपने Peppynose खाते में सेव करना चुना है। इसे सिर्फ़ आप देख सकती हैं।',
      stop: 'खाते में सेव करना बंद करें',
      saved: 'आपके खाते में सेव हो गया।',
      error: 'खाते में सेव नहीं हो सका। आपका ट्रैकर इस फ़ोन पर सुरक्षित है।',
      big: 'आपका ट्रैकर खाते में सेव करने के लिए बहुत बड़ा है। यह इस फ़ोन पर सुरक्षित है।',
      stopped: 'अब आपका ट्रैकर सिर्फ़ इस फ़ोन पर है। खाते वाली कॉपी मिटा दी गई।',
      note: 'इस फ़ोन पर और आपके खाते में सेव है।'
    },
    ta: {
      out: 'உங்கள் கண்காணிப்பை Peppynose கணக்கில் வைத்து, வேறு போனிலும் பார்க்க உள்நுழையுங்கள்.',
      login: 'நுழை',
      offer: 'உங்கள் கண்காணிப்பை வேறு போனிலும் பார்க்க வேண்டுமா? உங்கள் தேதி, எடைகள், டிக்குகளை உங்கள் Peppynose கணக்கில் சேமியுங்கள். அவற்றை நீங்கள் மட்டுமே பார்க்க முடியும். எப்போது வேண்டுமானாலும் நிறுத்தலாம்; அப்போது சேமித்த நகல் நீக்கப்படும்.',
      start: 'என் கண்காணிப்பை என் கணக்கில் சேமி',
      on: 'உங்கள் கண்காணிப்பை Peppynose கணக்கில் சேமிக்கத் தேர்ந்தெடுத்துள்ளீர்கள். அதை நீங்கள் மட்டுமே பார்க்க முடியும்.',
      stop: 'கணக்கில் சேமிப்பதை நிறுத்து',
      saved: 'உங்கள் கணக்கில் சேமிக்கப்பட்டது.',
      error: 'கணக்கில் சேமிக்க முடியவில்லை. உங்கள் கண்காணிப்பு இந்த போனில் பாதுகாப்பாக உள்ளது.',
      big: 'உங்கள் கண்காணிப்பு கணக்கில் சேமிக்க மிகப் பெரியது. இது இந்த போனில் பாதுகாப்பாக உள்ளது.',
      stopped: 'இனி உங்கள் கண்காணிப்பு இந்த போனில் மட்டும் இருக்கும். கணக்கில் இருந்த நகல் நீக்கப்பட்டது.',
      note: 'இந்த போனிலும் உங்கள் கணக்கிலும் சேமிக்கப்பட்டுள்ளது.'
    }
  }[lang] || null;
  if (!T) return;

  const KEYS = { preg: 'pn_preg', todo: 'pn_todo', weight: 'pn_weight' };
  const META = 'pn_trk_sync';
  const jget = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const jset = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const clean = v => v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  // Same keys in the same order, so two copies compare as text.
  const shape = get => Object.fromEntries(Object.keys(KEYS).map(name => [name, clean(get(name))]));
  const snapshot = () => shape(name => jget(KEYS[name]));
  const text = d => JSON.stringify(d);
  const isEmpty = d => Object.values(d).every(v => v == null);

  const privacyText = box.textContent;
  const panel = document.createElement('div');
  panel.className = 'trk-sync';
  const msg = document.createElement('p');
  msg.className = 'trk-note';
  msg.setAttribute('role', 'status');
  box.after(panel);

  let api = '', csrf = '', uid = '', on = false, timer = 0, sending = false;

  function button(label, id, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ghost trk-sync-btn';
    b.id = id;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  // "Saved on this phone only" notes are not true while the copy is on.
  function phoneNotes(synced) {
    const phoneOnly = [S.w_saved, S.v4_todo_saved].filter(Boolean);
    document.querySelectorAll('.trk-note').forEach(n => {
      if (n === msg) return;
      if (synced && phoneOnly.includes(n.textContent)) { n.dataset.phoneOnly = n.textContent; n.textContent = T.note; }
      else if (!synced && n.dataset.phoneOnly) { n.textContent = n.dataset.phoneOnly; delete n.dataset.phoneOnly; }
    });
    box.textContent = synced ? T.on : privacyText;
  }

  function paint() {
    panel.replaceChildren();
    if (!uid) {
      const p = document.createElement('p');
      p.className = 'trk-note';
      const a = document.createElement('a');
      a.href = (lang === 'en' ? '' : '/' + lang) + '/login.html?next=' + encodeURIComponent(location.pathname);
      a.textContent = T.login;
      p.append(T.out + ' ', a);
      panel.append(p);
      return;
    }
    phoneNotes(on);
    if (on) panel.append(button(T.stop, 'trk-sync-stop', stop), msg);
    else {
      const p = document.createElement('p');
      p.className = 'trk-note';
      p.textContent = T.offer;
      panel.append(p, button(T.start, 'trk-sync-start', start), msg);
    }
  }

  async function call(path, method, body, keepalive) {
    const res = await fetch(api + path, {
      method,
      credentials: 'include',
      keepalive: !!keepalive,
      headers: body === undefined ? {} : { 'content-type': 'application/json', 'x-csrf-token': csrf },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    return { ok: res.ok, status: res.status, data };
  }

  async function push(keepalive) {
    if (!on || sending) return;
    const now = snapshot(), t = text(now);
    const meta = jget(META) || {};
    if (meta.uid === uid && meta.last === t) return;
    sending = true;
    try {
      const r = await call('/api/account/tracker', 'PUT', { data: now }, keepalive);
      if (r.ok) { jset(META, { uid, last: t }); msg.textContent = T.saved; }
      else msg.textContent = r.status === 413 ? T.big : T.error;
    } catch (e) {
      msg.textContent = T.error;
    } finally {
      sending = false;
    }
  }

  function watch() {
    clearInterval(timer);
    timer = setInterval(() => push(false), 3000);
  }

  async function start() {
    const meta = jget(META) || {};
    // What is here was saved for a different account on this phone. It is safe
    // in that account; do not copy it into this one.
    if (meta.uid && meta.uid !== uid) for (const key of Object.values(KEYS)) jset(key, null);
    on = true;
    paint();
    jset(META, { uid, last: '' });
    await push(false);
    watch();
  }

  async function stop() {
    const b = document.getElementById('trk-sync-stop');
    if (b) b.disabled = true;
    try {
      const r = await call('/api/account/tracker/delete', 'POST', {});
      if (!r.ok) { msg.textContent = T.error; if (b) b.disabled = false; return; }
    } catch (e) { msg.textContent = T.error; if (b) b.disabled = false; return; }
    on = false;
    clearInterval(timer);
    jset(META, null);
    paint();
    msg.textContent = T.stopped;
    panel.append(msg);
  }

  // Write the account copy into this browser, then load the page again so the
  // tracker draws it. Done at most once per tab, so a bad copy cannot loop.
  function apply(data) {
    for (const [name, key] of Object.entries(KEYS)) jset(key, data[name] == null ? null : data[name]);
    const t = text(snapshot());
    jset(META, { uid, last: t });
    let again = false;
    try { again = sessionStorage.getItem('pn_trk_applied') === t; sessionStorage.setItem('pn_trk_applied', t); } catch (e) {}
    if (!again) location.reload();
    else { paint(); watch(); }
  }

  async function begin(auth) {
    const user = auth && auth.me && auth.me.user;
    api = (auth && auth.api) || '';
    if (!user || !user.uid) { uid = ''; paint(); return; }
    uid = user.uid;
    csrf = auth.me.csrf || '';
    let server;
    try {
      const r = await call('/api/account/tracker', 'GET');
      if (!r.ok || !r.data) { paint(); return; }
      server = r.data.data;
    } catch (e) { paint(); return; }
    const meta = jget(META) || {};
    const local = snapshot(), localText = text(local);
    on = !!server;
    if (on) {
      const serverText = text(shape(name => server[name]));
      const mine = meta.uid === uid;
      const changedHere = mine && meta.last !== localText;
      if (changedHere) {
        // Edited on this phone since the last save: this phone wins.
        paint();
        await push(false);
      } else if (localText !== serverText && !(isEmpty(server) && isEmpty(local))) {
        // A copy from another phone, another account, or a guest visit on this
        // phone: the account copy is the one this account chose to keep.
        apply(server);
        return;
      } else {
        jset(META, { uid, last: localText });
        paint();
      }
      watch();
    } else {
      // Stopped on another device, or never started. A mark for another
      // account stays, so start() will not copy that account's data here.
      if (meta.uid === uid) jset(META, null);
      paint();
    }
  }

  addEventListener('pagehide', () => { if (on) push(true); });
  if (window.pnAuth) begin(window.pnAuth);
  else addEventListener('pn:auth', e => begin(e.detail), { once: true });
})();
