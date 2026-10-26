// Customer accounts against the local Worker (same server as the shop tests).
const { test, expect } = require('@playwright/test');

const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const password = 'horse-battery-99';

function person(project) {
  const mobile = project === 'mobile' ? '9123456780' : '9876543210';
  return {
    email: `parent.${project}@example.com`,
    username: `parent.${project}`,
    mobile,
    spaced: `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`
  };
}

const homeUrl = /\/$|\/index(\.html)?$/;

async function signUp(page, who, name = 'Test Amma') {
  await page.goto('/signup.html?next=https://evil.example');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Username', { exact: true }).fill(who.username);
  await page.getByLabel('Mobile number', { exact: true }).fill(who.mobile);
  await page.getByLabel('Email', { exact: true }).fill(who.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
}

async function logOut(page) {
  await page.getByRole('button', { name: 'Log out' }).first().click();
  await expect(page).toHaveURL(/\/login(\.html)?$/);
}

test('sign up, header shows the name, log in each way, reject a bad password, delete', async ({ page }, testInfo) => {
  const who = person(testInfo.project.name);
  await signUp(page, who);
  await expect(page).toHaveURL(/\/account(\.html)?$/);
  await expect(page.locator('#who')).toContainText('Test Amma');
  await expect(page.locator('#who-username')).toHaveText(who.username);
  await expect(page.locator('#who-mobile')).toHaveText(who.mobile);
  await expect(page.locator('#who-email')).toHaveText(who.email);
  await expect(page.locator('header .pn-account')).toHaveText('Test Amma');
  expect(await noSideScroll(page)).toBeLessThanOrEqual(1);

  await logOut(page);
  await expect(page.locator('header .pn-account')).toHaveText('Log in');

  const id = page.getByLabel('Username / mobile number / email');
  await id.fill(who.email);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password-1');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.locator('#err')).toHaveText('Invalid credentials.');

  await id.fill(who.username.toUpperCase());
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/account(\.html)?$/);
  await logOut(page);

  await id.fill(who.spaced);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/account(\.html)?$/);
  await expect(page.locator('#who-mobile')).toHaveText(who.mobile);
  await logOut(page);

  await id.fill(who.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/account(\.html)?$/);
  await expect(page.locator('header .pn-logout')).toHaveText('Log out');

  await page.locator('#account-in summary').click();
  await page.locator('#delete-form').getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page).toHaveURL(/\/login(\.html)?\?deleted=1$/);
  await expect(page.locator('#deleted-note')).toContainText('deleted');
  await expect(page.locator('header .pn-account')).toHaveText('Log in');
});

test('duplicate username and mobile are explained on the sign-up form', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const who = {
    email: `dup.${project}@example.com`,
    username: `dup.${project}`,
    mobile: project === 'mobile' ? '9000000002' : '9000000001'
  };
  await signUp(page, who, 'Dup Amma');
  await expect(page).toHaveURL(/\/account(\.html)?$/);
  await page.goto('/signup.html');
  await page.getByLabel('Name', { exact: true }).fill('Other Amma');
  await page.getByLabel('Username', { exact: true }).fill(who.username.toUpperCase());
  await page.getByLabel('Mobile number', { exact: true }).fill(project === 'mobile' ? '9000000012' : '9000000011');
  await page.getByLabel('Email', { exact: true }).fill(`other.${project}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('#err')).toHaveText('That username is already taken.');
  await expect(page.locator('[data-for="username"]')).toHaveText('That username is already taken.');

  await page.getByLabel('Username').fill(`other.${project}`);
  await page.getByLabel('Mobile number').fill('+91 ' + who.mobile);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('#err')).toHaveText('An account with this mobile number already exists.');
  await expect(page.locator('[data-for="mobile"]')).toHaveText('An account with this mobile number already exists.');
});

test('OTP button follows the identifier, then a mobile code and an email code log in', async ({ page }, testInfo) => {
  const ready = page.waitForResponse(r => r.url().includes('/api/auth/config') && r.request().method() === 'GET');
  await page.goto('/login.html');
  await ready;
  const otp = page.getByRole('button', { name: 'Log in with OTP' });
  const id = page.getByLabel('Username / mobile number / email');
  await expect(otp).toBeDisabled();
  await id.fill('ada_amma');
  await expect(otp).toBeDisabled();
  await expect(page.locator('#otp-hint')).toBeVisible();
  await expect(page.locator('#otp-hint')).toContainText('mobile number or email');
  await id.fill('98765 43210');
  await expect(otp).toBeEnabled();
  await expect(page.locator('#otp-hint')).toBeHidden();
  await id.fill('ada@example.com');
  await expect(otp).toBeEnabled();

  const project = testInfo.project.name;
  const who = {
    email: `otp.${project}@example.com`,
    username: `otp.${project}`,
    mobile: project === 'mobile' ? '9345678901' : '9234567890'
  };
  await signUp(page, who, 'Otp Amma');
  await expect(page).toHaveURL(/\/account(\.html)?$/);
  await logOut(page);
  await page.clock.install();

  await id.fill(`+91 ${who.mobile.slice(0, 5)} ${who.mobile.slice(5)}`);
  await expect(otp).toBeEnabled();
  const requested = page.waitForResponse(r => r.url().includes('/api/auth/otp/request') && r.request().method() === 'POST');
  await otp.click();
  const first = await (await requested).json();
  await expect(page.locator('#otp-panel')).toBeVisible();
  await expect(page.locator('#otp-sent')).toContainText('If an account exists, we sent a code.');
  const resend = page.locator('#otp-resend');
  await expect(resend).toBeDisabled();
  await page.locator('#otp-code').fill('000000');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('#err')).toHaveText('That code is wrong or has expired.');

  await page.clock.runFor(31_000);
  await expect(resend).toBeEnabled();
  const resent = page.waitForResponse(r => r.url().includes('/api/auth/otp/request') && r.request().method() === 'POST');
  await resend.click();
  const second = await (await resent).json();
  expect(second.dev_code).toMatch(/^\d{6}$/);
  expect(second.dev_code).not.toBe(first.dev_code);
  await page.locator('#otp-code').fill(first.dev_code);
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('#err')).toHaveText('That code is wrong or has expired.');
  await page.locator('#otp-code').fill(second.dev_code);
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page).toHaveURL(/\/account(\.html)?$/);
  await expect(page.locator('#who-mobile')).toHaveText(who.mobile);

  await logOut(page);
  await id.fill(who.email.toUpperCase());
  const emailed = page.waitForResponse(r => r.url().includes('/api/auth/otp/request') && r.request().method() === 'POST');
  await otp.click();
  const emailCode = await (await emailed).json();
  await page.locator('#otp-code').fill(emailCode.dev_code);
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page).toHaveURL(/\/account(\.html)?$/);
  await expect(page.locator('#who-email')).toHaveText(who.email);
});

test('Skip login is smaller than Log in, returns to a safe page, and still allows the cart', async ({ page }) => {
  await page.goto('/login.html');
  const primary = page.locator('#auth-form button[type="submit"]');
  const skip = page.locator('#skip-login');
  await expect(skip).toBeVisible();
  await expect(skip).toBeEnabled();
  const box = el => el.evaluate(node => {
    const r = node.getBoundingClientRect();
    return { w: r.width, h: r.height, font: parseFloat(getComputedStyle(node).fontSize) };
  });
  const p = await box(primary);
  const s = await box(skip);
  expect(s.w).toBeLessThan(p.w * 0.75);
  expect(s.font).toBeLessThan(p.font);
  expect(s.h).toBeGreaterThanOrEqual(44);

  await skip.click();
  await expect(page).toHaveURL(homeUrl);
  await expect(page.locator('header .pn-account')).toHaveText('Log in');
  const guest = await page.evaluate(() => ({
    local: localStorage.getItem('pn_guest'),
    session: sessionStorage.getItem('pn_guest'),
    cookie: document.cookie
  }));
  expect(guest.local).toBe('1');
  expect(guest.session).toBe('1');
  expect(guest.cookie).toContain('pn_guest=1');

  await page.goto('/login.html?returnTo=/products.html');
  await page.locator('#skip-login').click();
  await expect(page).toHaveURL(/\/products(\.html)?$/);

  await page.goto('/login.html?next=https://evil.example');
  await page.locator('#skip-login').click();
  await expect(page).toHaveURL(homeUrl);
  expect(page.url()).not.toContain('evil');

  await page.goto('/login.html?next=//evil.example');
  await page.locator('#skip-login').click();
  await expect(page).toHaveURL(homeUrl);

  await page.goto('/login.html?next=' + encodeURIComponent('/%2F%2Fevil.example'));
  await page.locator('#skip-login').click();
  await expect(page).toHaveURL(homeUrl);
  expect(page.url()).not.toContain('evil');

  await page.goto('/signup.html');
  await expect(page.locator('#skip-login')).toBeVisible();
  const create = await box(page.locator('#auth-form button[type="submit"]'));
  const skipSign = await box(page.locator('#skip-login'));
  expect(skipSign.w).toBeLessThan(create.w * 0.75);

  await page.goto('/shop/baby-on-board-sign.html');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.locator('#added')).toContainText('Added to your cart');
  await page.goto('/shop/cart.html');
  await expect(page.locator('.sh-line')).toHaveCount(1);
  await expect(page.locator('header .pn-account')).toHaveText('Log in');
});

test('OTP button steps aside when code login is off', async ({ page }) => {
  await page.route('**/api/auth/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ otp: false })
  }));
  await page.goto('/login.html');
  await expect(page.locator('#otp-request')).toBeHidden();
  await expect(page.locator('#otp-hint')).toHaveText('Code login is coming soon.');
  await page.getByLabel('Username / mobile number / email').fill('9876543210');
  await expect(page.locator('#otp-request')).toBeHidden();
  await expect(page.locator('#otp-panel')).toBeHidden();
});

test('Hindi and Tamil login pages and the header link do not overflow', async ({ page }) => {
  await page.goto('/hi/login.html');
  await expect(page.locator('h1')).toContainText('स्वागत');
  await expect(page.getByLabel('उपयोगकर्ता नाम / मोबाइल नंबर / ईमेल')).toBeVisible();
  await expect(page.locator('header .pn-account')).toHaveText('लॉग इन');
  await expect(page.getByRole('button', { name: 'लॉग इन', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'लॉगिन छोड़ें' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'OTP से लॉग इन करें' })).toBeDisabled();
  expect(await noSideScroll(page)).toBeLessThanOrEqual(1);

  await page.goto('/ta/signup.html');
  await expect(page.locator('h1')).toContainText('கணக்கை');
  await expect(page.locator('header .pn-account')).toHaveText('நுழை');
  await expect(page.getByRole('button', { name: 'உள்நுழையாமல் தொடரவும்' })).toBeVisible();
  expect(await noSideScroll(page)).toBeLessThanOrEqual(1);

  await page.goto('/ta/login.html');
  await expect(page.getByLabel('பயனர் பெயர் / கைபேசி எண் / மின்னஞ்சல்')).toBeVisible();
  await expect(page.getByRole('button', { name: 'உள்நுழை', exact: true })).toBeVisible();
  await expect(page.locator('#otp-hint')).toContainText('கைபேசி');
  expect(await noSideScroll(page)).toBeLessThanOrEqual(1);

  for (const path of ['/index.html', '/login.html', '/account.html', '/ta/index.html', '/hi/index.html']) {
    await page.goto(path);
    await expect(page.locator('header .pn-account')).toBeVisible();
    expect(await noSideScroll(page), path).toBeLessThanOrEqual(1);
  }
});
