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

const SCHEMA = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'schema.sql'), 'utf8');
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

test('sign up stores a hash, sets an HttpOnly cookie, and rejects a duplicate email', async () => {
  const env = makeEnv();
  const res = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.10',
    body: { name: 'Ada Amma', email: 'Ada@Example.com', password: 'horse-battery-99' }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.user, { name: 'Ada Amma', email: 'ada@example.com' });
  assert.match(data.csrf, /^[0-9a-f]{32}$/);
  assert.equal(JSON.stringify(data).includes('horse-battery-99'), false);
  const cookie = cookieOf(res);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /Path=\//);
  const token = tokenOf(res);
  const row = await env.DB.prepare('SELECT email, password_hash FROM users').first();
  assert.equal(row.email, 'ada@example.com');
  assert.equal(row.password_hash.includes('horse-battery-99'), false);
  assert.equal(row.password_hash.startsWith('pbkdf2-sha256$'), true);
  const session = await env.DB.prepare('SELECT id FROM sessions').first();
  assert.notEqual(session.id, token);

  const again = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.10',
    body: { name: 'Ada Amma', email: 'ada@example.com', password: 'horse-battery-99' }
  });
  assert.equal(again.status, 409);
  assert.equal((await again.json()).code, 'email_taken');
});

test('login, me, logout and delete follow the cookie and the CSRF token', async () => {
  const env = makeEnv();
  const signup = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.20',
    body: { name: 'Meera', email: 'meera@example.com', password: 'horse-battery-99' }
  });
  const { csrf } = await signup.json();
  const cookie = `pn_session=${tokenOf(signup)}`;

  const anon = await call(env, '/api/auth/me');
  assert.deepEqual(await anon.json(), { user: null });

  const who = await call(env, '/api/auth/me', { cookie });
  assert.equal((await who.json()).user.email, 'meera@example.com');

  await env.DB.prepare('DELETE FROM sessions').run();
  const loggedOut = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.20',
    body: { email: 'MEERA@example.com', password: 'horse-battery-99' }
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
    body: { email: 'meera@example.com', password: 'horse-battery-99' }
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
  await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.30',
    body: { name: 'Ravi', email: 'ravi@example.com', password: 'horse-battery-99' }
  });
  const wrong = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.30',
    body: { email: 'ravi@example.com', password: 'not-the-password' }
  });
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).code, 'bad_login');
  assert.equal(wrong.headers.get('set-cookie'), null);

  const unknown = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.31',
    body: { email: 'nobody@example.com', password: 'not-the-password' }
  });
  assert.equal(unknown.status, 401);
  assert.equal((await unknown.json()).error, 'Wrong email or password.');

  const weak = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.32',
    body: { name: 'A', email: 'not-an-email', password: 'short' }
  });
  assert.equal(weak.status, 400);
  const fields = (await weak.json()).fields;
  assert.equal(fields.name, 'name');
  assert.equal(fields.email, 'email');
  assert.equal(fields.password, 'short');

  const foreign = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'https://evil.example', ip: '203.0.113.33',
    body: { email: 'ravi@example.com', password: 'horse-battery-99' }
  });
  assert.equal(foreign.status, 403);
  assert.equal((await foreign.json()).code, 'forbidden_origin');

  const form = await authApi(new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' },
    body: 'email=ravi@example.com&password=horse-battery-99'
  }), env);
  assert.equal(form.status, 415);
});

test('login attempts are rate limited per IP', async () => {
  const env = makeEnv();
  await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.40',
    body: { name: 'Lata', email: 'lata@example.com', password: 'horse-battery-99' }
  });
  for (let i = 0; i < 8; i++) {
    const res = await call(env, '/api/auth/login', {
      method: 'POST', origin: 'http://localhost', ip: '203.0.113.40',
      body: { email: 'lata@example.com', password: 'wrong-password-' + i }
    });
    assert.equal(res.status, 401);
  }
  const locked = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.40',
    body: { email: 'lata@example.com', password: 'horse-battery-99' }
  });
  assert.equal(locked.status, 429);
  assert.equal((await locked.json()).code, 'rate_limited');
  const otherIp = await call(env, '/api/auth/login', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.41',
    body: { email: 'lata@example.com', password: 'horse-battery-99' }
  });
  assert.equal(otherIp.status, 200);
});

test('cookie Domain is set only from a safe COOKIE_DOMAIN value', async () => {
  const env = makeEnv({ COOKIE_DOMAIN: '.peppynose.com', AUTH_ORIGINS: 'https://www.peppynose.com' });
  const res = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'https://www.peppynose.com', ip: '203.0.113.50',
    body: { name: 'Diya', email: 'diya@example.com', password: 'horse-battery-99' }
  });
  assert.equal(res.status, 200);
  assert.match(cookieOf(res), /Domain=\.peppynose\.com/);
  const bad = makeEnv({ COOKIE_DOMAIN: 'peppynose.com' });
  const refused = await call(bad, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost', ip: '203.0.113.51',
    body: { name: 'Diya', email: 'diya2@example.com', password: 'horse-battery-99' }
  });
  assert.equal(refused.status, 503);
  assert.equal(await bad.DB.prepare('SELECT id FROM users').first(), null);
});

test('accounts stay unavailable when the session secret is missing', async () => {
  const env = makeEnv({ SESSION_SECRET: '' });
  const res = await call(env, '/api/auth/signup', {
    method: 'POST', origin: 'http://localhost',
    body: { name: 'Diya', email: 'diya3@example.com', password: 'horse-battery-99' }
  });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'not_configured');
});
