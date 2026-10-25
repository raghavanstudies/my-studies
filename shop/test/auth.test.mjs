// Unit tests for the customer account API. They use an in-memory SQLite database
// with the same schema the Worker runs on D1. AUTH_TEST_FAST shortens PBKDF2 so
// the suite stays quick; production refuses iteration counts below 600,000.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { authApi, configuredIters, hashPassword, verifyPassword, MIN_PBKDF2_ITERS } from '../src/auth.js';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8');
const MIGRATION_1 = readFileSync(join(here, '..', 'db', 'auth-migration.sql'), 'utf8');
const MIGRATION_2 = readFileSync(join(here, '..', 'db', 'auth-migration-002.sql'), 'utf8');
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

test('production PBKDF2 floor is 600,000 and a low override is refused', () => {
  assert.equal(MIN_PBKDF2_ITERS, 600_000);
  assert.equal(configuredIters({}), 600_000);
  assert.equal(configuredIters({ AUTH_PBKDF2_ITERS: '600000' }), 600_000);
  assert.equal(configuredIters({ AUTH_PBKDF2_ITERS: '1000' }), null);
  assert.equal(configuredIters({ AUTH_TEST_FAST: '1' }), 1_000);
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

test('sign up stores a hash, sets an HttpOnly cookie, and rejects duplicate email, username and mobile', async () => {
  const env = makeEnv();
  const first = account({ username: 'Ada.Amma', email: 'Ada@Example.com', mobile: '+91 98765 43210' });
  const res = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.10',
    body: first
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.user, { name: 'Ada Amma', email: 'ada@example.com', username: 'Ada.Amma', mobile: '9876543210' });
  assert.match(data.csrf, /^[0-9a-f]{32}$/);
  assert.equal(JSON.stringify(data).includes('horse-battery-99'), false);
  const cookie = cookieOf(res);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /Path=\//);
  const token = tokenOf(res);
  const row = await env.DB.prepare('SELECT email, username, mobile, password_hash FROM users').first();
  assert.equal(row.email, 'ada@example.com');
  assert.equal(row.username, 'Ada.Amma');
  assert.equal(row.mobile, '9876543210');
  assert.equal(row.password_hash.includes('horse-battery-99'), false);
  assert.equal(row.password_hash.startsWith('pbkdf2-sha256$'), true);
  const session = await env.DB.prepare('SELECT id FROM sessions').first();
  assert.notEqual(session.id, token);

  const dupEmail = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.10',
    body: account({ email: 'ada@example.com' })
  });
  assert.equal(dupEmail.status, 409);
  assert.equal((await dupEmail.json()).code, 'email_taken');

  const dupUser = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.10',
    body: account({ username: 'ada.amma' })
  });
  assert.equal(dupUser.status, 409);
  assert.equal((await dupUser.json()).code, 'username_taken');

  const dupMobile = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.10',
    body: account({ mobile: '09876543210' })
  });
  assert.equal(dupMobile.status, 409);
  assert.equal((await dupMobile.json()).code, 'mobile_taken');
});

test('login accepts username, mobile formats and email, and hides which one was wrong', async () => {
  const env = makeEnv();
  await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.15',
    body: account({ name: 'Meera', username: 'Meera.R', mobile: '9876543210', email: 'meera@example.com' })
  });
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
  const signup = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.20',
    body: account({ name: 'Meera', username: 'meera', email: 'meera2@example.com' })
  });
  const { csrf } = await signup.json();
  const cookie = `pn_session=${tokenOf(signup)}`;

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
  await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.30',
    body: ravi
  });
  const wrong = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.30',
    body: { identifier: 'ravi@example.com', password: 'not-the-password' }
  });
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).code, 'bad_login');
  assert.equal(wrong.headers.get('set-cookie'), null);

  const weak = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.32',
    body: { name: 'A', email: 'not-an-email', password: 'short', confirm: 'other' }
  });
  assert.equal(weak.status, 400);
  const fields = (await weak.json()).fields;
  assert.equal(fields.name, 'name');
  assert.equal(fields.email, 'email');
  assert.equal(fields.username, 'username');
  assert.equal(fields.mobile, 'mobile');
  assert.equal(fields.password, 'short');
  assert.equal(fields.confirm, 'mismatch');

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
  await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.40',
    body: lata
  });
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
  const env = makeEnv({ COOKIE_DOMAIN: '.peppynose.com', AUTH_ORIGINS: 'https://www.peppynose.com' });
  const res = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'https://www.peppynose.com', ip: '203.0.113.50',
    body: account({ name: 'Diya', username: 'diya', email: 'diya@example.com' })
  });
  assert.equal(res.status, 200);
  assert.match(cookieOf(res), /Domain=\.peppynose\.com/);
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
  await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.60',
    body: person
  });
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
  await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.70', body: person
  });
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
  await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.80', body: person
  });
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
  await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.90', body: person
  });
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
