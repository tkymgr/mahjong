import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:4175', headless: true, serviceWorkers: process.env.PLAYWRIGHT_PWA ? 'allow' : 'block' },
  webServer: {
    command: process.env.PLAYWRIGHT_PWA
      ? 'node tests/browser/fixtures/pwa-server.mjs --port 4175'
      : process.env.PLAYWRIGHT_PREVIEW
      ? 'npm run preview -- --port 4175 --strictPort'
      : 'npm start -- --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175'
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1100, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'landscape', use: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } }
  ]
});
