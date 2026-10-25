// Decision tests for the landing-page login gate. No browser and no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const gate = require(join(dirname(fileURLToPath(import.meta.url)), '../../peppynose/login-gate.js'));

const anon = { guest: false, loggedInHint: false, userAgent: 'Mozilla/5.0 Chrome/120.0.0.0' };
const nextOf = redirect => decodeURIComponent(new URL(redirect, 'https://www.peppynose.com').searchParams.get('next'));

test('safeNext accepts a site path and rejects open redirects', () => {
  assert.equal(gate.safeNext('/index.html'), '/index.html');
  assert.equal(gate.safeNext('/hi/index.html'), '/hi/index.html');
  assert.equal(gate.safeNext('/ta/index.html?x=1'), '/ta/index.html?x=1');
  assert.equal(gate.safeNext('/%2Findex.html'), '');
  assert.equal(gate.safeNext('/%2F%2Fevil.example'), '');
  assert.equal(gate.safeNext('%2F%2Fevil.example'), '');
  assert.equal(gate.safeNext('https://evil.example'), '');
  assert.equal(gate.safeNext('//evil.example'), '');
  assert.equal(gate.safeNext('/\\evil.example'), '');
  assert.equal(gate.safeNext('/index.html?q=a:b'), '');
  assert.equal(gate.safeNext(''), '');
  assert.equal(gate.safeNext(null), '');
  assert.equal(gate.safeNext('/' + 'a'.repeat(400)), '');
});

test('a normal first visit to each landing page goes to that language login', () => {
  const cases = [
    ['/', '/login.html', '/index.html'],
    ['/index.html', '/login.html', '/index.html'],
    ['/index.html?utm=1', '/login.html', '/index.html'],
    ['/hi', '/hi/login.html', '/hi/index.html'],
    ['/hi/', '/hi/login.html', '/hi/index.html'],
    ['/hi/index.html', '/hi/login.html', '/hi/index.html'],
    ['/ta', '/ta/login.html', '/ta/index.html'],
    ['/ta/', '/ta/login.html', '/ta/index.html'],
    ['/ta/index.html', '/ta/login.html', '/ta/index.html']
  ];
  for (const [path, login, home] of cases) {
    const choice = gate.decide({ ...anon, path });
    assert.equal(new URL(choice.redirect, 'https://www.peppynose.com').pathname, login, path);
    assert.equal(nextOf(choice.redirect), home, path);
    assert.equal(gate.safeNext(nextOf(choice.redirect)), home, path);
    assert.equal(gate.isAuthPath(nextOf(choice.redirect)), false, path);
    assert.equal(gate.decide({ ...anon, path: login }).redirect, null, path);
  }
});

test('guest, logged-in hint, and crawlers stay on the landing page', () => {
  for (const path of ['/', '/index.html', '/hi/', '/ta/index.html']) {
    assert.equal(gate.decide({ ...anon, path, guest: true }).redirect, null);
    assert.equal(gate.decide({ ...anon, path, loggedInHint: true }).redirect, null);
    assert.equal(gate.decide({ ...anon, path, guest: true, loggedInHint: true }).redirect, null);
    assert.equal(gate.decide({ ...anon, path, userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }).redirect, null);
    assert.equal(gate.decide({ ...anon, path, userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)' }).redirect, null);
  }
  assert.equal(gate.isCrawler('Mozilla/5.0 Chrome/120.0.0.0'), false);
  assert.equal(gate.isCrawler(''), false);
  assert.equal(gate.isCrawler('Twitterbot/1.0'), true);
});

test('other pages are never sent to login', () => {
  for (const path of ['/products.html', '/hi/products.html', '/ta/about.html', '/shop/', '/shop/index.html', '/hi/shop/', '/login', '/login.html', '/hi/login', '/hi/login.html', '/ta/login.html', '/signup', '/signup.html', '/ta/signup.html', '/account.html', '/contact.html']) {
    assert.equal(gate.isLanding(path), false, path);
    assert.equal(gate.decide({ ...anon, path }).redirect, null, path);
  }
});

test('a saved language sends the landing page to that language login once', () => {
  const hi = gate.decide({ ...anon, path: '/', langSaved: 'hi' });
  assert.equal(new URL(hi.redirect, 'https://www.peppynose.com').pathname, '/hi/login.html');
  assert.equal(nextOf(hi.redirect), '/hi/index.html');

  const ta = gate.decide({ ...anon, path: '/index.html', langSaved: 'ta' });
  assert.equal(new URL(ta.redirect, 'https://www.peppynose.com').pathname, '/ta/login.html');
  assert.equal(nextOf(ta.redirect), '/ta/index.html');

  const en = gate.decide({ ...anon, path: '/hi/index.html', langSaved: 'en' });
  assert.equal(new URL(en.redirect, 'https://www.peppynose.com').pathname, '/login.html');
  assert.equal(nextOf(en.redirect), '/index.html');

  const same = gate.decide({ ...anon, path: '/ta/', langSaved: 'ta' });
  assert.equal(new URL(same.redirect, 'https://www.peppynose.com').pathname, '/ta/login.html');
  assert.equal(gate.decide({ ...anon, path: '/hi/index.html', langSaved: 'nope' }).redirect.includes('/hi/login.html'), true);
});

test('a missing localized login page falls back to the English login without a loop', () => {
  const choice = gate.decide({ ...anon, path: '/hi/index.html', localizedLogin: false });
  assert.equal(new URL(choice.redirect, 'https://www.peppynose.com').pathname, '/login.html');
  assert.equal(nextOf(choice.redirect), '/hi/index.html');
  assert.equal(gate.decide({ ...anon, path: choice.redirect, localizedLogin: false }).redirect, null);
  assert.equal(gate.decide({ ...anon, path: '/login.html', langSaved: 'hi', localizedLogin: false }).redirect, null);
});
