/**
 * E2E Tests: Magic Link Authentication Flow
 * Tests the complete passwordless authentication flow
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS, PAGE_ROUTES, TIMEOUTS } from '../fixtures/test-data';
import { logout, isAuthenticated, waitForSession } from '../helpers/auth-helpers';
import { cleanupTestUser, getMagicLinkToken, createTestUser } from '../helpers/database-helpers';

test.describe('Magic Link Authentication', () => {
  const testEmail = TEST_USERS.regular.email;

  test.beforeEach(async () => {
    // Clean up any existing test user
    await cleanupTestUser(testEmail);
  });

  test.afterEach(async () => {
    // Clean up test data
    await cleanupTestUser(testEmail);
  });

  test('should display login page correctly', async ({ page }) => {
    await page.goto(PAGE_ROUTES.LOGIN);

    // Check page elements
    await expect(page.locator('h1')).toContainText('Welcome to CartelBot');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Send magic link');
  });

  test('should show validation error for invalid email', async ({ page }) => {
    await page.goto(PAGE_ROUTES.LOGIN);

    // Try to submit with invalid email
    await page.fill('#email', 'invalid-email');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: TIMEOUTS.SHORT });
  });

  test('should send magic link successfully', async ({ page }) => {
    await page.goto(PAGE_ROUTES.LOGIN);

    // Fill valid email
    await page.fill('#email', testEmail);

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for success message
    await expect(page.locator('text=Check your email')).toBeVisible({ timeout: TIMEOUTS.SHORT });
    await expect(page.locator(`text=${testEmail}`)).toBeVisible();

    // Should have button to use different email
    await expect(page.locator('button:has-text("Use a different email")')).toBeVisible();
  });

  test('should allow changing email after sending magic link', async ({ page }) => {
    await page.goto(PAGE_ROUTES.LOGIN);

    // Send magic link
    await page.fill('#email', testEmail);
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Check your email')).toBeVisible();

    // Click to change email
    await page.click('button:has-text("Use a different email")');

    // Should return to login form
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#email')).toHaveValue('');
  });

  test.skip('should verify magic link token and create session', async ({ page }) => {
    // NOTE: This test is skipped because it requires email integration
    // To enable, you need to:
    // 1. Configure a test email service (Mailtrap, Mailosaur, etc.)
    // 2. OR create a test-only endpoint that returns the token
    // 3. OR mock the Resend API

    await page.goto(PAGE_ROUTES.LOGIN);

    // Send magic link
    await page.fill('#email', testEmail);
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Check your email')).toBeVisible();

    // Get magic link token (implement based on your strategy)
    const token = await getMagicLinkToken(testEmail);
    if (!token) {
      throw new Error('Failed to retrieve magic link token');
    }

    // Navigate to verify page
    await page.goto(`${PAGE_ROUTES.VERIFY}?token=${token}`);

    // Should show verifying state
    await expect(page.locator('text=Verifying...')).toBeVisible();

    // Should show success
    await expect(page.locator('text=Success!')).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

    // Should redirect to dashboard
    await page.waitForURL(PAGE_ROUTES.DASHBOARD, { timeout: TIMEOUTS.SHORT });
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();

    // Verify session is established
    const authenticated = await isAuthenticated(page);
    expect(authenticated).toBe(true);
  });

  test('should show error for invalid token', async ({ page }) => {
    const invalidToken = 'invalid-token-12345';

    await page.goto(`${PAGE_ROUTES.VERIFY}?token=${invalidToken}`);

    // Should show error state
    await expect(page.locator('text=Verification Failed')).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

    // Should have back to login button
    await expect(page.locator('button:has-text("Back to login")')).toBeVisible();
  });

  test('should redirect to login when visiting verify without token', async ({ page }) => {
    await page.goto(PAGE_ROUTES.VERIFY);

    // Should show error message
    await expect(page.locator('text=No verification token provided')).toBeVisible({ timeout: TIMEOUTS.SHORT });
  });

  test.skip('should logout successfully', async ({ page }) => {
    // NOTE: Requires magic link authentication to be working
    // Login first (implement loginAsUser helper)
    // await loginAsUser(page, testEmail);

    // Verify logged in
    // const beforeLogout = await isAuthenticated(page);
    // expect(beforeLogout).toBe(true);

    // Logout
    // await logout(page);

    // Should redirect to login
    // await expect(page).toHaveURL(PAGE_ROUTES.LOGIN);

    // Verify logged out
    // const afterLogout = await isAuthenticated(page);
    // expect(afterLogout).toBe(false);
  });

  test('should prevent access to protected routes when not authenticated', async ({ page }) => {
    // Try to access dashboard without authentication
    await page.goto(PAGE_ROUTES.DASHBOARD);

    // Should redirect to login
    await page.waitForURL(PAGE_ROUTES.LOGIN, { timeout: TIMEOUTS.SHORT });
  });

  test('should maintain session across page refreshes', async ({ page }) => {
    // NOTE: This test requires authentication to be working
    test.skip();

    // Login and navigate to dashboard
    // await loginAsUser(page, testEmail);
    // await page.goto(PAGE_ROUTES.DASHBOARD);

    // Reload page
    // await page.reload();

    // Should still be on dashboard
    // await expect(page).toHaveURL(PAGE_ROUTES.DASHBOARD);
    // await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
  });
});

test.describe('Session Management', () => {
  test('should show session expired modal when session expires', async ({ page }) => {
    // This test would require manipulating cookies/tokens
    // to simulate an expired session
    test.skip();
  });

  test('should handle concurrent login attempts', async ({ page, context }) => {
    // Test multiple browser tabs logging in simultaneously
    test.skip();
  });
});
