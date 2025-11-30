/**
 * Playwright Global Setup
 * Runs once before all tests
 */

import { connectToTestDatabase } from './helpers/database-helpers';

export default async function globalSetup() {
  console.log('\n[Global Setup] Starting E2E test environment...\n');

  try {
    // Connect to test database
    const db = await connectToTestDatabase();
    console.log(`[Global Setup] ✓ Database connected: ${db.databaseName}`);

    // Verify required environment variables
    const required = ['DATABASE_URL'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      console.error(`[Global Setup] ✗ Missing environment variables: ${missing.join(', ')}`);
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    console.log('[Global Setup] ✓ Environment variables validated');
    console.log('\n[Global Setup] E2E environment ready!\n');
  } catch (error) {
    console.error('\n[Global Setup] ✗ Setup failed:', error);
    throw error;
  }
}
