// Second round (QA report, 24 Oct 2026): grammar, week 41/42, leap-year and month-end dates, weight-input edge cases,
// refresh and cleared data in the middle of entering weights, and the "Add" hearts never making the page wider.
const { test, expect } = require('@playwright/test');
const { blockExternal } = require('./helpers');

const ymd = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const fromToday = n => { const t = new Date(); return ymd(new Date(t.getFullYear(), t.getMonth(), t.getDate() + n)); };
const open = async (page, preg, path = 'pregnancy-tracker.html') => {
  await page.addInitScript(p => { try { sessionStorage.setItem('pn_loader_seen', '1'); localStorage.setItem('pn_consent', 'denied');
    if (p && !localStorage.getItem('pn_preg')) localStorage.setItem('pn_preg', JSON.stringify(p)); } catch (e) {} }, preg);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await blockExternal(page);
  await page.goto('/' + path);
  return errors;
};

test('TC-EDGE-01 English says "1 week" and "1 day", never "1 weeks" / "1 days"', async ({ page }) => {
  const errors = await open(page, { mode: 'lmp', date: fromToday(-8) });          // 1 week and 1 day
  await page.click('.dash-tile[data-open="p-week"]');
  await expect(page.locator('#r-age')).toHaveText('You are 1 week and 1 day pregnant');
  await page.click('#p-week .dash-back');
  await page.click('#r-change');
  await page.check('input[name="mode"][value="due"]');
  await page.fill('#trk-date', fromToday(1)); await page.click('#trk-form button[type="submit"]');
  await expect(page.locator('#r-left')).toHaveText('1 day to go');
  await expect(page.locator('#dt-due-s')).toHaveText('1 day to go');
  await page.evaluate(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; });
  await page.click('#r-share');
  const [u] = await page.evaluate(() => window.__opened);
  expect(decodeURIComponent(u)).toContain('1 day to go');
  expect(decodeURIComponent(u)).not.toMatch(/\b1 (weeks|days)\b/);
  expect(errors).toEqual([]);
});

test('TC-EDGE-02 weeks 41 and 42 say the same week everywhere (no "40" left over)', async ({ context }) => {
  for (const [days, w] of [[-7, 41], [-14, 42]]) {
    const page = await context.newPage();                                          // its own page: the saved date is set once
    const errors = await open(page, { mode: 'due', date: fromToday(days) });
    await expect(page.locator('#r-week')).toHaveText(`Week ${w}`);
    await expect(page.locator('#r-ring-n')).toHaveText(String(w));
    await expect(page.locator('#r-ph-n')).toHaveText(String(w));                 // no picture after week 40: the number shows
    await expect(page.locator('#dt-size-s')).toHaveText(`Week ${w}`);
    await page.click('.dash-tile[data-open="p-week"]');
    await expect(page.locator('#r-prog')).toHaveText(`Week ${w} · Due date reached`);
    await page.click('#p-week .dash-back');
    await expect(page.locator('#dt-todo-s')).toHaveText(`Your to-do for week ${w}`);
    expect(errors).toEqual([]);
    await page.click('#r-clear');
    await page.close();
  }
});

test('TC-EDGE-03 leap day and month-end dates count right', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2028, 1, 29, 10, 0, 0));               // 29 Feb 2028
  await open(page, { mode: 'due', date: '2028-03-31' });
  await expect(page.locator('#r-left')).toHaveText('31 days to go');
  await page.click('.dash-tile[data-open="p-week"]');
  await expect(page.locator('#r-age')).toHaveText('You are 35 weeks and 4 days pregnant');
  await expect(page.locator('#r-due')).toContainText('31 March 2028');
});

test('TC-EDGE-04 month end: last period on 31 December, today 31 January', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2027, 0, 31, 10, 0, 0));
  await open(page, { mode: 'lmp', date: '2026-12-31' });
  await expect(page.locator('#r-week')).toHaveText('Week 4');
  await page.click('.dash-tile[data-open="p-week"]');
  await expect(page.locator('#r-age')).toHaveText('You are 4 weeks and 3 days pregnant');
  await expect(page.locator('#r-due')).toContainText('7 October 2027');           // 31 Dec + 280 days
});

test('TC-EDGE-05 weight inputs: 0, negative, letters, huge and empty values are refused; decimals are kept to 0.1 kg', async ({ page }) => {
  const errors = await open(page, { mode: 'due', date: fromToday(126) });
  await page.click('.dash-add');
  const setNum = (sel, v) => page.locator(sel).evaluate((e, v) => { e.value = v; }, v);   // letters cannot be typed into a number box
  for (const [h, pre, msg] of [['0', '55', 'height'], ['-160', '55', 'height'], ['abc', '55', 'height'], ['99999', '55', 'height'], ['158', '0', 'kg'], ['158', '-55', 'kg'], ['158', '', 'kg'], ['158', '1e9', 'kg']]) {
    await setNum('#wt-h', h); await setNum('#wt-pre', pre); await page.click('#wt-setup button[type="submit"]');
    await expect(page.locator('#wt-setup-err')).toContainText(msg === 'height' ? 'height in cm' : 'weight in kg');
  }
  await page.fill('#wt-h', '158'); await page.fill('#wt-pre', '55'); await page.click('#wt-setup button[type="submit"]');
  for (const k of ['0', '-61', 'abc', '', '250', '1e9']) {
    await setNum('#wt-kg', k); await page.click('#wt-add button[type="submit"]');
    await expect(page.locator('#wt-err')).toHaveText('Enter a weight in kg (30–200).');
  }
  await page.click('#wt-wk-btn');
  for (const w of ['0', '-3', '43', '']) {
    await setNum('#wt-week', w); await setNum('#wt-kg', '60'); await page.click('#wt-add button[type="submit"]');
    await expect(page.locator('#wt-err')).toHaveText('Choose a week from 1 to 42.');
  }
  await page.fill('#wt-week', '22'); await page.fill('#wt-kg', '61.25'); await page.click('#wt-add button[type="submit"]');
  await expect(page.locator('#wt-err')).toHaveText('');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('pn_weight'))).e).toEqual({ 22: 61.3 });
  expect(errors).toEqual([]);
});

test('TC-EDGE-06 refresh before "Add", broken saved data and cleared browser data never break the page', async ({ page }) => {
  let errors = await open(page, { mode: 'due', date: fromToday(126) });
  await page.click('.dash-add');
  await page.fill('#wt-h', '158'); await page.fill('#wt-pre', '55'); await page.click('#wt-setup button[type="submit"]');
  await page.fill('#wt-kg', '61.9');                                               // typed, not added
  await page.reload();
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('pn_weight'))).e).toEqual({});
  await expect(page.locator('#dt-weight')).toHaveText('Tap to start');
  for (const bad of ['not json', '{"h":"abc","pre":null,"e":"x"}', '[]', 'null']) {
    await page.evaluate(b => localStorage.setItem('pn_weight', b), bad);
    await page.reload();
    await expect(page.locator('#dt-weight')).toHaveText('Tap to start');
    if (await page.locator('#p-weight').isHidden()) await page.click('.dash-add');
    await expect(page.locator('#wt-setup')).toBeVisible();
  }
  await page.evaluate(() => localStorage.clear());                                 // "clear browser data"
  const fresh = await page.context().newPage();                                   // no test setup script on this page
  const errs2 = []; fresh.on('pageerror', e => errs2.push(e.message));
  await blockExternal(fresh); await fresh.goto('/pregnancy-tracker.html');
  await expect(fresh.locator('#trk-form')).toBeVisible();
  await expect(fresh.locator('#trk-result')).toBeHidden();
  expect(errors).toEqual([]); expect(errs2).toEqual([]);
});

test('TC-EDGE-07 the hearts after "Add" never make the page wider on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.addInitScript(() => { try { localStorage.setItem('pn_weight', JSON.stringify({ h: 158, pre: 55, e: {} })); } catch (e) {} });
  await open(page, { mode: 'due', date: fromToday(126) });
  await page.click('.dash-add');
  await page.fill('#wt-kg', '61.9'); await page.click('#wt-add button[type="submit"]');
  let widest = 0;
  for (let i = 0; i < 12; i++) { widest = Math.max(widest, await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)); await page.waitForTimeout(100); }
  expect(widest).toBeLessThanOrEqual(1);
});
