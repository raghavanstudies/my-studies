// TC-V3: checks for the V3 build: wordmark logo, first-visit loader, "Scan to buy" QR codes and buy pages,
// pregnancy week tracker, tracker links, home store line and teaser. All 3 languages.
const path = require('path');
const { test, expect } = require('@playwright/test');
const { PAGES, SITE, BUY_SLUGS, open, blockExternal } = require('./helpers');

const PRODUCTS = require(path.join(__dirname, '../../../tools/peppynose/v3/products_v3.json')).filter(p => p.qr);
const LANGS = { en: '', ta: 'ta/', hi: 'hi/' };
const TRACKER = { en: 'Pregnancy tracker', ta: 'கர்ப்ப கால டிராக்கர்', hi: 'प्रेगनेंसी ट्रैकर' };
const NEW_PAGES = Object.values(LANGS).flatMap(d => ['pregnancy-tracker.html', ...BUY_SLUGS.map(s => `buy/${s}.html`)].map(p => d + p)); // 42
const OLD_PAGES = Object.values(LANGS).flatMap(d => [...PAGES, '404.html'].map(p => d + p));                                        // 30
const desktopOnly = info => test.skip(info.project.name !== 'desktop', 'runs its own screen sizes once');

// Skip the first-visit loader so it does not sit over the page while a test clicks.
async function noLoader(page) {
  await page.addInitScript(() => { try { sessionStorage.setItem('pn_loader_seen', '1'); } catch (e) {} });
}

test.describe('new pages in all 3 languages', () => {
  for (const p of NEW_PAGES) {
    test(`TC-V3-01 ${p}: loads, images, links, no overflow at 360/390/768/1440`, async ({ page, request }, info) => {
      desktopOnly(info);
      const { res, errors } = await open(page, p);
      expect(res.status()).toBe(200);
      expect(errors).toEqual([]);
      const refs = await page.$$eval('[href], [src]', els => els.map(e => e.getAttribute('href') || e.getAttribute('src')));
      const base = new URL('/' + p, 'http://x');
      const local = [...new Set(refs.filter(r => r && !/^(https?:|mailto:|#|\?)/.test(r)).map(r => new URL(r, base).pathname))];
      for (const ref of local) expect((await request.get(ref)).status(), `${p} → ${ref}`).toBe(200);
      for (const w of [360, 390, 768, 1440]) {
        await page.setViewportSize({ width: w, height: 900 });
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, `${p} at ${w}px`).toBeLessThanOrEqual(0);
      }
      await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 15000 });
      expect(await page.$$eval('img[src]', imgs => imgs.filter(i => i.naturalWidth === 0).map(i => i.getAttribute('src'))), p).toEqual([]);
      // canonical + hreflang for every language
      const sub = p.replace(/^(ta|hi)\//, '');
      expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(SITE + p);
      for (const [h, d] of [['en', ''], ['ta', 'ta/'], ['hi', 'hi/'], ['x-default', '']]) {
        expect(await page.locator(`link[rel="alternate"][hreflang="${h}"]`).getAttribute('href'), `${p} ${h}`).toBe(SITE + d + sub);
      }
      // same rules as V2: no ₹, phone number only inside the wa.me link
      const body = await page.locator('body').innerText();
      expect(body).not.toContain('₹');
      expect(body).not.toMatch(/7448704660/);
      await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    });
  }
});

test('TC-V3-02 buy pages have the right Amazon and Flipkart links in all 3 languages', async ({ page }, info) => {
  desktopOnly(info);
  for (const prod of PRODUCTS) {
    const want = prod.packs.flatMap(k => [k.amazon, k.flipkart]).filter(Boolean);
    for (const d of Object.values(LANGS)) {
      await open(page, `${d}buy/${prod.slug}.html`);
      const links = page.locator('.buy-box a.btn');
      expect(await links.evaluateAll(as => as.map(a => a.getAttribute('href'))), `${d}${prod.slug}`).toEqual(want);
      for (const a of await links.all()) {
        await expect(a).toHaveAttribute('target', '_blank');
        await expect(a).toHaveAttribute('rel', 'noopener');
      }
      await expect(page.locator('h1')).toHaveText(prod.name[d ? d.slice(0, 2) : 'en']);
      await expect(page.locator('.wa-float')).toHaveCount(1);
    }
  }
});

test('TC-V3-03 "Scan to buy" QR codes: 13 on the shop, 4 on home, none for unavailable products', async ({ page }) => {
  await noLoader(page);
  for (const [lang, d] of Object.entries(LANGS)) {
    for (const [file, n] of [['products.html', 13], ['index.html', 4]]) {
      await open(page, d + file);
      const qr = page.locator('a.pn-qr');
      await expect(qr).toHaveCount(n);
      for (const a of await qr.all()) {
        const href = await a.getAttribute('href');
        const slug = href.match(/^buy\/([a-z0-9-]+)\.html$/)[1];
        expect(BUY_SLUGS).toContain(slug);
        await expect(a.locator('img')).toHaveAttribute('src', new RegExp(`images/qr/${lang}/${slug}\\.svg$`));
      }
      // coming-soon and out-of-stock cards never get a QR code
      await expect(page.locator('article.card.unavailable a.pn-qr')).toHaveCount(0);
    }
  }
  await open(page, 'products.html');
  await page.locator('a.pn-qr[href="buy/foam-mat.html"]').click();
  await expect(page).toHaveURL(/\/buy\/foam-mat\.html$/);
});

test('TC-V3-04 header shows the Peppynose wordmark logo on every page', async ({ page }, info) => {
  desktopOnly(info);
  await noLoader(page);
  for (const p of [...OLD_PAGES, ...NEW_PAGES.filter((_, i) => i % 7 === 0)]) {
    await open(page, p);
    const word = page.locator('header .brand img.brand-word');
    await expect(word, p).toBeVisible();
    await expect(word).toHaveAttribute('alt', 'Peppynose');
    expect(await word.evaluate(i => i.naturalWidth), p).toBe(640);
  }
});

test.describe('loader', () => {
  test('TC-V3-05 loader shows on the first page view only and is gone within a second', async ({ page }) => {
    await open(page, 'index.html');
    await expect(page.locator('#pn-loader')).toHaveCount(0, { timeout: 1500 });
    await page.goto('/products.html');
    // second page in the same tab: removed straight away
    expect(await page.evaluate(() => sessionStorage.getItem('pn_loader_seen'))).toBe('1');
    await expect(page.locator('#pn-loader')).toHaveCount(0);
  });

  test('TC-V3-06 no loader for visitors who prefer reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await blockExternal(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#pn-loader')).toHaveCount(0);
  });
});

test('TC-V3-07 tracker link in the menu and footer of every page; teaser and store line on home', async ({ page }) => {
  await noLoader(page);
  for (const [lang, d] of Object.entries(LANGS)) {
    for (const p of ['index.html', 'products.html', 'privacy.html']) {
      await open(page, d + p);
      await expect(page.locator('header nav > a[href$="pregnancy-tracker.html"]')).toHaveText(TRACKER[lang]);
      await expect(page.locator('footer a[href$="pregnancy-tracker.html"]')).toHaveText(TRACKER[lang]);
    }
    await open(page, d + 'index.html');
    await expect(page.locator('.tracker-teaser a.btn')).toHaveAttribute('href', 'pregnancy-tracker.html');
    await expect(page.locator('.store-line')).toHaveCount(1);
  }
  await open(page, 'index.html');
  await expect(page.locator('.store-line')).toHaveText('Shop now on Flipkart & Amazon. Our own store is coming soon.');
  await page.locator('.tracker-teaser a.btn').click();
  await expect(page.locator('h1')).toHaveText('Pregnancy week tracker');
  await expect(page.locator('header nav > a[aria-current="page"]')).toHaveText('Pregnancy tracker');
});

test.describe('pregnancy tracker', () => {
  // date N days from today, as yyyy-mm-dd in the browser's own time zone
  const day = (page, n) => page.evaluate(n => { const t = new Date(); const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }, n);

  test.beforeEach(async ({ page }) => { await noLoader(page); });

  test('TC-V3-08 due date 140 days away shows week 20, second trimester, 140 days to go', async ({ page }) => {
    const { errors } = await open(page, 'pregnancy-tracker.html');
    await expect(page.locator('.disclaimer').first()).toContainText('not medical advice');
    await expect(page.locator('#trk-result')).toBeHidden();
    await page.fill('#trk-date', await day(page, 140));
    await page.click('#trk-form button[type="submit"]');
    await expect(page.locator('#r-week')).toHaveText('Week 20');
    await expect(page.locator('#r-tri')).toHaveText('Second trimester');
    await expect(page.locator('#r-age')).toHaveText('You are 20 weeks and 0 days pregnant');
    await expect(page.locator('#r-left')).toHaveText('140 days to go');
    await page.click('.dash-tile[data-open="p-week"]');     // dashboard: the week details open as a panel
    await expect(page.locator('#r-tip')).not.toBeEmpty();
    await expect(page.locator('#n-mob')).toBeVisible();      // weeks 14–33
    await expect(page.locator('#n-bob')).toBeHidden();
    await page.click('#p-week .dash-back');
    // share opens WhatsApp with no phone number; the visitor picks the chat. The text is added on click, never kept in the href.
    await expect(page.locator('#r-share')).toHaveAttribute('href', 'https://wa.me/');
    await page.evaluate(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; });
    await page.click('#r-share');
    const [share] = await page.evaluate(() => window.__opened);
    expect(share).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(share)).toContain("I'm 20 weeks pregnant");
    expect(share).not.toContain('7448704660');
    expect(errors).toEqual([]);
  });

  test('TC-V3-09 last-period mode, saved on this device, and "Clear my data" removes it', async ({ page }) => {
    await open(page, 'pregnancy-tracker.html');
    await page.check('input[name="mode"][value="lmp"]');
    await page.fill('#trk-date', await day(page, -245));      // 35 weeks ago
    await page.click('#trk-form button[type="submit"]');
    await expect(page.locator('#r-week')).toHaveText('Week 35');
    await expect(page.locator('#r-tri')).toHaveText('Third trimester');
    await page.click('.dash-tile[data-open="p-week"]');
    await expect(page.locator('#n-bob')).toBeVisible();      // week 34+
    await expect(page.locator('#n-teeth')).toBeVisible();    // week 28+
    await page.click('#p-week .dash-back');
    // remembered after a reload
    await page.reload();
    await expect(page.locator('#r-week')).toHaveText('Week 35');
    await expect(page.locator('input[name="mode"][value="lmp"]')).toBeChecked();
    await page.click('#r-clear');
    await expect(page.locator('#trk-result')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('pn_preg'))).toBeNull();
    await page.reload();
    await expect(page.locator('#trk-result')).toBeHidden();
  });

  test('TC-V3-10 empty or impossible date shows an error, no result', async ({ page }) => {
    await open(page, 'pregnancy-tracker.html');
    await page.click('#trk-form button[type="submit"]');
    await expect(page.locator('#trk-err')).toHaveText('Please choose a date.');
    await page.check('input[name="mode"][value="lmp"]');
    await page.fill('#trk-date', await day(page, -400));
    await page.click('#trk-form button[type="submit"]');
    await expect(page.locator('#trk-err')).toContainText("doesn't look right");
    await expect(page.locator('#trk-result')).toBeHidden();
  });

  test('TC-V3-11 tracker works in Tamil and Hindi', async ({ page }) => {
    for (const d of ['ta/', 'hi/']) {
      const { errors } = await open(page, d + 'pregnancy-tracker.html');
      await page.fill('#trk-date', await day(page, 140));
      await page.click('#trk-form button[type="submit"]');
      await expect(page.locator('#r-week')).toContainText('20');
      await expect(page.locator('#r-share')).toHaveAttribute('href', 'https://wa.me/');
      expect(errors).toEqual([]);
      await page.click('#r-clear');
    }
  });
});

test('TC-V3-12 phone header: language buttons never cover the logo (home EN/TA/HI, 320–430 px)', async ({ page }, info) => {
  desktopOnly(info);
  await noLoader(page);
  for (const d of Object.values(LANGS)) {
    await open(page, d + 'index.html');
    for (const w of [320, 360, 390, 412, 430, 768, 1024]) {
      await page.setViewportSize({ width: w, height: 800 });
      const r = await page.evaluate(() => {
        const box = s => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, vis: getComputedStyle(e).display !== 'none' }; };
        return { brand: box('.bar > .brand'), lang: box('.bar > .lang-switch'), menu: box('.bar > .menu-btn'), word: box('.brand-word') };
      });
      const hit = (a, b) => a.vis && b.vis && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
      expect(hit(r.brand, r.lang), `${d}index at ${w}px: logo vs language buttons`).toBe(false);
      expect(hit(r.brand, r.menu), `${d}index at ${w}px: logo vs Menu`).toBe(false);
      expect(r.word.r - r.word.l, `${d}index at ${w}px: lettering not squashed`).toBeGreaterThan(100);
    }
  }
});

test('TC-V3-13 a visitor who chose Tamil and scans an English code lands on the Tamil buy page', async ({ page }) => {
  await noLoader(page);
  await open(page, 'index.html');
  await page.evaluate(() => localStorage.setItem('pn_lang', 'ta'));
  await page.goto('/buy/foam-mat.html');
  await expect(page).toHaveURL(/\/ta\/buy\/foam-mat\.html$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ta');
});

test('TC-V3-14 tracker edge cases: due today, 5 weeks ahead, 300 days ahead; nothing is sent', async ({ page }) => {
  await noLoader(page);
  const sent = [];
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1')) sent.push(r.url()); });
  await open(page, 'pregnancy-tracker.html');
  const day = n => page.evaluate(n => { const t = new Date(); const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }, n);
  const go = async n => {
    if (await page.locator('#trk-form').isHidden()) await page.click('#r-change');   // V4: the form hides once a result shows
    await page.fill('#trk-date', await day(n)); await page.click('#trk-form button[type="submit"]');
  };
  await go(0);
  await expect(page.locator('#r-week')).toHaveText('Week 40');
  await expect(page.locator('#r-left')).toHaveText('Due date reached');
  await go(35);
  await expect(page.locator('#r-week')).toHaveText('Week 35');
  await page.click('.dash-tile[data-open="p-week"]');
  await expect(page.locator('#n-bob')).toBeVisible();
  await expect(page.locator('#n-teeth')).toBeVisible();
  await expect(page.locator('#n-mob')).toBeHidden();
  await page.click('#p-week .dash-back');
  await go(300);
  await expect(page.locator('#trk-err')).toContainText("doesn't look right");
  await expect(page.locator('#trk-result')).toBeHidden();
  // only Google Fonts may be requested, and nothing carries the date
  for (const u of sent) expect(u, u).toMatch(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//);
});

test('TC-V3-15 Tamil home 1001–1239 px: "Scan to buy" caption sits under the QR, inside the card (TC-23 fix)', async ({ page }, info) => {
  desktopOnly(info);
  await noLoader(page);
  for (const [d, w, dir] of [['ta/', 1024, 'column'], ['ta/', 1239, 'column'], ['ta/', 1280, 'row'], ['ta/', 1000, 'row'], ['', 1024, 'row'], ['hi/', 1024, 'row']]) {
    await page.setViewportSize({ width: w, height: 900 });
    await open(page, d + 'index.html');
    const qr = await page.$$eval('.pn-qr', qs => qs.map(q => {
      const c = q.closest('article').getBoundingClientRect(), s = q.querySelector('span').getBoundingClientRect();
      return { dir: getComputedStyle(q).flexDirection, inside: s.right <= c.right && s.left >= c.left };
    }));
    expect(qr.length).toBe(4);
    for (const q of qr) { expect(q.dir, `${d}index at ${w}px`).toBe(dir); expect(q.inside, `${d}index at ${w}px`).toBe(true); }
  }
});
