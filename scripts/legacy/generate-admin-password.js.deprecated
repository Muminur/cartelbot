/**
 * Generate bcrypt hash for admin password
 * Usage: node scripts/generate-admin-password.js your_password
 */

const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.error('Error: Please provide a password');
  console.log('Usage: node scripts/generate-admin-password.js your_password');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Error: Password must be at least 8 characters long');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);

console.log('\n========================================');
console.log('Admin Password Hash Generated');
console.log('========================================');
console.log('\nPassword:', password);
console.log('Hash:', hash);
console.log('\nAdd this to your .env file:');
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log('========================================\n');
