/**
 * Quick verification script for stop loss normalization fix
 * Tests the exact user scenario that caused the bug
 */

import { parseSignal } from './lib/parser/text-parser';

console.log('==================================================');
console.log('STOP LOSS NORMALIZATION FIX - VERIFICATION');
console.log('==================================================\n');

// Original user signal that failed
const userSignal = `$ROSE Buying Now
Entry: 0.01882
Targets:
0.01885
0.01886
0.01887
0.01888
SL: 01880`;

console.log('User Input Signal:');
console.log('--------------------------------------------------');
console.log(userSignal);
console.log('--------------------------------------------------\n');

// Parse the signal
const result = parseSignal(userSignal);

console.log('Parsed Result:');
console.log('--------------------------------------------------');
console.log(`Symbol: ${result.symbol}`);
console.log(`Entry: ${result.entries.join(', ')}`);
console.log(`Targets: ${result.targets.join(', ')}`);
console.log(`Stop Loss: ${result.stopLoss}`);
console.log(`Confidence: ${result.confidence}%`);
console.log(`Errors: ${result.errors.length > 0 ? result.errors.join(', ') : 'None'}`);
console.log('--------------------------------------------------\n');

// Validation
const isValid = result.errors.length === 0;
const expectedStopLoss = 0.01880;
const stopLossCorrect = Math.abs(result.stopLoss - expectedStopLoss) < 0.0000001;

console.log('Fix Verification:');
console.log('--------------------------------------------------');
console.log(`✓ Stop loss normalized correctly: ${stopLossCorrect ? 'YES ✅' : 'NO ❌'}`);
console.log(`  - Input: "01880" → Parsed: ${result.stopLoss}`);
console.log(`  - Expected: ${expectedStopLoss}`);
console.log(`  - Match: ${stopLossCorrect ? 'YES' : 'NO'}`);
console.log();
console.log(`✓ Validation passed: ${isValid ? 'YES ✅' : 'NO ❌'}`);
console.log(`  - Errors: ${result.errors.length === 0 ? 'None' : result.errors.join(', ')}`);
console.log();
console.log(`✓ Signal ready for execution: ${isValid && stopLossCorrect ? 'YES ✅' : 'NO ❌'}`);
console.log(`  - Status would be: ${isValid ? 'parsed' : 'pending'}`);
console.log('--------------------------------------------------\n');

// Additional diagnostic
const minEntry = Math.min(...result.entries);
const percentBelow = ((minEntry - result.stopLoss) / minEntry) * 100;

console.log('Diagnostic Information:');
console.log('--------------------------------------------------');
console.log(`Min Entry Price: ${minEntry}`);
console.log(`Stop Loss Price: ${result.stopLoss}`);
console.log(`Stop Loss Below Entry: ${percentBelow.toFixed(4)}%`);
console.log(`Valid Range: 0% - 50% below entry`);
console.log(`Within Range: ${percentBelow >= 0 && percentBelow <= 50 ? 'YES ✅' : 'NO ❌'}`);
console.log('--------------------------------------------------\n');

// Final verdict
if (isValid && stopLossCorrect && percentBelow >= 0 && percentBelow <= 50) {
  console.log('🎉 FIX VERIFIED SUCCESSFULLY!');
  console.log('The signal now parses correctly and is ready for trade execution.');
  console.log();
  console.log('Before Fix: Signal status = "pending" (validation failed)');
  console.log('After Fix:  Signal status = "parsed" (ready to execute) ✅');
  process.exit(0);
} else {
  console.log('❌ FIX VERIFICATION FAILED!');
  console.log('The signal still has issues. Review the output above.');
  process.exit(1);
}
