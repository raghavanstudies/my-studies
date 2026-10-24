// Pregnancy tracker dashboard (dash.js): week ring, "Add today's weight", 6 tiles, full-screen panels.
const { test, expect } = require('@playwright/test');
const { blockExternal } = require('./helpers');

const start = async (page, path = 'pregnancy-tracker.html', extra = {}) => {   // due date in 126 days = week 22
  await page.addInitScript(x => { try { sessionStorage.setItem('pn_loader_seen', '1'); localStorage.setItem('pn_consent', 'denied');
    if (!localStorage.getItem('pn_preg')) { const t = new Date(); const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 126);
      localStorage.setItem('pn_preg', JSON.stringify({ mode: 'due', date: [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-') })); }
    for (const [k, v] of Object.entries(x)) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, extra);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await blockExternal(page);
  await page.goto('/' + path);
  return errors;
};

test('TC-DASH-01 dashboard: week ring, big weight button and 6 tiles with this week\'s facts; page title steps aside', async ({ page }) => {
  const errors = await start(page, 'pregnancy-tracker.html', { pn_weight: { h: 158, pre: 55, e: { 20: 60.2 } }, pn_todo: { w22: [true, false, true] } });
  await expect(page.locator('#r-ring-n')).toHaveText('22');
  await expect(page.locator('#r-pct')).toHaveText('55% of the way');
  expect(+(await page.locator('#r-ring').evaluate(e => parseFloat(e.style.strokeDashoffset)))).toBeGreaterThan(0);
  await expect(page.locator('.dash-add')).toBeVisible();
  await expect(page.locator('.dash-tile')).toHaveCount(6);
  await expect(page.locator('#dt-weight')).toHaveText('60.2 kg');
  await expect(page.locator('#dt-weight-s')).toHaveText('In range');
  await expect(page.locator('#dt-size')).toContainText('small papaya');
  await expect(page.locator('#dt-check')).toHaveText('The anomaly scan (detailed baby scan)');
  await expect(page.locator('#dt-check-s')).toHaveText('weeks 18–22');
  await expect(page.locator('#dt-todo')).toHaveText('2 of 4 done');
  await expect(page.locator('#dt-due-s')).toHaveText('126 days to go');
  await expect(page.locator('#dt-tip')).not.toBeEmpty();
  await expect(page.locator('.page-head')).toBeHidden();
  for (const id of ['p-weight', 'p-week', 'p-checks', 'p-todo']) await expect(page.locator('#' + id)).toBeHidden();
  expect(errors).toEqual([]);
});

test('TC-DASH-02 a tile opens a full-screen panel; Back, the phone\'s back button and Escape close it; the tile updates', async ({ page }) => {
  await start(page);
  await expect(page.locator('#dt-weight')).toHaveText('Tap to start');
  await page.click('.dash-tile[data-open="p-checks"]');
  const panel = page.locator('#p-checks');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('role', 'dialog');
  expect(await panel.evaluate(e => { const c = getComputedStyle(e); return [c.position, c.top, c.left, c.right, c.bottom]; })).toEqual(['fixed', '0px', '0px', '0px', '0px']);   // full screen
  await expect(page.locator('html')).toHaveClass(/dash-open/);
  await expect(page).toHaveURL(/#p-checks$/);
  await page.click('#p-checks .dash-back');
  await expect(panel).toBeHidden();
  await expect(page.locator('html')).not.toHaveClass(/dash-open/);
  await page.click('.dash-tile[data-open="p-todo"]');
  await page.locator('#r-todo input[type="checkbox"]').first().check();
  await page.goBack();                                       // phone back button
  await expect(page.locator('#p-todo')).toBeHidden();
  await expect(page.locator('#dt-todo')).toHaveText('1 of 4 done');
  await page.click('.dash-add');
  await page.fill('#wt-h', '158'); await page.fill('#wt-pre', '55'); await page.click('#wt-setup button[type="submit"]');
  await page.fill('#wt-kg', '61.9'); await page.click('#wt-add button[type="submit"]');
  await page.keyboard.press('Escape');
  await expect(page.locator('#p-weight')).toBeHidden();
  await expect(page.locator('#dt-weight')).toHaveText('61.9 kg');
  await expect(page.locator('#dt-weight-s')).toHaveText('Above range');
});

test('TC-DASH-03 Tamil and Hindi tiles; no sideways scroll on a 320 px phone with a panel open', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  for (const [d, t] of [['ta/', 'அடுத்த பரிசோதனை'], ['hi/', 'अगला चेकअप']]) {
    const errors = await start(page, d + 'pregnancy-tracker.html');
    await expect(page.locator('.dash-tile[data-open="p-checks"] .dt-h')).toHaveText(t);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.click('.dash-tile[data-open="p-week"]');
    await expect(page.locator('#p-week')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  }
});
