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

async function expectOneGoogleSignIn(page) {
  await expect(page.locator('#google-slot')).toHaveAttribute('data-google', /^(gis|fallback)$/);
  const count = await page.evaluate(() => {
    const shown = el => {
      if (!el || el.hidden) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const box = el.getBoundingClientRect();
      return box.width > 1 && box.height > 1;
    };
    const fallback = document.getElementById('google-signin');
    const host = document.getElementById('google-btn');
    const official = host && host.querySelector('iframe, [role="button"]');
    return (shown(fallback) ? 1 : 0) + (shown(official) ? 1 : 0);
  });
  expect(count).toBe(1);
}

async function signUp(page, who, name = 'Test Amma') {
  await page.goto('/signup.html?next=' + encodeURIComponent('/account.html'));
  await page.getByLabel('Username', { exact: true }).fill(who.username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await expect(page.locator('#stay-logged-in')).toBeChecked();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/details(\.html)?/);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(who.email);
  await page.getByLabel(/Mobile number/).fill(who.mobile);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
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
  await expect(page).toHaveURL(homeUrl);
  await page.goto('/account.html');
  await logOut(page);

  await id.fill(who.spaced);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(homeUrl);
  await page.goto('/account.html');
  await expect(page.locator('#who-mobile')).toHaveText(who.mobile);
  await logOut(page);

  await id.fill(who.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(homeUrl);
  await expect(page.locator('header .pn-logout')).toHaveText('Log out');

  await page.goto('/account.html');
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
  await page.getByLabel('Username', { exact: true }).fill(who.username.toUpperCase());
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('#err')).toHaveText('That username is already taken.');
  await expect(page.locator('[data-for="username"]')).toHaveText('That username is already taken.');

  await page.locator('#auth-form input[name="username"]').fill(`other.${project}`);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/details(\.html)?/);
  await page.getByLabel('Name', { exact: true }).fill('Other Amma');
  await page.getByLabel('Email', { exact: true }).fill(`other.${project}@example.com`);
  await page.getByLabel(/Mobile number/).fill('+91 ' + who.mobile);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#err')).toHaveText('An account with this mobile number already exists.');
  await expect(page.locator('[data-for="mobile"]')).toHaveText('An account with this mobile number already exists.');
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

test('Hindi and Tamil login pages and the header link do not overflow', async ({ page }) => {
  await page.goto('/hi/login.html');
  await expect(page.locator('h1')).toHaveText('स्वागत है');
  await expect(page.getByLabel('उपयोगकर्ता नाम / मोबाइल नंबर / ईमेल')).toBeVisible();
  await expect(page.locator('header .pn-account')).toHaveText('लॉग इन');
  await expect(page.getByRole('button', { name: 'लॉग इन', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'लॉगिन छोड़ें' })).toBeVisible();
  await expect(page.locator('#stay-logged-in')).toBeChecked();
  await expect(page.locator('#google-signin')).toHaveText('Google से साइन इन करें');
  await expectOneGoogleSignIn(page);
  await expect(page.locator('#otp-request')).toHaveCount(0);
  expect(await noSideScroll(page)).toBeLessThanOrEqual(1);

  await page.goto('/ta/signup.html');
  await expect(page.locator('h1')).toContainText('கணக்கை');
  await expect(page.locator('header .pn-account')).toHaveText('நுழை');
  await expect(page.getByRole('button', { name: 'உள்நுழையாமல் தொடரவும்' })).toBeVisible();
  expect(await noSideScroll(page)).toBeLessThanOrEqual(1);

  await page.goto('/ta/login.html');
  await expect(page.getByLabel('பயனர் பெயர் / கைபேசி எண் / மின்னஞ்சல்')).toBeVisible();
  await expect(page.getByRole('button', { name: 'உள்நுழை', exact: true })).toBeVisible();
  await expect(page.locator('h1')).toHaveText('வரவேற்கிறோம்');
  await expectOneGoogleSignIn(page);
  await expect(page.locator('#otp-hint')).toHaveCount(0);
  await expect(page.locator('#stay-logged-in')).toBeChecked();
  expect(await noSideScroll(page)).toBeLessThanOrEqual(1);

  for (const path of ['/index.html', '/login.html', '/account.html', '/ta/index.html', '/hi/index.html']) {
    await page.goto(path);
    await expect(page.locator('header .pn-account')).toBeVisible();
    expect(await noSideScroll(page), path).toBeLessThanOrEqual(1);
  }
});

test('a first visit to the landing page opens login, and other pages do not', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page).toHaveURL(/\/login(\.html)?\?next=/);
  expect(decodeURIComponent(new URL(page.url()).searchParams.get('next'))).toBe('/index.html');
  await expect(page.locator('h1')).toHaveText('Welcome');
  await expect(page.locator('#stay-logged-in')).toBeChecked();
  await expect(page.locator('#google-slot')).toBeVisible();
  await expectOneGoogleSignIn(page);
  await expect(page.locator('#otp-request')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/one-time code|OTP/i);
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
  await expect(page.locator('#skip-login')).toBeVisible();
  await expect(page.locator('.auth-switch a')).toHaveAttribute('href', /signup\.html\?next=/);

  await page.goto('/');
  await expect(page).toHaveURL(/\/login(\.html)?\?next=/);

  await page.goto('/products.html');
  await expect(page).toHaveURL(/\/products(\.html)?$/);
  await expect(page.locator('h1')).toBeVisible();
});

test('Skip login returns to the landing page and stays there on reload', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login(\.html)?\?next=/);
  await page.locator('#skip-login').click();
  await expect(page).toHaveURL(homeUrl);
  await expect(page.locator('h1')).toContainText('little');
  await page.reload();
  await expect(page).toHaveURL(homeUrl);
  await expect(page.locator('h1')).toContainText('little');
  const guest = await page.evaluate(() => ({
    local: localStorage.getItem('pn_guest'),
    session: sessionStorage.getItem('pn_guest')
  }));
  expect(guest.local).toBe('1');
  expect(guest.session).toBe('1');
});

test('a first visit can sign up, must fill details, then stays on the home page', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await page.goto('/');
  await expect(page).toHaveURL(/\/login(\.html)?\?next=/);
  await expect(page.locator('h1')).toHaveText('Welcome');
  await expect(page.locator('#stay-logged-in')).toBeChecked();
  await expectOneGoogleSignIn(page);
  await expect(page.locator('#otp-request')).toHaveCount(0);
  const link = page.locator('.auth-switch a');
  await expect(link).toHaveAttribute('href', /signup\.html\?next=/);
  await link.click();
  await expect(page).toHaveURL(/\/signup(\.html)?\?next=/);
  await page.getByLabel('Username', { exact: true }).fill(`gate.${project}`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await expect(page.locator('#stay-logged-in')).toBeChecked();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/details(\.html)?\?next=/);
  await expect(page.locator('h1')).toContainText('details');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('[data-for="name"]')).not.toBeEmpty();
  await expect(page.locator('[data-for="email"]')).not.toBeEmpty();
  await page.locator('#details-form input[name="name"]').fill('Gate Amma');
  await page.locator('#details-form input[name="email"]').fill('not-an-email');
  await page.locator('#details-form input[name="mobile"]').fill('12345');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('[data-for="email"]')).toHaveText('Please enter a valid email.');
  await expect(page.locator('[data-for="mobile"]')).toHaveText('Enter a 10-digit Indian mobile number.');
  await page.locator('#details-form input[name="mobile"]').fill('');
  await page.locator('#details-form input[name="email"]').fill(`gate.${project}@example.com`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(homeUrl);
  await expect(page.locator('h1')).toContainText('little');
  await page.reload();
  await expect(page).toHaveURL(homeUrl);
  await expect(page.locator('h1')).toContainText('little');
});

test('a logged-in visitor sees the landing page, and logout shows login again', async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  const who = { username: `gate.${project}` };
  const loggedIn = await page.request.post('/api/auth/login', { data: { identifier: who.username, password } });
  expect(loggedIn.ok()).toBeTruthy();
  await page.goto('/index.html');
  await expect(page).toHaveURL(homeUrl);
  await expect(page.locator('h1')).toContainText('little');
  await page.reload();
  await expect(page).toHaveURL(homeUrl);

  await page.evaluate(() => {
    localStorage.removeItem('pn_logged_in');
    sessionStorage.removeItem('pn_logged_in');
    document.cookie = 'pn_logged_in=; Path=/; Max-Age=0; SameSite=Lax; Secure';
  });
  await page.goto('/index.html');
  await expect(page).toHaveURL(homeUrl);

  await logOut(page);
  await page.goto('/index.html');
  await expect(page).toHaveURL(/\/login(\.html)?\?next=/);
  await page.getByLabel('Username / mobile number / email').fill(who.username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(homeUrl);
});

test('Hindi and Tamil landing pages open their own login page', async ({ page }) => {
  await page.goto('/hi/');
  await expect(page).toHaveURL(/\/hi\/login(\.html)?\?next=/);
  expect(decodeURIComponent(new URL(page.url()).searchParams.get('next'))).toBe('/hi/index.html');
  await page.getByRole('button', { name: 'लॉगिन छोड़ें' }).click();
  await expect(page).toHaveURL(/\/hi\/(index(\.html)?)?$/);
  await page.reload();
  await expect(page.locator('h1')).toContainText('पड़ाव');

  await page.evaluate(() => {
    localStorage.removeItem('pn_guest');
    sessionStorage.removeItem('pn_guest');
    document.cookie = 'pn_guest=; Path=/; Max-Age=0; SameSite=Lax; Secure';
  });
  await page.goto('/ta/index.html');
  await expect(page).toHaveURL(/\/ta\/login(\.html)?\?next=/);
  expect(decodeURIComponent(new URL(page.url()).searchParams.get('next'))).toBe('/ta/index.html');
  await page.getByRole('button', { name: 'உள்நுழையாமல் தொடரவும்' }).click();
  await expect(page).toHaveURL(/\/ta\/(index(\.html)?)?$/);
  await expect(page.locator('h1')).toContainText('கட்டத்திலும்');
});

test('a search crawler stays on the English landing page', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
  });
  const page = await context.newPage();
  await page.goto('/index.html');
  await expect(page).toHaveURL(homeUrl);
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator('h1')).toContainText('little');
  await context.close();
});
