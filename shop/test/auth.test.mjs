// Unit tests for the customer account API. They use an in-memory SQLite database
// with the same schema the Worker runs on D1. AUTH_TEST_FAST shortens PBKDF2 so
// the suite stays quick. Production accepts only 100000 iterations, the Workers cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { authApi, configuredIters, hashPassword, verifyPassword, MIN_PBKDF2_ITERS, MAX_PBKDF2_ITERS, REMEMBER_SECONDS } from '../src/auth.js';
import { resetGoogleKeyCache } from '../src/google-id.js';
import { makeRsaKey, signIdToken, jwksFetch, baseClaims } from './google-token.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8');
const MIGRATION_1 = readFileSync(join(here, '..', 'db', 'auth-migration.sql'), 'utf8');
const MIGRATION_2 = readFileSync(join(here, '..', 'db', 'auth-migration-002.sql'), 'utf8');
const MIGRATION_3 = readFileSync(join(here, '..', 'db', 'auth-migration-003.sql'), 'utf8');
const SECRET = 'unit-test-session-secret-not-used-in-production';

function d1(db) {
  return {
    prepare(sql) {
      return {
        _sql: sql,
        _args: [],
        bind(...args) { this._args = args; return this; },
        async first() {
          const row = db.prepare(sql).get(...this._args);
          return row === undefined ? null : row;
        },
        async all() { return { results: db.prepare(sql).all(...this._args) }; },
        async run() {
          const info = db.prepare(sql).run(...this._args);
          return { meta: { changes: Number(info.changes) } };
        }
      };
    },
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) {
          const info = db.prepare(s._sql).run(...s._args);
          out.push({ meta: { changes: Number(info.changes) } });
        }
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    }
  };
}

function makeEnv(extra = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  return {
    DB: d1(db),
    SESSION_SECRET: SECRET,
    AUTH_TEST_FAST: '1',
    OTP_SMS_PROVIDER: 'dev',
    OTP_EMAIL_PROVIDER: 'dev',
    ...extra
  };
}

function call(env, path, { method = 'GET', body, cookie, origin, ip, headers = {} } = {}) {
  const h = new Headers(headers);
  if (body !== undefined) {
    h.set('content-type', 'application/json');
    body = JSON.stringify(body);
  }
  if (cookie) h.set('cookie', cookie);
  if (origin) h.set('origin', origin);
  if (ip) h.set('cf-connecting-ip', ip);
  return authApi(new Request('http://localhost' + path, { method, headers: h, body }), env);
}

const cookieOf = res => {
  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  const line = cookies.find(c => c && c.startsWith('pn_session='));
  assert.ok(line, 'expected a pn_session cookie');
  return line;
};
const tokenOf = res => cookieOf(res).split(';', 1)[0].slice('pn_session='.length);

let seq = 0;
function account(over = {}) {
  seq += 1;
  return {
    name: 'Ada Amma',
    username: 'ada.' + seq,
    mobile: '9' + String(seq).padStart(9, '0'),
    email: `ada${seq}@example.com`,
    password: 'horse-battery-99',
    confirm: 'horse-battery-99',
    ...over
  };
}

async function createAccount(env, body, ip = '203.0.113.10') {
  const res = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip,
    body: { username: body.username, password: body.password, confirm: body.confirm, stay: body.stay === true }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  const cookie = `pn_session=${tokenOf(res)}`;
  const profile = await call(env, '/api/auth/profile', {
    method: 'PUT', origin: 'http://localhost', cookie,
    headers: { 'x-csrf-token': data.csrf },
    body: { name: body.name, email: body.email, mobile: body.mobile || '' }
  });
  const saved = await profile.json();
  assert.equal(profile.status, 200, JSON.stringify(saved));
  return { cookie, csrf: data.csrf, signup: data, profile: saved };
}

test('production PBKDF2 count is 100000 and a higher override is refused', async () => {
  assert.equal(MAX_PBKDF2_ITERS, 100_000);
  assert.equal(MIN_PBKDF2_ITERS, 100_000);
  assert.equal(configuredIters({}), 100_000);
  assert.ok(configuredIters({}) <= 100_000);
  assert.equal(configuredIters({ AUTH_PBKDF2_ITERS: '100000' }), 100_000);
  assert.equal(configuredIters({ AUTH_PBKDF2_ITERS: '100001' }), null);
  assert.equal(configuredIters({ AUTH_PBKDF2_ITERS: '600000' }), null);
  assert.equal(configuredIters({ AUTH_PBKDF2_ITERS: '1000' }), null);
  assert.equal(configuredIters({ AUTH_TEST_FAST: '1' }), 1_000);
  assert.equal(configuredIters({ AUTH_TEST_FAST: '1', AUTH_PBKDF2_ITERS: '600000' }), 1_000);

  const env = makeEnv({ AUTH_TEST_FAST: '0', AUTH_PBKDF2_ITERS: '600000' });
  const res = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.9',
    body: account({ username: 'too.many', email: 'toomany@example.com' })
  });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.code, 'not_configured');
  assert.match(body.error, /100000/);
  assert.match(body.error, /cannot run PBKDF2 above/);
  assert.equal(await env.DB.prepare('SELECT id FROM users').first(), null);
});

test('hashPassword never stores the password and verifyPassword checks it', async () => {
  const password = 'correct horse battery staple';
  const stored = await hashPassword(password, SECRET, 1_000);
  assert.equal(stored.startsWith('pbkdf2-sha256$1000$'), true);
  assert.equal(stored.includes(password), false);
  assert.equal(await verifyPassword(password, stored, SECRET), true);
  assert.equal(await verifyPassword('wrong-password-here', stored, SECRET), false);
  assert.equal(await verifyPassword(password, stored, 'another-secret-that-is-long-enough'), false);
  assert.equal(await verifyPassword(password, 'plain-text-' + password, SECRET), false);
  const storedCount = await hashPassword(password, SECRET, 100_000);
  assert.match(storedCount, /^pbkdf2-sha256\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.equal(storedCount.includes(password), false);
  assert.equal(await verifyPassword(password, storedCount, SECRET), true);
  const tooHigh = 'pbkdf2-sha256$600000$' + '11'.repeat(16) + '$' + '22'.repeat(32);
  assert.equal(await verifyPassword(password, tooHigh, SECRET), false);
  assert.match(tooHigh, /\$600000\$/);
});

test('migration 002 only adds columns and the OTP table', () => {
  assert.equal(/drop\s+table/i.test(MIGRATION_2), false);
  assert.match(MIGRATION_2, /ALTER TABLE users ADD COLUMN username/);
  assert.match(MIGRATION_2, /ALTER TABLE users ADD COLUMN mobile/);
  assert.match(MIGRATION_2, /CREATE TABLE IF NOT EXISTS auth_otps/);
  const db = new DatabaseSync(':memory:');
  db.exec(MIGRATION_1);
  db.exec(MIGRATION_2);
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  assert.ok(cols.includes('username'));
  assert.ok(cols.includes('mobile'));
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'auth_otps'").get());
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(r => r.name);
  assert.ok(indexes.includes('users_username'));
  assert.ok(indexes.includes('users_mobile'));
});

test('migration 003 keeps existing accounts and allows a Google-only row', () => {
  assert.match(MIGRATION_3, /google_sub/);
  assert.match(MIGRATION_3, /profile_complete/);
  assert.match(MIGRATION_3, /DROP TABLE users/);
  assert.equal(/drop\s+table\s+(orders|products|sessions|auth_otps)\b/i.test(MIGRATION_3), false);
  const db = new DatabaseSync(':memory:');
  db.exec(MIGRATION_1);
  db.exec(MIGRATION_2);
  db.prepare('INSERT INTO users (id, email, name, password_hash, created_at, username, mobile) VALUES (?, ?, ?, ?, ?, ?, ?)').run('u1', 'ada@example.com', 'Ada', 'hash', '2020-01-01T00:00:00.000Z', 'ada', '9876543210');
  db.prepare('INSERT INTO sessions (id, user_id, csrf, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run('s1', 'u1', 'csrfcsrfcsrfcsrfcsrfcsrfcsrfcsrf', '2020-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z');
  db.exec(MIGRATION_3);
  const row = db.prepare('SELECT email, username, name, profile_complete, google_sub FROM users WHERE id = ?').get('u1');
  assert.equal(row.email, 'ada@example.com');
  assert.equal(row.username, 'ada');
  assert.equal(row.profile_complete, 1);
  assert.equal(row.google_sub, null);
  assert.equal(db.prepare('SELECT user_id FROM sessions WHERE id = ?').get('s1').user_id, 'u1');
  db.prepare('INSERT INTO users (id, email, username, mobile, name, password_hash, google_sub, profile_complete, created_at) VALUES (?, NULL, NULL, NULL, ?, NULL, ?, 0, ?)').run('u2', 'Ada', '1234567890', '2020-01-02T00:00:00.000Z');
  assert.equal(db.prepare('SELECT google_sub, profile_complete FROM users WHERE id = ?').get('u2').profile_complete, 0);
});

test('sign up stores a hash, sets an HttpOnly cookie, and rejects a duplicate username', async () => {
  const env = makeEnv();
  const first = account({ username: 'Ada.Amma', email: 'Ada@Example.com', mobile: '+91 98765 43210' });
  const res = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.10',
    body: { username: first.username, password: first.password, confirm: first.confirm, stay: true }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.user, { name: '', email: '', username: 'Ada.Amma', mobile: '', profile_complete: false });
  assert.match(data.csrf, /^[0-9a-f]{32}$/);
  assert.equal(JSON.stringify(data).includes('horse-battery-99'), false);
  const cookie = cookieOf(res);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, new RegExp('Max-Age=' + REMEMBER_SECONDS));
  const token = tokenOf(res);
  const row = await env.DB.prepare('SELECT email, username, mobile, password_hash, profile_complete FROM users').first();
  assert.equal(row.email, null);
  assert.equal(row.username, 'Ada.Amma');
  assert.equal(row.mobile, null);
  assert.equal(row.profile_complete, 0);
  assert.equal(row.password_hash.includes('horse-battery-99'), false);
  assert.equal(row.password_hash.startsWith('pbkdf2-sha256$'), true);
  const session = await env.DB.prepare('SELECT id, expires_at FROM sessions').first();
  assert.notEqual(session.id, token);
  const life = new Date(session.expires_at).getTime() - Date.now();
  assert.ok(life > 29 * 24 * 60 * 60 * 1000);
  assert.ok(life < 31 * 24 * 60 * 60 * 1000);

  const profile = await call(env, '/api/auth/profile', {
    method: 'PUT', origin: 'http://localhost', cookie: `pn_session=${token}`,
    headers: { 'x-csrf-token': data.csrf },
    body: { name: first.name, email: first.email, mobile: first.mobile }
  });
  assert.equal(profile.status, 200);
  assert.deepEqual((await profile.json()).user, {
    name: 'Ada Amma', email: 'ada@example.com', username: 'Ada.Amma', mobile: '9876543210', profile_complete: true
  });

  const dupUser = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.10',
    body: account({ username: 'ada.amma' })
  });
  assert.equal(dupUser.status, 409);
  assert.equal((await dupUser.json()).code, 'username_taken');

  const other = await createAccount(env, account({ email: 'other@example.com', mobile: '9123456780' }), '203.0.113.11');
  const dupEmail = await call(env, '/api/auth/profile', {
    method: 'PUT', origin: 'http://localhost', cookie: other.cookie,
    headers: { 'x-csrf-token': other.csrf },
    body: { name: 'Other Amma', email: 'ada@example.com', mobile: '' }
  });
  assert.equal(dupEmail.status, 409);
  assert.equal((await dupEmail.json()).code, 'email_taken');
  const dupMobile = await call(env, '/api/auth/profile', {
    method: 'PUT', origin: 'http://localhost', cookie: other.cookie,
    headers: { 'x-csrf-token': other.csrf },
    body: { name: 'Other Amma', email: 'other@example.com', mobile: '09876543210' }
  });
  assert.equal(dupMobile.status, 409);
  assert.equal((await dupMobile.json()).code, 'mobile_taken');
});

test('login accepts username, mobile formats and email, and hides which one was wrong', async () => {
  const env = makeEnv();
  await createAccount(env, account({ name: 'Meera', username: 'Meera.R', mobile: '9876543210', email: 'meera@example.com' }), '203.0.113.15');
  for (const identifier of ['meera.r', 'MEERA.R', '9876543210', '+91 98765 43210', '91-9876543210', '09876543210', 'MEERA@example.com']) {
    const res = await call(env, '/api/auth/login', {
      method: 'POST', origin: 'http://localhost', ip: '203.0.113.16',
      body: { identifier, password: 'horse-battery-99' }
    });
    assert.equal(res.status, 200, identifier);
    assert.equal((await res.json()).user.username, 'Meera.R');
  }
  const wrong = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.17',
    body: { identifier: 'meera.r', password: 'not-the-password' }
  });
  assert.equal(wrong.status, 401);
  const wrongBody = await wrong.json();
  assert.equal(wrongBody.code, 'bad_login');
  assert.equal(wrongBody.error, 'Invalid credentials.');
  const unknown = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.18',
    body: { identifier: 'nobody@example.com', password: 'not-the-password' }
  });
  assert.equal(unknown.status, 401);
  assert.equal((await unknown.json()).error, wrongBody.error);
});

test('login, me, logout and delete follow the cookie and the CSRF token', async () => {
  const env = makeEnv();
  const made = await createAccount(env, account({ name: 'Meera', username: 'meera', email: 'meera2@example.com', mobile: '9000000001' }), '203.0.113.20');
  const { csrf } = made;
  const cookie = made.cookie;

  const anon = await call(env, '/api/auth/me');
  assert.deepEqual(await anon.json(), { user: null });

  const who = await call(env, '/api/auth/me', { cookie });
  const whoBody = await who.json();
  assert.equal(whoBody.user.email, 'meera2@example.com');
  assert.equal(whoBody.user.username, 'meera');

  await env.DB.prepare('DELETE FROM sessions').run();
  const loggedOut = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.20',
    body: { identifier: 'MEERA', password: 'horse-battery-99' }
  });
  assert.equal(loggedOut.status, 200);
  const fresh = await loggedOut.json();
  const cookie2 = `pn_session=${tokenOf(loggedOut)}`;

  const bad = await call(env, '/api/auth/logout', { method: 'POST', origin: 'http://localhost', cookie: cookie2 });
  assert.equal(bad.status, 403);
  assert.equal((await bad.json()).code, 'csrf');
  assert.ok(await env.DB.prepare('SELECT id FROM sessions').first());

  const out = await call(env, '/api/auth/logout', {
    method: 'POST', origin: 'http://localhost', cookie: cookie2,
    headers: { 'x-csrf-token': fresh.csrf }
  });
  assert.equal(out.status, 200);
  assert.match(cookieOf(out), /Max-Age=0/);
  const after = await call(env, '/api/auth/me', { cookie: cookie2 });
  assert.deepEqual(await after.json(), { user: null });

  const back = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.21',
    body: { identifier: 'meera2@example.com', password: 'horse-battery-99' }
  });
  const backBody = await back.json();
  const gone = await call(env, '/api/auth/delete', {
    method: 'POST', origin: 'http://localhost', cookie: `pn_session=${tokenOf(back)}`,
    headers: { 'x-csrf-token': backBody.csrf },
    body: { password: 'horse-battery-99' }
  });
  assert.equal(gone.status, 200);
  assert.equal(await env.DB.prepare('SELECT id FROM users').first(), null);
  assert.equal(csrf.length, 32);
});

test('wrong password, validation, foreign origin and a form post are refused', async () => {
  const env = makeEnv();
  const ravi = account({ name: 'Ravi', username: 'ravi', email: 'ravi@example.com' });
  await createAccount(env, ravi, '203.0.113.30');
  const wrong = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.30',
    body: { identifier: 'ravi@example.com', password: 'not-the-password' }
  });
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).code, 'bad_login');
  assert.equal(wrong.headers.get('set-cookie'), null);

  const weak = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.32',
    body: { username: 'ab', password: 'short', confirm: 'other' }
  });
  assert.equal(weak.status, 400);
  const fields = (await weak.json()).fields;
  assert.equal(fields.username, 'username');
  assert.equal(fields.password, 'short');
  assert.equal(fields.confirm, 'mismatch');
  assert.equal(fields.name, undefined);
  assert.equal(fields.email, undefined);
  assert.equal(fields.mobile, undefined);

  const digits = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.32',
    body: account({ username: '12345' })
  });
  assert.equal(digits.status, 400);
  assert.equal((await digits.json()).fields.username, 'username');

  const foreign = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'https://evil.example', ip: '203.0.113.33',
    body: { identifier: 'ravi@example.com', password: 'horse-battery-99' }
  });
  assert.equal(foreign.status, 403);
  assert.equal((await foreign.json()).code, 'forbidden_origin');

  const form = await authApi(new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' },
    body: 'identifier=ravi@example.com&password=horse-battery-99'
  }), env);
  assert.equal(form.status, 415);
});

test('login attempts are rate limited per IP', async () => {
  const env = makeEnv();
  const lata = account({ name: 'Lata', username: 'lata', email: 'lata@example.com' });
  await createAccount(env, lata, '203.0.113.40');
  for (let i = 0; i < 8; i++) {
    const res = await call(env, '/api/auth/login', {
      method: 'POST', origin: 'http://localhost', ip: '203.0.113.40',
      body: { identifier: 'lata', password: 'wrong-password-' + i }
    });
    assert.equal(res.status, 401);
  }
  const locked = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.40',
    body: { identifier: 'lata@example.com', password: 'horse-battery-99' }
  });
  assert.equal(locked.status, 429);
  assert.equal((await locked.json()).code, 'rate_limited');
  const otherIp = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.41',
    body: { identifier: lata.mobile, password: 'horse-battery-99' }
  });
  assert.equal(otherIp.status, 200);
});

test('cookie Domain is set only from a safe COOKIE_DOMAIN value', async () => {
  const env = makeEnv({ COOKIE_DOMAIN: '.peppynose.com', AUTH_ORIGINS: 'https://www.peppynose.com,https://peppynose.com' });
  const res = await authApi(new Request('https://www.peppynose.com/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://www.peppynose.com', 'cf-connecting-ip': '203.0.113.50' },
    body: JSON.stringify(account({ name: 'Diya', username: 'diya', email: 'diya@example.com' }))
  }), env);
  assert.equal(res.status, 200);
  assert.match(cookieOf(res), /Domain=\.peppynose\.com/);
  const local = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.52',
    body: account({ name: 'Diya', username: 'diya.local', email: 'diya.local@example.com' })
  });
  assert.equal(local.status, 200);
  assert.doesNotMatch(cookieOf(local), /Domain=/);
  const bad = makeEnv({ COOKIE_DOMAIN: 'peppynose.com' });
  const refused = await call(bad, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.51',
    body: account({ name: 'Diya', username: 'diya2', email: 'diya2@example.com' })
  });
  assert.equal(refused.status, 503);
  assert.equal(await bad.DB.prepare('SELECT id FROM users').first(), null);
});

test('accounts stay unavailable when the session secret is missing', async () => {
  const env = makeEnv({ SESSION_SECRET: '' });
  const res = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost',
    body: account({ name: 'Diya', username: 'diya3', email: 'diya3@example.com' })
  });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'not_configured');
});

test('OTP login works by mobile and email, and a missing account stays generic', async () => {
  const env = makeEnv();
  const person = account({ name: 'Oviya', username: 'oviya', mobile: '9123456780', email: 'oviya@example.com' });
  await createAccount(env, person, '203.0.113.60');
  const usernameCode = await call(env, '/api/auth/otp/request', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.60',
    body: { identifier: 'oviya' }
  });
  assert.equal(usernameCode.status, 400);
  assert.equal((await usernameCode.json()).code, 'otp_needs_contact');

  const missing = await call(env, '/api/auth/otp/request', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.61',
    body: { identifier: '9000000000' }
  });
  assert.equal(missing.status, 200);
  const missingBody = await missing.json();
  assert.equal(missingBody.message, 'If an account exists, we sent a code.');
  assert.equal(missingBody.dev_code, undefined);
  assert.equal(await env.DB.prepare('SELECT id FROM auth_otps').first(), null);

  const mobile = await call(env, '/api/auth/otp/request', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.62',
    body: { identifier: '+91 91234 56780' }
  });
  assert.equal(mobile.status, 200);
  const mobileBody = await mobile.json();
  assert.equal(mobileBody.message, 'If an account exists, we sent a code.');
  assert.match(mobileBody.dev_code, /^\d{6}$/);
  const row = await env.DB.prepare('SELECT code_hash FROM auth_otps').first();
  assert.equal(row.code_hash.includes(mobileBody.dev_code), false);

  const bad = await call(env, '/api/auth/otp/verify', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.62',
    body: { identifier: '9123456780', code: mobileBody.dev_code === '000000' ? '000001' : '000000' }
  });
  assert.equal(bad.status, 401);
  assert.equal((await bad.json()).code, 'otp_invalid');

  const good = await call(env, '/api/auth/otp/verify', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.62',
    body: { identifier: '09123456780', code: mobileBody.dev_code }
  });
  assert.equal(good.status, 200);
  assert.match(cookieOf(good), /pn_session=/);
  assert.equal((await good.json()).user.email, 'oviya@example.com');

  const again = await call(env, '/api/auth/otp/verify', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.62',
    body: { identifier: '9123456780', code: mobileBody.dev_code }
  });
  assert.equal(again.status, 401);

  const email = await call(env, '/api/auth/otp/request', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.63',
    body: { identifier: 'Oviya@Example.com' }
  });
  const emailBody = await email.json();
  assert.match(emailBody.dev_code, /^\d{6}$/);
  const emailLogin = await call(env, '/api/auth/otp/verify', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.63',
    body: { identifier: 'oviya@example.com', code: emailBody.dev_code }
  });
  assert.equal(emailLogin.status, 200);
  assert.equal((await emailLogin.json()).user.username, 'oviya');
});

test('OTP resend replaces the previous code', async () => {
  const env = makeEnv();
  const person = account({ username: 'resend.user', mobile: '9234567890', email: 'resend@example.com' });
  await createAccount(env, person, '203.0.113.70');
  const first = await call(env, '/api/auth/otp/request', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.70',
    body: { identifier: '9234567890' }
  });
  const firstBody = await first.json();
  const second = await call(env, '/api/auth/otp/request', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.70',
    body: { identifier: '+91 92345 67890' }
  });
  const secondBody = await second.json();
  assert.notEqual(firstBody.dev_code, secondBody.dev_code);
  const old = await call(env, '/api/auth/otp/verify', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.70',
    body: { identifier: '9234567890', code: firstBody.dev_code }
  });
  assert.equal(old.status, 401);
  const neu = await call(env, '/api/auth/otp/verify', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.70',
    body: { identifier: '9234567890', code: secondBody.dev_code }
  });
  assert.equal(neu.status, 200);
});

test('an expired OTP and a code with five wrong tries cannot be used', async () => {
  const env = makeEnv();
  const person = account({ username: 'expiry.user', mobile: '9345678901', email: 'expiry@example.com' });
  await createAccount(env, person, '203.0.113.80');
  const issued = await call(env, '/api/auth/otp/request', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.80',
    body: { identifier: 'expiry@example.com' }
  });
  const { dev_code: code } = await issued.json();
  await env.DB.prepare('UPDATE auth_otps SET expires_at = ?').bind(new Date(Date.now() - 1000).toISOString()).run();
  const expired = await call(env, '/api/auth/otp/verify', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.80',
    body: { identifier: 'expiry@example.com', code }
  });
  assert.equal(expired.status, 401);
  assert.equal((await expired.json()).code, 'otp_invalid');

  const fresh = await call(env, '/api/auth/otp/request', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.81',
    body: { identifier: '9345678901' }
  });
  const right = (await fresh.json()).dev_code;
  for (let i = 0; i < 4; i++) {
    const res = await call(env, '/api/auth/otp/verify', {
      method: 'POST', origin: 'http://localhost', ip: '203.0.113.81',
      body: { identifier: '9345678901', code: '11111' + i }
    });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).code, 'otp_invalid');
  }
  const fifth = await call(env, '/api/auth/otp/verify', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.81',
    body: { identifier: '9345678901', code: '222222' }
  });
  assert.equal(fifth.status, 401);
  assert.equal((await fifth.json()).code, 'otp_locked');
  const after = await call(env, '/api/auth/otp/verify', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.81',
    body: { identifier: '9345678901', code: right }
  });
  assert.equal(after.status, 401);
  assert.equal((await after.json()).code, 'otp_locked');
});

test('OTP requests are rate limited and dev mode never reveals a code on the live domain', async () => {
  const env = makeEnv();
  const person = account({ username: 'limit.user', mobile: '9456789012', email: 'limit@example.com' });
  await createAccount(env, person, '203.0.113.90');
  for (let i = 0; i < 5; i++) {
    const res = await call(env, '/api/auth/otp/request', {
      method: 'POST', origin: 'http://localhost', ip: '203.0.113.91',
      body: { identifier: '9456789012' }
    });
    assert.equal(res.status, 200);
  }
  const locked = await call(env, '/api/auth/otp/request', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.91',
    body: { identifier: '+91 94567 89012' }
  });
  assert.equal(locked.status, 429);
  assert.equal((await locked.json()).code, 'rate_limited');

  const live = await authApi(new Request('https://www.peppynose.com/api/auth/otp/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://www.peppynose.com' },
    body: JSON.stringify({ identifier: '9456789012' })
  }), env);
  assert.equal(live.status, 503);
  const liveBody = await live.json();
  assert.equal(liveBody.code, 'otp_not_configured');
  assert.equal(liveBody.dev_code, undefined);

  const apiHost = await authApi(new Request('https://api.peppynose.com/api/auth/otp/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://www.peppynose.com' },
    body: JSON.stringify({ identifier: 'limit@example.com' })
  }), makeEnv({ AUTH_ORIGINS: 'https://www.peppynose.com' }));
  assert.equal(apiHost.status, 503);
  assert.equal((await apiHost.json()).dev_code, undefined);

  let fetched = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = async () => { fetched += 1; return new Response('no', { status: 500 }); };
  try {
    const blocked = await call(makeEnv({ OTP_SMS_PROVIDER: 'msg91' }), '/api/auth/otp/request', {
      method: 'POST', origin: 'http://localhost', ip: '203.0.113.92',
      body: { identifier: '9456789012' }
    });
    assert.equal(blocked.status, 503);
    assert.equal((await blocked.json()).code, 'otp_not_configured');
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = orig;
  }
});

test('OTP is off unless dev is set and the request is local', async () => {
  const person = account({ username: 'off.user', mobile: '9567890123', email: 'off@example.com' });
  const off = makeEnv({ OTP_SMS_PROVIDER: 'off', OTP_EMAIL_PROVIDER: 'off' });
  await createAccount(off, person, '203.0.113.93');
  const refused = await call(off, '/api/auth/otp/request', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.93',
    body: { identifier: '9567890123' }
  });
  assert.equal(refused.status, 503);
  const refusedBody = await refused.json();
  assert.equal(refusedBody.code, 'otp_not_configured');
  assert.equal(refusedBody.error, 'Code login is not available yet.');
  assert.equal(refusedBody.dev_code, undefined);

  const unset = makeEnv();
  delete unset.OTP_SMS_PROVIDER;
  delete unset.OTP_EMAIL_PROVIDER;
  const configOff = await call(unset, '/api/auth/config');
  assert.equal(configOff.status, 200);
  assert.deepEqual(await configOff.json(), { otp: false, google_client_id: '' });
  const unsetSend = await call(unset, '/api/auth/otp/request', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.94',
    body: { identifier: '9567890123' }
  });
  assert.equal(unsetSend.status, 503);
  assert.equal((await unsetSend.json()).error, 'Code login is not available yet.');

  const dev = makeEnv({ OTP_SMS_PROVIDER: 'dev', OTP_EMAIL_PROVIDER: 'dev' });
  const localConfig = await call(dev, '/api/auth/config');
  assert.deepEqual(await localConfig.json(), { otp: true, google_client_id: '' });
  const loopback = await authApi(new Request('http://127.0.0.1/api/auth/config'), dev);
  assert.deepEqual(await loopback.json(), { otp: true, google_client_id: '' });
  const liveConfig = await authApi(new Request('https://api.peppynose.com/api/auth/config', {
    headers: { origin: 'https://www.peppynose.com' }
  }), dev);
  assert.equal(liveConfig.status, 200);
  assert.deepEqual(await liveConfig.json(), { otp: false, google_client_id: '' });
  const liveSend = await authApi(new Request('https://www.peppynose.com/api/auth/otp/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://www.peppynose.com' },
    body: JSON.stringify({ identifier: '9567890123' })
  }), dev);
  assert.equal(liveSend.status, 503);
  assert.equal((await liveSend.json()).dev_code, undefined);
});

test('stay logged in sets Max-Age, and an unchecked box is a session cookie', async () => {
  const env = makeEnv();
  const who = account({ username: 'stay.user', email: 'stay@example.com' });
  const persistent = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.100',
    body: { username: who.username, password: who.password, confirm: who.confirm, stay: true }
  });
  assert.match(cookieOf(persistent), new RegExp('Max-Age=' + REMEMBER_SECONDS));
  const sessionOnly = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.101',
    body: { identifier: who.username, password: who.password, stay: false }
  });
  assert.equal(sessionOnly.status, 200);
  assert.doesNotMatch(cookieOf(sessionOnly), /Max-Age=/);
  const omitted = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.102',
    body: { identifier: who.username, password: who.password }
  });
  assert.doesNotMatch(cookieOf(omitted), /Max-Age=/);
});

test('profile requires name and email, and mobile is optional', async () => {
  const env = makeEnv();
  const made = await createAccount(env, account({ username: 'profile.user', email: 'profile@example.com', mobile: '9678901234' }), '203.0.113.110');
  const noCsrf = await call(env, '/api/auth/profile', {
    method: 'PUT', origin: 'http://localhost', cookie: made.cookie,
    body: { name: 'New Name', email: 'profile@example.com', mobile: '' }
  });
  assert.equal(noCsrf.status, 403);
  const empty = await call(env, '/api/auth/profile', {
    method: 'PUT', origin: 'http://localhost', cookie: made.cookie,
    headers: { 'x-csrf-token': made.csrf },
    body: { name: 'A', email: 'bad', mobile: '12345' }
  });
  assert.equal(empty.status, 400);
  const fields = (await empty.json()).fields;
  assert.equal(fields.name, 'name');
  assert.equal(fields.email, 'email');
  assert.equal(fields.mobile, 'mobile');
  const optional = await call(env, '/api/auth/profile', {
    method: 'PUT', origin: 'http://localhost', cookie: made.cookie,
    headers: { 'x-csrf-token': made.csrf },
    body: { name: 'Profile Amma', email: 'profile@example.com', mobile: '' }
  });
  assert.equal(optional.status, 200);
  const saved = await optional.json();
  assert.equal(saved.user.mobile, '');
  assert.equal(saved.user.profile_complete, true);
  const row = await env.DB.prepare('SELECT mobile, profile_complete FROM users WHERE username = ?').bind('profile.user').first();
  assert.equal(row.mobile, null);
  assert.equal(row.profile_complete, 1);
});

test('Google sign-in verifies the token, links a verified email, and honours stay logged in', async () => {
  const { privateKey, jwk } = await makeRsaKey();
  const clientId = 'test-client-id.apps.googleusercontent.com';
  const env = makeEnv({ GOOGLE_CLIENT_ID: clientId, GOOGLE_JWKS_FETCH: jwksFetch(jwk) });
  resetGoogleKeyCache();
  const hidden = await call(makeEnv(), '/api/auth/config');
  assert.equal((await hidden.json()).google_client_id, '');
  const shown = await call(env, '/api/auth/config');
  assert.equal((await shown.json()).google_client_id, clientId);

  const off = await call(makeEnv(), '/api/auth/google', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.120',
    body: { credential: 'nope', stay: true }
  });
  assert.equal(off.status, 503);
  assert.equal((await off.json()).code, 'google_not_configured');

  const bad = await call(env, '/api/auth/google', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.121',
    body: { credential: await signIdToken(privateKey, baseClaims({ aud: 'other.apps.googleusercontent.com' })), stay: true }
  });
  assert.equal(bad.status, 401);
  assert.equal((await bad.json()).code, 'google_invalid');
  assert.equal(await env.DB.prepare('SELECT id FROM users').first(), null);

  const created = await call(env, '/api/auth/google', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.122',
    body: { credential: await signIdToken(privateKey, baseClaims()), stay: false }
  });
  assert.equal(created.status, 200);
  const createdBody = await created.json();
  assert.equal(createdBody.user.email, 'ada.google@gmail.com');
  assert.equal(createdBody.user.name, 'Ada Lovelace');
  assert.equal(createdBody.user.profile_complete, false);
  assert.doesNotMatch(cookieOf(created), /Max-Age=/);
  const row = await env.DB.prepare('SELECT google_sub, password_hash, profile_complete FROM users').first();
  assert.equal(row.google_sub, '100000000000000000001');
  assert.equal(row.password_hash, null);
  assert.equal(row.profile_complete, 0);
  const passwordTry = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.123',
    body: { identifier: 'ada.google@gmail.com', password: 'horse-battery-99' }
  });
  assert.equal(passwordTry.status, 401);

  const again = await call(env, '/api/auth/google', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.124',
    body: { credential: await signIdToken(privateKey, baseClaims({ name: 'Ada L' })), stay: true }
  });
  assert.equal(again.status, 200);
  assert.match(cookieOf(again), new RegExp('Max-Age=' + REMEMBER_SECONDS));
  assert.equal(await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first().then(r => r.n), 1);

  const existing = makeEnv({ GOOGLE_CLIENT_ID: clientId, GOOGLE_JWKS_FETCH: jwksFetch(jwk) });
  await createAccount(existing, account({ username: 'linked.user', email: 'linked@example.com', name: 'Linked Amma', mobile: '9789012345' }), '203.0.113.125');
  resetGoogleKeyCache();
  const linked = await call(existing, '/api/auth/google', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.126',
    body: { credential: await signIdToken(privateKey, baseClaims({ sub: '100000000000000000099', email: 'linked@example.com', name: 'From Google' })), stay: true }
  });
  assert.equal(linked.status, 200);
  const linkedBody = await linked.json();
  assert.equal(linkedBody.user.username, 'linked.user');
  assert.equal(linkedBody.user.profile_complete, true);
  assert.equal(linkedBody.user.name, 'Linked Amma');
  const linkedRow = await existing.DB.prepare('SELECT google_sub FROM users WHERE email = ?').bind('linked@example.com').first();
  assert.equal(linkedRow.google_sub, '100000000000000000099');

  const clash = await call(existing, '/api/auth/google', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.127',
    body: { credential: await signIdToken(privateKey, baseClaims({ sub: '100000000000000000077', email: 'linked@example.com' })), stay: true }
  });
  assert.equal(clash.status, 401);
  assert.equal((await clash.json()).code, 'google_invalid');
});
