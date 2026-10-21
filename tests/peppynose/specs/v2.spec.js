// TC-V2: checks for the V2 build (BRD R0–R12): Tamil/Hindi pages, no prices, WhatsApp, Instagram,
// trust badges, language switch and remembered choice, hreflang, footer and hero changes.
const { test, expect } = require('@playwright/test');
const { PAGES, SITE, open, blockExternal } = require('./helpers');

const LANGS = { en: '', ta: 'ta/', hi: 'hi/' };
const ALL = Object.values(LANGS).flatMap(d => [...PAGES, '404.html'].map(p => d + p));   // 30 pages
const CHECK_PRICE = { en: 'Check price', ta: 'விலை அறிய', hi: 'कीमत देखें' };
const langOf = path => path.startsWith('ta/') ? 'ta' : path.startsWith('hi/') ? 'hi' : 'en';
const desktopOnly = (info) => test.skip(info.project.name !== 'desktop', 'runs its own screen sizes once');

test.describe('every page in all 3 languages', () => {
  for (const path of ALL) {
    test(`TC-V2-01 ${path}: loads, images, links, no overflow at 360/390/768/1440`, async ({ page, request }, info) => {
      desktopOnly(info);
      const { res, errors } = await open(page, path);
      expect(res.status()).toBe(200);
      expect(errors).toEqual([]);
      await expect(page.locator('html')).toHaveAttribute('lang', langOf(path));
      // every local link and asset exists
      const refs = await page.$$eval('[href], [src], source[srcset]', els => els.map(e => e.getAttribute('href') || e.getAttribute('src') || e.getAttribute('srcset')));
      const base = new URL('/' + path, 'http://x');
      const local = [...new Set(refs.filter(r => r && !/^(https?:|mailto:|#|\?)/.test(r)).map(r => new URL(r, base).pathname))];
      for (const ref of local) expect((await request.get(ref)).status(), `${path} → ${ref}`).toBe(200);
      for (const w of [360, 390, 768, 1440]) {
        await page.setViewportSize({ width: w, height: 900 });
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, `${path} at ${w}px`).toBeLessThanOrEqual(0);
      }
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 20)); } });
      await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 15000 });
      const broken = await page.$$eval('img', imgs => imgs.filter(i => i.naturalWidth === 0).map(i => i.getAttribute('src')));
      expect(broken, path).toEqual([]);
    });

    test(`TC-V2-02 ${path}: no ₹, footer logo, WhatsApp button, no visible phone number`, async ({ page }, info) => {
      desktopOnly(info);
      await open(page, path);
      const html = await page.content();
      expect(html).not.toContain('₹');
      await expect(page.locator('footer .foot img').first()).toHaveAttribute('src', /images\/logo-footer\.webp$/);
      const wa = page.locator('a.wa-float');
      await expect(wa).toHaveCount(1);
      await expect(wa).toHaveAttribute('href', 'https://wa.me/917448704660?text=Hi%20Peppynose%2C%20I%20have%20a%20question');
      await expect(wa).toHaveAttribute('target', '_blank');
      await expect(wa).toHaveAttribute('rel', 'noopener');
      await expect(page.locator('script[src$="wa.js"]')).toHaveCount(1);
      await expect(page.locator('head script[src$="lang.js"]')).toHaveCount(1);
      const text = await page.locator('body').innerText();
      expect(text).not.toMatch(/7448704660|74487\s?04660/);
      await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
      // every buy button says "Check price" in the page's language
      const buy = await page.$$eval('.buy.priced a b', bs => bs.map(b => b.textContent.trim()));
      for (const t of buy) expect(t).toBe(CHECK_PRICE[langOf(path)]);
    });
  }
});

test('TC-V2-03 SEO: 27 pages have their own canonical and en/ta/hi/x-default hreflang; 404s have none', async ({ page }, info) => {
  desktopOnly(info);
  for (const [lang, d] of Object.entries(LANGS)) {
    for (const p of PAGES) {
      await open(page, d + p);
      const sub = p === 'index.html' ? '' : p;
      expect(await page.locator('link[rel="canonical"]').getAttribute('href'), d + p).toBe(SITE + d + sub);
      for (const [h, hd] of [['en', ''], ['ta', 'ta/'], ['hi', 'hi/'], ['x-default', '']]) {
        expect(await page.locator(`link[rel="alternate"][hreflang="${h}"]`).getAttribute('href'), `${d + p} ${h}`).toBe(SITE + hd + sub);
      }
      expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toBe(SITE + 'images/og-banner.jpg?v=2');
    }
    await open(page, d + '404.html');
    await expect(page.locator('link[rel="alternate"]')).toHaveCount(0);
  }
});

test('TC-V2-04 buy links are identical in all 3 languages', async ({ page }, info) => {
  desktopOnly(info);
  for (const p of ['index.html', 'products.html']) {
    const sets = {};
    for (const [lang, d] of Object.entries(LANGS)) {
      await open(page, d + p);
      sets[lang] = (await page.$$eval('a[href*="amazon.in"], a[href*="flipkart.com"]', as => as.map(a => a.href))).sort();
    }
    expect(sets.ta, p).toEqual(sets.en);
    expect(sets.hi, p).toEqual(sets.en);
  }
});

test('TC-V2-05 hero shows the 16:9 photo on desktop and 4:5 on phones', async ({ page }) => {
  await open(page, 'index.html');
  const img = page.locator('.hero3-art picture img');
  const w = page.viewportSize().width;
  expect(await img.evaluate(i => i.currentSrc.split('/').pop())).toBe(w <= 760 ? 'hero-photo-4x5.webp' : 'hero-photo.webp');
  const ratio = await img.evaluate(i => i.getBoundingClientRect().width / i.getBoundingClientRect().height);
  expect(ratio).toBeCloseTo(w <= 760 ? 4 / 5 : 16 / 9, 1);
});

test('TC-V2-06 trust badges and Instagram section on the 3 home pages', async ({ page }) => {
  const IG = ['https://www.instagram.com/p/Dev-nlBm_uH/', 'https://www.instagram.com/p/Det8B2pG6GL/', 'https://www.instagram.com/p/DemNlUiowOE/',
    'https://www.instagram.com/p/DerX-e9G8Nd/', 'https://www.instagram.com/p/DePcXmAiaBf/', 'https://www.instagram.com/reel/DePa71kihlz/'];
  for (const d of Object.values(LANGS)) {
    await open(page, d + 'index.html');
    await expect(page.locator('.trust-badges li')).toHaveCount(3);
    // trust row sits between the hero and the marquee
    expect(await page.evaluate(() => document.querySelector('.hero2').nextElementSibling.className)).toBe('trust-badges');
    const tiles = page.locator('.ig-grid a');
    await expect(tiles).toHaveCount(6);
    expect(await tiles.evaluateAll(as => as.map(a => a.href))).toEqual(IG);
    for (const a of await tiles.all()) {
      await expect(a).toHaveAttribute('target', '_blank');
      await expect(a.locator('img')).toHaveAttribute('loading', 'lazy');
    }
    // Instagram section comes right before the "Shop Peppynose online" band
    expect(await page.evaluate(() => document.querySelector('.ig-sec').nextElementSibling.querySelector('.band2') !== null)).toBe(true);
  }
});

for (const banner of ['open', 'closed']) {
  test(`TC-V2-07 WhatsApp and help-chat buttons never cover a button or footer link while scrolling the shop (cookie banner ${banner})`, async ({ page }) => {
    if (banner === 'closed') await page.addInitScript(() => localStorage.setItem('pn_consent', 'denied'));
    await open(page, 'products.html');
    await expect(page.locator('.pn-consent')).toHaveCount(banner === 'open' ? 1 : 0);
    await page.waitForTimeout(300);
    const max = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < max; y += 250) {
      await page.evaluate(v => scrollTo(0, v), y);
      await page.waitForTimeout(250);
      const check = () => page.evaluate(() => {
        for (const [f, hide] of [['.wa-float', 'wa-hide'], ['.pn-chat', 'pn-chat-hide']]) {
          const fl = document.querySelector(f);
          if (!fl || fl.classList.contains(hide)) continue;
          const r = (f === '.pn-chat' ? fl.querySelector('.pn-chat-btn') : fl).getBoundingClientRect();
          for (const el of document.querySelectorAll('.btn, .buy a, .agebtn, .chips a, footer a, .pn-qr')) {
            const b = el.getBoundingClientRect();
            if (b.width && b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom) return f + ' over ' + el.textContent.trim().slice(0, 30);
          }
        }
        return null;
      });
      // a real overlap stays; a busy test machine can be a frame late hiding the button, so look again once
      let clash = await check();
      if (clash) { await page.waitForTimeout(500); clash = await check(); }
      expect(clash, `at scroll ${y}`).toBeNull();
    }
  });
}

test('TC-V2-08 footer links are at least 40 px tall and do not overlap on phones', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone layout');
  for (const d of Object.values(LANGS)) {
    await open(page, d + 'index.html');
    const rects = await page.$$eval('.foot ul', uls => uls.map(ul => [...ul.querySelectorAll('a')].map(a => { const r = a.getBoundingClientRect(); return [r.top, r.bottom]; })));
    for (const list of rects) {
      for (const [t, b] of list) expect(b - t).toBeGreaterThanOrEqual(40);
      for (let i = 1; i < list.length; i++) expect(list[i][0]).toBeGreaterThanOrEqual(list[i - 1][1] - 0.5);
    }
  }
});

test('TC-V2-09 language switch only on the 3 home pages', async ({ page }) => {
  for (const [lang, d] of Object.entries(LANGS)) {
    for (const p of PAGES) {
      await open(page, d + p);
      await expect(page.locator('.lang-switch'), d + p).toHaveCount(p === 'index.html' ? 2 : 0);
    }
    await open(page, d + 'index.html');
    await expect(page.locator('.bar > .lang-switch a[aria-current="true"]')).toHaveAttribute('hreflang', lang);
  }
});

test('TC-V2-10 chosen language is remembered across pages and visits; EN switches back', async ({ page }, info) => {
  desktopOnly(info);
  await blockExternal(page);
  await page.goto('/index.html');
  await page.locator('.bar > .lang-switch a[hreflang="ta"]').click();
  await expect(page).toHaveURL(/\/ta\/index\.html$/);
  expect(await page.evaluate(() => localStorage.getItem('pn_lang'))).toBe('ta');
  // internal links stay in Tamil
  await page.locator('header nav a[href="products.html"]').click();
  await expect(page).toHaveURL(/\/ta\/products\.html$/);
  // opening an English page sends you to the Tamil one, keeping query and #anchor
  await page.goto('/about.html');
  await expect(page).toHaveURL(/\/ta\/about\.html$/);
  await page.goto('/products.html?age=kids#play');
  await expect(page).toHaveURL(/\/ta\/products\.html\?age=kids#play$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/ta\/$/);
  // Back still works (location.replace keeps history clean)
  await page.goto('/ta/faq.html');
  await page.goBack();
  await expect(page).toHaveURL(/\/ta\/$/);
  // choose Hindi, then English
  await page.goto('/ta/index.html');
  await page.locator('.bar > .lang-switch a[hreflang="hi"]').click();
  await expect(page).toHaveURL(/\/hi\/index\.html$/);
  await page.goto('/faq.html');
  await expect(page).toHaveURL(/\/hi\/faq\.html$/);
  await page.goto('/hi/index.html');
  await page.locator('.bar > .lang-switch a[hreflang="en"]').click();
  await expect(page).toHaveURL(/\/index\.html$/);
  expect(await page.evaluate(() => localStorage.getItem('pn_lang'))).toBe('en');
  await page.goto('/about.html');
  await expect(page).toHaveURL(/\/about\.html$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('TC-V2-11 English is the default: no saved choice means no redirect', async ({ page }) => {
  await blockExternal(page);
  for (const p of ['/', '/about.html', '/products.html']) {
    await page.goto(p);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  }
});

test.describe('Tamil browser', () => {
  test.use({ locale: 'ta-IN' });
  test('TC-V2-12 Tamil browser sees English plus a one-time suggestion, never an auto-redirect', async ({ page }, info) => {
    desktopOnly(info);
    await blockExternal(page);
    await page.goto('/index.html');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const hint = page.locator('.lang-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('தமிழில் பார்க்க');
    await page.reload();
    await expect(page.locator('.lang-hint')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    // the suggestion never shows on other pages
    await page.evaluate(() => localStorage.clear());
    await page.goto('/products.html');
    await expect(page.locator('.lang-hint')).toHaveCount(0);
  });
});

test('TC-V2-13 phone menu shows the language switch and still closes with Escape / outside tap', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone menu');
  for (const d of ['', 'ta/']) {
    await open(page, d + 'index.html');
    const btn = page.locator('.menu-btn'), nav = page.locator('#nav');
    await btn.click();
    await expect(nav.locator('.lang-switch.in-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await btn.click();
    const vp = page.viewportSize();
    await page.mouse.click(vp.width / 2, vp.height - 120);
    await expect(nav).toBeHidden();
  }
  // choosing a language from the phone menu works
  await open(page, 'index.html');
  await page.locator('.menu-btn').click();
  await page.locator('.lang-switch.in-menu a[hreflang="hi"]').click();
  await expect(page).toHaveURL(/\/hi\/index\.html$/);
});

test('TC-V2-14 privacy page mentions WhatsApp chat and no phone number (EN/TA/HI)', async ({ page }) => {
  await open(page, 'privacy.html');
  await expect(page.locator('main')).toContainText('We do not list a phone number; you can reach us by email or WhatsApp chat.');
  await expect(page.locator('main p', { hasText: 'Messages you send us on WhatsApp.' })).toContainText('WhatsApp handles the chat under its own privacy policy.');
  await open(page, 'ta/privacy.html');
  await expect(page.locator('main')).toContainText('WhatsApp-இல் நீங்கள் அனுப்பும் செய்திகள்.');
  await open(page, 'hi/privacy.html');
  await expect(page.locator('main')).toContainText('WhatsApp पर आपके भेजे संदेश।');
});
