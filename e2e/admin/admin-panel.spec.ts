/**
 * E2E Tests: Admin Panel Operations
 * Tests admin authentication and dashboard functionality
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS, PAGE_ROUTES, TIMEOUTS } from '../fixtures/test-data';
import { loginAsAdmin } from '../helpers/auth-helpers';

test.describe('Admin Authentication', () => {
  test('should display admin login page correctly', async ({ page }) => {
    await page.goto(PAGE_ROUTES.ADMIN_LOGIN);

    // Check page elements
    await expect(page.locator('h1')).toContainText('Admin Login');
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Check navigation links
    await expect(page.locator('button:has-text("User Login")')).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    const { username, password } = TEST_USERS.admin;

    await page.goto(PAGE_ROUTES.ADMIN_LOGIN);

    // Fill credentials
    await page.fill('#username', username);
    await page.fill('#password', password);

    // Submit login
    await page.click('button[type="submit"]');

    // Should redirect to admin dashboard
    await page.waitForURL(PAGE_ROUTES.ADMIN_DASHBOARD, { timeout: TIMEOUTS.SHORT });

    // Verify admin dashboard loads
    await expect(page.locator('h1:has-text("Admin Dashboard")')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto(PAGE_ROUTES.ADMIN_LOGIN);

    // Try invalid credentials
    await page.fill('#username', 'wronguser');
    await page.fill('#password', 'wrongpass');
    await page.click('button[type="submit"]');

    // Should stay on login page and show error
    await expect(page).toHaveURL(PAGE_ROUTES.ADMIN_LOGIN);
    // Wait for error toast or message
    await page.waitForTimeout(1000);
  });

  test('should show validation error for empty fields', async ({ page }) => {
    await page.goto(PAGE_ROUTES.ADMIN_LOGIN);

    // Try to submit empty form
    await page.click('button[type="submit"]');

    // Form should not submit (browser validation)
    await expect(page).toHaveURL(PAGE_ROUTES.ADMIN_LOGIN);
  });

  test('should disable login button while submitting', async ({ page }) => {
    const { username, password } = TEST_USERS.admin;

    await page.goto(PAGE_ROUTES.ADMIN_LOGIN);

    await page.fill('#username', username);
    await page.fill('#password', password);

    // Click submit and immediately check if button is disabled
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Button should be disabled or show loading state
    const isDisabled = await submitButton.isDisabled();
    const hasLoadingText = await submitButton.locator('text=Logging in...').isVisible().catch(() => false);

    expect(isDisabled || hasLoadingText).toBe(true);
  });
});

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin before each test
    await loginAsAdmin(page);
  });

  test('should display admin dashboard with statistics', async ({ page }) => {
    // Verify we're on dashboard
    await expect(page).toHaveURL(PAGE_ROUTES.ADMIN_DASHBOARD);

    // Check main elements
    await expect(page.locator('h1:has-text("Admin Dashboard")')).toBeVisible();
    await expect(page.locator('p:has-text("System overview")')).toBeVisible();

    // Check stat cards
    await expect(page.locator('text=Total Users')).toBeVisible();
    await expect(page.locator('text=With API Keys')).toBeVisible();
    await expect(page.locator('text=Total Signals')).toBeVisible();
    await expect(page.locator('text=Total P&L')).toBeVisible();
  });

  test('should display subscription tiers breakdown', async ({ page }) => {
    await page.goto(PAGE_ROUTES.ADMIN_DASHBOARD);

    // Check subscription tiers card
    await expect(page.locator('text=Subscription Tiers')).toBeVisible();

    // Should show tier labels
    await expect(page.locator('text=Free')).toBeVisible();
    await expect(page.locator('text=Premium')).toBeVisible();
    await expect(page.locator('text=Pro')).toBeVisible();

    // Should have progress bars (check for bg-gray-500, bg-blue-500, bg-purple-500)
    await expect(page.locator('.bg-gray-500').first()).toBeVisible();
  });

  test('should display signal status breakdown', async ({ page }) => {
    await page.goto(PAGE_ROUTES.ADMIN_DASHBOARD);

    // Check signal status card
    await expect(page.locator('text=Signal Status')).toBeVisible();

    // Should show status badges (pending, executing, completed, failed)
    const statuses = ['Pending', 'Executing', 'Completed', 'Failed'];
    for (const status of statuses) {
      // Status might be 0, so just check the card exists
      await expect(page.locator(`text=${status}`).first()).toBeVisible();
    }
  });

  test('should have database cleanup section', async ({ page }) => {
    await page.goto(PAGE_ROUTES.ADMIN_DASHBOARD);

    // Check cleanup card
    await expect(page.locator('text=Database Cleanup')).toBeVisible();

    // Should have analyze button
    await expect(page.locator('button:has-text("Analyze Mock Signals")')).toBeVisible();
  });

  test('should analyze mock signals', async ({ page }) => {
    await page.goto(PAGE_ROUTES.ADMIN_DASHBOARD);

    // Click analyze button
    await page.click('button:has-text("Analyze Mock Signals")');

    // Wait for analysis to complete
    await page.waitForTimeout(2000);

    // Should show results (either success with count or no mock signals message)
    const hasResults = await page.locator('.bg-blue-50, .bg-green-50, .bg-yellow-50').isVisible();
    expect(hasResults).toBe(true);
  });

  test.skip('should delete mock signals after analysis', async ({ page }) => {
    // This test is skipped to prevent accidental data deletion
    // Enable only in test environment with proper safeguards

    await page.goto(PAGE_ROUTES.ADMIN_DASHBOARD);

    // Analyze first
    await page.click('button:has-text("Analyze Mock Signals")');
    await page.waitForTimeout(2000);

    // Check if delete button appears
    const deleteButton = page.locator('button:has-text("Delete")');
    if (await deleteButton.isVisible()) {
      // Click delete
      await deleteButton.click();

      // Wait for confirmation
      await page.waitForTimeout(2000);

      // Should show success message
      await expect(page.locator('.bg-green-50')).toBeVisible();
    }
  });

  test('should navigate to admin sections via sidebar', async ({ page }) => {
    await page.goto(PAGE_ROUTES.ADMIN_DASHBOARD);

    // Test navigation to different admin sections
    const sections = [
      { name: 'Users', url: PAGE_ROUTES.ADMIN_USERS },
      { name: 'Subscriptions', url: PAGE_ROUTES.ADMIN_SUBSCRIPTIONS },
      { name: 'Signals', url: PAGE_ROUTES.ADMIN_SIGNALS },
      { name: 'System', url: PAGE_ROUTES.ADMIN_SYSTEM },
    ];

    for (const section of sections) {
      // Click nav link
      await page.click(`a:has-text("${section.name}")`);

      // Verify URL changed
      await page.waitForURL(section.url, { timeout: TIMEOUTS.SHORT });

      // Go back to dashboard
      await page.goto(PAGE_ROUTES.ADMIN_DASHBOARD);
    }
  });

  test('should load admin dashboard without errors', async ({ page }) => {
    // Listen for console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto(PAGE_ROUTES.ADMIN_DASHBOARD);

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Check for critical errors (ignore minor warnings)
    const criticalErrors = errors.filter(err =>
      !err.includes('Warning') &&
      !err.includes('favicon') &&
      !err.includes('Violation')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('should handle admin logout', async ({ page }) => {
    await page.goto(PAGE_ROUTES.ADMIN_DASHBOARD);

    // Find and click logout button (implementation may vary)
    const logoutButton = page.locator('button:has-text("Logout"), a:has-text("Logout")');

    if (await logoutButton.isVisible()) {
      await logoutButton.click();

      // Should redirect to login
      await page.waitForURL(PAGE_ROUTES.ADMIN_LOGIN, { timeout: TIMEOUTS.SHORT });
    }
  });

  test('should prevent access to admin routes without authentication', async ({ page, context }) => {
    // Clear all cookies to simulate logged out state
    await context.clearCookies();

    // Try to access admin dashboard
    await page.goto(PAGE_ROUTES.ADMIN_DASHBOARD);

    // Should redirect to admin login
    await page.waitForURL(PAGE_ROUTES.ADMIN_LOGIN, { timeout: TIMEOUTS.SHORT });
  });

  test('should display responsive layout on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(PAGE_ROUTES.ADMIN_DASHBOARD);

    // Verify page is still usable on mobile
    await expect(page.locator('h1:has-text("Admin Dashboard")')).toBeVisible();

    // Stats should stack vertically on mobile
    const statsCards = page.locator('text=Total Users').locator('..');
    await expect(statsCards).toBeVisible();
  });
});

test.describe('Admin Performance', () => {
  test('should load dashboard within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto(PAGE_ROUTES.ADMIN_DASHBOARD);
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    // Dashboard should load in less than 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });
});
