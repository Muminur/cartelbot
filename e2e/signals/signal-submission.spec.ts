/**
 * E2E Tests: Signal Submission Workflow
 * Tests signal parsing and submission functionality
 */

import { test, expect } from '@playwright/test';
import { TEST_SIGNALS, PAGE_ROUTES, TIMEOUTS } from '../fixtures/test-data';

test.describe('Signal Submission', () => {
  test.skip('should display signal submission page', async ({ page }) => {
    // NOTE: Requires authentication
    await page.goto(PAGE_ROUTES.SIGNALS);

    await expect(page.locator('h1')).toContainText('Submit Signal');
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeVisible();
    await expect(page.locator('button:has-text("Parse & Review")')).toBeVisible();
  });

  test.skip('should parse percentage-based signal', async ({ page }) => {
    await page.goto(PAGE_ROUTES.SIGNALS);

    // Enter signal text
    await page.fill('textarea', TEST_SIGNALS.percentageBased);

    // Click parse
    await page.click('button:has-text("Parse & Review")');

    // Wait for parsed signal card
    await expect(page.locator('text=Parsed Signal')).toBeVisible({ timeout: TIMEOUTS.MEDIUM });

    // Verify parsed data shows
    await expect(page.locator('text=BTC')).toBeVisible();
    await expect(page.locator('text=50000')).toBeVisible(); // Entry
    await expect(page.locator('text=48000')).toBeVisible(); // Stop loss
  });

  test.skip('should parse price-based signal', async ({ page }) => {
    await page.goto(PAGE_ROUTES.SIGNALS);

    await page.fill('textarea', TEST_SIGNALS.priceBased);
    await page.click('button:has-text("Parse & Review")');

    await expect(page.locator('text=Parsed Signal')).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
    await expect(page.locator('text=ETH')).toBeVisible();
  });

  test.skip('should show error for invalid signal', async ({ page }) => {
    await page.goto(PAGE_ROUTES.SIGNALS);

    await page.fill('textarea', TEST_SIGNALS.invalid);
    await page.click('button:has-text("Parse & Review")');

    // Should show error
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: TIMEOUTS.SHORT });
  });

  test.skip('should submit signal and execute trade', async ({ page }) => {
    await page.goto(PAGE_ROUTES.SIGNALS);

    // Parse signal
    await page.fill('textarea', TEST_SIGNALS.percentageBased);
    await page.click('button:has-text("Parse & Review")');
    await expect(page.locator('text=Parsed Signal')).toBeVisible();

    // Submit
    await page.click('button:has-text("Submit & Execute")');

    // Should redirect to history
    await page.waitForURL(/\/signals\/history/, { timeout: TIMEOUTS.LONG });

    // Success toast should appear
    await expect(page.locator('text=Trade executed successfully')).toBeVisible();
  });
});
