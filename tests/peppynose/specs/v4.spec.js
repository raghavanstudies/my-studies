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
    await blockExternal(page);
    await page.route('**/analytics-config.js', r => r.fulfill({ contentType: 'text/javascript', body: "window.PN_ANALYTICS = { ga4: 'G-XXXXXXXXXX', clarity: 'CLARITY_PROJECT_ID' };" }));
    await page.goto('/index.html');
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

  test('TC-V4-07 first screen: week, week picture, baby size, days to go, share button; tabs below', async ({ page }) => {
    const { errors } = await open(page, 'pregnancy-tracker.html');
    const imgReq = []; page.on('request', r => { if (r.url().includes('/assets/tracker/')) imgReq.push(r.url()); });
    await page.fill('#trk-date', await day(page, 126));
    await page.click('#trk-form button[type="submit"]');
    await expect(page.locator('#r-week')).toHaveText('Week 22');
    // the approved week picture replaces the peach placeholder
    await expect(page.locator('#r-img')).toBeVisible();
    await expect(page.locator('#r-img')).toHaveAttribute('src', '/assets/tracker/week22.webp');
    await expect(page.locator('#r-img')).toHaveAttribute('alt', 'Illustration of baby at week 22 of pregnancy');
    await expect(page.locator('#r-ph')).toBeHidden();
    await expect(page.locator('#r-size')).toContainText('Baby is about the size of a small papaya');
    await expect(page.locator('#r-left')).toHaveText('126 days to go');
    await expect(page.locator('#r-card')).toContainText('Share with family');
    await expect(page.locator('#trk-form')).toBeHidden();
    // dashboard: the V3 details open from the "Baby size" tile as a full-screen panel
    await expect(page.locator('#p-week')).toBeHidden();
    await page.click('.dash-tile[data-open="p-week"]');
    await expect(page.locator('#p-week')).toBeVisible();
    await expect(page.locator('#r-tri')).toHaveText('Second trimester');
    await expect(page.locator('#r-tip')).not.toBeEmpty();
    await page.click('#p-week .dash-back');
    await expect(page.locator('#p-week')).toBeHidden();
    await expect(page.locator('.disclaimer').first()).toContainText('not medical advice');
    await expect(page.locator('.trk-d2')).toContainText('not medical advice');
    expect(imgReq.map(u => new URL(u).pathname)).toEqual(['/assets/tracker/week22.webp']);   // only this week's picture
    expect(errors).toEqual([]);
  });

  test('TC-V4-08 Checkups marks the anomaly scan "Now"; To-do ticks survive reload; Clear removes everything', async ({ page }) => {
    await open(page, 'pregnancy-tracker.html');
    await page.fill('#trk-date', await day(page, 126));
    await page.click('#trk-form button[type="submit"]');
    await page.click('.dash-tile[data-open="p-checks"]');
    await expect(page.locator('#p-checks')).toBeVisible();
    await expect(page.locator('#p-week')).toBeHidden();    // one panel at a time
    await expect(page.locator('#r-checks li')).toHaveCount(7);
    await expect(page.locator('#r-checks li.ck-now')).toHaveCount(1);
    await expect(page.locator('#r-checks li.ck-now')).toContainText('18–22');
    await page.click('#p-checks .dash-back');
    await page.click('.dash-tile[data-open="p-todo"]');
    await expect(page.locator('#r-todo-h')).toHaveText('Your to-do for week 22');
    const boxes = page.locator('#r-todo input[type="checkbox"]');
    expect(await boxes.count()).toBeGreaterThanOrEqual(3);
    await boxes.nth(1).check();
    await page.reload();
    await expect(page.locator('#r-todo input[type="checkbox"]').nth(1)).toBeChecked();   // the panel is open again after a reload
    await page.click('#p-todo .dash-back');
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

  test('TC-V4-10 Tamil and Hindi first screen and to-do work', async ({ page }) => {
    for (const d of ['ta/', 'hi/']) {
      const { errors } = await open(page, d + 'pregnancy-tracker.html');
      await page.fill('#trk-date', await day(page, 126));
      await page.click('#trk-form button[type="submit"]');
      await expect(page.locator('#r-week')).toContainText('22');
      await expect(page.locator('#r-size')).not.toBeEmpty();
      await page.click('.dash-tile[data-open="p-todo"]');
      await page.locator('#r-todo input[type="checkbox"]').first().check();
      await page.reload();
      await expect(page.locator('#r-todo input[type="checkbox"]').first()).toBeChecked();
      expect(errors).toEqual([]);
      await page.click('#p-todo .dash-back');
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
    test.setTimeout(60000);
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
      await page.waitForTimeout(2500);
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

test.describe('V4.1 fixes', () => {
  test.beforeEach(async ({ page }) => { await noLoader(page); });

  test('TC-V4-18 no pregnancy data in any analytics event (EN/TA/HI)', async ({ page }) => {
    await page.addInitScript(() => { window.open = () => null; });
    await consent(page, 'granted');
    for (const d of Object.values(LANGS)) {
      await open(page, d + 'pregnancy-tracker.html');
      await page.fill('#trk-date', await day(page, 126));
      await page.click('#trk-form button[type="submit"]');
      await expect(page.locator('#r-week')).toContainText('22');                 // tracker itself unchanged
      await Promise.all([page.waitForEvent('download'), page.click('#r-card')]);
      const ev = await page.evaluate(() => window.pnEvents.map(e => [e.name, e.params]));
      const used = ev.find(e => e[0] === 'tracker_used'), card = ev.find(e => e[0] === 'share_card_created');
      expect(Object.keys(used[1]).sort(), d).toEqual(['language', 'page_path']);
      expect(Object.keys(card[1]).sort(), d).toEqual(['language', 'method', 'page_path']);
      expect(JSON.stringify(ev), d).not.toMatch(/week|trimester|due|input_mode|lmp|"22"|:22\b/);
      await page.click('#r-clear');
    }
  });

  test('TC-V4-19 Clarity never loads on the tracker pages; GA4 page views still do', async ({ page }) => {
    await consent(page, 'granted');
    const hits = watch(page);
    for (const d of Object.values(LANGS)) {
      hits.length = 0;
      await openWithIds(page, d + 'pregnancy-tracker.html');
      await expect.poll(() => hits.length).toBe(1);
      await page.waitForTimeout(300);
      expect(hits.filter(u => u.includes('clarity.ms')), d).toEqual([]);
      expect(hits[0]).toContain('googletagmanager.com/gtag/js');
      expect(await page.evaluate(() => typeof window.clarity), d).toBe('undefined');
      await expect(page.locator('section.trk[data-clarity-mask="True"]')).toHaveCount(1);
    }
    hits.length = 0;
    await openWithIds(page, 'index.html');                                         // other pages: both load
    await expect.poll(() => hits.length).toBe(2);
    expect(hits.some(u => u.includes('clarity.ms'))).toBe(true);
  });

  test('TC-V4-20 home has no sideways scroll on small phones with large text (EN/TA/HI, 320–412 px, 100/115/130%)', async ({ page }, info) => {
    desktopOnly(info);
    test.setTimeout(120000);   // 24 page loads × 3 text sizes
    const bad = [];
    for (const motion of ['no-preference', 'reduce']) {
      // own tab per setting: switching to reduced motion makes motion.js reload the open page (by design)
      const tab = motion === 'reduce' ? await page.context().newPage() : page;
      await tab.emulateMedia({ reducedMotion: motion });
      await noLoader(tab); await consent(tab, 'denied');
      for (const d of Object.values(LANGS)) {
        for (const w of [320, 360, 390, 412]) {
          await tab.setViewportSize({ width: w, height: 800 });
          await open(tab, d + 'index.html');
          for (const fs of ['100%', '115%', '130%']) {
            await tab.evaluate(fs => { document.documentElement.style.fontSize = fs; }, fs);
            await tab.waitForTimeout(150);
            const over = await tab.evaluate(() => document.documentElement.scrollWidth - innerWidth);
            if (over > 0) bad.push(`${d || 'en/'}index ${w}px ${fs} ${motion}: ${over}px`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test('TC-V4-21 the phone-only CSS block leaves tablet and desktop unchanged', async ({ page }, info) => {
    desktopOnly(info);
    await consent(page, 'denied');
    // compare the layout with and without the V4.1 phone-only block in styles.css
    const snap = () => page.evaluate(() => [...document.querySelectorAll('.stage, .stage > *, .agegrid-p, .agegrid-p > a, .promise2, .promise2 > *, .sec-head > *, .mini > div, .mini .buy')]
      .map(e => { const c = getComputedStyle(e); return [c.gridTemplateColumns, c.minWidth, c.maxWidth, c.padding, c.flexWrap, c.overflowWrap, Math.round(e.getBoundingClientRect().width)].join('|'); }));
    for (const w of [768, 1024, 1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      await open(page, 'index.html');
      const withBlock = await snap();
      const removed = await page.evaluate(() => {
        const sh = [...document.styleSheets].find(x => /\/styles\.css(\?|$)/.test(x.href || ''));
        const i = [...sh.cssRules].findIndex(r => (r.conditionText || '').includes('max-width: 480px') && r.cssText.includes('.promise2'));
        if (i < 0) return false;
        sh.deleteRule(i); return true;
      });
      expect(removed).toBe(true);
      expect(await snap(), `${w}px`).toEqual(withBlock);
    }
  });
});

test.describe('22 Oct: real analytics IDs', () => {
  test.beforeEach(async ({ page }) => { await noLoader(page); });

  test('TC-V4-22 the live IDs are in place; nothing loads before Accept; after Accept GA4 + Clarity load (not Clarity on tracker pages)', async ({ page, request }, info) => {
    desktopOnly(info);
    const cfg = await (await request.get('/analytics-config.js')).text();
    expect(cfg).toContain("ga4: 'G-TQ3T4P57SJ'");
    expect(cfg).toContain("clarity: 'z1i2qcz3dc'");
    const hits = watch(page);
    await open(page, 'index.html');
    await page.waitForTimeout(300);
    expect(hits).toEqual([]);                                                       // banner shown, nothing sent yet
    await page.click('.pn-consent .pn-c-yes');
    await expect.poll(() => hits.length).toBe(2);
    expect(hits.some(u => u.startsWith('https://www.googletagmanager.com/gtag/js?id=G-TQ3T4P57SJ'))).toBe(true);
    expect(hits.some(u => u.startsWith('https://www.clarity.ms/tag/z1i2qcz3dc'))).toBe(true);
    for (const d of Object.values(LANGS)) {
      hits.length = 0;
      await page.goto('/' + d + 'pregnancy-tracker.html');
      await expect.poll(() => hits.length).toBe(1);
      await page.waitForTimeout(300);
      expect(hits.filter(u => u.includes('clarity.ms')), d).toEqual([]);
    }
  });
});

test.describe('22 Oct: tracker pictures', () => {
  test.beforeEach(async ({ page }) => { await noLoader(page); await consent(page, 'denied'); });
  const go = async (page, mode, n) => {
    if (await page.locator('#trk-form').isHidden()) await page.click('#r-change');
    await page.check(`input[name="mode"][value="${mode}"]`);
    await page.fill('#trk-date', await day(page, n)); await page.click('#trk-form button[type="submit"]');
  };

  test('TC-V4-23 all 37 approved pictures (week 4–40) are on the site, 800 × 800 WebP', async ({ page, request }, info) => {
    desktopOnly(info);
    await open(page, 'index.html');
    for (let w = 4; w <= 40; w++) {
      const p = `/assets/tracker/week${String(w).padStart(2, '0')}.webp`;
      const res = await request.get(p);
      expect(res.status(), p).toBe(200);
      expect(res.headers()['content-type'], p).toContain('image/webp');
      const size = await page.evaluate(async p => { const i = new Image(); i.src = p; await i.decode(); return [i.naturalWidth, i.naturalHeight]; }, p);
      expect(size, p).toEqual([800, 800]);
    }
  });

  test('TC-V4-24 each week shows its own picture; before week 4 the placeholder, no picture requested', async ({ page }) => {
    await open(page, 'pregnancy-tracker.html');
    for (const [days, w] of [[-28, 4], [-91, 13], [-280, 40]]) {
      await go(page, 'lmp', days);
      await expect(page.locator('#r-img')).toHaveAttribute('src', `/assets/tracker/week${String(w).padStart(2, '0')}.webp`);
      await expect(page.locator('#r-img')).toBeVisible();
      expect(await page.locator('#r-img').evaluate(i => i.complete && i.naturalWidth)).toBe(800);
    }
    await go(page, 'lmp', -14);                                                     // week 2
    await expect(page.locator('#r-img')).toBeHidden();
    await expect(page.locator('#r-ph')).toBeVisible();
    await expect(page.locator('#r-ph-n')).toHaveText('2');
  });

  test('TC-V4-25 whole picture shows (rounded square, not cropped to a circle) and it is lazy-loaded', async ({ page }) => {
    await open(page, 'pregnancy-tracker.html');
    await go(page, 'due', 126);
    const img = page.locator('#r-img');
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute('loading', 'lazy');
    const st = await img.evaluate(i => { const c = getComputedStyle(i); const b = i.getBoundingClientRect(); return { r: c.borderTopLeftRadius, fit: c.objectFit, w: b.width, h: b.height }; });
    expect(st.r).not.toBe('50%');
    expect(parseFloat(st.r)).toBeLessThan(st.w * 0.3);
    expect(st.w).toBeCloseTo(st.h, 0);                                              // square box, square picture: nothing cut
    // the card is not hidden under the sticky header
    await page.waitForTimeout(900);
    const [top, head] = await page.evaluate(() => [document.querySelector('.trk-hero').getBoundingClientRect().top, document.querySelector('header').getBoundingClientRect().bottom]);
    expect(top).toBeGreaterThanOrEqual(head - 1);
  });

  test('TC-V4-26 3D tilt follows the mouse; click or Enter zooms; Escape, ✕ or a tap closes', async ({ page }, info) => {
    desktopOnly(info);
    await open(page, 'pregnancy-tracker.html');
    await go(page, 'due', 126);
    const box = page.locator('.trk-hero-img');
    await expect(box).toHaveClass(/has-img/);
    await expect(box).toHaveAttribute('role', 'button');
    await page.waitForTimeout(900);                                                 // let the smooth scroll to the result finish
    const r = await box.boundingBox();
    await page.mouse.move(r.x + r.width * .9, r.y + r.height * .2);
    await page.waitForTimeout(200);
    const t = await box.evaluate(b => [parseFloat(b.style.getPropertyValue('--rx')), parseFloat(b.style.getPropertyValue('--ry'))]);
    expect(t[0]).toBeGreaterThan(3); expect(t[1]).toBeGreaterThan(3);            // tilted towards the pointer
    expect(Math.max(...t.map(Math.abs))).toBeLessThanOrEqual(12);
    await page.mouse.move(r.x - 60, r.y + r.height / 2);                            // leave: back to flat
    await page.waitForTimeout(200);
    expect(await box.evaluate(b => parseFloat(b.style.getPropertyValue('--ry')))).toBe(0);
    await box.click();
    const zoom = page.locator('.trk-zoom');
    await expect(zoom).toHaveCount(1);
    await expect(zoom.locator('img')).toHaveAttribute('src', /week22\.webp$/);
    await expect(zoom).toHaveAttribute('aria-label', 'Illustration of baby at week 22 of pregnancy');
    await page.keyboard.press('Escape');
    await expect(zoom).toHaveCount(0);
    await box.focus(); await page.keyboard.press('Enter');
    await expect(zoom).toHaveCount(1);
    await page.click('.trk-zoom-x');
    await expect(zoom).toHaveCount(0);
  });

  test('TC-V4-27 phones: drag tilts, phone motion tilts gently, a tap zooms and a tap closes; Tamil and Hindi', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'phone only');
    for (const [d, alt] of [['ta/', 'கர்ப்பத்தின் 22-ஆம் வாரத்தில் குழந்தையின் படம்'], ['hi/', 'प्रेग्नेंसी के हफ़्ते 22 में शिशु का चित्र']]) {
      await open(page, d + 'pregnancy-tracker.html');
      await go(page, 'due', 126);
      const box = page.locator('.trk-hero-img');
      await expect(box).toHaveClass(/has-img/);
      await expect(page.locator('#r-img')).toHaveAttribute('alt', alt);
      // The result scrolls into view. Motion is ignored until the picture is on screen.
      await expect.poll(async () => box.evaluate(b => b.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
      await page.evaluate(() => { for (const [b, g] of [[40, 0], [50, 15]]) dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: b, gamma: g })); });
      await page.waitForTimeout(200);
      const t = await box.evaluate(b => [parseFloat(b.style.getPropertyValue('--rx')), parseFloat(b.style.getPropertyValue('--ry'))]);
      expect(t[1]).toBeGreaterThan(2);
      expect(Math.max(...t.map(Math.abs))).toBeLessThanOrEqual(8);               // gentle
      await box.tap();
      await expect(page.locator('.trk-zoom')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      await page.locator('.trk-zoom').tap({ position: { x: 20, y: 300 } });
      await expect(page.locator('.trk-zoom')).toHaveCount(0);
      await page.click('#r-clear');
    }
  });

  test('TC-V4-28 reduced motion: no tilt, zoom still works', async ({ page }, info) => {
    desktopOnly(info);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'pregnancy-tracker.html');
    await go(page, 'due', 126);
    const box = page.locator('.trk-hero-img');
    await expect(box).toHaveClass(/has-img/);
    const r = await box.boundingBox();
    await page.mouse.move(r.x + r.width * .9, r.y + r.height * .2);
    await page.waitForTimeout(200);
    expect(await page.locator('#r-img').evaluate(i => getComputedStyle(i).transform)).toBe('none');
    await box.click();
    await expect(page.locator('.trk-zoom')).toHaveCount(1);
  });

  test('TC-V4-29 share card includes the week picture (made on the device); still no pregnancy data in analytics', async ({ page }) => {
    await page.addInitScript(() => { window.open = () => null; });
    await consent(page, 'granted');
    await open(page, 'pregnancy-tracker.html');
    await go(page, 'due', 126);
    await expect(page.locator('#r-img')).toBeVisible();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#r-card')]);
    const buf = require('fs').readFileSync(await dl.path());
    // look at the picture area of the card: a real picture has many colours, the plain placeholder only a few
    const colours = await page.evaluate(async b64 => {
      const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode();
      const c = document.createElement('canvas'); c.width = 330; c.height = 330; const x = c.getContext('2d');
      x.drawImage(i, 375, 230, 330, 330, 0, 0, 330, 330);
      const d = x.getImageData(0, 0, 330, 330).data, set = new Set();
      for (let k = 0; k < d.length; k += 4 * 37) set.add((d[k] >> 3) + ',' + (d[k + 1] >> 3) + ',' + (d[k + 2] >> 3));
      return set.size;
    }, buf.toString('base64'));
    expect(colours).toBeGreaterThan(150);
    const ev = JSON.stringify(await page.evaluate(() => window.pnEvents.map(e => [e.name, e.params])));
    expect(ev).not.toMatch(/week|trimester|due|input_mode|assets\/tracker/);
  });
});

test.describe('22 Oct re-test fixes', () => {
  test.beforeEach(async ({ page }) => { await noLoader(page); });

  test('TC-V4-30 "Share my week": no share text in the link (EN/TA/HI); WhatsApp gets the text only on click; analytics never sees it', async ({ page }) => {
    await consent(page, 'granted');
    await page.addInitScript(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; });
    for (const d of Object.values(LANGS)) {
      await open(page, d + 'pregnancy-tracker.html');
      await page.fill('#trk-date', await day(page, 126));
      await page.click('#trk-form button[type="submit"]');
      await expect(page.locator('#r-week')).toContainText('22');
      expect(await page.$$eval('a[href*="wa.me"]', as => as.map(a => a.getAttribute('href')).filter(h => /text=/.test(h) && !h.includes('917448704660')))).toEqual([]);
      await expect(page.locator('#r-share')).toHaveAttribute('href', 'https://wa.me/');
      await page.click('#r-share');
      const opened = await page.evaluate(() => window.__opened);
      expect(opened.length, d).toBe(1);
      expect(opened[0]).toMatch(/^https:\/\/wa\.me\/\?text=.+/);
      expect(decodeURIComponent(opened[0])).toContain('126');
      expect(opened[0]).not.toContain('7448704660');
      const ev = await page.evaluate(() => window.pnEvents.map(e => [e.name, e.params]));
      expect(ev.find(e => e[0] === 'whatsapp_click')[1]).toMatchObject({ placement: 'tracker_share' });
      expect(JSON.stringify(ev), d).not.toMatch(/text=|126|week|due/);
      await page.click('#r-clear');
      await page.evaluate(() => { window.__opened.length = 0; });
    }
  });

  test('TC-V4-31 a week with no picture clears the previous picture: not zoomable, no label', async ({ page }) => {
    await consent(page, 'denied');
    await open(page, 'pregnancy-tracker.html');
    await page.fill('#trk-date', await day(page, 126));
    await page.click('#trk-form button[type="submit"]');
    const box = page.locator('.trk-hero-img');
    await expect(box).toHaveClass(/has-img/);
    await expect(box).toHaveAttribute('aria-label', /week 22/);
    for (const [mode, n, ph] of [['lmp', -14, '2'], ['lmp', -290, '41']]) {           // week 2 (too early) and week 41 (shows its real number, 24 Oct)
      await page.click('#r-change');
      await page.check(`input[name="mode"][value="${mode}"]`);
      await page.fill('#trk-date', await day(page, n));
      await page.click('#trk-form button[type="submit"]');
      await expect(page.locator('#r-ph')).toBeVisible();
      await expect(page.locator('#r-ph-n')).toHaveText(ph);
      await expect(box).not.toHaveClass(/has-img/);
      for (const attr of ['role', 'aria-label', 'tabindex']) expect(await box.getAttribute(attr), attr).toBeNull();
      await box.click({ force: true });
      await expect(page.locator('.trk-zoom')).toHaveCount(0);
    }
  });
});
