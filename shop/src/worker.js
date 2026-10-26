// Peppynose own shop — API (Cloudflare Worker + D1). Static pages come from dist/ (see scripts/build.mjs).
// Rules: the browser never decides a price; every amount is worked out here from the database, in paise.
import { HttpError, authApi, corsHeaders } from './auth.js';

const enc = new TextEncoder();

export const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

// Which status an admin may move an order to next.
const NEXT = {
  pending_payment: ['cancelled'], payment_failed: ['cancelled'],
  paid: ['packed', 'refunded'], paid_review: ['paid', 'refunded'],
  packed: ['shipped', 'refunded'], shipped: ['delivered'], delivered: ['refunded']
};
const INVOICE_OK = ['paid', 'packed', 'shipped', 'delivered'];
const MAX_QTY = 10, MAX_LINES = 20;

// ---------- small helpers ----------
const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...SEC, ...headers } });
const now = () => new Date().toISOString();
const randHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupees = p => '₹' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const istDate = iso => { try { return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };

async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
const toHex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
// Constant-time compare: both sides are hashed first, so length and content leak nothing.
async function same(a, b, secret) {
  const [x, y] = await Promise.all([hmac(secret, String(a)), hmac(secret, String(b))]);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

async function body(req) {
  if (!(req.headers.get('content-type') || '').startsWith('application/json')) throw new HttpError(415, 'Send JSON.');   // also blocks simple cross-site form posts
  const text = await req.text();
  if (text.length > 20000) throw new HttpError(413, 'Too much data.');
  try { const v = JSON.parse(text); if (v && typeof v === 'object') return v; } catch { }
  throw new HttpError(400, 'Bad request.');
}
const str = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '').slice(0, max);
const int = v => (Number.isInteger(v) ? v : (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN));

async function settings(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(results.map(r => [r.key, r.value]));
}

// ---------- catalogue ----------
async function catalogue(env) {
  const [p, v, s] = await Promise.all([
    env.DB.prepare('SELECT slug, category, data FROM products WHERE active = 1 ORDER BY sort').all(),
    env.DB.prepare('SELECT sku, product_slug, label, price, stock, mrp FROM variants ORDER BY sort').all(),
    settings(env.DB)
  ]);
  return {
    products: p.results.map(r => ({
      slug: r.slug, category: r.category, ...JSON.parse(r.data),
      variants: v.results.filter(x => x.product_slug === r.slug).map(x => ({ sku: x.sku, label: JSON.parse(x.label), price: x.price, mrp: x.mrp, stock: Math.min(x.stock, MAX_QTY) }))
    })),
    shipping: { fee: +s.shipping_fee, free_above: +s.free_shipping_above },
    states: STATES
  };
}

// Prices one cart from the database. Throws 409 when something is no longer available.
async function price(env, rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw new HttpError(400, 'Your cart is empty.');
  const want = new Map();
  for (const it of rawItems.slice(0, MAX_LINES)) {
    const sku = str(it && it.sku, 80), qty = int(it && it.qty);
    if (!sku || !(qty >= 1 && qty <= MAX_QTY)) throw new HttpError(400, `Quantity must be 1 to ${MAX_QTY}.`);
    want.set(sku, Math.min(MAX_QTY, (want.get(sku) || 0) + qty));
  }
  const skus = [...want.keys()];
  const { results } = await env.DB.prepare(`SELECT v.sku, v.label, v.price, v.stock, p.data, p.gst_rate, p.hsn, p.active
    FROM variants v JOIN products p ON p.slug = v.product_slug WHERE v.sku IN (${skus.map(() => '?').join(',')})`).bind(...skus).all();
  const bySku = new Map(results.map(r => [r.sku, r]));
  const lines = [];
  for (const [sku, qty] of want) {
    const r = bySku.get(sku);
    if (!r || !r.active) throw new HttpError(409, 'An item in your cart is no longer sold. Please remove it.', { sku });
    if (r.stock < qty) throw new HttpError(409, r.stock ? `Only ${r.stock} left of one item. Please lower the quantity.` : 'One item is out of stock. Please remove it.', { sku, stock: r.stock });
    lines.push({ sku, qty, unit_price: r.price, name: JSON.parse(r.data).name.en, label: JSON.parse(r.label).en, gst_rate: r.gst_rate, hsn: r.hsn });
  }
  const s = await settings(env.DB);
  const subtotal = lines.reduce((t, l) => t + l.unit_price * l.qty, 0);
  const shipping = subtotal >= +s.free_shipping_above ? 0 : +s.shipping_fee;
  return { lines, subtotal, shipping, total: subtotal + shipping, settings: s };
}

function customer(c) {
  c = c || {};
  const out = {
    name: str(c.name, 80), phone: str(c.phone, 20).replace(/[\s-]/g, '').replace(/^(\+91|0)/, ''), email: str(c.email, 120).toLowerCase(),
    address1: str(c.address1, 120), address2: str(c.address2, 120), city: str(c.city, 60), pincode: str(c.pincode, 6), state: str(c.state, 60)
  };
  const bad = {};
  if (out.name.length < 2) bad.name = 'Please enter your full name.';
  if (!/^[6-9]\d{9}$/.test(out.phone)) bad.phone = 'Please enter a 10-digit Indian mobile number.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out.email)) bad.email = 'Please enter a valid email.';
  if (out.address1.length < 5) bad.address1 = 'Please enter your house / street.';
  if (out.city.length < 2) bad.city = 'Please enter your town or city.';
  if (!/^[1-9]\d{5}$/.test(out.pincode)) bad.pincode = 'Please enter a 6-digit PIN code.';
  if (!STATES.includes(out.state)) bad.state = 'Please choose your state.';
  if (Object.keys(bad).length) throw new HttpError(400, 'Please check the highlighted fields.', { fields: bad });
  return out;
}

// ---------- checkout + payment ----------
async function checkout(req, env) {
  const b = await body(req);
  const cust = customer(b.customer);
  const q = await price(env, b.items);
  const mode = env.PAYMENT_MODE === 'razorpay' ? 'razorpay' : 'mock';
  const lang = ['en', 'ta', 'hi'].includes(b.lang) ? b.lang : 'en';
  const row = await env.DB.prepare("UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = 'next_order_number' RETURNING value").first();
  const number = +row.value - 1, id = 'o_' + randHex(12), token = randHex(24), at = now();
  let gateway = null;
  if (mode === 'razorpay') gateway = await razorpayOrder(env, q.total, number);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO orders (id, number, token, status, lang, created_at, customer, state, subtotal, shipping, total, payment_mode, gateway_order)
      VALUES (?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, number, token, lang, at, JSON.stringify(cust), cust.state, q.subtotal, q.shipping, q.total, mode, gateway),
    ...q.lines.map(l => env.DB.prepare('INSERT INTO order_items (order_id, sku, name, label, qty, unit_price, gst_rate, hsn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, l.sku, l.name, l.label, l.qty, l.unit_price, l.gst_rate, l.hsn)),
    env.DB.prepare('INSERT INTO order_events (order_id, at, status, note) VALUES (?, ?, ?, ?)').bind(id, at, 'pending_payment', 'Order placed')
  ]);
  return json({ order: id, token, number: 'PN-' + number, total: q.total, pay: mode === 'razorpay' ? { mode, key: env.RAZORPAY_KEY_ID, gateway_order: gateway } : { mode } });
}

async function razorpayOrder(env, amount, number) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new HttpError(503, 'Online payment is not set up yet.');
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Basic ' + btoa(env.RAZORPAY_KEY_ID + ':' + env.RAZORPAY_KEY_SECRET) },
    body: JSON.stringify({ amount, currency: 'INR', receipt: 'PN-' + number })
  });
  if (!r.ok) throw new HttpError(502, 'Payment service is busy. Please try again.');
  return (await r.json()).id;
}

async function loadOrder(env, id, token) {
  if (typeof id !== 'string' || typeof token !== 'string' || !/^o_[0-9a-f]{24}$/.test(id)) throw new HttpError(404, 'Order not found.');
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!o || !(await same(o.token, token, env.ORDER_SECRET))) throw new HttpError(404, 'Order not found.');
  return o;
}
// The customer's order page, in the language they ordered in.
const orderLink = o => `${o.lang === 'en' ? '' : '/' + o.lang}/shop/order.html#o=${o.id}&t=${o.token}`;
const items = (env, id) => env.DB.prepare('SELECT sku, name, label, qty, unit_price, gst_rate, hsn FROM order_items WHERE order_id = ?').bind(id).all().then(r => r.results);
const outbox = (env, order, kind, to, subject, text) =>
  env.DB.prepare('INSERT INTO outbox (order_id, kind, to_addr, subject, body, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(order, kind, to, subject, text, now());

// Marks an order paid and takes the stock — exactly once, however many times the payment is reported.
async function finalize(env, o, ref) {
  const nonce = randHex(16), at = now();
  const claim = await env.DB.prepare("UPDATE orders SET finalize_nonce = ?, payment_ref = ? WHERE id = ? AND finalize_nonce IS NULL AND status IN ('pending_payment', 'payment_failed')")
    .bind(nonce, ref, o.id).run();
  if (!claim.meta.changes) return (await env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(o.id).first()).status;
  const list = await items(env, o.id), cust = JSON.parse(o.customer), s = await settings(env.DB);
  const link = orderLink(o);
  try {
    await env.DB.batch([   // one transaction: if any stock would go below 0 (CHECK), nothing here is saved
      ...list.map(i => env.DB.prepare('UPDATE variants SET stock = stock - ? WHERE sku = ?').bind(i.qty, i.sku)),
      env.DB.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND finalize_nonce = ?").bind(at, o.id, nonce),
      env.DB.prepare('INSERT INTO order_events (order_id, at, status, note) VALUES (?, ?, ?, ?)').bind(o.id, at, 'paid', 'Payment received'),
      outbox(env, o.id, 'order_paid', cust.email, `Peppynose order PN-${o.number} confirmed`,
        `Hi ${cust.name},\n\nThank you! We received your payment of ${rupees(o.total)} for order PN-${o.number}.\nWe will pack it soon and send you the tracking number.\n\nSee your order: ${link}\n\n— Peppynose`),
      outbox(env, o.id, 'seller_new_order', s.seller_email, `New order PN-${o.number} — ${rupees(o.total)}`, `New paid order PN-${o.number} from ${cust.name}, ${cust.city}, ${cust.state}. Open the shop admin to pack it.`)
    ]);
    return 'paid';
  } catch (e) {
    // Paid, but stock ran out between checkout and payment: keep the money safe, let the owner decide (ship later or refund).
    await env.DB.batch([
      env.DB.prepare("UPDATE orders SET status = 'paid_review', paid_at = ? WHERE id = ? AND finalize_nonce = ?").bind(at, o.id, nonce),
      env.DB.prepare('INSERT INTO order_events (order_id, at, status, note) VALUES (?, ?, ?, ?)').bind(o.id, at, 'paid_review', 'Paid, but stock was not enough — owner to check'),
      outbox(env, o.id, 'seller_review', s.seller_email, `CHECK order PN-${o.number}: paid but out of stock`, `Order PN-${o.number} was paid (${rupees(o.total)}) but stock was not enough. Ship when you have stock, or refund.`)
    ]);
    return 'paid_review';
  }
}

async function payMock(req, env) {
  if (env.PAYMENT_MODE === 'razorpay') throw new HttpError(404, 'Not found.');
  const b = await body(req), o = await loadOrder(env, b.order, b.token);
  if (o.payment_mode !== 'mock') throw new HttpError(400, 'Wrong payment type.');
  if (b.outcome === 'fail') {
    if (['pending_payment', 'payment_failed'].includes(o.status)) await env.DB.batch([
      env.DB.prepare("UPDATE orders SET status = 'payment_failed' WHERE id = ? AND finalize_nonce IS NULL").bind(o.id),
      env.DB.prepare('INSERT INTO order_events (order_id, at, status, note) VALUES (?, ?, ?, ?)').bind(o.id, now(), 'payment_failed', 'Test payment failed')
    ]);
    return json({ status: (await env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(o.id).first()).status });
  }
  return json({ status: await finalize(env, o, 'mock_' + randHex(8)) });
}

// Razorpay (used once real keys are added): the signature proves the payment really came from Razorpay.
async function payRazorpay(req, env) {
  const b = await body(req), o = await loadOrder(env, b.order, b.token);
  if (o.payment_mode !== 'razorpay' || !o.gateway_order || b.razorpay_order_id !== o.gateway_order) throw new HttpError(400, 'Payment does not match this order.');
  const expected = toHex(await hmac(env.RAZORPAY_KEY_SECRET, `${o.gateway_order}|${str(b.razorpay_payment_id, 64)}`));
  if (!(await same(expected, str(b.razorpay_signature, 128), env.ORDER_SECRET))) throw new HttpError(400, 'Payment could not be verified.');
  return json({ status: await finalize(env, o, str(b.razorpay_payment_id, 64)) });
}

async function orderView(url, env) {
  const o = await loadOrder(env, url.searchParams.get('o'), url.searchParams.get('t'));
  const [list, ev] = await Promise.all([items(env, o.id), env.DB.prepare('SELECT at, status, note FROM order_events WHERE order_id = ? ORDER BY at').bind(o.id).all()]);
  return json({
    number: 'PN-' + o.number, status: o.status, created_at: o.created_at, paid_at: o.paid_at, customer: JSON.parse(o.customer),
    items: list.map(i => ({ sku: i.sku, name: i.name, label: i.label, qty: i.qty, unit_price: i.unit_price })),
    subtotal: o.subtotal, shipping: o.shipping, total: o.total, tracking: o.tracking, events: ev.results,
    pay_mode: o.payment_mode, can_pay: ['pending_payment', 'payment_failed'].includes(o.status) && !o.finalize_nonce, invoice: INVOICE_OK.includes(o.status)
  });
}

// GST tax invoice (prices include GST). Same state as the seller → CGST + SGST, other state → IGST.
async function invoice(url, env) {
  const o = await loadOrder(env, url.searchParams.get('o'), url.searchParams.get('t'));
  if (!INVOICE_OK.includes(o.status)) throw new HttpError(404, 'The invoice is ready after payment.');
  const list = await items(env, o.id), s = await settings(env.DB), c = JSON.parse(o.customer);
  const intra = o.state === s.seller_state;
  const split = (gross, rate) => { const taxable = Math.round(gross * 100 / (100 + rate)); return { taxable, tax: gross - taxable }; };
  const rows = list.map(i => ({ desc: `${i.name} — ${i.label}`, hsn: i.hsn || '—', qty: i.qty, rate: i.gst_rate, gross: i.unit_price * i.qty, ...split(i.unit_price * i.qty, i.gst_rate) }));
  if (o.shipping) { const rate = Math.max(...list.map(i => i.gst_rate)); rows.push({ desc: 'Delivery charges', hsn: '9965', qty: 1, rate, gross: o.shipping, ...split(o.shipping, rate) }); }
  const sum = k => rows.reduce((t, r) => t + r[k], 0);
  const taxCols = r => intra ? `<td>${rupees(Math.floor(r.tax / 2))}<small> @${r.rate / 2}%</small></td><td>${rupees(r.tax - Math.floor(r.tax / 2))}<small> @${r.rate / 2}%</small></td>` : `<td>${rupees(r.tax)}<small> @${r.rate}%</small></td>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Invoice PN-${o.number}</title><style>
body{font:15px/1.5 system-ui,sans-serif;color:#2e2a33;max-width:860px;margin:24px auto;padding:0 16px}h1{font-size:1.4rem;margin:0}
.test{background:#fff3cd;border:1px solid #e0c36c;padding:8px 12px;border-radius:8px;margin:0 0 16px}.grid{display:flex;flex-wrap:wrap;gap:24px;justify-content:space-between;margin:16px 0}
table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:right;vertical-align:top}th:first-child,td:first-child{text-align:left}
small{color:#6e6773}tfoot td{font-weight:700}.wrapt{overflow-x:auto}@media print{.test{border:1px solid #000}button{display:none}}</style></head><body>
<p class="test"><b>TEST INVOICE — not valid for tax.</b> GST details to be confirmed by CA before the shop goes live.</p>
<h1>Tax invoice</h1>
<div class="grid"><div><b>${esc(s.seller_name)}</b><br>${esc(s.seller_address)}<br>GSTIN: ${esc(s.seller_gstin || 'to be added')}<br>${esc(s.seller_email)}</div>
<div>Invoice no: <b>PN-${o.number}</b><br>Date: ${esc(istDate(o.paid_at || o.created_at))}<br>Payment: ${esc(o.payment_mode === 'mock' ? 'test payment' : 'online (Razorpay)')}</div></div>
<div><b>Bill / ship to</b><br>${esc(c.name)}<br>${esc(c.address1)}${c.address2 ? '<br>' + esc(c.address2) : ''}<br>${esc(c.city)} - ${esc(c.pincode)}<br>${esc(c.state)}<br>Place of supply: ${esc(o.state)}</div>
<div class="wrapt"><table><thead><tr><th>Item</th><th>HSN/SAC</th><th>Qty</th><th>Taxable value</th>${intra ? '<th>CGST</th><th>SGST</th>' : '<th>IGST</th>'}<th>Total</th></tr></thead><tbody>
${rows.map(r => `<tr><td>${esc(r.desc)}</td><td>${esc(r.hsn)}</td><td>${r.qty}</td><td>${rupees(r.taxable)}</td>${taxCols(r)}<td>${rupees(r.gross)}</td></tr>`).join('\n')}
</tbody><tfoot><tr><td colspan="3">Total</td><td>${rupees(sum('taxable'))}</td>${intra ? `<td colspan="2">${rupees(sum('tax'))}</td>` : `<td>${rupees(sum('tax'))}</td>`}<td>${rupees(o.total)}</td></tr></tfoot></table></div>
<p><small>Prices include GST. This is a computer-generated invoice.</small></p><button onclick="print()">Print / save as PDF</button></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', ...SEC, 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" } });
}

// ---------- admin ----------
const COOKIE = 'pn_admin', HOURS = 8;
async function isAdmin(req, env) {
  const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)pn_admin=(\d+)\.([0-9a-f]{64})/);
  if (!m || +m[1] < Date.now()) return false;
  return same(m[2], toHex(await hmac(env.SESSION_SECRET, 'admin.' + m[1])), env.SESSION_SECRET);
}
const cookie = (req, value, maxAge) => `${COOKIE}=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;

async function login(req, env) {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 10) throw new HttpError(503, 'Admin password is not set.');
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  const since = new Date(Date.now() - 15 * 60e3).toISOString();
  const tries = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at > ?').bind(ip, since).first();
  if (tries.n >= 5) throw new HttpError(429, 'Too many wrong tries. Please wait 15 minutes.');
  const b = await body(req);
  if (!(await same(str(b.password, 200), env.ADMIN_PASSWORD, env.SESSION_SECRET))) {
    await env.DB.batch([env.DB.prepare('INSERT INTO login_attempts (ip, at) VALUES (?, ?)').bind(ip, now()),
      env.DB.prepare('DELETE FROM login_attempts WHERE at < ?').bind(new Date(Date.now() - 864e5).toISOString())]);
    throw new HttpError(401, 'Wrong password.');
  }
  const exp = Date.now() + HOURS * 3600e3;
  return json({ ok: true }, 200, { 'set-cookie': cookie(req, `${exp}.${toHex(await hmac(env.SESSION_SECRET, 'admin.' + exp))}`, HOURS * 3600) });
}

async function adminOrders(url, env) {
  const st = url.searchParams.get('status');
  const q = st && st !== 'all'
    ? env.DB.prepare('SELECT id, number, status, created_at, customer, total, tracking FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 200').bind(st)
    : env.DB.prepare('SELECT id, number, status, created_at, customer, total, tracking FROM orders ORDER BY created_at DESC LIMIT 200');
  const { results } = await q.all();
  return json({ orders: results.map(o => { const c = JSON.parse(o.customer); return { id: o.id, number: 'PN-' + o.number, status: o.status, created_at: o.created_at, name: c.name, city: c.city, state: c.state, total: o.total, tracking: o.tracking, next: NEXT[o.status] || [] }; }) });
}

async function adminOrder(url, env) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(url.searchParams.get('id') || '').first();
  if (!o) throw new HttpError(404, 'Order not found.');
  const [list, ev] = await Promise.all([items(env, o.id), env.DB.prepare('SELECT at, status, note FROM order_events WHERE order_id = ? ORDER BY at').bind(o.id).all()]);
  return json({ id: o.id, number: 'PN-' + o.number, status: o.status, created_at: o.created_at, paid_at: o.paid_at, customer: JSON.parse(o.customer), items: list,
    subtotal: o.subtotal, shipping: o.shipping, total: o.total, payment_mode: o.payment_mode, payment_ref: o.payment_ref, tracking: o.tracking, note: o.admin_note,
    events: ev.results, next: NEXT[o.status] || [], link: orderLink(o) });
}

async function setStatus(req, env) {
  const b = await body(req);
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(str(b.id, 40)).first();
  if (!o) throw new HttpError(404, 'Order not found.');
  const to = str(b.status, 20), tracking = str(b.tracking, 80), note = str(b.note, 300);
  if (!(NEXT[o.status] || []).includes(to)) throw new HttpError(400, `An order that is "${o.status}" cannot become "${to}".`);
  if (to === 'shipped' && !tracking) throw new HttpError(400, 'Please add the courier tracking number.');
  const list = await items(env, o.id), c = JSON.parse(o.customer), at = now();
  const stmts = [
    env.DB.prepare('UPDATE orders SET status = ?, tracking = COALESCE(?, tracking), admin_note = COALESCE(?, admin_note) WHERE id = ? AND status = ?').bind(to, tracking || null, note || null, o.id, o.status),
    env.DB.prepare('INSERT INTO order_events (order_id, at, status, note) VALUES (?, ?, ?, ?)').bind(o.id, at, to, note || null)
  ];
  // paid_review → paid: the owner found stock, so take it now (never below 0).
  if (o.status === 'paid_review' && to === 'paid') list.forEach(i => stmts.push(env.DB.prepare('UPDATE variants SET stock = MAX(stock - ?, 0) WHERE sku = ?').bind(i.qty, i.sku)));
  // Refund before it left the shop: the items go back on the shelf.
  if (to === 'refunded' && ['paid', 'packed'].includes(o.status)) list.forEach(i => stmts.push(env.DB.prepare('UPDATE variants SET stock = stock + ? WHERE sku = ?').bind(i.qty, i.sku)));
  const link = orderLink(o);
  if (to === 'shipped') stmts.push(outbox(env, o.id, 'shipped', c.email, `Your Peppynose order PN-${o.number} is on the way`, `Hi ${c.name},\n\nYour order PN-${o.number} has been shipped.\nTracking number: ${tracking}\n\nSee your order: ${link}\n\n— Peppynose`));
  if (to === 'refunded') stmts.push(outbox(env, o.id, 'refunded', c.email, `Refund for Peppynose order PN-${o.number}`, `Hi ${c.name},\n\nWe have refunded ${rupees(o.total)} for order PN-${o.number}. It can take 5–7 working days to reach your account.\n\n— Peppynose`));
  const r = await env.DB.batch(stmts);
  if (!r[0].meta.changes) throw new HttpError(409, 'This order was just changed by someone else. Please refresh.');
  return json({ ok: true, status: to });
}

async function adminProducts(env) {
  const [p, v] = await Promise.all([env.DB.prepare('SELECT slug, data, gst_rate, hsn, gst_confirmed FROM products ORDER BY sort').all(), env.DB.prepare('SELECT sku, product_slug, label, price, stock, mrp FROM variants ORDER BY sort').all()]);
  return json({ products: p.results.map(r => ({ slug: r.slug, name: JSON.parse(r.data).name.en, gst_rate: r.gst_rate, hsn: r.hsn, gst_confirmed: !!r.gst_confirmed,
    variants: v.results.filter(x => x.product_slug === r.slug).map(x => ({ sku: x.sku, label: JSON.parse(x.label).en, price: x.price, mrp: x.mrp, stock: x.stock })) })) });
}

async function setVariant(req, env) {
  const b = await body(req), sku = str(b.sku, 80), price = int(b.price), stock = int(b.stock);
  if (!(price >= 100 && price <= 10000000)) throw new HttpError(400, 'Price must be between ₹1 and ₹1,00,000.');
  if (!(stock >= 0 && stock <= 100000)) throw new HttpError(400, 'Stock must be 0 or more.');
  const cur = await env.DB.prepare('SELECT mrp FROM variants WHERE sku = ?').bind(sku).first();
  if (!cur) throw new HttpError(404, 'Item not found.');
  if (cur.mrp && price > cur.mrp) throw new HttpError(400, `Price cannot be above the MRP (${rupees(cur.mrp)}).`);
  const r = await env.DB.prepare('UPDATE variants SET price = ?, stock = ? WHERE sku = ?').bind(price, stock, sku).run();
  if (!r.meta.changes) throw new HttpError(404, 'Item not found.');
  return json({ ok: true });
}

async function adminOutbox(env) {
  const { results } = await env.DB.prepare('SELECT o.id, o.kind, o.to_addr, o.subject, o.body, o.created_at, o.sent_at, d.number FROM outbox o LEFT JOIN orders d ON d.id = o.order_id ORDER BY o.id DESC LIMIT 100').all();
  return json({ messages: results.map(m => ({ ...m, number: m.number ? 'PN-' + m.number : '' })) });
}

async function admin(req, url, env) {
  const path = url.pathname.slice('/api/admin/'.length), m = req.method;
  if (req.headers.get('x-pn-admin') !== '1') throw new HttpError(403, 'Forbidden.');   // CSRF guard: other sites cannot add this header
  if (path === 'login' && m === 'POST') return login(req, env);
  if (path === 'logout' && m === 'POST') return json({ ok: true }, 200, { 'set-cookie': cookie(req, '', 0) });
  if (!(await isAdmin(req, env))) throw new HttpError(401, 'Please log in.');
  if (path === 'me' && m === 'GET') return json({ ok: true });
  if (path === 'orders' && m === 'GET') return adminOrders(url, env);
  if (path === 'order' && m === 'GET') return adminOrder(url, env);
  if (path === 'order-status' && m === 'POST') return setStatus(req, env);
  if (path === 'products' && m === 'GET') return adminProducts(env);
  if (path === 'variant' && m === 'POST') return setVariant(req, env);
  if (path === 'outbox' && m === 'GET') return adminOutbox(env);
  throw new HttpError(404, 'Not found.');
}

async function api(req, url, env) {
  const p = url.pathname, m = req.method;
  if (p.startsWith('/api/auth/')) return authApi(req, env);
  if (p.startsWith('/api/admin/')) return admin(req, url, env);
  if (p === '/api/catalogue' && m === 'GET') return json(await catalogue(env));
  if (p === '/api/checkout' && m === 'POST') return checkout(req, env);
  if (p === '/api/pay/mock' && m === 'POST') return payMock(req, env);
  if (p === '/api/pay/razorpay' && m === 'POST') return payRazorpay(req, env);
  if (p === '/api/order' && m === 'GET') return orderView(url, env);
  if (p === '/api/invoice' && m === 'GET') return invoice(url, env);
  throw new HttpError(404, 'Not found.');
}

function withCors(req, env, res) {
  const headers = new Headers();
  res.headers.forEach((v, k) => { if (k !== 'set-cookie') headers.set(k, v); });
  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const c of cookies) headers.append('set-cookie', c);
  if (!cookies.length && res.headers.get('set-cookie')) headers.append('set-cookie', res.headers.get('set-cookie'));
  for (const [k, v] of Object.entries(corsHeaders(req, env))) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return withCors(req, env, new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, x-csrf-token',
          'access-control-max-age': '600',
          ...SEC
        }
      }));
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try { return withCors(req, env, await api(req, url, env)); }
    catch (e) {
      const res = e instanceof HttpError
        ? json({ error: e.message, ...(e.extra || {}) }, e.status)
        : (console.error(e), json({ error: 'Something went wrong. Please try again.', code: 'server' }, 500));
      return withCors(req, env, res);
    }
  }
};
