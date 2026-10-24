// Customer accounts against the local Worker (same server as the shop tests).
const { test, expect } = require('@playwright/test');

const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('sign up, header shows the name, log out, reject a bad password, log in, delete', async ({ page }, testInfo) => {
  const email = `parent.${testInfo.project.name}@example.com`;
  await page.goto('/signup.html?next=https://evil.example');
  await page.getByLabel('Name').fill('Test Amma');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('horse-battery-99');
  await page.getByRole('button', { name: 'Create account' }).click();
  // A next= URL that leaves the site is ignored.
  await expect(page).toHaveURL(/\/account(\.html)?$/);
  await expect(page.locator('#who')).toContainText('Test Amma');
  await expect(page.locator('#who')).toContainText(email);
  await expect(page.locator('header .pn-account')).toHaveText('Test Amma');
  expect(await noSideScroll(page)).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: 'Log out' }).first().click();
  await expect(page).toHaveURL(/\/login(\.html)?$/);
  await expect(page.locator('header .pn-account')).toHaveText('Log in');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('wrong-password-1');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('#err')).toHaveText('Wrong email or password.');

  await page.getByLabel('Password').fill('horse-battery-99');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/account(\.html)?$/);
  await expect(page.locator('header .pn-logout')).toHaveText('Log out');

  await page.locator('#account-in summary').click();
  await page.locator('#delete-form').getByLabel('Password').fill('horse-battery-99');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page).toHaveURL(/\/login(\.html)?\?deleted=1$/);
  await expect(page.locator('#deleted-note')).toContainText('deleted');
  await expect(page.locator('header .pn-account')).toHaveText('Log in');
});

test('Hindi and Tamil login pages and the header link do not overflow', async ({ page }) => {
  await page.goto('/hi/login.html');
  await expect(page.locator('h1')).toContainText('स्वागत');
  await expect(page.locator('header .pn-account')).toHaveText('लॉग इन');
  await expect(page.getByRole('button', { name: 'लॉग इन' })).toBeVisible();
  expect(await noSideScroll(page)).toBeLessThanOrEqual(1);

  await page.goto('/ta/signup.html');
  await expect(page.locator('h1')).toContainText('கணக்கை');
  await expect(page.locator('header .pn-account')).toHaveText('நுழை');
  expect(await noSideScroll(page)).toBeLessThanOrEqual(1);

  for (const path of ['/index.html', '/login.html', '/account.html', '/ta/index.html', '/hi/index.html']) {
    await page.goto(path);
    await expect(page.locator('header .pn-account')).toBeVisible();
    expect(await noSideScroll(page), path).toBeLessThanOrEqual(1);
  }
});
