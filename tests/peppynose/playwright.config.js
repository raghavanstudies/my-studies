// Playwright config for the Peppynose static site in ../../peppynose
const { defineConfig } = require('@playwright/test');

const PORT = 8766;

module.exports = defineConfig({
  testDir: './specs',
  timeout: 30000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory ../../peppynose`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
