// TC-HOME: the landing page.
const { test, expect } = require('@playwright/test');
const { open } = require('./helpers');

test.beforeEach(async ({ page }) => { await open(page, 'index.html'); });

test('TC-HOME-01 hero shows the heading, rating and both store buttons', async ({ page }) => {
  await expect(page.locator('.hero2 h1')).toHaveText(/With you at every\s*little stage\./);
  await expect(page.locator('.hero2 a.btn.amazon')).toHaveAttribute('href', /amazon\.in\/stores\/Peppynose/);
  await expect(page.locator('.hero2 a.btn.flipkart')).toHaveAttribute('href', /flipkart\.com\/search\?q=peppynose/);
  await expect(page.locator('.hero2 .proof')).toContainText('4.4/5 from 140 ratings on Amazon.in');
  await expect(page.locator('.announce')).toContainText('4.4 out of 5');
});

test('TC-HOME-02 hero image and Mom on Board card are shown', async ({ page }) => {
  const hero = page.locator('.hero3-art > img');
  await expect(hero).toHaveAttribute('src', 'images/hero-family.webp');
  expect(await hero.evaluate(i => i.naturalWidth)).toBeGreaterThan(0);
  const card = page.locator('.fc3');
  await expect(card).toContainText('Mom on Board sign');
  await expect(card).toContainText('₹249 on Amazon.in');
  await expect(card).toHaveAttribute('href', 'https://www.amazon.in/dp/B0GVZFQ2Y5');
});

test('TC-HOME-03 banner says "Verified 4★ & 5★ reviews"', async ({ page }) => {
  const track = page.locator('.marquee .track');
  await expect(track).toContainText('Verified 4★ & 5★ reviews');
  await expect(track).not.toContainText('Verified 5★ reviews');
});

test('TC-HOME-04 only the two verified reviews show, with correct stars', async ({ page }) => {
  const reviews = page.locator('.reviews.two .feature-review');
  await expect(reviews).toHaveCount(2);
  await expect(reviews.nth(0)).toContainText('Bhaskar');
  await expect(reviews.nth(0).locator('.stars')).toHaveText('★★★★★');
  await expect(reviews.nth(0)).toContainText('Verified purchase · Amazon.in');
  await expect(reviews.nth(1)).toContainText('Pratik Kamble');
  await expect(reviews.nth(1).locator('.stars')).toHaveText('★★★★☆');
  await expect(reviews.nth(1).locator('.stars')).toHaveAttribute('aria-label', '4 out of 5 stars');
  await expect(reviews.nth(1)).toContainText('Verified purchase · Flipkart');
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('Ekta');
  expect(body).not.toContain('Mitali');
});

test('TC-HOME-05 shop-by-age tiles open the shop already filtered', async ({ page }) => {
  const tiles = page.locator('.agegrid-p a');
  await expect(tiles).toHaveCount(5);
  const hrefs = await tiles.evaluateAll(as => as.map(a => a.getAttribute('href')));
  expect(hrefs).toEqual(['pregnancy', 'newborn', 'months3', 'crawling', 'kids'].map(a => `products.html?age=${a}`));
  await tiles.filter({ hasText: 'Crawling babies' }).click();
  await expect(page).toHaveURL(/products\.html\?age=crawling/);
  await expect(page.locator('.agebtn.on')).toHaveText('Knee pads · 1–3 yrs');
  await expect(page.locator('.card:visible')).toHaveCount(5);
});

test('TC-HOME-06 stage sections show products with a price on each marketplace button', async ({ page }) => {
  await expect(page.locator('.stage')).toHaveCount(4);
  const bob = page.locator('.mini', { hasText: 'Baby on Board & Bump on Board Sign' });
  await expect(bob.locator('a.amazon')).toContainText('₹249');
  await expect(bob.locator('a.flipkart')).toContainText('₹239');
  const mob = page.locator('.mini', { hasText: 'Mom on Board & Baby on Board Sign' });
  await expect(mob.locator('a.amazon')).toContainText('₹249');
  await expect(mob.locator('a.flipkart')).toContainText('₹239');
  const knee = page.locator('.mini', { hasText: 'Blue Smiley' });
  await expect(knee.locator('a.flipkart')).toContainText('Check price');
});

test('TC-HOME-07 best sellers show 4 products with buy buttons', async ({ page }) => {
  const cards = page.locator('.tint .grid .card');
  await expect(cards).toHaveCount(4);
  for (let i = 0; i < 4; i++) await expect(cards.nth(i).locator('a.btn.amazon')).toHaveCount(1);
});

test('TC-HOME-08 product thumbnails have descriptive alt text', async ({ page }) => {
  const alts = await page.$$eval('.mini img, .fc3 img, .stage-ph img', imgs => imgs.map(i => i.alt));
  expect(alts.length).toBeGreaterThan(0);
  for (const alt of alts) expect(alt.length).toBeGreaterThan(5);
});
