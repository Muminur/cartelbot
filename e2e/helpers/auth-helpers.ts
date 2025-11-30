/**
 * E2E Test Authentication Helpers
 * Helper functions for authentication in E2E tests
 */

import { Page, expect } from '@playwright/test';
import { TEST_USERS, API_ROUTES, PAGE_ROUTES, TIMEOUTS } from '../fixtures/test-data';

/**
 * Login as regular user using magic link
 * Note: This is a simplified version for E2E testing
 * In real tests, you would need to intercept the magic link email or use a test endpoint
 */
export async function loginAsUser(page: Page, email: string = TEST_USERS.regular.email) {
  // Navigate to login page
  await page.goto(PAGE_ROUTES.LOGIN);

  // Fill email and submit
  await page.fill('#email', email);
  await page.click('button[type="submit"]');

  // Wait for success message
  await expect(page.locator('text=Check your email')).toBeVisible({ timeout: TIMEOUTS.SHORT });

  // For E2E testing, we'll create a mock magic link token
  // In production, this would come from email
  const mockToken = await generateMockMagicLinkToken(page, email);

  // Navigate to verify page with token
  await page.goto(`${PAGE_ROUTES.VERIFY}?token=${mockToken}`);

  // Wait for verification success
  await expect(page.locator('text=Success!')).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

  // Wait for redirect to dashboard
  await page.waitForURL(PAGE_ROUTES.DASHBOARD, { timeout: TIMEOUTS.SHORT });

  // Verify we're logged in
  await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: TIMEOUTS.SHORT });
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
 * Generate a mock magic link token for testing
 * This simulates the token generation without actually sending an email
 * NOTE: In production, you would use a test email service or intercept the email
 */
async function generateMockMagicLinkToken(page: Page, email: string): Promise<string> {
  // For E2E tests, we can use the API directly to generate a token
  // This is a test-only approach and should not be available in production

  // In a real scenario, you would:
  // 1. Use a test email service (like Mailtrap, Mailosaur)
  // 2. OR create a test-only endpoint that returns the token
  // 3. OR intercept the Resend API call

  // For now, we'll return a placeholder that the test should override
  // with actual implementation based on your testing strategy
  return 'test-magic-link-token';
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
