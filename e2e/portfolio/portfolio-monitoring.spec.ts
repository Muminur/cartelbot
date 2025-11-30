/**
 * E2E Tests: Portfolio Monitoring with WebSocket
 * Tests real-time portfolio updates
 */

import { test, expect } from '@playwright/test';
import { PAGE_ROUTES, TIMEOUTS } from '../fixtures/test-data';

test.describe('Portfolio Monitoring', () => {
  test.skip('should display portfolio page', async ({ page }) => {
    await page.goto(PAGE_ROUTES.PORTFOLIO);

    await expect(page.locator('h1:has-text("Portfolio")')).toBeVisible();
    await expect(page.locator('text=View your complete Binance')).toBeVisible();
  });

  test.skip('should show live connection status', async ({ page }) => {
    await page.goto(PAGE_ROUTES.PORTFOLIO);

    // Wait for WebSocket connection
    await expect(page.locator('.bg-green-50:has-text("Live")')).toBeVisible({ timeout: TIMEOUTS.WEBSOCKET });

    // Should show pulsing indicator
    await expect(page.locator('.w-2.h-2.bg-green-500.animate-pulse')).toBeVisible();
  });

  test.skip('should refresh portfolio manually', async ({ page }) => {
    await page.goto(PAGE_ROUTES.PORTFOLIO);

    // Click refresh button
    await page.click('button[aria-label="Refresh portfolio"]');

    // Should show loading state briefly
    await expect(page.locator('.animate-spin')).toBeVisible({ timeout: TIMEOUTS.SHORT });

    // Wait for refresh to complete
    await page.waitForTimeout(2000);
  });

  test.skip('should display portfolio balances', async ({ page }) => {
    await page.goto(PAGE_ROUTES.PORTFOLIO);

    // Wait for portfolio to load
    await page.waitForTimeout(3000);

    // Should show portfolio widget or loading spinner
    const hasPortfolio = await page.locator('table, .grid').isVisible();
    const hasLoading = await page.locator('.animate-spin.h-12.w-12').isVisible();

    expect(hasPortfolio || hasLoading).toBe(true);
  });

  test.skip('should handle session expired during WebSocket connection', async ({ page, context }) => {
    await page.goto(PAGE_ROUTES.PORTFOLIO);

    // Clear cookies to simulate session expiration
    await context.clearCookies();

    // Trigger WebSocket connection attempt
    await page.reload();

    // Should show session expired modal
    await expect(page.locator('text=Session Expired')).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
  });
});
