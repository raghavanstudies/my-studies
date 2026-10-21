// TC-V4: checks for the V4 build: tracker first screen + tabs + share card, analytics only after consent,
// help chat, two-parrot loader, scroll animations, privacy page and footer "Cookie settings" link.
const { test, expect } = require('@playwright/test');
const { PAGES, BUY_SLUGS, open, blockExternal } = require('./helpers');

const LANGS = { en: '', ta: 'ta/', hi: 'hi/' };
const ALL = Object.values(LANGS).flatMap(d => [...PAGES, '404.html', 'pregnancy-tracker.html', ...BUY_SLUGS.map(s => `buy/${s}.html`)].map(p => d + p)); // 72
const TRACKERS = /googletagmanager\.com|google-analytics\.com|clarity\.ms/;
const desktopOnly = info => test.skip(info.project.name !== 'desktop', 'runs its own checks once');
const noLoader = page => page.addInitScript(() => { try { sessionStorage.setItem('pn_loader_seen', '1'); } catch (e) {} });
const consent = (page, v) => page.addInitScript(v => { try { localStorage.setItem('pn_consent', v); } catch (e) {} }, v);
// Record every request to Google/Microsoft (they are aborted by blockExternal, but the attempt is still seen).
const watch = page => { const hits = []; page.on('request', r => { if (TRACKERS.test(r.url())) hits.push(r.url()); }); return hits; };
// Pretend Boss has pasted real IDs into /analytics-config.js (registered after blockExternal so it wins).
const openWithIds = async (page, path) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await blockExternal(page);
  await page.route('**/analytics-config.js', r => r.fulfill({ contentType: 'text/javascript', body: "window.PN_ANALYTICS = { ga4: 'G-TEST12345', clarity: 'abc123test' };" }));
  await page.goto('/' + path);
  return { errors };
};
const day = (page, n) => page.evaluate(n => { const t = new Date(); const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }, n);

test('TC-V4-01 every page loads the V4 scripts and has a "Cookie settings" link; motion.js only off the buy pages', async ({ request }, info) => {
  desktopOnly(info);
  for (const p of ALL) {
    const html = await (await request.get('/' + p)).text();
    for (const s of ['/analytics-config.js', '/analytics.js', '/chatbot.js']) expect(html, `${p} ${s}`).toContain(`<script src="${s}" defer></script>`);
    expect(html.includes('<script src="/motion.js" defer></script>'), `${p} motion.js`).toBe(!p.includes('buy/'));
    expect(html, p).toContain('data-pn-cookie-settings');
    expect(html, p).not.toContain('googletagmanager.com/gtag');   // never hard-coded in a page
  }
});

test.describe('analytics consent', () => {
  test.beforeEach(async ({ page }) => { await noLoader(page); });

  test('TC-V4-02 banner shows in the page language; nothing goes to Google/Microsoft before Accept', async ({ page }) => {
    const hits = watch(page);
    for (const [lang, d, yes] of [['en', '', 'Accept'], ['ta', 'ta/', 'ஏற்கிறேன்'], ['hi', 'hi/', 'स्वीकार करें']]) {
      for (const p of ['index.html', 'products.html', 'pregnancy-tracker.html', 'buy/foam-mat.html']) {
        await open(page, d + p);
        const bar = page.locator('.pn-consent');
        await expect(bar, d + p).toBeVisible();
        await expect(bar).toHaveAttribute('lang', lang);
        await expect(bar.locator('.pn-c-yes')).toHaveText(yes);
        await expect(bar.locator('a')).toHaveAttribute('href', `/${d}privacy.html`);
      }
    }
    expect(hits).toEqual([]);
  });

  test('TC-V4-03 placeholder IDs + Accept: still nothing loads', async ({ page }) => {
    const hits = watch(page);
    await open(page, 'index.html');
    await page.click('.pn-consent .pn-c-yes');
    await expect(page.locator('.pn-consent')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('pn_consent'))).toBe('granted');
    await page.goto('/products.html');
    await page.waitForTimeout(300);
    expect(hits).toEqual([]);
  });

  test('TC-V4-04 real IDs: 0 requests before Accept, GA4 + Clarity after; consent mode denies ads', async ({ page }) => {
    const hits = watch(page);
    await openWithIds(page, 'index.html');
    await page.waitForTimeout(300);
    expect(hits).toEqual([]);
    const consentDefault = await page.evaluate(() => [...dataLayer].map(a => [...a]).find(a => a[0] === 'consent' && a[1] === 'default'));
    expect(consentDefault[2]).toEqual({ ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });
    await page.click('.pn-consent .pn-c-yes');
    await expect.poll(() => hits.length).toBe(2);
    expect(hits.some(u => u.startsWith('https://www.googletagmanager.com/gtag/js?id=G-TEST12345'))).toBe(true);
    expect(hits.some(u => u.startsWith('https://www.clarity.ms/tag/abc123test'))).toBe(true);
    const update = await page.evaluate(() => [...dataLayer].map(a => [...a]).find(a => a[0] === 'consent' && a[1] === 'update'));
    expect(update[2]).toEqual({ analytics_storage: 'granted' });
  });

  test('TC-V4-05 Decline: no banner on the next page, nothing loads; "Cookie settings" reopens it; Decline after Accept reloads clean', async ({ page }) => {
    const hits = watch(page);
    await openWithIds(page, 'index.html');
    await page.click('.pn-consent .pn-c-no');
    await page.goto('/about.html');
    await expect(page.locator('.pn-consent')).toHaveCount(0);
    expect(hits).toEqual([]);
    await page.locator('footer [data-pn-cookie-settings]').click();
    await expect(page.locator('.pn-consent')).toBeVisible();
    await page.click('.pn-consent .pn-c-yes');
    await expect.poll(() => hits.length).toBe(2);
    // changed mind: reload, then no more requests
    await page.locator('footer [data-pn-cookie-settings]').click();
    await Promise.all([page.waitForEvent('load'), page.click('.pn-consent .pn-c-no')]);
    const n = hits.length;
    await page.waitForTimeout(400);
    expect(hits.length).toBe(n);
    expect(await page.evaluate(() => localStorage.getItem('pn_consent'))).toBe('denied');
  });

  test('TC-V4-06 named events carry product, language and page', async ({ page }) => {
    await consent(page, 'granted');
    await open(page, 'products.html');
    await page.locator('.card a.amazon').first().click({ modifiers: [] });
    await page.locator('.card a.flipkart').first().click();
    await page.locator('.wa-float').click();
    const ev = await page.evaluate(() => window.pnEvents.map(e => ({ name: e.name, ...e.params })));
    const amazon = ev.find(e => e.name === 'amazon_click');
    expect(amazon).toMatchObject({ product_slug: 'baby-on-board-sign', language: 'en', page_path: '/products.html' });
    expect(ev.find(e => e.name === 'flipkart_click')).toMatchObject({ product_slug: 'baby-on-board-sign' });
    expect(ev.find(e => e.name === 'whatsapp_click')).toMatchObject({ placement: 'float' });
    await open(page, 'buy/foam-mat.html');
    expect(await page.evaluate(() => window.pnEvents.find(e => e.name === 'qr_buy_page_view').params)).toMatchObject({ product_slug: 'foam-mat', arrived_from: 'direct_or_qr' });
  });
});

test.describe('pregnancy tracker V4', () => {
  test.beforeEach(async ({ page }) => { await noLoader(page); await consent(page, 'denied'); });

  test('TC-V4-07 first screen: week, picture circle, baby size, days to go, share button; tabs below', async ({ page }) => {
    const { errors } = await open(page, 'pregnancy-tracker.html');
    const imgReq = []; page.on('request', r => { if (r.url().includes('/assets/tracker/')) imgReq.push(r.url()); });
    await page.fill('#trk-date', await day(page, 126));
    await page.click('#trk-form button[type="submit"]');
    await expect(page.locator('#r-week')).toHaveText('Week 22');
    await expect(page.locator('#r-ph')).toBeVisible();
    await expect(page.locator('#r-ph-n')).toHaveText('22');
    await expect(page.locator('#r-img')).toBeHidden();          // approved pictures not switched on yet
    await expect(page.locator('#r-size')).toContainText('Baby is about the size of a small papaya');
    await expect(page.locator('#r-left')).toHaveText('126 days to go');
    await expect(page.locator('#r-card')).toContainText('Share with family');
    await expect(page.locator('#trk-form')).toBeHidden();
    // tab 1 is open with the V3 details
    await expect(page.locator('#t-week')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#r-tri')).toHaveText('Second trimester');
    await expect(page.locator('#r-tip')).not.toBeEmpty();
    await expect(page.locator('.disclaimer').first()).toContainText('not medical advice');
    await expect(page.locator('.trk-d2')).toContainText('not medical advice');
    expect(imgReq).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('TC-V4-08 Checkups tab marks the anomaly scan "Now"; To-do ticks survive reload; Clear removes everything', async ({ page }) => {
    await open(page, 'pregnancy-tracker.html');
    await page.fill('#trk-date', await day(page, 126));
    await page.click('#trk-form button[type="submit"]');
    await page.click('#t-checks');
    await expect(page.locator('#p-checks')).toBeVisible();
    await expect(page.locator('#p-week')).toBeHidden();
    await expect(page.locator('#r-checks li')).toHaveCount(7);
    await expect(page.locator('#r-checks li.ck-now')).toHaveCount(1);
    await expect(page.locator('#r-checks li.ck-now')).toContainText('18–22');
    await page.click('#t-todo');
    await expect(page.locator('#r-todo-h')).toHaveText('Your to-do for week 22');
    const boxes = page.locator('#r-todo input[type="checkbox"]');
    expect(await boxes.count()).toBeGreaterThanOrEqual(3);
    await boxes.nth(1).check();
    await page.reload();
    await page.click('#t-todo');
    await expect(page.locator('#r-todo input[type="checkbox"]').nth(1)).toBeChecked();
    await page.click('#r-clear');
    expect(await page.evaluate(() => [localStorage.getItem('pn_preg'), localStorage.getItem('pn_todo')])).toEqual([null, null]);
    await page.reload();
    await expect(page.locator('#trk-result')).toBeHidden();
    await expect(page.locator('#trk-form')).toBeVisible();
  });

  test('TC-V4-09 "Share with family" makes a PNG card on the device and opens WhatsApp without a number', async ({ page }) => {
    await page.addInitScript(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; });
    await open(page, 'pregnancy-tracker.html');
    await page.fill('#trk-date', await day(page, 126));
    await page.click('#trk-form button[type="submit"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#r-card')]);
    expect(dl.suggestedFilename()).toBe('peppynose-week-22.png');
    const buf = require('fs').readFileSync(await dl.path());
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    expect(buf.readUInt32BE(16)).toBe(1080);                       // 1080 × 1080
    expect(buf.readUInt32BE(20)).toBe(1080);
    const [wa] = await page.evaluate(() => window.__opened);
    expect(wa).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(wa)).toContain('peppynose.com');
    expect(wa).not.toContain('7448704660');
    await expect(page.locator('#r-card-msg')).toContainText('Card saved');
  });

  test('TC-V4-10 Tamil and Hindi first screen, tabs and to-do work', async ({ page }) => {
    for (const d of ['ta/', 'hi/']) {
      const { errors } = await open(page, d + 'pregnancy-tracker.html');
      await page.fill('#trk-date', await day(page, 126));
      await page.click('#trk-form button[type="submit"]');
      await expect(page.locator('#r-week')).toContainText('22');
      await expect(page.locator('#r-size')).not.toBeEmpty();
      await page.click('#t-todo');
      await page.locator('#r-todo input[type="checkbox"]').first().check();
      await page.reload();
      await page.click('#t-todo');
      await expect(page.locator('#r-todo input[type="checkbox"]').first()).toBeChecked();
      expect(errors).toEqual([]);
      await page.click('#r-clear');
    }
  });

  test('TC-V4-11 sizes: before week 4, week 35, after week 40', async ({ page }) => {
    await open(page, 'pregnancy-tracker.html');
    const go = async (mode, n) => {
      if (await page.locator('#trk-form').isHidden()) await page.click('#r-change');
      await page.check(`input[name="mode"][value="${mode}"]`);
      await page.fill('#trk-date', await day(page, n)); await page.click('#trk-form button[type="submit"]');
    };
    await go('lmp', -14);
    await expect(page.locator('#r-size')).toHaveText('Baby sizes start from week 4.');
    await go('due', 35);
    await expect(page.locator('#r-week')).toHaveText('Week 35');
    await expect(page.locator('#r-size')).toContainText('bunch of bananas');
    await go('lmp', -290);
    await expect(page.locator('#r-size')).toHaveText('Baby is ready to meet you!');
  });
});

test.describe('help chat', () => {
  test.beforeEach(async ({ page }) => { await noLoader(page); await consent(page, 'denied'); });

  test('TC-V4-12 chat button sits above the WhatsApp button, same right edge, no overlap (320–1280 px)', async ({ page }, info) => {
    desktopOnly(info);
    for (const w of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width: w, height: 800 });
      await open(page, 'index.html');
      const [c, wa] = await page.evaluate(() => ['.pn-chat-btn', '.wa-float'].map(s => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; }));
      expect(c.b, `${w}px`).toBeLessThanOrEqual(wa.t);
      expect(Math.abs(c.r - wa.r), `${w}px right edges`).toBeLessThanOrEqual(1);
      expect(wa.t - c.b, `${w}px gap`).toBeGreaterThanOrEqual(8);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${w}px`).toBeLessThanOrEqual(0);
    }
  });

  test('TC-V4-13 tap a question, type a question, no-match goes to WhatsApp; Escape closes', async ({ page }) => {
    await open(page, 'index.html');
    await page.click('.pn-chat-btn');
    const panel = page.locator('.pn-chat-panel');
    await expect(panel).toBeVisible();
    await panel.locator('button[data-q]', { hasText: 'How do I clean and care for the teether?' }).click();
    await expect(panel.locator('.pn-m.bot').last()).toContainText('mild soap and clean water');
    await panel.locator('input').fill('how to remove sign');
    await panel.locator('form button[type="submit"]').click();
    await expect(panel.locator('.pn-m.bot').last()).toContainText('suction cup');
    await panel.locator('input').fill('xyzzy plugh');
    await panel.locator('form button[type="submit"]').click();
    const wa = panel.locator('.pn-m.bot').last().locator('a.pn-chat-wa');
    await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/917448704660\?text=.*xyzzy/);
    expect(await page.locator('body').innerText()).not.toMatch(/7448704660/);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('TC-V4-14 help chat answers typed questions in Tamil and Hindi', async ({ page }, info) => {
    desktopOnly(info);   // on phones the button hides while the hero buttons are under it
    for (const [d, q] of [['ta/', 'டீதர் சுத்தம்'], ['hi/', 'टीदर साफ़']]) {
      await open(page, d + 'index.html');
      await page.click('.pn-chat-btn');
      const panel = page.locator('.pn-chat-panel');
      await panel.locator('input').fill(q);
      await panel.locator('form button[type="submit"]').click();
      await expect(panel.locator('.pn-m.bot').last().locator('a.pn-chat-wa')).toHaveCount(1);
      expect(await page.evaluate(() => window.pnEvents.filter(e => e.name === 'chatbot_question').map(e => e.params.question_id))).toEqual(['teether_care']);
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('loader and motion', () => {
  test('TC-V4-15 two-parrot loader: gone within a second, once per tab, never on buy pages', async ({ page }) => {
    await consent(page, 'denied');
    await open(page, 'index.html');
    await expect(page.locator('#pn-loader .pl-art img')).toHaveCount(3);
    await expect(page.locator('#pn-loader')).toHaveCount(0, { timeout: 1200 });
    await page.goto('/about.html');
    await expect(page.locator('#pn-loader')).toHaveCount(0);
    const html = await (await page.request.get('/buy/foam-mat.html')).text();
    expect(html).not.toContain('pn-loader');
  });

  test('TC-V4-16 scroll animations on big screens; nothing at all with reduced motion', async ({ page }, info) => {
    desktopOnly(info);
    await noLoader(page); await consent(page, 'denied');
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, 'index.html');
    await expect(page.locator('.pn-progress')).toHaveCount(1);
    await expect(page.locator('.pn-fly')).toHaveCount(1);
    expect(await page.locator('.pn-rv').count()).toBeGreaterThan(10);
    // the hero photo (LCP) is never animated
    expect(await page.evaluate(() => !!document.querySelector('.hero3-art img').closest('.pn-rv'))).toBe(false);
    // everything that fades in is fully visible once scrolled past (EN/TA/HI, several pages)
    for (const p of ['index.html', 'products.html', 'faq.html', 'about.html', 'pregnancy-tracker.html', 'ta/index.html', 'hi/products.html']) {
      await open(page, p);
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } });
      await page.waitForTimeout(1200);
      const hidden = await page.evaluate(() => [...document.querySelectorAll('.pn-rv, .pn-wd')].filter(e => parseFloat(getComputedStyle(e).opacity) < 0.5).map(e => e.className + ' | ' + getComputedStyle(e).opacity + ' | ' + (e.textContent || '').trim().slice(0, 20) + ' | ' + (e.closest('section,div[class]') || {}).className));
      expect(hidden, p).toEqual([]);
    }
    // phones: no flying birds
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, 'index.html');
    await expect(page.locator('.pn-fly')).toHaveCount(0);
    // reduced motion: no loader, no reveals, no bar, no birds
    const rm = await page.context().newPage();          // fresh tab, so the loader would normally show
    await rm.emulateMedia({ reducedMotion: 'reduce' });
    await rm.setViewportSize({ width: 1280, height: 900 });
    await open(rm, 'index.html');
    await expect(rm.locator('#pn-loader')).toHaveCount(0);
    await expect(rm.locator('.pn-progress, .pn-fly, .pn-rv')).toHaveCount(0);
  });
});

test('TC-V4-17 privacy page explains analytics in all 3 languages', async ({ page }) => {
  await noLoader(page); await consent(page, 'denied');
  for (const d of Object.values(LANGS)) {
    await open(page, d + 'privacy.html');
    await expect(page.locator('#pn-priv-analytics')).toHaveCount(1);
    const body = await page.locator('main').innerText();
    for (const w of ['Google Analytics', 'Microsoft Clarity']) expect(body, d).toContain(w);
    expect(body).not.toMatch(/7448704660/);
  }
  await open(page, 'privacy.html');
  await expect(page.locator('.page-head p')).toHaveText('Last updated: October 2026');
});
