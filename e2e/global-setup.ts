/**
 * Playwright Global Setup
 * Runs once before all tests
 */

import * as fs from 'fs';
import * as path from 'path';

export default async function globalSetup() {
  console.log('\n[Global Setup] Starting E2E test environment...\n');

  try {
    // Check for test session file
    const sessionPath = path.join(__dirname, '../playwright/.auth/test-session.json');

    if (!fs.existsSync(sessionPath)) {
      console.error('[Global Setup] ✗ Test session not found!');
      console.error('Run: node scripts/create-test-session.js first');
      throw new Error('Test session not found');
    }

    const session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    console.log(`[Global Setup] ✓ Test session found for: ${session.email}`);
    console.log(`[Global Setup] ✓ User ID: ${session.userId}`);

    // Load environment variables from .env.local
    const envPath = path.join(__dirname, '../.env.local');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim();
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
      console.log('[Global Setup] ✓ Environment variables loaded');
    }

    console.log('\n[Global Setup] E2E environment ready!\n');
  } catch (error) {
    console.error('\n[Global Setup] ✗ Setup failed:', error);
    throw error;
  }
}
