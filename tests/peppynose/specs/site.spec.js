// TC-SITE: checks that apply to every page.
const { test, expect } = require('@playwright/test');
const { PAGES, POLICY_PAGES, open } = require('./helpers');
const ALL_PAGES = [...PAGES, '404.html'];

for (const path of ALL_PAGES) {
  test.describe(path, () => {
    test('TC-SITE-01 page loads with a title and no script errors', async ({ page }) => {
      const { res, errors } = await open(page, path);
      expect(res.status()).toBe(200);
      await expect(page).toHaveTitle(/Peppynose/);
      expect(errors).toEqual([]);
    });

    test('TC-SITE-02 header has the 6 menu links and marks the current page', async ({ page }) => {
      await open(page, path);
      const links = page.locator('header nav > a');
      await expect(links).toHaveText(['Home', 'Shop', 'About', 'FAQ', 'Pregnancy tracker', 'Contact']);
      if (!POLICY_PAGES.includes(path) && path !== '404.html') {
        await expect(page.locator(`header nav > a[href="${path}"]`)).toHaveAttribute('aria-current', 'page');
      }
    });

    test('TC-SITE-03 footer has explore, policy, marketplace and contact links', async ({ page }) => {
      await open(page, path);
      const foot = page.locator('footer');
      const root = path === '404.html' ? '/' : '';  // 404.html uses site-root paths
      for (const href of ['products.html', 'about.html', 'faq.html', 'contact.html', 'shipping.html', 'returns.html', 'privacy.html', 'terms.html']) {
        await expect(foot.locator(`a[href="${root}${href}"]`)).toHaveCount(1);
      }
      await expect(foot.locator('a[href^="https://www.amazon.in/stores/Peppynose"]')).toHaveCount(1);
      await expect(foot.locator('a[href^="https://www.flipkart.com/"]')).toHaveCount(1);
      await expect(foot.locator('a[href="mailto:care.peppynose@gmail.com"]')).toHaveCount(1);
      const insta = foot.locator('a[href="https://www.instagram.com/peppynose_toystore/"]');
      await expect(insta).toHaveText('Instagram');
      await expect(insta).toHaveAttribute('target', '_blank');
      await expect(insta).toHaveAttribute('rel', 'noopener');
      await expect(foot).toContainText('T-pet Road, Musiri 621211');
    });

    test('TC-SITE-04 every image loads (remote photos fall back to local ones)', async ({ page }) => {
      await open(page, path);
      // scroll through the page so lazy images load
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 30)); }
      });
      await page.waitForLoadState('networkidle');
      // wait until every image has finished (loaded or failed) before judging it
      await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 15000 });
      const broken = await page.$$eval('img', imgs => imgs
        .filter(i => !i.complete || i.naturalWidth === 0)
        .map(i => i.getAttribute('src')));
      expect(broken).toEqual([]);
    });

    test('TC-SITE-05 every local link and asset exists', async ({ page, request }) => {
      await open(page, path);
      const refs = await page.$$eval('[href], [src]', els => els.map(e => e.getAttribute('href') || e.getAttribute('src')));
      const local = [...new Set(refs.filter(r => r && !/^(https?:|mailto:|#|\?)/.test(r)).map(r => r.split('#')[0].split('?')[0]))];
      for (const ref of local) {
        const res = await request.get('/' + ref.replace(/^\//, ''));
        expect(res.status(), ref).toBe(200);
      }
    });

    test('TC-SITE-06 no sideways scrolling', async ({ page }) => {
      await open(page, path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('TC-SITE-07 marketplace links open in a new tab safely', async ({ page }) => {
      await open(page, path);
      const bad = await page.$$eval('a[href*="amazon.in"], a[href*="flipkart.com"]', as => as
        .filter(a => a.target !== '_blank' || !(a.rel || '').includes('noopener'))
        .map(a => a.href));
      expect(bad).toEqual([]);
    });

    test('TC-SITE-08 every image has alt text (only the decorative header logo may be empty)', async ({ page }) => {
      await open(page, path);
      const missing = await page.$$eval('img', imgs => imgs
        .filter(i => !i.hasAttribute('alt') || (i.getAttribute('alt') === '' && !i.closest('.brand')))
        .map(i => i.getAttribute('src')));
      expect(missing).toEqual([]);
    });
  });
}

test('TC-SITE-09 mobile menu opens and closes', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'menu button only shows on phones');
  await open(page, 'index.html');
  const nav = page.locator('#nav');
  const btn = page.locator('.menu-btn');
  await expect(btn).toBeVisible();
  await expect(nav).toBeHidden();
  await btn.click();
  await expect(nav).toBeVisible();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  // Escape closes it and keeps aria-expanded in sync
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  // tapping outside closes it
  await btn.click();
  await expect(nav).toBeVisible();
  // tap the lower part of the screen, below the open menu
  const vp = page.viewportSize();
  await page.mouse.click(vp.width / 2, vp.height - 40);
  await expect(nav).toBeHidden();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  // tapping the button again toggles it closed
  await btn.click();
  await btn.click();
  await expect(nav).toBeHidden();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  // tapping inside the menu follows the link
  await btn.click();
  await nav.locator('a', { hasText: 'Shop' }).click();
  await expect(page).toHaveURL(/products\.html$/);
});

test('TC-SITE-11 footer and "See all" links are at least 44 px tall on phones', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'tap targets are enlarged on phones only');
  await open(page, 'index.html');
  const heights = await page.$$eval('.foot a, .link-arrow', as => as.map(a => a.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(10);
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
});

test('TC-SITE-10 desktop menu is always visible', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop only');
  await open(page, 'index.html');
  await expect(page.locator('.menu-btn')).toBeHidden();
  await expect(page.locator('#nav')).toBeVisible();
});
