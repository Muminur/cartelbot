/**
 * Playwright Global Teardown
 * Runs once after all tests
 */

import { disconnectFromTestDatabase, cleanupAllTestData } from './helpers/database-helpers';

export default async function globalTeardown() {
  console.log('\n[Global Teardown] Cleaning up E2E test environment...\n');

  try {
    // Clean up all test data
    await cleanupAllTestData();
    console.log('[Global Teardown] ✓ Test data cleaned up');

    // Disconnect from database
    await disconnectFromTestDatabase();
    console.log('[Global Teardown] ✓ Database disconnected');

    console.log('\n[Global Teardown] Cleanup complete!\n');
  } catch (error) {
    console.error('\n[Global Teardown] ✗ Cleanup failed:', error);
    // Don't throw - allow tests to complete even if cleanup fails
  }
}
