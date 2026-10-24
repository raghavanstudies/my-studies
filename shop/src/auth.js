// Customer accounts for the Peppynose site. The static pages cannot store passwords;
// this module runs inside the shop Worker and keeps accounts in D1.
// Passwords are peppered with SESSION_SECRET, then hashed with PBKDF2-SHA256.
// The browser only receives an HttpOnly session cookie. Logout also needs the
// per-session CSRF token returned by GET /api/auth/me (custom header, so a
// foreign page cannot log someone out).

export const MIN_PBKDF2_ITERS = 600_000;
const TEST_ITERS = 1_000;
const SESSION_SECONDS = 14 * 24 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_IP = 8;
const LOGIN_MAX_EMAIL = 20;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_MAX_IP = 10;
const COMMON = new Set([
  'password123', 'password1234', '1234567890', '123456789012', 'qwerty12345',
  'peppynose123', 'changeme123', 'iloveyou123', 'welcome1234'
]);

const enc = new TextEncoder();
const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' };

export class HttpError extends Error {
  constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; }
}

const json = (data, status = 200, headers = {}) => {
  const h = new Headers({ 'content-type': 'application/json; charset=utf-8', ...SEC });
  for (const [k, v] of Object.entries(headers)) {
    if (v == null) continue;
    if (Array.isArray(v)) for (const item of v) h.append(k, item);
    else h.set(k, v);
  }
  return new Response(JSON.stringify(data), { status, headers: h });
};

const toHex = bytes => [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = hex => {
  if (typeof hex !== 'string' || hex.length % 2 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};
const randHex = n => toHex(crypto.getRandomValues(new Uint8Array(n)));

function timingSafeEqual(a, b) {
  const n = Math.max(a.length, b.length);
  let d = a.length === b.length ? 0 : 1;
  for (let i = 0; i < n; i++) d |= (a[i] || 0) ^ (b[i] || 0);
  return d === 0;
}

export function configuredIters(env) {
  if (env && env.AUTH_TEST_FAST === '1') return TEST_ITERS;
  const raw = env && env.AUTH_PBKDF2_ITERS ? Number(env.AUTH_PBKDF2_ITERS) : MIN_PBKDF2_ITERS;
  if (!Number.isInteger(raw) || raw < MIN_PBKDF2_ITERS || raw > 2_000_000) return null;
  return raw;
}

function requireSecret(env) {
  const secret = env && env.SESSION_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) throw new HttpError(503, 'Accounts are not set up yet.', { code: 'not_configured' });
  const iters = configuredIters(env);
  if (!iters) throw new HttpError(503, 'Password hashing is not configured safely.', { code: 'not_configured' });
  return { secret, iters };
}

function assertConfig(env) {
  const cfg = requireSecret(env);
  cookieDomain(env);
  return cfg;
}

async function pepper(secret, password) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(password)));
}

async function pbkdf2(material, salt, iters) {
  const key = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iters }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password, secret, iters) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(await pepper(secret, password), salt, iters);
  return `pbkdf2-sha256$${iters}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(password, stored, secret) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;
  const iters = Number(parts[1]);
  const salt = fromHex(parts[2]);
  const expect = fromHex(parts[3]);
  if (!Number.isInteger(iters) || iters < TEST_ITERS || iters > 2_000_000 || !salt || salt.length < 16 || !expect || expect.length !== 32) return false;
  const got = await pbkdf2(await pepper(secret, password), salt, iters);
  return timingSafeEqual(got, expect);
}

const dummyCache = new Map();
async function dummyHash(secret, iters) {
  const key = iters + '\0' + secret;
  if (!dummyCache.has(key)) dummyCache.set(key, await hashPassword('not-a-real-user-password', secret, iters));
  return dummyCache.get(key);
}

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim() : '').slice(0, max);

function validateSignup(b) {
  const name = clean(b.name, 80);
  const email = clean(b.email, 120).toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';
  const fields = {};
  if (name.length < 2) fields.name = 'name';
  if (!EMAIL.test(email) || email.includes('..') || email.startsWith('.') || email.includes('.@')) fields.email = 'email';
  if (password.length < 10 || password.length > 200) fields.password = 'short';
  else if (COMMON.has(password.toLowerCase()) || /^(.)\1+$/.test(password) || password.toLowerCase() === email || password.toLowerCase() === name.toLowerCase()) fields.password = 'common';
  if (Object.keys(fields).length) throw new HttpError(400, 'Please check the highlighted fields.', { code: 'invalid', fields });
  return { name, email, password };
}

function validateLogin(b) {
  const email = clean(b.email, 120).toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';
  const fields = {};
  if (!EMAIL.test(email)) fields.email = 'email';
  if (password.length < 1 || password.length > 200) fields.password = 'short';
  if (Object.keys(fields).length) throw new HttpError(400, 'Please check the highlighted fields.', { code: 'invalid', fields });
  return { email, password };
}

async function readJson(req) {
  const type = req.headers.get('content-type') || '';
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Send JSON.', { code: 'bad_json' });
  const text = await req.text();
  if (text.length > 4000) throw new HttpError(413, 'Too much data.', { code: 'too_large' });
  try {
    const v = JSON.parse(text);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch { /* fall through */ }
  throw new HttpError(400, 'Bad request.', { code: 'bad_json' });
}

function clientIp(req) {
  // Cloudflare sets cf-connecting-ip and does not let the visitor spoof it.
  // Do not trust X-Forwarded-For: the visitor can set it and skip the limit.
  return (req.headers.get('cf-connecting-ip') || 'local').slice(0, 80);
}

function allowedOrigin(req, env) {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  let self = '';
  try { self = new URL(req.url).origin; } catch { return null; }
  const list = String(env.AUTH_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (origin === self || list.includes(origin)) return origin;
  return null;
}

function assertBrowserOrigin(req, env) {
  const origin = req.headers.get('origin');
  if (!origin) return;
  if (!allowedOrigin(req, env)) throw new HttpError(403, 'This site cannot do that.', { code: 'forbidden_origin' });
}

export function corsHeaders(req, env) {
  const origin = allowedOrigin(req, env);
  if (!origin) return { vary: 'Origin' };
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    vary: 'Origin'
  };
}

function cookieDomain(env) {
  const domain = String(env.COOKIE_DOMAIN || '').trim();
  if (!domain) return '';
  if (!/^\.[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) throw new HttpError(503, 'Cookie domain is not configured safely.', { code: 'not_configured' });
  return domain;
}

function sessionCookie(req, env, value, maxAge) {
  const url = new URL(req.url);
  const host = url.hostname;
  const secure = url.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1';
  let c = `pn_session=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly`;
  if (secure) c += '; Secure';
  const domain = cookieDomain(env);
  if (domain) c += `; Domain=${domain}`;
  return c;
}

function readCookie(req, name) {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return toHex(new Uint8Array(buf));
}

async function tooMany(env, scope, key, windowMs, max) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_attempts WHERE scope = ? AND key = ? AND at > ?').bind(scope, key, since).first();
  return Number(row && row.n) >= max;
}

async function recordAttempt(env, scope, key) {
  const at = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO auth_attempts (scope, key, at) VALUES (?, ?, ?)').bind(scope, key, at),
    env.DB.prepare('DELETE FROM auth_attempts WHERE at < ?').bind(new Date(Date.now() - 864e5).toISOString())
  ]);
}

const pub = row => ({ name: row.name, email: row.email });

async function startSession(req, env, user) {
  const token = randHex(32);
  const csrf = randHex(16);
  const at = new Date().toISOString();
  const exp = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? OR expires_at < ?').bind(user.id, at),
    env.DB.prepare('INSERT INTO sessions (id, user_id, csrf, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').bind(await sha256hex(token), user.id, csrf, at, exp)
  ]);
  return json({ ok: true, user: pub(user), csrf }, 200, { 'set-cookie': sessionCookie(req, env, token, SESSION_SECONDS) });
}

async function sessionRow(req, env) {
  const token = readCookie(req, 'pn_session');
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const id = await sha256hex(token);
  const row = await env.DB.prepare(`SELECT s.id, s.csrf, s.expires_at, s.user_id, u.email, u.name, u.password_hash
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`).bind(id).first();
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    return null;
  }
  return row;
}

function assertCsrf(req, row) {
  const sent = req.headers.get('x-csrf-token') || '';
  const a = enc.encode(sent);
  const b = enc.encode(row.csrf);
  if (!timingSafeEqual(a, b)) throw new HttpError(403, 'This page is out of date. Please refresh and try again.', { code: 'csrf' });
}

async function signup(req, env) {
  assertBrowserOrigin(req, env);
  const { secret, iters } = assertConfig(env);
  const body = validateSignup(await readJson(req));
  const ip = clientIp(req);
  if (await tooMany(env, 'signup', 'ip:' + ip, SIGNUP_WINDOW_MS, SIGNUP_MAX_IP)) {
    throw new HttpError(429, 'Too many accounts created from this network. Please wait an hour.', { code: 'rate_limited' });
  }
  await recordAttempt(env, 'signup', 'ip:' + ip);
  const hash = await hashPassword(body.password, secret, iters);
  const id = 'u_' + randHex(16);
  try {
    await env.DB.prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, body.email, body.name, hash, new Date().toISOString()).run();
  } catch (e) {
    const msg = String(e && e.message || '');
    if (msg.includes('UNIQUE') || msg.includes('constraint failed')) throw new HttpError(409, 'An account with this email already exists. Try logging in.', { code: 'email_taken' });
    throw e;
  }
  return startSession(req, env, { id, email: body.email, name: body.name });
}

async function login(req, env) {
  assertBrowserOrigin(req, env);
  const { secret, iters } = assertConfig(env);
  const body = validateLogin(await readJson(req));
  const ip = clientIp(req);
  if (await tooMany(env, 'login', 'ip:' + ip, LOGIN_WINDOW_MS, LOGIN_MAX_IP) || await tooMany(env, 'login', 'email:' + body.email, LOGIN_WINDOW_MS, LOGIN_MAX_EMAIL)) {
    throw new HttpError(429, 'Too many tries. Please wait 15 minutes.', { code: 'rate_limited' });
  }
  const user = await env.DB.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?').bind(body.email).first();
  const stored = user ? user.password_hash : await dummyHash(secret, iters);
  const ok = await verifyPassword(body.password, stored, secret);
  if (!user || !ok) {
    await recordAttempt(env, 'login', 'ip:' + ip);
    await recordAttempt(env, 'login', 'email:' + body.email);
    throw new HttpError(401, 'Wrong email or password.', { code: 'bad_login' });
  }
  return startSession(req, env, user);
}

async function me(req, env) {
  assertConfig(env);
  const row = await sessionRow(req, env);
  if (!row) return json({ user: null });
  return json({ user: pub(row), csrf: row.csrf });
}

async function logout(req, env) {
  assertBrowserOrigin(req, env);
  assertConfig(env);
  const row = await sessionRow(req, env);
  if (row) {
    assertCsrf(req, row);
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(row.id).run();
  }
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(req, env, '', 0) });
}

async function deleteAccount(req, env) {
  assertBrowserOrigin(req, env);
  const { secret } = assertConfig(env);
  const row = await sessionRow(req, env);
  if (!row) throw new HttpError(401, 'Please log in.', { code: 'bad_login' });
  assertCsrf(req, row);
  const body = await readJson(req);
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 1 || password.length > 200 || !(await verifyPassword(password, row.password_hash, secret))) {
    throw new HttpError(401, 'Wrong email or password.', { code: 'bad_login' });
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(row.user_id)
  ]);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(req, env, '', 0) });
}

// TODO(forgot-password): do not add a reset link until email is actually delivered.
// shop outbox rows are only stored for the admin screen; nothing sends them. A reset
// token that is shown on screen, or accepted without proving control of the inbox,
// would let someone else take the account. Until then the login page asks the visitor
// to email care.peppynose@gmail.com from the address on the account.

export async function authApi(req, env) {
  try {
    const path = new URL(req.url).pathname;
    const method = req.method;
    if (path === '/api/auth/signup' && method === 'POST') return await signup(req, env);
    if (path === '/api/auth/login' && method === 'POST') return await login(req, env);
    if (path === '/api/auth/logout' && method === 'POST') return await logout(req, env);
    if (path === '/api/auth/delete' && method === 'POST') return await deleteAccount(req, env);
    if (path === '/api/auth/me' && method === 'GET') return await me(req, env);
    throw new HttpError(404, 'Not found.', { code: 'not_found' });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...(e.extra || {}) }, e.status);
    throw e;
  }
}
