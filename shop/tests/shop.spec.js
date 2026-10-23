// TC-SHOP-xx: local test shop (wrangler dev --local + D1). Run: npm test
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const VARS = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.dev.vars'), 'utf8').trim().split('\n').map(l => l.split(/=(.*)/s).slice(0, 2)));
const ADMIN = { 'x-pn-admin': '1' };
const CUST = { name: 'Test Amma', phone: '9876543210', email: 'test@example.com', address1: '12 Main Street', address2: 'Near temple', city: 'Musiri', pincode: '621211', state: 'Tamil Nadu' };

async function adminLogin(request) {
  const r = await request.post('/api/admin/login', { headers: ADMIN, data: { password: VARS.ADMIN_PASSWORD } });
  expect(r.status()).toBe(200);
}
async function setVariant(request, sku, price, stock) {
  const r = await request.post('/api/admin/variant', { headers: ADMIN, data: { sku, price, stock } });
  expect(r.status()).toBe(200);
}
async function order(request, items, customer = CUST) {
  const r = await request.post('/api/checkout', { data: { items, customer } });
  return { status: r.status(), body: await r.json() };
}
const pay = (request, o, outcome = 'success') => request.post('/api/pay/mock', { data: { order: o.order, token: o.token, outcome } }).then(r => r.json());
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test.describe.configure({ mode: 'serial' });

test('TC-SHOP-01 live site files are not changed; only the local copy gets "Buy from Peppynose"', async ({ page }) => {
  const live = fs.readFileSync(path.join(__dirname, '..', '..', 'peppynose', 'products.html'), 'utf8');
  expect(live).not.toContain('sh-direct');
  expect(fs.existsSync(path.join(__dirname, '..', '..', 'peppynose', 'shop'))).toBe(false);
  await page.goto('/products.html');
  await expect(page.locator('a.sh-direct')).toHaveCount(13);
  await page.locator('a.sh-direct').first().click();
  await expect(page).toHaveURL(/\/shop\/baby-on-board-sign/);
  await expect(page.locator('h1')).toContainText('Baby on Board');
});

test('TC-SHOP-02 shop home lists all 13 products with prices, noindex and test banner', async ({ page }) => {
  await page.goto('/shop/');
  await expect(page.locator('.sh-card')).toHaveCount(13);
  await expect(page.locator('[data-from="teether-gift-set"]')).toHaveText('₹649');
  await expect(page.locator('.shop-test')).toContainText('Test shop');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  expect(await noSideScroll(page)).toBe(true);
});

test('TC-SHOP-03 add to cart, change quantity, delivery fee below ₹499 and free above', async ({ page }) => {
  await page.goto('/shop/baby-on-board-sign.html');
  await expect(page.locator('#stock-note')).toContainText('In stock');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.locator('#added')).toContainText('Added to your cart');
  await page.goto('/shop/cart.html');
  await expect(page.locator('.sh-line')).toHaveCount(1);
  await expect(page.locator('.sh-summary')).toContainText('₹49');
  await expect(page.locator('.sh-grand')).toContainText('₹298');
  await page.getByRole('button', { name: /One more/ }).click();
  await expect(page.locator('.sh-grand')).toContainText('₹547');     // 2 × ₹249 = ₹498, under ₹499 → + ₹49
  await expect(page.locator('.sh-summary')).toContainText('Free delivery on orders of ₹499');
  await page.getByRole('button', { name: /One more/ }).click();
  await expect(page.locator('.sh-grand')).toContainText('₹747');     // 3 × ₹249, free delivery
  await expect(page.locator('.sh-summary')).toContainText('Free');
  await page.getByRole('button', { name: /Remove/ }).click();
  await expect(page.locator('#cart')).toContainText('Your cart is empty');
  expect(await noSideScroll(page)).toBe(true);
});

test('TC-SHOP-04 checkout shows clear errors for a wrong phone and PIN', async ({ page }) => {
  await page.goto('/shop/foam-mat.html');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('/shop/checkout.html');
  await expect(page.locator('#summary')).toContainText('Foam');
  const f = page.locator('#checkout');
  await f.locator('[name=name]').fill('Test Amma');
  await f.locator('[name=phone]').fill('12345');
  await f.locator('[name=email]').fill('test@example.com');
  await f.locator('[name=address1]').fill('12 Main Street');
  await f.locator('[name=city]').fill('Musiri');
  await f.locator('[name=pincode]').fill('0123');
  await f.locator('[name=state]').selectOption('Tamil Nadu');
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page.locator('#e-phone')).toContainText('10-digit');
  await expect(page.locator('#e-pincode')).toContainText('6-digit');
  await expect(f.locator('[name=phone]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/checkout/);
  expect(await noSideScroll(page)).toBe(true);
});

test('TC-SHOP-05 full order: checkout → test payment → confirmed → GST invoice (Tamil Nadu: CGST + SGST)', async ({ page }) => {
  await page.goto('/shop/knee-pads-blue-smiley.html');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('/shop/checkout.html');
  const f = page.locator('#checkout');
  for (const k of ['name', 'phone', 'email', 'address1', 'address2', 'city', 'pincode']) await f.locator(`[name=${k}]`).fill(CUST[k]);
  await f.locator('[name=state]').selectOption('Tamil Nadu');
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page).toHaveURL(/pay(\.html)?#o=o_/);
  await expect(page.locator('#pay-amount')).toContainText('₹228');   // ₹179 + ₹49 delivery
  await page.getByRole('button', { name: 'Pay (test: success)' }).click();
  await expect(page).toHaveURL(/order(\.html)?#o=o_/);
  await expect(page.locator('h1')).toHaveText('Thank you! Order confirmed');
  expect(await page.evaluate(() => localStorage.getItem('pn_cart'))).toBe('[]');
  const [inv] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name: 'View invoice' }).click()]);
  await expect(inv.locator('body')).toContainText('TEST INVOICE');
  await expect(inv.locator('thead')).toContainText('CGST');
  await expect(inv.locator('thead')).toContainText('SGST');
  await expect(inv.locator('tfoot')).toContainText('₹228.00');
});

test('TC-SHOP-06 other state gets IGST; invoice only after payment', async ({ request }) => {
  const o = (await order(request, [{ sku: 'foam-mat-1', qty: 1 }], { ...CUST, state: 'Karnataka', pincode: '560001', city: 'Bengaluru' })).body;
  let r = await request.get(`/api/invoice?o=${o.order}&t=${o.token}`);
  expect(r.status()).toBe(404);
  await pay(request, o);
  r = await request.get(`/api/invoice?o=${o.order}&t=${o.token}`);
  const html = await r.text();
  expect(html).toContain('IGST');
  expect(html).not.toContain('CGST');
});

test('TC-SHOP-07 failed payment can be retried', async ({ page, request }) => {
  const o = (await order(request, [{ sku: 'lcd-tablet-blue-1', qty: 1 }])).body;
  await page.goto(`/shop/pay.html#o=${o.order}&t=${o.token}`);
  await page.getByRole('button', { name: 'Test: payment fails' }).click();
  await expect(page.locator('h1')).toHaveText('Payment did not go through');
  await page.getByRole('link', { name: 'Pay now' }).click();
  await page.getByRole('button', { name: 'Pay (test: success)' }).click();
  await expect(page.locator('h1')).toHaveText('Thank you! Order confirmed');
});

test('TC-SHOP-08 server ignores prices sent by the browser and rejects bad quantities', async ({ request }) => {
  const r = await request.post('/api/checkout', { data: { items: [{ sku: 'teether-gift-set-1', qty: 1, price: 100 }], customer: CUST, total: 100 } });
  expect((await r.json()).total).toBe(64900);
  expect((await order(request, [{ sku: 'teether-gift-set-1', qty: 11 }])).status).toBe(400);
  expect((await order(request, [{ sku: 'teether-gift-set-1', qty: 0 }])).status).toBe(400);
  expect((await order(request, [{ sku: 'no-such-thing', qty: 1 }])).status).toBe(409);
  expect((await request.post('/api/checkout', { headers: { 'content-type': 'text/plain' }, data: '{}' })).status()).toBe(415);
});

test('TC-SHOP-09 order link needs the secret token; paying twice takes stock once', async ({ request }) => {
  await adminLogin(request);
  await setVariant(request, 'wooden-kitchen-set-1', 39900, 5);
  const o = (await order(request, [{ sku: 'wooden-kitchen-set-1', qty: 2 }])).body;
  expect((await request.get(`/api/order?o=${o.order}&t=${'0'.repeat(48)}`)).status()).toBe(404);
  expect((await pay(request, o)).status).toBe('paid');
  expect((await pay(request, o)).status).toBe('paid');
  const p = await (await request.get('/api/admin/products', { headers: ADMIN })).json();
  const v = p.products.flatMap(x => x.variants).find(x => x.sku === 'wooden-kitchen-set-1');
  expect(v.stock).toBe(3);
});

test('TC-SHOP-10 last item bought twice at once: second paid order goes to "paid_review", stock never below 0', async ({ request }) => {
  await adminLogin(request);
  await setVariant(request, 'teether-fish-bird-1', 29900, 1);
  const a = (await order(request, [{ sku: 'teether-fish-bird-1', qty: 1 }])).body;
  const b = (await order(request, [{ sku: 'teether-fish-bird-1', qty: 1 }])).body;   // both pass checkout: stock is 1 for each
  expect((await pay(request, a)).status).toBe('paid');
  expect((await pay(request, b)).status).toBe('paid_review');
  const p = await (await request.get('/api/admin/products', { headers: ADMIN })).json();
  expect(p.products.flatMap(x => x.variants).find(x => x.sku === 'teether-fish-bird-1').stock).toBe(0);
  expect((await order(request, [{ sku: 'teether-fish-bird-1', qty: 1 }])).status).toBe(409);
  await setVariant(request, 'teether-fish-bird-1', 29900, 25);
});

test('TC-SHOP-11 admin API is locked: header and login needed, wrong password refused', async ({ request }) => {
  expect((await request.get('/api/admin/orders')).status()).toBe(403);
  expect((await request.get('/api/admin/orders', { headers: ADMIN })).status()).toBe(401);
  expect((await request.post('/api/admin/login', { headers: ADMIN, data: { password: 'wrong-password' } })).status()).toBe(401);
});

test('TC-SHOP-12 admin: log in, pack and ship an order with tracking, see the email, edit a price', async ({ page, request }) => {
  const o = (await order(request, [{ sku: 'teether-car-cloud-1', qty: 1 }])).body;
  await pay(request, o);
  await page.goto('/shop/admin.html');
  await page.getByLabel('Admin password').fill('not-the-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('#login-err')).toHaveText('Wrong password.');
  await page.getByLabel('Admin password').fill(VARS.ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('#login')).toBeHidden();
  await page.getByRole('button', { name: o.number }).click();
  await page.getByRole('button', { name: 'Mark as packed' }).click();
  await expect(page.locator('.sh-card-admin h2')).toContainText('packed');
  await page.getByRole('button', { name: 'Mark as shipped' }).click();
  await expect(page.locator('#adm-status-err')).toContainText('tracking number');
  await page.getByLabel(/Tracking number/).fill('DTDC123456789');
  await page.getByRole('button', { name: 'Mark as shipped' }).click();
  await expect(page.locator('.sh-card-admin h2')).toContainText('shipped');
  await page.getByRole('tab', { name: 'Messages' }).click();
  await expect(page.locator('.sh-msg').first()).toContainText(`${o.number} is on the way`);
  await page.getByRole('tab', { name: 'Prices & stock' }).click();
  const row = page.locator('tr[data-sku="mom-on-board-sign-1"]');
  await row.locator('[name=price]').fill('259');
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(row.locator('.sh-saved')).toHaveText('Saved');
  const cust = await page.context().newPage();
  await cust.goto('/shop/mom-on-board-sign.html');
  await expect(cust.locator('[data-price="mom-on-board-sign-1"]')).toHaveText('₹259');
  await cust.close();
  await setVariant(page.request, 'mom-on-board-sign-1', 24900, 25);
  // the customer's page shows the tracking number
  await page.goto(`/shop/order.html#o=${o.order}&t=${o.token}`);
  await expect(page.locator('h1')).toHaveText('Shipped');
  await expect(page.locator('#order')).toContainText('DTDC123456789');
});

test('TC-SHOP-13 no sideways scroll on product, checkout, order and admin pages', async ({ page }) => {
  for (const p of ['/shop/teether-gift-set.html', '/shop/checkout.html', '/shop/pay.html', '/shop/admin.html']) {
    await page.goto(p);
    await page.waitForLoadState('networkidle');
    expect(await noSideScroll(page), p).toBe(true);
  }
});
