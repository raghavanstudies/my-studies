// Account features in the browser: checkout fills in the account, saved
// addresses, "Your orders", devices, and the optional tracker copy.
const { test, expect } = require('@playwright/test');

const password = 'horse-battery-99';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test.describe.configure({ mode: 'serial' });

// Signs up through the API (cookies land in this page's context) and fills the details.
async function signUp(page, username, email) {
  const r = await page.request.post('/api/auth/signup', { data: { username, password, confirm: password, stay: true } });
  expect(r.ok()).toBeTruthy();
  const { csrf } = await r.json();
  const p = await page.request.put('/api/auth/profile', { headers: { 'x-csrf-token': csrf }, data: { name: 'Account Amma', email, mobile: '' } });
  expect(p.ok()).toBeTruthy();
}

async function logIn(page, username) {
  const r = await page.request.post('/api/auth/login', { data: { identifier: username, password, stay: true } });
  expect(r.ok()).toBeTruthy();
}

test('checkout fills in the account, saves the address, and the order shows on the account page', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const username = `orders.${project}`, email = `orders.${project}@example.com`;
  await signUp(page, username, email);

  await page.goto('/shop/foam-mat.html');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('/shop/checkout.html');
  const f = page.locator('#checkout');
  await expect(f.locator('[name=name]')).toHaveValue('Account Amma');
  await expect(f.locator('[name=email]')).toHaveValue(email);
  await expect(page.locator('#saved-address')).toHaveCount(0);
  await expect(f.locator('[name=save_address]')).toBeChecked();
  await f.locator('[name=phone]').fill('9876543210');
  await f.locator('[name=address1]').fill('7 Temple Street');
  await f.locator('[name=city]').fill('Musiri');
  await f.locator('[name=pincode]').fill('621211');
  await f.locator('[name=state]').selectOption('Tamil Nadu');
  expect(await noSideScroll(page)).toBe(true);
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page).toHaveURL(/pay(\.html)?#o=o_/);
  await page.getByRole('button', { name: 'Pay (test: success)' }).click();
  await expect(page.locator('h1')).toHaveText('Thank you! Order confirmed');

  // The next checkout offers the saved address and fills it in.
  await page.goto('/shop/foam-mat.html');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('/shop/checkout.html');
  await expect(page.locator('#saved-address')).toBeVisible();
  await expect(f.locator('[name=address1]')).toHaveValue('7 Temple Street');
  await expect(f.locator('[name=state]')).toHaveValue('Tamil Nadu');
  await page.locator('#saved-address').selectOption('new');
  await expect(f.locator('[name=address1]')).toHaveValue('');
  await expect(f.locator('[name=name]')).toHaveValue('Account Amma');

  await page.goto('/account.html');
  const orders = page.locator('#my-orders');
  await expect(orders.locator('li')).toHaveCount(1);
  await expect(orders).toContainText('PN-');
  await expect(orders).toContainText('Paid');
  await expect(orders).toContainText('1 item');
  await expect(page.locator('#edit-details')).toHaveAttribute('href', /details\.html\?next=%2Faccount\.html/);
  expect(await noSideScroll(page)).toBe(true);
  await orders.getByRole('link', { name: 'View order' }).click();
  await expect(page.locator('h1')).toHaveText('Thank you! Order confirmed');

  await page.goto('/account.html');
  await page.locator('#edit-details').click();
  await expect(page).toHaveURL(/\/details(\.html)?\?next=/);
  await expect(page.locator('#details-form [name=name]')).toHaveValue('Account Amma');
  await page.locator('#details-form [name=name]').fill('Edited Amma');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/account(\.html)?$/);
  await expect(page.locator('#who')).toContainText('Edited Amma');
});

test('the account page lists each device and can log the others out', async ({ page, browser }, testInfo) => {
  const username = `devices.${testInfo.project.name}`;
  await signUp(page, username, `devices.${testInfo.project.name}@example.com`);
  const other = await browser.newContext({ userAgent: ANDROID });
  const phone = await other.newPage();
  await logIn(phone, username);

  await page.goto('/account.html');
  const devices = page.locator('#my-devices');
  await expect(devices.locator('li')).toHaveCount(2);
  await expect(devices).toContainText('This device');
  await expect(devices).toContainText('Chrome on Android');
  await page.locator('#logout-others').click();
  await expect(devices).toContainText('Other devices are logged out.');
  await expect(devices.locator('li')).toHaveCount(1);
  expect((await (await phone.request.get('/api/auth/me')).json()).user).toBeNull();
  expect((await (await page.request.get('/api/auth/me')).json()).user).not.toBeNull();
  await other.close();
});

function dueIn(days) {
  const d = new Date(Date.now() + days * 864e5);
  return d.toISOString().slice(0, 10);
}

test('the tracker is sent to the account only after opting in, and follows the account to another phone', async ({ page, browser }, testInfo) => {
  const username = `tracker.${testInfo.project.name}`;
  await page.goto('/pregnancy-tracker.html');
  await expect(page.locator('.trk-sync a')).toHaveAttribute('href', /login\.html\?next=%2Fpregnancy-tracker/);

  await signUp(page, username, `tracker.${testInfo.project.name}@example.com`);
  await page.goto('/pregnancy-tracker.html');
  await expect(page.locator('#trk-sync-start')).toBeVisible();
  await expect(page.locator('.privacy')).toContainText('Nothing is sent to Peppynose');
  await page.locator('#trk-date').fill(dueIn(120));
  await page.getByRole('button', { name: 'Show my week' }).click();
  await expect(page.locator('#trk-result')).toBeVisible();
  // Not opted in yet: the account has no copy, even after waiting for the sync timer.
  await page.waitForTimeout(3500);
  expect((await (await page.request.get('/api/account/tracker')).json()).data).toBeNull();

  await page.locator('#trk-sync-start').click();
  await expect(page.locator('.trk-sync [role=status]')).toHaveText('Saved to your account.');
  await expect(page.locator('.privacy')).toContainText('You chose to save your tracker');
  const saved = (await (await page.request.get('/api/account/tracker')).json()).data;
  expect(saved.preg.date).toBe(dueIn(120));

  // Another phone logged in to the same account gets the tracker.
  const other = await browser.newContext();
  const phone = await other.newPage();
  await logIn(phone, username);
  await phone.goto('/pregnancy-tracker.html');
  await expect(phone.locator('#trk-sync-stop')).toBeVisible();
  await expect(phone.locator('#trk-result')).toBeVisible();
  expect(JSON.parse(await phone.evaluate(() => localStorage.getItem('pn_preg'))).date).toBe(dueIn(120));

  // A change on that phone reaches the first one.
  await phone.locator('#r-change').click();
  await phone.locator('#trk-date').fill(dueIn(90));
  await phone.getByRole('button', { name: 'Show my week' }).click();
  await expect.poll(async () => (await (await phone.request.get('/api/account/tracker')).json()).data.preg.date, { timeout: 10000 }).toBe(dueIn(90));
  await page.reload();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pn_preg')).date), { timeout: 10000 }).toBe(dueIn(90));

  // Stopping deletes the account copy and every device shows the offer again.
  await phone.locator('#trk-sync-stop').click();
  await expect(phone.locator('.trk-sync [role=status]')).toContainText('this phone only');
  expect((await (await phone.request.get('/api/account/tracker')).json()).data).toBeNull();
  await page.reload();
  await expect(page.locator('#trk-sync-start')).toBeVisible();
  await expect(page.locator('.privacy')).toContainText('Nothing is sent to Peppynose');
  expect(await noSideScroll(page)).toBe(true);
  await other.close();
});
