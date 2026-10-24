// "My weight" tab on the pregnancy tracker (weight.js). Weights are kept only in this browser.
const { test, expect } = require('@playwright/test');
const { blockExternal } = require('./helpers');

const LANGS = { en: '', ta: 'ta/', hi: 'hi/' };
const setup = async (page, path, days = 126) => {   // due date in 126 days = week 22 today
  await page.addInitScript(d => { try { sessionStorage.setItem('pn_loader_seen', '1'); localStorage.setItem('pn_consent', 'denied');
    if (!localStorage.getItem('pn_preg')) { const t = new Date(); const x = new Date(t.getFullYear(), t.getMonth(), t.getDate() + d);
      localStorage.setItem('pn_preg', JSON.stringify({ mode: 'due', date: [x.getFullYear(), String(x.getMonth() + 1).padStart(2, '0'), String(x.getDate()).padStart(2, '0')].join('-') })); } } catch (e) {} }, days);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await blockExternal(page);
  await page.goto('/' + path);
  await page.click('#t-weight');
  return errors;
};
const start = async (page, h = '158', pre = '55') => {
  await page.fill('#wt-h', h); await page.fill('#wt-pre', pre); await page.click('#wt-setup button[type="submit"]');
};
const add = async (page, w, k) => { await page.fill('#wt-week', String(w)); await page.fill('#wt-kg', String(k)); await page.click('#wt-add button[type="submit"]'); };

test('TC-WT-01 "My weight" is the 4th tracker tab in EN/TA/HI; the page says weights stay on the phone', async ({ request }) => {
  const words = { en: ['My weight', 'Your date and weights stay'], ta: ['என் எடை', 'தேதியும் எடைகளும்'], hi: ['मेरा वज़न', 'तारीख और वज़न'] };
  for (const [l, d] of Object.entries(LANGS)) {
    const html = await (await request.get('/' + d + 'pregnancy-tracker.html')).text();
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html).toContain(`<button type="button" role="tab" id="t-weight" aria-controls="p-weight" aria-selected="false" tabindex="-1">${words[l][0]}</button>`);
    expect(html).toContain(words[l][1]);
    expect(html).toContain(`<script src="${d ? '../' : ''}weight.js" defer></script>`);
    const priv = await (await request.get('/' + d + 'privacy.html')).text();
    expect(priv).toContain({ en: 'the date and weights you enter', ta: 'தேதியும் எடைகளும்,', hi: 'तारीख़ और वज़न,' }[l]);
  }
});

test('TC-WT-02 height and starting weight are checked, then BMI and the healthy total are shown; this week is suggested', async ({ page }) => {
  const errors = await setup(page, 'pregnancy-tracker.html');
  await expect(page.locator('#p-weight')).toBeVisible();
  await start(page, '50', '55');
  await expect(page.locator('#wt-setup-err')).toHaveText('Enter your height in cm (120–220).');
  await start(page, '158', '500');
  await expect(page.locator('#wt-setup-err')).toHaveText('Enter a weight in kg (30–200).');
  await start(page);
  await expect(page.locator('#wt-bmi')).toHaveText('Your BMI before pregnancy: 22.0 (normal weight). Usual healthy gain for the whole pregnancy: 11.5–16 kg.');
  await expect(page.locator('#wt-week')).toHaveValue('22');
  await expect(page.locator('#wt-table')).toContainText('No weights yet');
  expect(errors).toEqual([]);
});

test('TC-WT-03 weekly weights: table, healthy-range status, chart dots, month view, delete; kept after reload', async ({ page }) => {
  await setup(page, 'pregnancy-tracker.html');
  await start(page);
  await add(page, 45, 60);
  await expect(page.locator('#wt-err')).toHaveText('Choose a week from 1 to 42.');
  await add(page, 20, 20);
  await expect(page.locator('#wt-err')).toHaveText('Enter a weight in kg (30–200).');
  for (const [w, k] of [[8, 55.6], [16, 58.1], [20, 60.2], [22, 62.8]]) await add(page, w, k);
  await add(page, 22, 62.5);   // same week again replaces it
  const rows = page.locator('#wt-table tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('8'); await expect(rows.nth(0)).toContainText('55.6 kg'); await expect(rows.nth(0)).toContainText('In range');
  await expect(rows.nth(3)).toContainText('62.5 kg'); await expect(rows.nth(3)).toContainText('Gained +7.5'); await expect(rows.nth(3)).toContainText('Above range');
  await expect(page.locator('#wt-svg circle')).toHaveCount(4);
  await expect(page.locator('#wt-svg polygon.wt-band')).toHaveCount(1);
  await page.click('.wt-views button[data-view="month"]');
  const m = page.locator('#wt-table tbody tr');
  await expect(m).toHaveCount(3);                                   // months 2, 4 and 5
  await expect(m.nth(2)).toContainText('Month 5 (weeks 18–22)');
  await expect(m.nth(2)).toContainText('62.5 kg');                  // the latest weight in that month
  await page.click('.wt-views button[data-view="week"]');
  await page.click('button[aria-label="Delete week 8"]');
  await expect(rows).toHaveCount(3);
  await page.reload(); await page.click('#t-weight');
  await expect(page.locator('#wt-table tbody tr')).toHaveCount(3);
  await page.click('#wt-edit');
  await expect(page.locator('#wt-h')).toHaveValue('158');
});

test('TC-WT-04 weights never leave the phone, and "Clear my data" deletes them', async ({ page }) => {
  const sent = []; page.on('request', r => sent.push(r.url() + ' ' + (r.postData() || '')));
  await setup(page, 'pregnancy-tracker.html');
  await start(page, '163.5', '71.3');
  await add(page, 22, 79.4);
  expect(sent.filter(s => /163\.5|71\.3|79\.4/.test(s))).toEqual([]);
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('pn_weight')));
  expect(saved).toEqual({ h: 163.5, pre: 71.3, e: { 22: 79.4 } });
  await page.click('#r-clear');
  expect(await page.evaluate(() => localStorage.getItem('pn_weight'))).toBeNull();
});

test('TC-WT-05 Tamil and Hindi: own words, no sideways scroll on a 320 px phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  for (const [d, st] of [['ta/', 'வரம்புக்குள்'], ['hi/', 'सीमा में']]) {
    await page.evaluate(() => { try { localStorage.removeItem('pn_weight'); } catch (e) {} }).catch(() => {});
    const errors = await setup(page, d + 'pregnancy-tracker.html');
    await start(page);
    await add(page, 16, 58.1);
    await expect(page.locator('#wt-table')).toContainText(st);
    await page.click('.wt-views button[data-view="month"]');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  }
});
