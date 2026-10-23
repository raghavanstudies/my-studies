// Peppynose test shop — browser side. The cart lives in this browser only; prices always come from the server.
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rupees = p => '₹' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: p % 100 ? 2 : 0 });
  const MAX = 10, KEY = 'pn_cart';
  // Page text in this page's language (written into each page by scripts/build.mjs).
  const T = window.PN_SHOP_T || {}, L = T.lang || 'en', ROOT = T.root || '../';
  const t = (k, o = {}) => String(T[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => (x in o ? o[x] : m));
  const n = o => (o && (o[L] || o.en)) || '';
  // Server messages are English; other languages show their own words for the same problem.
  const msg = e => L === 'en' ? e.message : t(e.status === 409 ? 'err_stock' : e.status === 404 ? 'err_notfound' : e.data && e.data.fields ? 'err_fields' : 'err_generic');
  document.querySelectorAll('.sh-langs a').forEach(a => { a.href += location.hash; });   // keep the order link when switching language

  // ---- site header bits (the live pages do this inline) ----
  const yr = $('year'); if (yr) yr.textContent = new Date().getFullYear();
  const mb = document.querySelector('.menu-btn'), nav = $('nav');
  if (mb && nav) {
    const setMenu = open => { nav.classList.toggle('open', open); mb.setAttribute('aria-expanded', open); };
    mb.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); mb.focus(); } });
  }
  document.querySelectorAll('[data-pn-cookie-settings]').forEach(a => a.closest('li')?.remove());   // no cookies or analytics in the test shop

  // ---- cart (localStorage; may be unavailable in private mode) ----
  let mem = [];
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(i => i && typeof i.sku === 'string' && Number.isInteger(i.qty) && i.qty > 0) : []; } catch { return mem; } };
  const write = c => { mem = c; try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { } badge(); };
  const count = () => read().reduce((t, i) => t + i.qty, 0);
  function badge() {
    let a = $('sh-cart-link');
    if (!a && nav) { a = document.createElement('a'); a.id = 'sh-cart-link'; a.className = 'sh-cart-link'; a.href = 'cart.html'; nav.appendChild(a); }
    if (a) { const c = count(); a.textContent = c ? t('cart_n', { n: c }) : t('cart'); }
  }
  badge();

  // ---- server ----
  async function api(path, opts = {}) {
    const r = await fetch(path, { ...opts, headers: { ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(opts.headers || {}) }, credentials: 'same-origin' });
    let data = {}; try { data = await r.json(); } catch { }
    if (!r.ok) { const e = new Error(data.error || 'Something went wrong. Please try again.'); e.data = data; e.status = r.status; throw e; }
    return data;
  }
  let catP;
  const cat = () => catP || (catP = api('/api/catalogue'));
  const bySku = c => { const m = new Map(); c.products.forEach(p => p.variants.forEach(v => m.set(v.sku, { p, v }))); return m; };
  const hash = () => new URLSearchParams(location.hash.slice(1));
  const fail = (el, e) => { el.innerHTML = `<p class="sh-err">${esc(msg(e))}</p>`; };

  // ---- shop home: live "from" prices ----
  if (document.querySelector('[data-from]')) cat().then(c => c.products.forEach(p => {
    const el = document.querySelector(`[data-from="${CSS.escape(p.slug)}"]`);
    if (el) el.textContent = rupees(Math.min(...p.variants.map(v => v.price)));
  })).catch(() => { });

  // ---- product page ----
  const form = $('buy-form');
  if (form) {
    const qty = $('qty'), note = $('stock-note'), add = form.querySelector('.sh-add');
    let stock = {};
    const clamp = () => { const v = Math.max(1, Math.min(MAX, parseInt(qty.value, 10) || 1)); qty.value = v; return v; };
    const sku = () => form.querySelector('input[name="sku"]:checked').value;
    const refresh = () => {
      const s = stock[sku()];
      if (s === undefined) return;
      add.disabled = s === 0;
      note.textContent = s === 0 ? t('stock_out') : s <= 5 ? t('stock_low', { n: s }) : t('stock_ok');
      note.classList.toggle('low', s <= 5);
    };
    form.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { qty.value = clamp() + +b.dataset.step; clamp(); }));
    qty.addEventListener('change', clamp);
    form.addEventListener('change', refresh);
    cat().then(c => {
      const p = c.products.find(x => x.slug === document.querySelector('.sh-product').dataset.slug);
      if (!p) return;
      p.variants.forEach(v => { stock[v.sku] = v.stock; const el = form.querySelector(`[data-price="${CSS.escape(v.sku)}"]`); if (el) el.textContent = rupees(v.price); });
      refresh();
    }).catch(() => { note.textContent = t('stock_err'); });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const s = sku(), n = clamp(), c = read(), line = c.find(i => i.sku === s);
      const max = Math.min(MAX, stock[s] ?? MAX);
      if (line) line.qty = Math.min(max, line.qty + n); else c.push({ sku: s, qty: Math.min(max, n) });
      write(c);
      $('added').innerHTML = `${esc(t('added'))} <a href="cart.html">${esc(t('view_cart', { n: count() }))}</a>`;
    });
  }

  // ---- cart page ----
  const cartEl = $('cart');
  function totals(c, lines) {
    const sub = lines.reduce((t, l) => t + l.v.price * l.qty, 0);
    const ship = sub >= c.shipping.free_above ? 0 : c.shipping.fee;
    return { sub, ship, total: sub + ship };
  }
  const totalRows = (c, x, hint = true) => `<div class="sh-tot"><span>${esc(t('items'))}</span><b>${rupees(x.sub)}</b></div>
    <div class="sh-tot"><span>${esc(t('delivery'))}</span><b>${x.ship ? rupees(x.ship) : esc(t('free'))}</b></div>
    ${x.ship && hint ? `<p class="sh-hint">${esc(t('free_hint', { p: rupees(c.shipping.free_above) }))}</p>` : ''}
    <div class="sh-tot sh-grand"><span>${esc(t('total'))}</span><b>${rupees(x.total)}</b></div>`;
  function cartLines(c) {
    const m = bySku(c), out = [];
    read().forEach(i => { const x = m.get(i.sku); if (x) out.push({ ...x, qty: Math.min(i.qty, MAX) }); });
    write(out.map(l => ({ sku: l.v.sku, qty: l.qty })));   // drops items that are no longer sold
    return out;
  }
  const empty = () => `<p>${esc(t('empty'))}</p><p><a class="btn" href="index.html">${esc(t('shop_now'))}</a></p>`;
  function drawCart(c) {
    const lines = cartLines(c);
    if (!lines.length) { cartEl.innerHTML = empty(); return; }
    const tot = totals(c, lines), short = lines.some(l => l.qty > l.v.stock);
    cartEl.innerHTML = `<ul class="sh-lines">${lines.map(l => `<li class="sh-line" data-sku="${esc(l.v.sku)}">
      <img src="${ROOT}${esc(l.p.img)}" alt="" width="72" height="72">
      <div class="sh-line-info"><a href="${esc(l.p.slug)}.html">${esc(n(l.p.name))}</a><span>${esc(n(l.v.label))} · ${esc(t('each', { p: rupees(l.v.price) }))}</span>
      ${l.qty > l.v.stock ? `<span class="sh-err">${esc(l.v.stock ? t('left', { n: l.v.stock }) : t('out'))}</span>` : ''}</div>
      <div class="sh-qty small"><button type="button" data-d="-1" aria-label="${esc(t('one_less'))}: ${esc(n(l.p.name))}">−</button><span aria-live="polite">${l.qty}</span><button type="button" data-d="1" aria-label="${esc(t('one_more'))}: ${esc(n(l.p.name))}"${l.qty >= Math.min(MAX, l.v.stock) ? ' disabled' : ''}>+</button></div>
      <b class="sh-line-price">${rupees(l.v.price * l.qty)}</b>
      <button type="button" class="sh-remove" data-rm aria-label="${esc(t('remove'))}: ${esc(n(l.p.name))}">${esc(t('remove'))}</button></li>`).join('')}</ul>
      <div class="sh-summary">${totalRows(c, tot)}</div>
      ${short ? `<p class="sh-err">${esc(t('lower_qty'))}</p>` : ''}
      <a class="btn sh-pay${short ? ' disabled' : ''}" href="checkout.html"${short ? ' aria-disabled="true" tabindex="-1"' : ''}>${esc(t('checkout'))}</a>`;
  }
  if (cartEl) {
    cartEl.addEventListener('click', e => {
      const li = e.target.closest('.sh-line'); if (!li) return;
      const c = read(), i = c.findIndex(x => x.sku === li.dataset.sku); if (i < 0) return;
      if (e.target.closest('[data-rm]')) c.splice(i, 1);
      else if (e.target.closest('[data-d]')) { c[i].qty += +e.target.closest('[data-d]').dataset.d; if (c[i].qty < 1) c.splice(i, 1); }
      else return;
      write(c); cat().then(drawCart);
    });
    cat().then(drawCart).catch(e => fail(cartEl, e));
  }

  // ---- checkout ----
  const co = $('checkout');
  if (co) {
    const err = $('err'), sum = $('summary'), btn = co.querySelector('.sh-pay');
    const showErrs = f => {
      co.querySelectorAll('.sh-field-err').forEach(x => x.remove());
      co.querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
      let first;
      Object.entries(f || {}).forEach(([k, text]) => {
        const el = co.elements[k]; if (!el) return;
        el.setAttribute('aria-invalid', 'true');
        const p = document.createElement('span'); p.className = 'sh-field-err'; p.id = 'e-' + k; p.textContent = L === 'en' ? text : t('f_' + k);
        el.setAttribute('aria-describedby', p.id); el.after(p); first = first || el;
      });
      if (first) first.focus();
    };
    cat().then(c => {
      const sel = co.elements.state;
      c.states.forEach(s => sel.add(new Option(s, s)));
      const lines = cartLines(c);
      if (!lines.length) { co.innerHTML = empty(); return; }
      sum.innerHTML = `<h2>${esc(t('order_title'))}</h2><ul class="sh-mini">${lines.map(l => `<li><span>${esc(n(l.p.name))} — ${esc(n(l.v.label))} × ${l.qty}</span><b>${rupees(l.v.price * l.qty)}</b></li>`).join('')}</ul>${totalRows(c, totals(c, lines))}<p class="sh-hint"><a href="cart.html">${esc(t('change_cart'))}</a></p>`;
    }).catch(e => { err.textContent = msg(e); });
    co.addEventListener('submit', async e => {
      e.preventDefault();
      err.textContent = ''; showErrs({}); btn.disabled = true;
      const f = co.elements, customer = {};
      ['name', 'phone', 'email', 'address1', 'address2', 'city', 'pincode', 'state'].forEach(k => { customer[k] = f[k].value; });
      try {
        const r = await api('/api/checkout', { method: 'POST', body: JSON.stringify({ items: read(), customer, lang: L }) });
        location.href = `pay.html#o=${r.order}&t=${r.token}`;
      } catch (x) {
        err.textContent = msg(x); showErrs(x.data && x.data.fields); btn.disabled = false;
        if (x.status === 409) err.innerHTML = `${esc(msg(x))} <a href="cart.html">${esc(t('go_cart'))}</a>`;
      }
    });
  }

  // ---- test payment page ----
  const ok = $('pay-ok');
  if (ok) {
    const h = hash(), o = h.get('o'), tk = h.get('t'), err = $('err'), bad = $('pay-fail');
    const q = `o=${encodeURIComponent(o)}&t=${encodeURIComponent(tk)}`;
    const go = () => { location.href = `order.html#o=${o}&t=${tk}`; };
    api('/api/order?' + q).then(d => {
      if (!d.can_pay) return go();
      $('pay-amount').textContent = t('order_amount', { o: d.number, p: rupees(d.total) });
    }).catch(e => { err.textContent = msg(e); ok.disabled = bad.disabled = true; });
    const pay = outcome => async () => {
      ok.disabled = bad.disabled = true; err.textContent = '';
      try {
        const r = await api('/api/pay/mock', { method: 'POST', body: JSON.stringify({ order: o, token: tk, outcome }) });
        if (r.status === 'paid' || r.status === 'paid_review') write([]);
        go();
      } catch (e) { err.textContent = msg(e); ok.disabled = bad.disabled = false; }
    };
    ok.addEventListener('click', pay('success'));
    bad.addEventListener('click', pay('fail'));
  }

  // ---- order page ----
  const ord = $('order');
  if (ord) {
    const h = hash(), o = h.get('o'), tk = h.get('t');
    const q = `o=${encodeURIComponent(o || '')}&t=${encodeURIComponent(tk || '')}`;
    Promise.all([api('/api/order?' + q), cat().catch(() => null)]).then(([d, cg]) => {
      const m = cg ? bySku(cg) : new Map();   // product names in this page's language; the order keeps the English ones
      const [title, line] = T['st_' + d.status] || [d.status, ''];
      const c = d.customer;
      ord.innerHTML = `<p class="sh-eyebrow">${esc(t('order_no', { o: d.number }))}</p><h1>${esc(title)}</h1><p class="sh-status s-${esc(d.status)}">${esc(line)}</p>
        ${d.tracking ? `<p><b>${esc(t('tracking'))}</b> ${esc(d.tracking)}</p>` : ''}
        ${d.can_pay ? `<p><a class="btn sh-pay" href="pay.html#o=${esc(o)}&t=${esc(tk)}">${esc(t('pay_now'))}</a></p>` : ''}
        <div class="sh-summary"><ul class="sh-mini">${d.items.map(i => { const x = m.get(i.sku); return `<li><span>${esc(x ? n(x.p.name) : i.name)} — ${esc(x ? n(x.v.label) : i.label)} × ${i.qty}</span><b>${rupees(i.unit_price * i.qty)}</b></li>`; }).join('')}</ul>
        ${totalRows(null, { sub: d.subtotal, ship: d.shipping, total: d.total }, false)}</div>
        <h2>${esc(t('delivery_to'))}</h2><p>${esc(c.name)}<br>${esc(c.address1)}${c.address2 ? '<br>' + esc(c.address2) : ''}<br>${esc(c.city)} - ${esc(c.pincode)}, ${esc(c.state)}<br>${esc(t('mobile'))} ${esc(c.phone)}</p>
        ${d.invoice ? `<p><a class="btn plain" href="/api/invoice?${q}" target="_blank" rel="noopener">${esc(t('invoice'))}</a></p>` : ''}
        <p class="sh-hint">${esc(t('keep_link'))} <a href="mailto:care.peppynose@gmail.com">care.peppynose@gmail.com</a></p>`;
    }).catch(e => fail(ord, e));
  }

  // ---- admin ----
  const adm = $('admin');
  if (adm) {
    const A = (path, opts = {}) => api('/api/admin/' + path, { ...opts, headers: { 'x-pn-admin': '1' } });
    const login = $('login'), panel = $('panel');
    const STATUS = ['all', 'paid', 'paid_review', 'packed', 'shipped', 'delivered', 'pending_payment', 'payment_failed', 'cancelled', 'refunded'];
    const nice = s => s.replace(/_/g, ' ');
    const when = iso => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    let tab = 'orders', filter = 'all';

    const showLogin = () => { panel.hidden = true; login.hidden = false; login.elements.password.focus(); };
    login.addEventListener('submit', async e => {
      e.preventDefault(); $('login-err').textContent = '';
      try { await A('login', { method: 'POST', body: JSON.stringify({ password: login.elements.password.value }) }); login.reset(); login.hidden = true; draw(); }
      catch (x) { $('login-err').textContent = x.message; }
    });

    async function draw() {
      panel.hidden = false;
      panel.innerHTML = `<div class="sh-tabs" role="tablist">${[['orders', 'Orders'], ['products', 'Prices & stock'], ['outbox', 'Messages']].map(([k, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${n}</button>`).join('')}<button type="button" class="sh-logout" data-logout>Log out</button></div><div id="adm-body"><p>Loading…</p></div>`;
      const box = $('adm-body');
      try {
        if (tab === 'orders') {
          const d = await A('orders?status=' + filter);
          box.innerHTML = `<label class="sh-filter">Show <select id="adm-filter">${STATUS.map(s => `<option value="${s}"${s === filter ? ' selected' : ''}>${nice(s)}</option>`).join('')}</select></label>
            ${d.orders.length ? `<div class="sh-table"><table><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead><tbody>${d.orders.map(o => `<tr><td><button type="button" class="sh-link" data-open="${esc(o.id)}">${esc(o.number)}</button></td><td>${esc(when(o.created_at))}</td><td>${esc(o.name)}<br><small>${esc(o.city)}, ${esc(o.state)}</small></td><td>${rupees(o.total)}</td><td><span class="sh-pill s-${esc(o.status)}">${esc(nice(o.status))}</span></td></tr>`).join('')}</tbody></table></div>` : '<p>No orders yet.</p>'}
            <div id="adm-order"></div>`;
        } else if (tab === 'products') {
          const d = await A('products');
          box.innerHTML = `<p class="sh-hint">Prices include GST. Change a price or stock and press Save.</p><div class="sh-table"><table><thead><tr><th>Product</th><th>Pack</th><th>Price (₹)</th><th>Stock</th><th></th></tr></thead><tbody>${d.products.map(p => p.variants.map(v => `<tr data-sku="${esc(v.sku)}"><td>${esc(p.name)}${p.gst_confirmed ? '' : '<br><small>GST/HSN: to confirm with CA</small>'}</td><td>${esc(v.label)}</td><td><input aria-label="Price for ${esc(p.name)} ${esc(v.label)}" name="price" inputmode="decimal" value="${(v.price / 100).toFixed(v.price % 100 ? 2 : 0)}" size="7"></td><td><input aria-label="Stock for ${esc(p.name)} ${esc(v.label)}" name="stock" inputmode="numeric" value="${v.stock}" size="5"></td><td><button type="button" class="btn small" data-save>Save</button> <span class="sh-saved" role="status"></span></td></tr>`).join('')).join('')}</tbody></table></div>`;
        } else {
          const d = await A('outbox');
          box.innerHTML = `<p class="sh-hint">Emails the shop will send. In this test version they are only saved here, not sent.</p>${d.messages.length ? d.messages.map(m => `<details class="sh-msg"><summary><b>${esc(m.subject)}</b> <small>to ${esc(m.to_addr)} · ${esc(when(m.created_at))}</small></summary><pre>${esc(m.body)}</pre></details>`).join('') : '<p>No messages yet.</p>'}`;
        }
      } catch (x) { if (x.status === 401) return showLogin(); box.innerHTML = `<p class="sh-err">${esc(x.message)}</p>`; }
    }

    async function openOrder(id) {
      const box = $('adm-order');
      try {
        const d = await A('order?id=' + encodeURIComponent(id)), c = d.customer;
        box.innerHTML = `<div class="sh-card-admin"><h2>${esc(d.number)} <span class="sh-pill s-${esc(d.status)}">${esc(nice(d.status))}</span></h2>
          ${d.status === 'paid_review' ? '<p class="sh-err">Paid, but stock was not enough when the payment came in. Ship when you have stock (choose “paid”), or refund.</p>' : ''}
          <p>${esc(c.name)} · ${esc(c.phone)} · ${esc(c.email)}<br>${esc(c.address1)}${c.address2 ? ', ' + esc(c.address2) : ''}, ${esc(c.city)} - ${esc(c.pincode)}, ${esc(c.state)}</p>
          <ul class="sh-mini">${d.items.map(i => `<li><span>${esc(i.name)} — ${esc(i.label)} × ${i.qty}</span><b>${rupees(i.unit_price * i.qty)}</b></li>`).join('')}<li><span>Delivery</span><b>${d.shipping ? rupees(d.shipping) : 'Free'}</b></li><li><span><b>Total</b></span><b>${rupees(d.total)}</b></li></ul>
          <p><small>Payment: ${esc(d.payment_mode)}${d.payment_ref ? ' · ' + esc(d.payment_ref) : ''}${d.tracking ? ' · Tracking: ' + esc(d.tracking) : ''}</small></p>
          ${d.next.length ? `<form id="adm-status" class="sh-form"><label>Tracking number (needed for “shipped”)<input name="tracking" value="${esc(d.tracking || '')}" maxlength="80"></label><label>Note (only you see this)<input name="note" maxlength="300"></label>
          <div class="sh-actions">${d.next.map(s => `<button type="submit" class="btn small${s === 'refunded' || s === 'cancelled' ? ' plain' : ''}" value="${s}">Mark as ${esc(nice(s))}</button>`).join('')}</div><p class="sh-err" id="adm-status-err" role="alert"></p></form>` : ''}
          <details><summary>History</summary><ul>${d.events.map(e => `<li>${esc(when(e.at))} — ${esc(nice(e.status))}${e.note ? ': ' + esc(e.note) : ''}</li>`).join('')}</ul></details>
          <p><a href="${esc(d.link)}" target="_blank" rel="noopener">Customer's order page</a></p></div>`;
        const f = $('adm-status');
        if (f) f.addEventListener('submit', async e => {
          e.preventDefault();
          if (['refunded', 'cancelled'].includes(e.submitter.value) && !confirm(`Mark ${d.number} as ${nice(e.submitter.value)}?`)) return;
          try { await A('order-status', { method: 'POST', body: JSON.stringify({ id, status: e.submitter.value, tracking: f.elements.tracking.value, note: f.elements.note.value }) }); await draw(); openOrder(id); }
          catch (x) { $('adm-status-err').textContent = x.message; }
        });
        box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (x) { box.innerHTML = `<p class="sh-err">${esc(x.message)}</p>`; }
    }

    panel.addEventListener('click', async e => {
      const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; return draw(); }
      if (e.target.closest('[data-logout]')) { await A('logout', { method: 'POST', body: '{}' }).catch(() => { }); return showLogin(); }
      const o = e.target.closest('[data-open]'); if (o) return openOrder(o.dataset.open);
      const s = e.target.closest('[data-save]');
      if (s) {
        const tr = s.closest('tr'), out = tr.querySelector('.sh-saved');
        const price = Math.round(parseFloat(tr.querySelector('[name=price]').value) * 100), stock = parseInt(tr.querySelector('[name=stock]').value, 10);
        try { await A('variant', { method: 'POST', body: JSON.stringify({ sku: tr.dataset.sku, price, stock }) }); out.textContent = 'Saved'; out.classList.remove('sh-err'); }
        catch (x) { out.textContent = x.message; out.classList.add('sh-err'); }
      }
    });
    panel.addEventListener('change', e => { if (e.target.id === 'adm-filter') { filter = e.target.value; draw(); } });
    A('me').then(draw).catch(showLogin);
  }
})();
