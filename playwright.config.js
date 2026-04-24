// playwright.config.js — SabziTracker Production Test Suite
// Run: npx playwright test

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  // Test directories
  testDir:    './tests',
  testMatch:  ['**/integration/**/*.spec.js', '**/e2e/**/*.spec.js'],

  // Timeout per test (ms)
  timeout:        30_000,
  expect:         { timeout: 5_000 },

  // Run tests in parallel (safe — each test gets its own browser context)
  fullyParallel:  true,
  workers:        2,

  // Fail the run on any test failure
  forbidOnly:     !!process.env.CI,

  // Retry failed tests once in CI (flakiness guard for file:// protocol)
  retries:        process.env.CI ? 1 : 0,

  // Reporter
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-report/results.json' }]
  ],

  use: {
    // Base URL not needed (file:// protocol used in each test)
    headless:           true,
    screenshot:         'only-on-failure',
    video:              'retain-on-failure',
    trace:              'retain-on-failure',
    // Permissions needed for camera tests (scanner journey)
    permissions:        ['camera'],
    // Locale for ₹ formatting
    locale:             'en-IN',
    timezoneId:         'Asia/Kolkata',
  },

  projects: [
    // Primary: Chrome (production target)
    {
      name: 'chromium',
      use:  { ...devices['Desktop Chrome'] },
    },
    // Secondary: Firefox
    {
      name: 'firefox',
      use:  { ...devices['Desktop Firefox'] },
    },
    // Mobile: Android Chrome (key platform for invoice camera feature)
    {
      name: 'Mobile Chrome',
      use:  { ...devices['Pixel 5'] },
      // Skip download tests on mobile (Playwright limitation with file://)
      testIgnore: ['**/e2e/journeys.spec.js'],
    },
  ],

  // Global setup/teardown
  globalSetup:    './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js',
});
