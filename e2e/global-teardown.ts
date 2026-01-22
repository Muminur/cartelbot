/**
 * Playwright Global Teardown
 * Runs once after all tests
 */

export default async function globalTeardown() {
  console.log('\n[Global Teardown] Cleaning up E2E test environment...\n');

  try {
    // For local development, we don't cleanup test data automatically
    // to preserve the test user for repeated test runs
    console.log('[Global Teardown] ✓ Skipping cleanup (test user preserved)');
    console.log('[Global Teardown] ✓ Cleanup complete!\n');
  } catch (error) {
    console.error('\n[Global Teardown] ✗ Cleanup failed:', error);
    // Don't throw - allow tests to complete even if cleanup fails
  }
}
