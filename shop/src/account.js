// What a logged-in customer keeps in their account: their orders, saved
// delivery addresses, and a copy of their pregnancy tracker.
// Every route needs the session cookie. Changes also need the CSRF token from
// GET /api/auth/me (see auth.js). Nothing here is shared between accounts.
import { HttpError, readJson, requireUser } from './auth.js';

const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...SEC } });
const now = () => new Date().toISOString();
const randHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');

export const MAX_ADDRESSES = 5;
export const MAX_TRACKER_BYTES = 12000;
const ADDRESS_KEYS = ['name', 'phone', 'email', 'address1', 'address2', 'city', 'pincode', 'state'];
const TRACKER_KEYS = ['preg', 'todo', 'weight'];

// ---------- orders ----------
async function orders(req, env, orderLink) {
  const row = await requireUser(req, env);
  const { results } = await env.DB.prepare(`SELECT o.id, o.number, o.token, o.lang, o.status, o.created_at, o.total, o.tracking,
      (SELECT COALESCE(SUM(qty), 0) FROM order_items i WHERE i.order_id = o.id) AS items
    FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 50`).bind(row.user_id).all();
  return json({
    orders: (results || []).map(o => ({
      number: 'PN-' + o.number, status: o.status, created_at: o.created_at, total: o.total,
      items: o.items, tracking: o.tracking || '', link: orderLink(o)
    }))
  });
}

// ---------- saved addresses ----------
// The customer object is already checked by checkout (worker.js customer()).
export async function saveAddress(env, userId, cust) {
  const data = JSON.stringify(Object.fromEntries(ADDRESS_KEYS.map(k => [k, String(cust[k] || '')])));
  const at = now();
  const same = await env.DB.prepare('SELECT id FROM addresses WHERE user_id = ? AND data = ?').bind(userId, data).first();
  const stmts = same
    ? [env.DB.prepare('UPDATE addresses SET used_at = ? WHERE id = ?').bind(at, same.id)]
    : [env.DB.prepare('INSERT INTO addresses (id, user_id, data, created_at, used_at) VALUES (?, ?, ?, ?, ?)').bind('a_' + randHex(12), userId, data, at, at)];
  // Keep the most recently used few.
  stmts.push(env.DB.prepare('DELETE FROM addresses WHERE user_id = ? AND id NOT IN (SELECT id FROM addresses WHERE user_id = ? ORDER BY used_at DESC, id LIMIT ?)').bind(userId, userId, MAX_ADDRESSES));
  await env.DB.batch(stmts);
}

async function addresses(req, env) {
  const row = await requireUser(req, env);
  const { results } = await env.DB.prepare('SELECT id, data, used_at FROM addresses WHERE user_id = ? ORDER BY used_at DESC').bind(row.user_id).all();
  return json({ addresses: (results || []).map(a => ({ id: a.id, used_at: a.used_at, ...JSON.parse(a.data) })) });
}

async function deleteAddress(req, env) {
  const row = await requireUser(req, env, { csrf: true });
  const body = await readJson(req);
  const id = typeof body.id === 'string' ? body.id : '';
  if (!/^a_[0-9a-f]{24}$/.test(id)) throw new HttpError(400, 'Bad request.', { code: 'bad_json' });
  const r = await env.DB.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').bind(id, row.user_id).run();
  if (!r.meta.changes) throw new HttpError(404, 'Address not found.', { code: 'not_found' });
  return json({ ok: true });
}

// ---------- pregnancy tracker ----------
// The tracker pages keep pn_preg, pn_todo and pn_weight in localStorage. This
// stores the same three values for the account, so they survive a new phone.
// Only plain objects (or null) are kept, and the whole copy stays small.
function trackerData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'Bad tracker data.', { code: 'bad_json' });
  const out = {};
  for (const k of TRACKER_KEYS) {
    const v = raw[k];
    if (v == null) { out[k] = null; continue; }
    if (typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'Bad tracker data.', { code: 'bad_json' });
    out[k] = v;
  }
  const text = JSON.stringify(out);
  if (text.length > MAX_TRACKER_BYTES) throw new HttpError(413, 'Too much tracker data.', { code: 'too_large' });
  return text;
}

async function getTracker(req, env) {
  const row = await requireUser(req, env);
  const t = await env.DB.prepare('SELECT data, updated_at FROM tracker_data WHERE user_id = ?').bind(row.user_id).first();
  return json({ data: t ? JSON.parse(t.data) : null, updated_at: t ? t.updated_at : null });
}

async function putTracker(req, env) {
  const row = await requireUser(req, env, { csrf: true });
  const body = await readJson(req);
  const text = trackerData(body.data);
  const at = now();
  await env.DB.prepare('INSERT INTO tracker_data (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .bind(row.user_id, text, at).run();
  return json({ ok: true, updated_at: at });
}

async function deleteTracker(req, env) {
  const row = await requireUser(req, env, { csrf: true });
  await env.DB.prepare('DELETE FROM tracker_data WHERE user_id = ?').bind(row.user_id).run();
  return json({ ok: true });
}

// orderLink comes from worker.js, so the account and the shop use one link format.
export async function accountApi(req, env, { orderLink }) {
  try {
    const path = new URL(req.url).pathname;
    const m = req.method;
    if (path === '/api/account/orders' && m === 'GET') return await orders(req, env, orderLink);
    if (path === '/api/account/addresses' && m === 'GET') return await addresses(req, env);
    if (path === '/api/account/addresses/delete' && m === 'POST') return await deleteAddress(req, env);
    if (path === '/api/account/tracker' && m === 'GET') return await getTracker(req, env);
    if (path === '/api/account/tracker' && m === 'PUT') return await putTracker(req, env);
    if (path === '/api/account/tracker/delete' && m === 'POST') return await deleteTracker(req, env);
    throw new HttpError(404, 'Not found.', { code: 'not_found' });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...(e.extra || {}) }, e.status);
    throw e;
  }
}
