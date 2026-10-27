// Customer accounts for the Peppynose site. The static pages cannot store passwords;
// this module runs inside the shop Worker and keeps accounts in D1.
// Passwords are peppered with SESSION_SECRET, then hashed with PBKDF2-SHA256.
// The iteration count is stored in each hash. Cloudflare Workers' WebCrypto
// refuses counts above 100000, so that is the only production setting.
// The browser only receives an HttpOnly session cookie. Logout also needs the
// per-session CSRF token returned by GET /api/auth/me (custom header, so a
// foreign page cannot log someone out).
// A login code is a random 6-digit OTP. Only its HMAC is stored. Delivery is
// off unless a provider is set. Dev delivery runs only when it is set and the
// request is from localhost or 127.0.0.1. See otp-delivery.js.

import { deliveryReady, sendOtp } from './otp-delivery.js';
import { GoogleTokenError, verifyGoogleIdToken } from './google-id.js';

// Workers WebCrypto: "iteration counts above 100000 are not supported".
export const MAX_PBKDF2_ITERS = 100_000;
export const MIN_PBKDF2_ITERS = MAX_PBKDF2_ITERS;
const PBKDF2_TOO_HIGH = 'Password hashing is not configured safely. Cloudflare Workers cannot run PBKDF2 above 100000 iterations.';
const TEST_ITERS = 1_000;
// Checked "Stay logged in" sets Max-Age to this. An unchecked box omits Max-Age,
// so the browser drops the cookie when it closes. The server row uses the same
// lifetime either way, so a window left open does not stay logged in forever.
export const REMEMBER_SECONDS = 30 * 24 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_IP = 8;
const LOGIN_MAX_ID = 20;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_MAX_IP = 10;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX_IP = 8;
const OTP_MAX_ID = 5;
const BAD_LOGIN = 'Invalid credentials.';
const OTP_SENT = 'If an account exists, we sent a code.';
const OTP_BAD = 'That code is wrong or has expired.';
const OTP_LOCKED = 'Too many tries for this code. Request a new one.';
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
  if (!a || !b) return false;
  const n = Math.max(a.length, b.length);
  let d = a.length === b.length ? 0 : 1;
  for (let i = 0; i < n; i++) d |= (a[i] || 0) ^ (b[i] || 0);
  return d === 0;
}

export function configuredIters(env) {
  if (env && env.AUTH_TEST_FAST === '1') return TEST_ITERS;
  const raw = env && env.AUTH_PBKDF2_ITERS ? Number(env.AUTH_PBKDF2_ITERS) : MAX_PBKDF2_ITERS;
  if (!Number.isInteger(raw) || raw < MIN_PBKDF2_ITERS || raw > MAX_PBKDF2_ITERS) return null;
  return raw;
}

function requireSecret(env) {
  const secret = env && env.SESSION_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) throw new HttpError(503, 'Accounts are not set up yet.', { code: 'not_configured' });
  const iters = configuredIters(env);
  if (!iters) {
    const asked = env && env.AUTH_PBKDF2_ITERS ? Number(env.AUTH_PBKDF2_ITERS) : 0;
    const msg = Number.isInteger(asked) && asked > MAX_PBKDF2_ITERS
      ? PBKDF2_TOO_HIGH
      : 'Password hashing is not configured safely.';
    throw new HttpError(503, msg, { code: 'not_configured' });
  }
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
  if (!Number.isInteger(iters) || iters < 1 || iters > MAX_PBKDF2_ITERS) {
    throw new HttpError(503, PBKDF2_TOO_HIGH, { code: 'not_configured' });
  }
  try {
    const key = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iters }, key, 256);
    return new Uint8Array(bits);
  } catch (e) {
    const msg = String(e && e.message || e);
    if ((e && e.name === 'NotSupportedError') || /iteration counts above/i.test(msg)) {
      throw new HttpError(503, PBKDF2_TOO_HIGH, { code: 'not_configured' });
    }
    throw e;
  }
}

// Stored form: pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>
// The count stays with the hash so a later, higher Workers limit can re-hash.
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
  // A stored count above the Workers cap cannot be checked here. Leave the
  // hash as it is (the count is still in the string) and do not throw a 500.
  if (!Number.isInteger(iters) || iters < TEST_ITERS || iters > MAX_PBKDF2_ITERS || !salt || salt.length < 16 || !expect || expect.length !== 32) return false;
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
const USERNAME = /^[A-Za-z0-9._]{3,30}$/;
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim() : '').slice(0, max);

// Strip spaces and dashes, then a leading +91, a 12-digit 91 prefix, or an 11-digit 0 prefix.
// A 10-digit number that itself starts with 91 is a mobile, not a country code.
export function normalizeMobile(raw) {
  let s = String(raw || '').replace(/[\s-]/g, '');
  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.startsWith('+')) return '';
  if (s.startsWith('91') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  return /^[6-9]\d{9}$/.test(s) ? s : '';
}

// '@' means email. A string of digits (spaces, dashes, and a leading + allowed) means mobile.
// Anything else is a username. Username and email compare case-insensitively.
export function classifyIdentifier(raw) {
  const text = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  if (!text || text.length > 120) return { ok: false };
  if (text.includes('@')) {
    const email = text.replace(/\s+/g, '').toLowerCase();
    if (!EMAIL.test(email) || email.includes('..') || email.startsWith('.') || email.includes('.@')) return { ok: false };
    return { ok: true, kind: 'email', value: email };
  }
  const compact = text.replace(/[\s-]/g, '');
  if (/^\+?\d+$/.test(compact)) {
    const mobile = normalizeMobile(text);
    if (!mobile) return { ok: false };
    return { ok: true, kind: 'mobile', value: mobile };
  }
  if (!USERNAME.test(text)) return { ok: false };
  return { ok: true, kind: 'username', value: text };
}

function validEmail(raw) {
  const email = (typeof raw === 'string' ? raw : '').replace(/[\u0000-\u001f\u007f\s]/g, '').toLowerCase().slice(0, 120);
  if (!EMAIL.test(email) || email.includes('..') || email.startsWith('.') || email.includes('.@')) return '';
  return email;
}

function validName(raw) {
  const name = clean(raw, 80);
  if (name.length < 2 || name.length > 80) return '';
  return name;
}

function validateSignup(b) {
  const username = typeof b.username === 'string' ? b.username.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  const confirm = typeof b.confirm === 'string' ? b.confirm : '';
  const fields = {};
  if (!USERNAME.test(username) || /^\d+$/.test(username)) fields.username = 'username';
  if (password.length < 10 || password.length > 200) fields.password = 'short';
  else if (COMMON.has(password.toLowerCase()) || /^(.)\1+$/.test(password) || password.toLowerCase() === username.toLowerCase()) fields.password = 'common';
  if (confirm !== password) fields.confirm = 'mismatch';
  if (Object.keys(fields).length) throw new HttpError(400, 'Please check the highlighted fields.', { code: 'invalid', fields });
  return { username, password };
}

function validateProfile(b) {
  const name = validName(b.name);
  const email = validEmail(b.email);
  const mobileRaw = typeof b.mobile === 'string' ? b.mobile.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  const fields = {};
  if (!name) fields.name = 'name';
  if (!email) fields.email = 'email';
  let mobile = null;
  if (mobileRaw) {
    mobile = mobileRaw.length > 20 ? '' : normalizeMobile(mobileRaw);
    if (!mobile) fields.mobile = 'mobile';
  }
  if (Object.keys(fields).length) throw new HttpError(400, 'Please check the highlighted fields.', { code: 'invalid', fields });
  return { name, email, mobile };
}

function takenError(code) {
  const field = code === 'username_taken' ? 'username' : code === 'mobile_taken' ? 'mobile' : 'email';
  const message = code === 'username_taken'
    ? 'That username is already taken.'
    : code === 'mobile_taken'
      ? 'An account with this mobile number already exists.'
      : 'An account with this email already exists. Try logging in.';
  return new HttpError(409, message, { code, fields: { [field]: code } });
}

async function readJson(req) {
  const type = req.headers.get('content-type') || '';
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Send JSON.', { code: 'bad_json' });
  const text = await req.text();
  if (text.length > 16000) throw new HttpError(413, 'Too much data.', { code: 'too_large' });
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

function hostMatchesCookieDomain(host, domain) {
  const bare = domain.replace(/^\./, '').toLowerCase();
  const h = String(host || '').toLowerCase();
  return h === bare || h.endsWith('.' + bare);
}

function sessionCookie(req, env, value, maxAge) {
  const url = new URL(req.url);
  const host = url.hostname;
  const secure = url.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1';
  // maxAge null is a session cookie (no Max-Age). 0 clears it on logout.
  let c = `pn_session=${value}; Path=/; SameSite=Lax; HttpOnly`;
  if (maxAge != null) c += `; Max-Age=${maxAge}`;
  if (secure) c += '; Secure';
  const domain = cookieDomain(env);
  // A Domain for peppynose.com is ignored by a localhost browser, so local
  // tests and `wrangler dev` keep a host-only cookie. Live hosts under that
  // domain still get Domain=.peppynose.com.
  if (domain && hostMatchesCookieDomain(host, domain)) c += `; Domain=${domain}`;
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

const pub = row => ({
  name: row.name || '',
  email: row.email || '',
  username: row.username || '',
  mobile: row.mobile || '',
  profile_complete: Number(row.profile_complete) === 1
});

const USER_COLS = 'id, email, username, mobile, name, password_hash, google_sub, profile_complete, email_verified';
const USER_SQL = {
  email: `SELECT ${USER_COLS} FROM users WHERE email = ? COLLATE NOCASE`,
  mobile: `SELECT ${USER_COLS} FROM users WHERE mobile = ?`,
  username: `SELECT ${USER_COLS} FROM users WHERE username = ? COLLATE NOCASE`
};

function wantsStay(body) {
  return !!(body && body.stay === true);
}

function findUser(env, id) {
  return env.DB.prepare(USER_SQL[id.kind]).bind(id.value).first();
}

async function startSession(req, env, user, stay) {
  const token = randHex(32);
  const csrf = randHex(16);
  const at = new Date().toISOString();
  const exp = new Date(Date.now() + REMEMBER_SECONDS * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? OR expires_at < ?').bind(user.id, at),
    env.DB.prepare('INSERT INTO sessions (id, user_id, csrf, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').bind(await sha256hex(token), user.id, csrf, at, exp)
  ]);
  const maxAge = stay ? REMEMBER_SECONDS : null;
  return json({ ok: true, user: pub(user), csrf }, 200, { 'set-cookie': sessionCookie(req, env, token, maxAge) });
}

async function sessionRow(req, env) {
  const token = readCookie(req, 'pn_session');
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const id = await sha256hex(token);
  const row = await env.DB.prepare(`SELECT s.id, s.csrf, s.expires_at, s.user_id, u.email, u.username, u.mobile, u.name, u.password_hash, u.google_sub, u.profile_complete, u.email_verified
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

function mapUnique(e) {
  const msg = String(e && e.message || '');
  if (!msg.includes('UNIQUE') && !msg.includes('constraint failed')) return null;
  if (/google_sub/i.test(msg)) return new HttpError(401, 'Google sign-in failed.', { code: 'google_invalid' });
  if (/username/i.test(msg)) return takenError('username_taken');
  if (/mobile/i.test(msg)) return takenError('mobile_taken');
  return takenError('email_taken');
}

async function signup(req, env) {
  assertBrowserOrigin(req, env);
  const { secret, iters } = assertConfig(env);
  const raw = await readJson(req);
  const body = validateSignup(raw);
  const ip = clientIp(req);
  if (await tooMany(env, 'signup', 'ip:' + ip, SIGNUP_WINDOW_MS, SIGNUP_MAX_IP)) {
    throw new HttpError(429, 'Too many accounts created from this network. Please wait an hour.', { code: 'rate_limited' });
  }
  await recordAttempt(env, 'signup', 'ip:' + ip);
  const taken = await env.DB.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').bind(body.username).first();
  if (taken) throw takenError('username_taken');
  const hash = await hashPassword(body.password, secret, iters);
  const id = 'u_' + randHex(16);
  const user = { id, email: '', username: body.username, mobile: '', name: '', password_hash: hash, google_sub: null, profile_complete: 0 };
  try {
    await env.DB.prepare('INSERT INTO users (id, email, username, mobile, name, password_hash, google_sub, profile_complete, created_at) VALUES (?, NULL, ?, NULL, NULL, ?, NULL, 0, ?)').bind(id, body.username, hash, new Date().toISOString()).run();
  } catch (e) {
    const mapped = mapUnique(e);
    if (mapped) throw mapped;
    throw e;
  }
  return startSession(req, env, user, wantsStay(raw));
}

async function login(req, env) {
  assertBrowserOrigin(req, env);
  const { secret, iters } = assertConfig(env);
  const body = await readJson(req);
  const password = typeof body.password === 'string' ? body.password : '';
  const ip = clientIp(req);
  if (await tooMany(env, 'login', 'ip:' + ip, LOGIN_WINDOW_MS, LOGIN_MAX_IP)) {
    throw new HttpError(429, 'Too many tries. Please wait 15 minutes.', { code: 'rate_limited' });
  }
  const id = classifyIdentifier(body.identifier);
  const fields = {};
  if (!id.ok) fields.identifier = 'identifier';
  if (password.length < 1 || password.length > 200) fields.password = 'short';
  if (Object.keys(fields).length) {
    await recordAttempt(env, 'login', 'ip:' + ip);
    throw new HttpError(400, 'Please check the highlighted fields.', { code: 'invalid', fields });
  }
  const idKey = id.kind + ':' + id.value;
  if (await tooMany(env, 'login', 'id:' + idKey, LOGIN_WINDOW_MS, LOGIN_MAX_ID)) {
    throw new HttpError(429, 'Too many tries. Please wait 15 minutes.', { code: 'rate_limited' });
  }
  const user = await findUser(env, id);
  const stored = user ? user.password_hash : await dummyHash(secret, iters);
  const ok = await verifyPassword(password, stored, secret);
  if (!user || !ok) {
    await recordAttempt(env, 'login', 'ip:' + ip);
    await recordAttempt(env, 'login', 'id:' + idKey);
    throw new HttpError(401, BAD_LOGIN, { code: 'bad_login' });
  }
  return startSession(req, env, user, wantsStay(body));
}

function googleClientId(env) {
  const id = String(env && env.GOOGLE_CLIENT_ID || '').trim();
  return /^[0-9A-Za-z._-]{10,200}$/.test(id) ? id : '';
}

async function googleLogin(req, env) {
  assertBrowserOrigin(req, env);
  assertConfig(env);
  const clientId = googleClientId(env);
  if (!clientId) throw new HttpError(503, 'Google sign-in is not available yet.', { code: 'google_not_configured' });
  const body = await readJson(req);
  const credential = typeof body.credential === 'string' ? body.credential.trim() : '';
  const ip = clientIp(req);
  if (await tooMany(env, 'google', 'ip:' + ip, LOGIN_WINDOW_MS, LOGIN_MAX_IP)) {
    throw new HttpError(429, 'Too many tries. Please wait 15 minutes.', { code: 'rate_limited' });
  }
  let claims;
  try {
    claims = await verifyGoogleIdToken(credential, { clientId, fetchImpl: env.GOOGLE_JWKS_FETCH });
  } catch (e) {
    await recordAttempt(env, 'google', 'ip:' + ip);
    if (e instanceof GoogleTokenError && (e.code === 'jwks' || e.code === 'not_configured')) {
      throw new HttpError(503, 'Google sign-in is not available yet.', { code: 'google_not_configured' });
    }
    throw new HttpError(401, 'Google sign-in failed.', { code: 'google_invalid' });
  }
  let user = await env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE google_sub = ?`).bind(claims.sub).first();
  let release = null;
  if (!user) {
    const byEmail = await env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE email = ? COLLATE NOCASE`).bind(claims.email).first();
    if (byEmail) {
      // The same Google account can land here if it was created between the
      // two lookups. Sign that person in. Do not attach this Google id to an
      // account that only typed the same email: the details form does not
      // prove they own the address. Google does, so a typed (unverified) email
      // is taken off that account and given to this new one; that account is
      // sent back to "Your details". An email Google verified for a different
      // Google id is refused without replacing it.
      if (byEmail.google_sub === claims.sub) {
        user = byEmail;
      } else if (Number(byEmail.email_verified) !== 1) {
        release = byEmail.id;
      } else {
        await recordAttempt(env, 'google', 'ip:' + ip);
        if (byEmail.google_sub) throw new HttpError(401, 'Google sign-in failed.', { code: 'google_invalid' });
        throw takenError('email_taken');
      }
    }
  }
  if (!user) {
    const id = 'u_' + randHex(16);
    const name = validName(claims.name) || null;
    const insert = env.DB.prepare('INSERT INTO users (id, email, username, mobile, name, password_hash, google_sub, profile_complete, email_verified, created_at) VALUES (?, ?, NULL, NULL, ?, NULL, ?, 0, 1, ?)').bind(id, claims.email, name, claims.sub, new Date().toISOString());
    try {
      // One batch, so the email is only released if the new row is written.
      // If the old row became verified in between, nothing is released and the
      // insert fails on the unique email below.
      if (release) {
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET email = NULL, email_verified = 0, profile_complete = 0 WHERE id = ? AND email_verified = 0 AND email = ? COLLATE NOCASE').bind(release, claims.email),
          insert
        ]);
      } else {
        await insert.run();
      }
      user = await env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(id).first();
    } catch (e) {
      const mapped = mapUnique(e);
      if (!mapped) throw e;
      // Two clicks for the same Google account can collide on email or sub.
      // Sign that person in. A collision with someone else's email stays a refusal.
      user = await env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE google_sub = ?`).bind(claims.sub).first();
      if (!user) {
        await recordAttempt(env, 'google', 'ip:' + ip);
        throw mapped;
      }
    }
  }
  return startSession(req, env, user, wantsStay(body));
}

async function updateProfile(req, env) {
  assertBrowserOrigin(req, env);
  assertConfig(env);
  const row = await sessionRow(req, env);
  if (!row) throw new HttpError(401, 'Please log in.', { code: 'bad_login' });
  assertCsrf(req, row);
  const profile = validateProfile(await readJson(req));
  const emailOwner = await env.DB.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id != ?').bind(profile.email, row.user_id).first();
  if (emailOwner) throw takenError('email_taken');
  if (profile.mobile) {
    const mobileOwner = await env.DB.prepare('SELECT id FROM users WHERE mobile = ? AND id != ?').bind(profile.mobile, row.user_id).first();
    if (mobileOwner) throw takenError('mobile_taken');
  }
  // Only an email Google verified for this account stays verified. A typed or
  // changed email is unverified, so a verified Google sign-in can reclaim it.
  const keepsVerified = Number(row.email_verified) === 1 && String(row.email || '').toLowerCase() === profile.email;
  try {
    await env.DB.prepare('UPDATE users SET name = ?, email = ?, mobile = ?, profile_complete = 1, email_verified = ? WHERE id = ?').bind(profile.name, profile.email, profile.mobile, keepsVerified ? 1 : 0, row.user_id).run();
  } catch (e) {
    const mapped = mapUnique(e);
    if (mapped) throw mapped;
    throw e;
  }
  return json({
    ok: true,
    user: pub({
      name: profile.name,
      email: profile.email,
      username: row.username,
      mobile: profile.mobile || '',
      profile_complete: 1
    })
  });
}

function randomOtp() {
  const buf = new Uint32Array(1);
  const limit = 0x100000000 - (0x100000000 % 1000000);
  let n = 0;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return String(n % 1000000).padStart(6, '0');
}

async function otpHash(secret, identifier, code) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(identifier + '\n' + code));
  return toHex(new Uint8Array(sig));
}

async function requestOtp(req, env) {
  assertBrowserOrigin(req, env);
  const { secret } = assertConfig(env);
  const body = await readJson(req);
  const id = classifyIdentifier(body.identifier);
  if (!id.ok || (id.kind !== 'email' && id.kind !== 'mobile')) {
    throw new HttpError(400, 'A code can be sent to a mobile number or an email, not a username.', { code: 'otp_needs_contact' });
  }
  const channel = id.kind === 'mobile' ? 'sms' : 'email';
  const ready = deliveryReady(env, channel, req);
  if (!ready.ok) throw new HttpError(503, 'Code login is not available yet.', { code: 'otp_not_configured' });
  const ip = clientIp(req);
  const idKey = id.kind + ':' + id.value;
  if (await tooMany(env, 'otp_send', 'ip:' + ip, OTP_WINDOW_MS, OTP_MAX_IP) || await tooMany(env, 'otp_send', 'id:' + idKey, OTP_WINDOW_MS, OTP_MAX_ID)) {
    throw new HttpError(429, 'Too many codes requested. Please wait 15 minutes.', { code: 'rate_limited' });
  }
  await recordAttempt(env, 'otp_send', 'ip:' + ip);
  await recordAttempt(env, 'otp_send', 'id:' + idKey);
  const user = await findUser(env, id);
  const payload = { ok: true, message: OTP_SENT };
  if (!user) return json(payload);
  const code = randomOtp();
  const now = new Date();
  await env.DB.prepare('UPDATE auth_otps SET used = 1 WHERE identifier = ? AND used = 0').bind(idKey).run();
  await env.DB.prepare('INSERT INTO auth_otps (id, identifier, code_hash, expires_at, attempts, used, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)').bind('otp_' + randHex(16), idKey, await otpHash(secret, idKey, code), new Date(now.getTime() + OTP_TTL_MS).toISOString(), now.toISOString()).run();
  const sent = await sendOtp({ channel, to: id.value, code, env });
  if (!sent.ok) {
    await env.DB.prepare('UPDATE auth_otps SET used = 1 WHERE identifier = ? AND used = 0').bind(idKey).run();
    return json(payload);
  }
  if (ready.dev) payload.dev_code = code;
  return json(payload);
}

async function verifyOtp(req, env) {
  assertBrowserOrigin(req, env);
  const { secret } = assertConfig(env);
  const body = await readJson(req);
  const id = classifyIdentifier(body.identifier);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!id.ok || (id.kind !== 'email' && id.kind !== 'mobile')) throw new HttpError(401, OTP_BAD, { code: 'otp_invalid' });
  const channel = id.kind === 'mobile' ? 'sms' : 'email';
  const ready = deliveryReady(env, channel, req);
  if (!ready.ok && (ready.reason === 'dev_refused' || ready.reason === 'off')) throw new HttpError(503, 'Code login is not available yet.', { code: 'otp_not_configured' });
  const idKey = id.kind + ':' + id.value;
  const row = await env.DB.prepare('SELECT id, code_hash, expires_at, attempts, used FROM auth_otps WHERE identifier = ? ORDER BY created_at DESC LIMIT 1').bind(idKey).first();
  const got = await otpHash(secret, idKey, /^\d{6}$/.test(code) ? code : '000000');
  if (!row || row.used) {
    const dummy = await otpHash(secret, idKey, '000000');
    timingSafeEqual(fromHex(dummy), fromHex(got));
    const since = new Date(Date.now() - OTP_TTL_MS).toISOString();
    const fails = await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_attempts WHERE scope = ? AND key = ? AND at > ?').bind('otp_verify', 'id:' + idKey, since).first();
    if (Number(fails && fails.n) >= OTP_MAX_ATTEMPTS) throw new HttpError(401, OTP_LOCKED, { code: 'otp_locked' });
    await recordAttempt(env, 'otp_verify', 'id:' + idKey);
    throw new HttpError(401, OTP_BAD, { code: 'otp_invalid' });
  }
  if (Number(row.attempts) >= OTP_MAX_ATTEMPTS) throw new HttpError(401, OTP_LOCKED, { code: 'otp_locked' });
  const expired = row.expires_at < new Date().toISOString();
  const match = /^\d{6}$/.test(code) && timingSafeEqual(fromHex(row.code_hash), fromHex(got));
  if (expired || !match) {
    const attempts = Number(row.attempts) + 1;
    await env.DB.prepare('UPDATE auth_otps SET attempts = ? WHERE id = ?').bind(attempts, row.id).run();
    if (attempts >= OTP_MAX_ATTEMPTS) throw new HttpError(401, OTP_LOCKED, { code: 'otp_locked' });
    throw new HttpError(401, OTP_BAD, { code: 'otp_invalid' });
  }
  await env.DB.prepare('UPDATE auth_otps SET used = 1 WHERE id = ?').bind(row.id).run();
  const user = await findUser(env, id);
  if (!user) throw new HttpError(401, OTP_BAD, { code: 'otp_invalid' });
  return startSession(req, env, user, wantsStay(body));
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
    throw new HttpError(401, BAD_LOGIN, { code: 'bad_login' });
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
// One-time login codes are separate: they prove control of the mobile or inbox only
// when a real SMS or email provider is configured. Dev mode does not do that.

function authPublicConfig(req, env) {
  const sms = deliveryReady(env, 'sms', req).ok;
  const email = deliveryReady(env, 'email', req).ok;
  return json({ otp: !!(sms || email), google_client_id: googleClientId(env) });
}

export async function authApi(req, env) {
  try {
    const path = new URL(req.url).pathname;
    const method = req.method;
    if (path === '/api/auth/config' && method === 'GET') return authPublicConfig(req, env);
    if (path === '/api/auth/signup' && method === 'POST') return await signup(req, env);
    if (path === '/api/auth/login' && method === 'POST') return await login(req, env);
    if (path === '/api/auth/google' && method === 'POST') return await googleLogin(req, env);
    if (path === '/api/auth/profile' && method === 'PUT') return await updateProfile(req, env);
    if (path === '/api/auth/otp/request' && method === 'POST') return await requestOtp(req, env);
    if (path === '/api/auth/otp/verify' && method === 'POST') return await verifyOtp(req, env);
    if (path === '/api/auth/logout' && method === 'POST') return await logout(req, env);
    if (path === '/api/auth/delete' && method === 'POST') return await deleteAccount(req, env);
    if (path === '/api/auth/me' && method === 'GET') return await me(req, env);
    throw new HttpError(404, 'Not found.', { code: 'not_found' });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...(e.extra || {}) }, e.status);
    throw e;
  }
}
