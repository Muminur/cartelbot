/**
 * E2E Test Authentication Helpers
 * Helper functions for authentication in E2E tests
 */

import { Page, expect } from '@playwright/test';
import { TEST_USERS, API_ROUTES, PAGE_ROUTES, TIMEOUTS } from '../fixtures/test-data';
import { getMagicLinkToken } from './database-helpers';

/**
 * Login as regular user using magic link
 * IMPLEMENTED: Uses database-backed magic link token retrieval
 */
export async function loginAsUser(page: Page, email: string = TEST_USERS.regular.email) {
  // Navigate to login page
  await page.goto(PAGE_ROUTES.LOGIN);

  // Fill email and submit
  await page.fill('#email', email);
  await page.click('button[type="submit"]');

  // Wait for success message
  await expect(page.locator('text=Check your email')).toBeVisible({ timeout: TIMEOUTS.SHORT });

  // FIXED: Add 500ms delay to allow database write to complete
  // The magic link API writes the token asynchronously, so we need to wait
  await page.waitForTimeout(500);

  // Retrieve magic link token from database
  const token = await getMagicLinkToken(email);

  if (!token) {
    throw new Error(`[Auth Helper] ✗ Failed to retrieve magic link token for ${email}`);
  }

  console.log(`[Auth Helper] ✓ Retrieved magic link token for ${email}`);

  // Navigate to verify page with token
  await page.goto(`${PAGE_ROUTES.VERIFY}?token=${token}`);

  // Wait for verification success
  await expect(page.locator('text=Success!')).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

  // Wait for redirect to dashboard
  await page.waitForURL(PAGE_ROUTES.DASHBOARD, { timeout: TIMEOUTS.SHORT });

  // Verify we're logged in
  await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: TIMEOUTS.SHORT });

  console.log(`[Auth Helper] ✓ Successfully logged in as ${email}`);
}

/**
 * Login as admin user
 */
export async function loginAsAdmin(page: Page) {
  const { username, password } = TEST_USERS.admin;

  // Navigate to admin login
  await page.goto(PAGE_ROUTES.ADMIN_LOGIN);

  // Fill credentials
  await page.fill('#username', username);
  await page.fill('#password', password);

  // Submit login form
  await page.click('button[type="submit"]');

  // Wait for redirect to admin dashboard
  await page.waitForURL(PAGE_ROUTES.ADMIN_DASHBOARD, { timeout: TIMEOUTS.SHORT });

  // Verify admin dashboard loads
  await expect(page.locator('h1:has-text("Admin Dashboard")')).toBeVisible({ timeout: TIMEOUTS.SHORT });
}

/**
 * Logout current user
 */
export async function logout(page: Page) {
  // Call logout API
  await page.evaluate(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
  });

  // Wait a moment for logout to complete
  await page.waitForTimeout(500);

  // Verify redirect to login
  await page.goto(PAGE_ROUTES.DASHBOARD);
  await page.waitForURL(PAGE_ROUTES.LOGIN, { timeout: TIMEOUTS.SHORT });
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const response = await page.evaluate(async () => {
    const res = await fetch('/api/auth/session');
    return res.ok;
  });

  return response;
}

/**
 * Wait for session to be established
 */
export async function waitForSession(page: Page) {
  await page.waitForFunction(
    async () => {
      const response = await fetch('/api/auth/session');
      return response.ok;
    },
    { timeout: TIMEOUTS.MEDIUM }
  );
}

/**
 * Setup API keys for test user (for trade execution tests)
 */
export async function setupUserApiKeys(page: Page) {
  const { apiKey, apiSecret, useTestnet } = TEST_USERS.regular;

  // Navigate to settings
  await page.goto(PAGE_ROUTES.SETTINGS);

  // Fill API keys
  await page.fill('input[placeholder*="API Key"]', apiKey);
  await page.fill('input[placeholder*="API Secret"]', apiSecret);

  // Set testnet toggle
  if (useTestnet) {
    const toggle = page.locator('button[role="switch"]');
    const isChecked = await toggle.getAttribute('aria-checked') === 'true';
    if (!isChecked) {
      await toggle.click();
    }
  }

  // Save API keys
  await page.click('button:has-text("Save API Keys")');

  // Wait for success message
  await expect(page.locator('text=API keys saved successfully')).toBeVisible({ timeout: TIMEOUTS.SHORT });
}
