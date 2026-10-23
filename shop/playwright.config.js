// Tests for the LOCAL test shop. Starts `wrangler dev --local` on a fresh local database.
const { defineConfig } = require('@playwright/test');
const PORT = 8787;
module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  workers: 1,               // one shared local database
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npm run build && npm run db:reset && npx wrangler dev --local --port ${PORT}`,
    url: `http://localhost:${PORT}/api/catalogue`,
    reuseExistingServer: false,
    timeout: 120000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
