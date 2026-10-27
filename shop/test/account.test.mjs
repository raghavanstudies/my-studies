// Unit tests for the account features: one login per device, deleting a
// Google-only account, orders on the account, saved addresses and the tracker
// copy. They run the whole Worker on an in-memory SQLite database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';
import { deviceLabel, MAX_SESSIONS } from '../src/auth.js';
import { MAX_ADDRESSES, MAX_TRACKER_BYTES } from '../src/account.js';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8');
const MIGRATION_5 = readFileSync(join(here, '..', 'db', 'auth-migration-005.sql'), 'utf8');
const PASSWORD = 'horse-battery-99';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function d1(db) {
  const stmt = sql => ({
    _sql: sql, _args: [],
    bind(...args) { this._args = args; return this; },
    async first() { const row = db.prepare(sql).get(...this._args); return row === undefined ? null : row; },
    async all() { return { results: db.prepare(sql).all(...this._args) }; },
    async run() { const info = db.prepare(sql).run(...this._args); return { meta: { changes: Number(info.changes) } }; }
  });
  return {
    prepare: stmt,
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = stmts.map(s => ({ meta: { changes: Number(db.prepare(s._sql).run(...s._args).changes) } }));
        db.exec('COMMIT');
        return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    }
  };
}

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  db.exec(`INSERT INTO settings (key, value) VALUES ('shipping_fee', '4900'), ('free_shipping_above', '49900'), ('next_order_number', '1001'),
    ('seller_email', 'seller@example.com'), ('seller_state', 'Tamil Nadu');
    INSERT INTO products (slug, category, data, gst_rate, hsn) VALUES ('mat', 'play', '{"name":{"en":"Foam mat"}}', 18, '3921');
    INSERT INTO variants (sku, product_slug, label, price, stock) VALUES ('mat-blue', 'mat', '{"en":"Blue"}', 24900, 25);`);
  return { DB: d1(db), SESSION_SECRET: 'unit-test-session-secret-not-used-in-production', ORDER_SECRET: 'unit-test-order-secret', AUTH_TEST_FAST: '1', PAYMENT_MODE: 'mock' };
}

async function call(env, path, { method = 'GET', body, cookie, csrf, ua } = {}) {
  const h = new Headers({ origin: 'http://localhost' });
  if (body !== undefined) { h.set('content-type', 'application/json'); body = JSON.stringify(body); }
  if (cookie) h.set('cookie', cookie);
  if (csrf) h.set('x-csrf-token', csrf);
  if (ua) h.set('user-agent', ua);
  const res = await worker.fetch(new Request('http://localhost' + path, { method, headers: h, body }), env);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { res, status: res.status, data };
}

const cookieFrom = res => {
  const line = res.headers.getSetCookie().find(c => c.startsWith('pn_session='));
  assert.ok(line, 'expected a pn_session cookie');
  return line.split(';', 1)[0];
};

let seq = 0;
async function signUp(env, ua) {
  seq += 1;
  const username = 'acct.' + seq;
  const r = await call(env, '/api/auth/signup', { method: 'POST', ua, body: { username, password: PASSWORD, confirm: PASSWORD } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const cookie = cookieFrom(r.res);
  const p = await call(env, '/api/auth/profile', { method: 'PUT', cookie, csrf: r.data.csrf, body: { name: 'Acct Amma', email: `acct${seq}@example.com`, mobile: '' } });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  return { username, cookie, csrf: r.data.csrf };
}

async function logIn(env, username, ua) {
  const r = await call(env, '/api/auth/login', { method: 'POST', ua, body: { identifier: username, password: PASSWORD } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return { cookie: cookieFrom(r.res), csrf: r.data.csrf };
}

const customer = (over = {}) => ({
  name: 'Acct Amma', phone: '9876543210', email: 'acct@example.com', address1: '12 Temple Street', address2: '',
  city: 'Musiri', pincode: '621211', state: 'Tamil Nadu', ...over
});

test('migration 005 adds columns and tables without dropping anything', () => {
  const sql = MIGRATION_5;
  assert.equal(/drop\s+table/i.test(sql), false);
  const db = new DatabaseSync(':memory:');
  // The database as it was after migration 004: today's schema without what 005 adds.
  db.exec(SCHEMA);
  db.exec(`DROP INDEX orders_user; ALTER TABLE orders DROP COLUMN user_id; ALTER TABLE sessions DROP COLUMN device;
    DROP TABLE addresses; DROP TABLE tracker_data;`);
  db.exec(`INSERT INTO orders (id, number, token, status, created_at, customer, state, subtotal, shipping, total, payment_mode)
    VALUES ('o_1', 1001, 't', 'paid', '2026-01-01', '{}', 'Tamil Nadu', 1, 0, 1, 'mock')`);
  db.exec(sql);
  assert.equal(db.prepare('SELECT user_id FROM orders WHERE id = ?').get('o_1').user_id, null);
  db.exec("INSERT INTO addresses (id, user_id, data, created_at, used_at) VALUES ('a', 'u', '{}', 'x', 'x')");
  db.exec("INSERT INTO tracker_data (user_id, data, updated_at) VALUES ('u', '{}', 'x')");
  assert.throws(() => db.exec(sql), /duplicate column/);
});

test('device labels are short and readable', () => {
  assert.equal(deviceLabel(ANDROID), 'Chrome on Android');
  assert.equal(deviceLabel(IPHONE), 'Safari on iPhone / iPad');
  assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'), 'Edge on Windows');
  assert.equal(deviceLabel(''), 'Unknown device');
});

test('each device keeps its own login, and other devices can be logged out', async () => {
  const env = makeEnv();
  const phone = await signUp(env, ANDROID);
  const laptop = await logIn(env, phone.username, IPHONE);
  // Logging in on the second device no longer logs out the first.
  assert.ok((await call(env, '/api/auth/me', { cookie: phone.cookie })).data.user);
  const list = await call(env, '/api/auth/sessions', { cookie: laptop.cookie });
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.sessions.map(s => [s.device, s.current]).sort(), [['Chrome on Android', false], ['Safari on iPhone / iPad', true]]);
  for (const s of list.data.sessions) assert.match(s.id, /^[0-9a-f]{16}$/);

  assert.equal((await call(env, '/api/auth/sessions/revoke', { method: 'POST', cookie: laptop.cookie, body: { id: 'others' } })).status, 403);
  const own = list.data.sessions.find(s => s.current);
  assert.equal((await call(env, '/api/auth/sessions/revoke', { method: 'POST', cookie: laptop.cookie, csrf: laptop.csrf, body: { id: own.id } })).data.code, 'current_session');
  const out = await call(env, '/api/auth/sessions/revoke', { method: 'POST', cookie: laptop.cookie, csrf: laptop.csrf, body: { id: 'others' } });
  assert.equal(out.data.removed, 1);
  assert.equal((await call(env, '/api/auth/me', { cookie: phone.cookie })).data.user, null);
  assert.ok((await call(env, '/api/auth/me', { cookie: laptop.cookie })).data.user);

  // One device by its id; another account's id does nothing.
  const tablet = await logIn(env, phone.username, ANDROID);
  const other = await signUp(env, ANDROID);
  const tabletId = (await call(env, '/api/auth/sessions', { cookie: laptop.cookie })).data.sessions.find(s => !s.current).id;
  assert.equal((await call(env, '/api/auth/sessions/revoke', { method: 'POST', cookie: other.cookie, csrf: other.csrf, body: { id: tabletId } })).data.removed, 0);
  assert.ok((await call(env, '/api/auth/me', { cookie: tablet.cookie })).data.user);
  assert.equal((await call(env, '/api/auth/sessions/revoke', { method: 'POST', cookie: laptop.cookie, csrf: laptop.csrf, body: { id: tabletId } })).data.removed, 1);
  assert.equal((await call(env, '/api/auth/me', { cookie: tablet.cookie })).data.user, null);
  assert.equal((await call(env, '/api/auth/sessions', {})).status, 401);
});

test('only the newest logins are kept per account', async () => {
  const env = makeEnv();
  const first = await signUp(env, ANDROID);
  let last;
  for (let i = 0; i < MAX_SESSIONS + 2; i++) last = await logIn(env, first.username, IPHONE);
  assert.equal((await call(env, '/api/auth/sessions', { cookie: last.cookie })).data.sessions.length, MAX_SESSIONS);
  assert.equal((await call(env, '/api/auth/me', { cookie: first.cookie })).data.user, null);
});

test('me says whether the account has a password, and a Google-only account can be deleted', async () => {
  const env = makeEnv();
  const a = await signUp(env);
  const me = await call(env, '/api/auth/me', { cookie: a.cookie });
  assert.equal(me.data.user.has_password, true);
  assert.match(me.data.user.uid, /^u_[0-9a-f]{32}$/);

  // A row with no password, as Google sign-in makes it.
  await env.DB.prepare('UPDATE users SET password_hash = NULL, google_sub = ? WHERE username = ?').bind('100000000000000000301', a.username).run();
  assert.equal((await call(env, '/api/auth/me', { cookie: a.cookie })).data.user.has_password, false);
  const noTick = await call(env, '/api/auth/delete', { method: 'POST', cookie: a.cookie, csrf: a.csrf, body: {} });
  assert.equal(noTick.status, 400);
  assert.equal(noTick.data.code, 'confirm_needed');
  assert.equal((await call(env, '/api/auth/delete', { method: 'POST', cookie: a.cookie, body: { confirm: true } })).status, 403);
  const done = await call(env, '/api/auth/delete', { method: 'POST', cookie: a.cookie, csrf: a.csrf, body: { confirm: true } });
  assert.equal(done.status, 200);
  assert.equal(await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(a.username).first(), null);

  // A password account still needs the password; a tick is not enough.
  const b = await signUp(env);
  assert.equal((await call(env, '/api/auth/delete', { method: 'POST', cookie: b.cookie, csrf: b.csrf, body: { confirm: true } })).status, 401);
});

test('a logged-in checkout shows on the account, a guest checkout does not, and delete keeps the order', async () => {
  const env = makeEnv();
  const a = await signUp(env);
  const item = [{ sku: 'mat-blue', qty: 2 }];
  const mine = await call(env, '/api/checkout', { method: 'POST', cookie: a.cookie, body: { items: item, customer: customer(), lang: 'ta' } });
  assert.equal(mine.status, 200, JSON.stringify(mine.data));
  const guest = await call(env, '/api/checkout', { method: 'POST', body: { items: item, customer: customer({ name: 'Guest Amma' }) } });
  assert.equal(guest.status, 200);
  const other = await signUp(env);

  const list = await call(env, '/api/account/orders', { cookie: a.cookie });
  assert.equal(list.status, 200);
  assert.equal(list.data.orders.length, 1);
  const o = list.data.orders[0];
  assert.equal(o.number, mine.data.number);
  assert.equal(o.status, 'pending_payment');
  assert.equal(o.items, 2);
  assert.equal(o.total, 24900 * 2 + 4900);   // below free delivery
  assert.equal(o.link, `/ta/shop/order.html#o=${mine.data.order}&t=${mine.data.token}`);
  assert.equal((await call(env, '/api/account/orders', { cookie: other.cookie })).data.orders.length, 0);
  assert.equal((await call(env, '/api/account/orders', {})).status, 401);

  // The paid status shows too.
  await call(env, '/api/pay/mock', { method: 'POST', body: { order: mine.data.order, token: mine.data.token, outcome: 'ok' } });
  assert.equal((await call(env, '/api/account/orders', { cookie: a.cookie })).data.orders[0].status, 'paid');

  const del = await call(env, '/api/auth/delete', { method: 'POST', cookie: a.cookie, csrf: a.csrf, body: { password: PASSWORD } });
  assert.equal(del.status, 200);
  const kept = await env.DB.prepare('SELECT user_id, status FROM orders WHERE id = ?').bind(mine.data.order).first();
  assert.equal(kept.user_id, null);
  assert.equal(kept.status, 'paid');
});

test('checkout saves an address only when asked, keeps the newest few, and each account sees its own', async () => {
  const env = makeEnv();
  const a = await signUp(env);
  const buy = (cust, save) => call(env, '/api/checkout', { method: 'POST', cookie: a.cookie, body: { items: [{ sku: 'mat-blue', qty: 1 }], customer: cust, save_address: save } });
  assert.equal((await buy(customer(), false)).status, 200);
  assert.equal((await call(env, '/api/account/addresses', { cookie: a.cookie })).data.addresses.length, 0);
  assert.equal((await buy(customer(), true)).status, 200);
  assert.equal((await buy(customer(), true)).status, 200);   // the same address again is not a second row
  let list = (await call(env, '/api/account/addresses', { cookie: a.cookie })).data.addresses;
  assert.equal(list.length, 1);
  assert.equal(list[0].address1, '12 Temple Street');
  assert.equal(list[0].pincode, '621211');
  assert.match(list[0].id, /^a_[0-9a-f]{24}$/);

  for (let i = 0; i < MAX_ADDRESSES + 1; i++) assert.equal((await buy(customer({ address1: `${i + 20} Market Road` }), true)).status, 200);
  list = (await call(env, '/api/account/addresses', { cookie: a.cookie })).data.addresses;
  assert.equal(list.length, MAX_ADDRESSES);
  assert.equal(list[0].address1, `${MAX_ADDRESSES + 20} Market Road`);

  // A guest checkout never saves one, even if asked.
  await call(env, '/api/checkout', { method: 'POST', body: { items: [{ sku: 'mat-blue', qty: 1 }], customer: customer(), save_address: true } });
  assert.equal(await env.DB.prepare('SELECT COUNT(*) AS n FROM addresses').first().then(r => r.n), MAX_ADDRESSES);

  const other = await signUp(env);
  assert.equal((await call(env, '/api/account/addresses', { cookie: other.cookie })).data.addresses.length, 0);
  const victim = list[0].id;
  assert.equal((await call(env, '/api/account/addresses/delete', { method: 'POST', cookie: other.cookie, csrf: other.csrf, body: { id: victim } })).status, 404);
  assert.equal((await call(env, '/api/account/addresses/delete', { method: 'POST', cookie: a.cookie, body: { id: victim } })).status, 403);
  assert.equal((await call(env, '/api/account/addresses/delete', { method: 'POST', cookie: a.cookie, csrf: a.csrf, body: { id: victim } })).status, 200);
  assert.equal((await call(env, '/api/account/addresses', { cookie: a.cookie })).data.addresses.length, MAX_ADDRESSES - 1);
});

test('the tracker copy is per account, checked, size-limited and removed with the account', async () => {
  const env = makeEnv();
  const a = await signUp(env);
  const empty = await call(env, '/api/account/tracker', { cookie: a.cookie });
  assert.deepEqual(empty.data, { data: null, updated_at: null });
  const data = { preg: { mode: 'due', date: '2027-03-01' }, todo: { w12: [true, false] }, weight: { h: 160, w: { 12: 58.5 } } };
  assert.equal((await call(env, '/api/account/tracker', { method: 'PUT', cookie: a.cookie, body: { data } })).status, 403);
  const saved = await call(env, '/api/account/tracker', { method: 'PUT', cookie: a.cookie, csrf: a.csrf, body: { data } });
  assert.equal(saved.status, 200);
  assert.ok(saved.data.updated_at);
  const back = await call(env, '/api/account/tracker', { cookie: a.cookie });
  assert.deepEqual(back.data.data, data);

  // Unknown keys are dropped; wrong shapes and big copies are refused.
  const extra = await call(env, '/api/account/tracker', { method: 'PUT', cookie: a.cookie, csrf: a.csrf, body: { data: { ...data, other: { x: 1 } } } });
  assert.equal(extra.status, 200);
  assert.equal('other' in (await call(env, '/api/account/tracker', { cookie: a.cookie })).data.data, false);
  assert.equal((await call(env, '/api/account/tracker', { method: 'PUT', cookie: a.cookie, csrf: a.csrf, body: { data: { preg: 'x' } } })).status, 400);
  assert.equal((await call(env, '/api/account/tracker', { method: 'PUT', cookie: a.cookie, csrf: a.csrf, body: { data: [1] } })).status, 400);
  const big = { todo: { w1: Array.from({ length: 3000 }, () => true) } };
  assert.ok(JSON.stringify(big).length > MAX_TRACKER_BYTES);
  assert.equal((await call(env, '/api/account/tracker', { method: 'PUT', cookie: a.cookie, csrf: a.csrf, body: { data: big } })).status, 413);

  const other = await signUp(env);
  assert.equal((await call(env, '/api/account/tracker', { cookie: other.cookie })).data.data, null);
  assert.equal((await call(env, '/api/account/tracker', {})).status, 401);

  assert.equal((await call(env, '/api/auth/delete', { method: 'POST', cookie: a.cookie, csrf: a.csrf, body: { password: PASSWORD } })).status, 200);
  assert.equal(await env.DB.prepare('SELECT COUNT(*) AS n FROM tracker_data').first().then(r => r.n), 0);
});

test('the account API accepts the live site origin and answers PUT preflights', async () => {
  const env = { ...makeEnv(), AUTH_ORIGINS: 'https://www.peppynose.com' };
  const pre = await worker.fetch(new Request('https://api.peppynose.com/api/account/tracker', {
    method: 'OPTIONS', headers: { origin: 'https://www.peppynose.com', 'access-control-request-method': 'PUT' }
  }), env);
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-methods'), /\bPUT\b/);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://www.peppynose.com');
  const foreign = await worker.fetch(new Request('https://api.peppynose.com/api/account/orders', { headers: { origin: 'https://evil.example' } }), env);
  assert.equal(foreign.status, 403);
});
