// TC-SITE: checks that apply to every page.
const { test, expect } = require('@playwright/test');
const { PAGES, POLICY_PAGES, open } = require('./helpers');

for (const path of PAGES) {
  test.describe(path, () => {
    test('TC-SITE-01 page loads with a title and no script errors', async ({ page }) => {
      const { res, errors } = await open(page, path);
      expect(res.status()).toBe(200);
      await expect(page).toHaveTitle(/Peppynose/);
      expect(errors).toEqual([]);
    });

    test('TC-SITE-02 header has the 5 menu links and marks the current page', async ({ page }) => {
      await open(page, path);
      const links = page.locator('header nav a');
      await expect(links).toHaveText(['Home', 'Shop', 'About', 'FAQ', 'Contact']);
      if (!POLICY_PAGES.includes(path)) {
        await expect(page.locator(`header nav a[href="${path}"]`)).toHaveAttribute('aria-current', 'page');
      }
    });

    test('TC-SITE-03 footer has explore, policy, marketplace and contact links', async ({ page }) => {
      await open(page, path);
      const foot = page.locator('footer');
      for (const href of ['products.html', 'about.html', 'faq.html', 'contact.html', 'shipping.html', 'returns.html', 'privacy.html', 'terms.html']) {
        await expect(foot.locator(`a[href="${href}"]`)).toHaveCount(1);
      }
      await expect(foot.locator('a[href^="https://www.amazon.in/stores/Peppynose"]')).toHaveCount(1);
      await expect(foot.locator('a[href^="https://www.flipkart.com/"]')).toHaveCount(1);
      await expect(foot.locator('a[href="mailto:care.peppynose@gmail.com"]')).toHaveCount(1);
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
  await nav.locator('a', { hasText: 'Shop' }).click();
  await expect(page).toHaveURL(/products\.html$/);
});

test('TC-SITE-10 desktop menu is always visible', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop only');
  await open(page, 'index.html');
  await expect(page.locator('.menu-btn')).toBeHidden();
  await expect(page.locator('#nav')).toBeVisible();
});
