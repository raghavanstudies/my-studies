// TC-CONTENT: About, FAQ, Contact and policy pages, plus site-wide wording.
const { test, expect } = require('@playwright/test');
const { PAGES, POLICY_PAGES, open } = require('./helpers');

test('TC-CONTENT-01 FAQ answers open on tap and have the latest facts', async ({ page }) => {
  await open(page, 'faq.html');
  const q = page.locator('details', { hasText: 'What sizes are available?' });
  await expect(q.locator('p')).toBeHidden();
  await q.locator('summary').click();
  await expect(q.locator('p')).toBeVisible();
  await expect(q.locator('p')).toContainText('17.5 × 17.5 cm size is coming soon');
  await expect(page.locator('details', { hasText: 'What age are the knee pads for?' })).toContainText('1 to 3 years');
  await expect(page.locator('details', { hasText: 'What age are the toys for?' })).toContainText('1 to 3 years');
  await expect(page.locator('details', { hasText: 'teethers' }).first()).toContainText('3 months');
});

test('TC-CONTENT-02 About page tells the brand story', async ({ page }) => {
  await open(page, 'about.html');
  await expect(page.locator('main')).toContainText('began in 2023 in Musiri');
  await expect(page.locator('.promise > div')).toHaveCount(3);
});

test('TC-CONTENT-03 Contact page shows email, address and order help', async ({ page }) => {
  await open(page, 'contact.html');
  await expect(page.locator('main a[href="mailto:care.peppynose@gmail.com"]')).toBeVisible();
  await expect(page.locator('main')).toContainText('T-pet Road, Musiri 621211');
  await expect(page.locator('main a[href="https://www.amazon.in/gp/css/order-history"]')).toBeVisible();
  await expect(page.locator('main a[href="https://www.flipkart.com/account/orders"]')).toBeVisible();
});

for (const path of POLICY_PAGES) {
  test(`TC-CONTENT-04 ${path} explains marketplace orders and how to contact us`, async ({ page }) => {
    await open(page, path);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.page-head')).toContainText('Last updated:');
    const main = page.locator('main');
    await expect(main).toContainText('Amazon.in');
    await expect(main).toContainText('Flipkart');
    await expect(main.locator('a[href="mailto:care.peppynose@gmail.com"]')).toHaveCount(1);
  });
}

test('TC-CONTENT-05 returns and shipping pages say the marketplace policies apply', async ({ page }) => {
  await open(page, 'returns.html');
  await expect(page.locator('main')).toContainText('handled by Amazon.in or Flipkart under their own return and refund policies');
  await open(page, 'shipping.html');
  await expect(page.locator('main')).toContainText('Their shipping policies apply to your order');
});

test('TC-CONTENT-06 no leftover placeholder or removed text anywhere', async ({ page }) => {
  for (const path of [...PAGES, '404.html']) {
    await open(page, path);
    const text = await page.locator('body').innerText();
    for (const bad of ['mums', 'Draft', 'To be added', 'goes here', 'Ekta', 'Mitali', 'Verified 5★']) {
      expect(text, `${path}: ${bad}`).not.toContain(bad);
    }
  }
});
