/**
 * E2E Tests: Trade Execution Workflow
 * Tests trade execution and management functionality
 */

import { test, expect } from '@playwright/test';
import { PAGE_ROUTES, TIMEOUTS, TEST_TRADE_CONFIG } from '../fixtures/test-data';

test.describe('Trade Execution', () => {
  test.skip('should display execute trade page', async ({ page }) => {
    const signalId = 'test-signal-id'; // Create via API/database
    await page.goto(`${PAGE_ROUTES.TRADES_EXECUTE}?signalId=${signalId}`);

    await expect(page.locator('text=Signal Details')).toBeVisible();
    await expect(page.locator('text=Position Sizing')).toBeVisible();
    await expect(page.locator('button.bg-purple-600')).toBeVisible();
  });

  test.skip('should execute trade with fixed amount', async ({ page }) => {
    const signalId = 'test-signal-id';
    await page.goto(`${PAGE_ROUTES.TRADES_EXECUTE}?signalId=${signalId}`);

    // Select fixed amount
    await page.click('input[value="fixed"]');
    await page.fill('input[type="number"][min="10"]', TEST_TRADE_CONFIG.fixed.amount.toString());

    // Execute
    await page.click('button.bg-purple-600');

    // Should redirect to trades page
    await page.waitForURL(PAGE_ROUTES.TRADES, { timeout: TIMEOUTS.TRADE });
    await expect(page.locator('text=Trade executed successfully')).toBeVisible();
  });

  test.skip('should display active trades', async ({ page }) => {
    await page.goto(PAGE_ROUTES.TRADES);

    // Should show active trades tab
    await expect(page.locator('[role="tab"]:has-text("Active Trades")')).toBeVisible();

    // Click active trades tab
    await page.click('[role="tab"]:has-text("Active Trades")');

    // Table or empty state should be visible
    const hasTable = await page.locator('table').isVisible();
    const hasEmptyState = await page.locator('text=No active trades').isVisible();

    expect(hasTable || hasEmptyState).toBe(true);
  });

  test.skip('should sync trade statuses', async ({ page }) => {
    await page.goto(PAGE_ROUTES.TRADES);

    // Click sync button
    await page.click('button:has-text("Sync Status")');

    // Button should show loading state
    await expect(page.locator('.animate-spin')).toBeVisible({ timeout: TIMEOUTS.SHORT });

    // Wait for sync to complete
    await page.waitForTimeout(2000);

    // Loading should disappear
    await expect(page.locator('.animate-spin')).not.toBeVisible();
  });
});
