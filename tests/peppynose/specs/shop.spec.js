// TC-SHOP: the products page.
const { test, expect } = require('@playwright/test');
const { AMAZON_ASINS, REMOVED_ASINS, FLIPKART_PIDS, open } = require('./helpers');

test.beforeEach(async ({ page }) => { await open(page, 'products.html'); });

const card = (page, name) => page.locator('.card', { has: page.locator('h3', { hasText: name }) });

test('TC-SHOP-01 lists 15 products in 4 categories', async ({ page }) => {
  await expect(page.locator('.card')).toHaveCount(15);
  for (const id of ['car-signs', 'teethers', 'knee-pads', 'play']) await expect(page.locator(`#${id}`)).toBeVisible();
});

test('TC-SHOP-02 age filter shows the right products', async ({ page }) => {
  const expected = { all: 15, pregnancy: 3, newborn: 3, months3: 3, crawling: 5, kids: 4 };
  for (const [age, count] of Object.entries(expected)) {
    await page.locator(`.agebtn[data-age="${age}"]`).click();
    await expect(page.locator(`.agebtn[data-age="${age}"]`)).toHaveClass(/\bon\b/);
    await expect(page.locator('.card:visible'), age).toHaveCount(count);
    await expect(page.locator('.chips'), age).toBeVisible({ visible: age === 'all' });
    if (age !== 'all') await expect(page).toHaveURL(new RegExp(`\\?age=${age}$`));
  }
  await page.locator('.agebtn[data-age="months3"]').click();
  await expect(page.locator('.group:visible')).toHaveCount(1);
  await expect(page.locator('.group:visible h2')).toHaveText('Teethers');
});

test('TC-SHOP-03 opening ?age=kids preselects the filter', async ({ page }) => {
  await page.goto('/products.html?age=kids');
  await expect(page.locator('.agebtn.on')).toHaveText('Toys · 1–3 yrs');
  await expect(page.locator('.card:visible')).toHaveCount(4);
});

test('TC-SHOP-04 large sign is "Coming soon" with no buy links or price', async ({ page }) => {
  const c = card(page, 'Baby on Board Sign — Large');
  await expect(c.locator('.soon-badge')).toHaveText('Coming soon 🔜');
  await expect(c.locator('button.soon')).toBeDisabled();
  await expect(c.locator('button.soon')).toHaveText('Coming soon 🔜');
  await expect(c.locator('a')).toHaveCount(0);
  await expect(c).not.toContainText('₹');
});

test('TC-SHOP-05 LCD tablet multicolour is "Out of stock" with no buy link', async ({ page }) => {
  const c = card(page, 'LCD Writing Tablet — Multicolour');
  await expect(c.locator('.soon-badge')).toHaveText('Out of stock');
  await expect(c.locator('button.soon')).toBeDisabled();
  await expect(c.locator('a')).toHaveCount(0);
  await expect(c).not.toContainText('₹');
});

test('TC-SHOP-06 all buy links are present and unavailable items have none', async ({ page }) => {
  const hrefs = await page.$$eval('a', as => as.map(a => a.href));
  const asins = new Set(hrefs.map(h => (h.match(/amazon\.in\/dp\/(B0[A-Z0-9]{8})/) || [])[1]).filter(Boolean));
  expect([...asins].sort()).toEqual([...AMAZON_ASINS].sort());
  for (const removed of REMOVED_ASINS) expect(hrefs.join(' ')).not.toContain(removed);
  const pids = new Set(hrefs.map(h => (h.match(/flipkart\.com\/peppynose[^?]*\?pid=([A-Z0-9]+)/) || [])[1]).filter(Boolean));
  expect([...pids].sort()).toEqual([...FLIPKART_PIDS].sort());
});

test('TC-SHOP-07 every marketplace button says "Check price", no ₹ anywhere', async ({ page }) => {
  const opt = (name, pack) => card(page, name).locator('.opt', { hasText: pack });
  const bob = 'Baby on Board & Bump on Board Sign';
  await expect(opt(bob, 'Pack of 1').locator('a.amazon')).toHaveText(/Amazon\s*Check price/);
  await expect(opt(bob, 'Pack of 1').locator('a.flipkart')).toHaveText(/Flipkart\s*Check price/);
  await expect(opt(bob, 'Pack of 2').locator('a.amazon')).toHaveText(/Amazon\s*Check price/);
  await expect(opt(bob, 'Pack of 2').locator('a.flipkart')).toHaveText(/Flipkart\s*Check price/);
  const mob = card(page, 'Mom on Board & Baby on Board Sign');
  await expect(mob.locator('a.amazon')).toHaveText(/Amazon\s*Check price/);
  await expect(mob.locator('a.flipkart')).toHaveText(/Flipkart\s*Check price/);
  // every button says "Check price": marketplace prices change with offers
  const amazon = await page.$$eval('.card a.amazon', as => as.map(a => a.innerText));
  expect(amazon.length).toBe(18);
  for (const t of amazon) expect(t.replace(/\s+/g, ' ').trim()).toBe('Amazon Check price');
  expect(await page.locator('body').innerText()).not.toContain('₹');
  const flip = await page.$$eval('.card a.flipkart', as => as.map(a => a.innerText.replace(/\s+/g, ' ').trim()));
  expect(flip.length).toBe(15);
  for (const t of flip) expect(t).toBe('Flipkart Check price');
  // no single shared price sits next to the buttons any more
  await expect(page.locator('.opt-top b')).toHaveCount(0);
});

test('TC-SHOP-08 category chips jump to their sections', async ({ page }) => {
  await page.locator('.chips a', { hasText: 'Learning & Play' }).click();
  await expect(page).toHaveURL(/#play$/);
  await expect(page.locator('#play h2')).toBeInViewport();
});

test('TC-SHOP-09 spelling uses "moms-to-be"', async ({ page }) => {
  await expect(card(page, 'Mom on Board & Baby on Board Sign')).toContainText('moms-to-be');
});
