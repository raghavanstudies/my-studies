// TC-SEO: search engine and link-sharing setup.
const { test, expect } = require('@playwright/test');
const { PAGES, SITE, open } = require('./helpers');

test('TC-SEO-01 every page has canonical, og and twitter tags pointing at its own URL', async ({ page }) => {
  for (const path of PAGES) {
    await open(page, path);
    const url = SITE + (path === 'index.html' ? '' : path);
    const meta = async sel => page.locator(sel).getAttribute('content');
    expect(await page.locator('link[rel="canonical"]').getAttribute('href'), path).toBe(url);
    expect(await meta('meta[property="og:url"]'), path).toBe(url);
    expect(await meta('meta[property="og:type"]'), path).toBe('website');
    expect(await meta('meta[name="twitter:card"]'), path).toBe('summary_large_image');
    expect(await meta('meta[property="og:image"]'), path).toBe(SITE + 'images/og-banner.jpg');
    expect(await meta('meta[property="og:title"]'), path).toBeTruthy();
    expect(await meta('meta[name="description"]'), path).toBeTruthy();
  }
});

test('TC-SEO-02 page titles and descriptions are unique', async ({ page }) => {
  const titles = new Set(), descs = new Set();
  for (const path of PAGES) {
    await open(page, path);
    titles.add(await page.title());
    descs.add(await page.locator('meta[name="description"]').getAttribute('content'));
  }
  expect(titles.size).toBe(PAGES.length);
  expect(descs.size).toBe(PAGES.length);
});

test('TC-SEO-03 sharing banner is a 1200x630 image', async ({ page }) => {
  await open(page, 'images/og-banner.jpg');
  const size = await page.evaluate(() => { const i = document.querySelector('img'); return [i.naturalWidth, i.naturalHeight]; });
  expect(size).toEqual([1200, 630]);
});

test('TC-SEO-04 robots.txt allows crawling and points to the sitemap', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain('User-agent: *');
  expect(body).toContain('Allow: /');
  expect(body).toContain('Sitemap: https://www.peppynose.com/sitemap.xml');
});

test('TC-SEO-05 sitemap lists all 9 pages and each one exists', async ({ request }) => {
  const res = await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  expect(locs.sort()).toEqual(PAGES.map(p => SITE + (p === 'index.html' ? '' : p)).sort());
  for (const loc of locs) {
    const local = '/' + (loc.replace(SITE, '') || 'index.html');
    expect((await request.get(local)).status(), loc).toBe(200);
  }
});

test('TC-SEO-06 404 page is styled, not indexed and links home', async ({ page, request }) => {
  expect((await request.get('/this-page-does-not-exist')).status()).toBe(404);
  const { res } = await open(page, '404.html');
  expect(res.status()).toBe(200);
  await expect(page.locator('h1')).toContainText('wandered off');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('main a', { hasText: 'Back to home' })).toHaveAttribute('href', '/');
  // assets use site-root paths so the page works at any missing URL
  await expect(page.locator('link[rel="stylesheet"][href="/styles.css"]')).toHaveCount(1);
  await page.locator('main a', { hasText: 'Back to home' }).click();
  await expect(page.locator('h1')).toContainText('little');
});
