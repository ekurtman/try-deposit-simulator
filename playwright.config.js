import { defineConfig, devices } from '@playwright/test';
const remote = process.env.BASE_URL;
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.js', fullyParallel: true, workers: 3,
  forbidOnly: !!process.env.CI, retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', {open:'never'}]],
  use: { baseURL: remote || 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: {width:1440,height:1000} } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: remote ? undefined : { command:'npm run dev',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI },
});
