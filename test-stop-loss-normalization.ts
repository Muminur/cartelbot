/**
 * Test Suite: Stop Loss Normalization Fix
 *
 * Purpose: Verify that stop loss values with incorrect decimal precision
 * are automatically normalized to valid values.
 *
 * Bug: "SL: 01880" was parsed as 1880.0, which is above entry 0.01882
 * Fix: Detect decimal precision mismatch and normalize to 0.01880
 *
 * Run with: npx tsx test-stop-loss-normalization.ts
 */

import { parseSignal } from './lib/parser/text-parser';

console.log('='.repeat(80));
console.log('STOP LOSS NORMALIZATION FIX - TEST SUITE');
console.log('='.repeat(80));
console.log();

// Test cases covering various stop loss formatting issues
const testCases = [
  {
    name: 'Original Bug: Missing "0." prefix (01880 → 0.01880)',
    signal: `$ROSE Buying Now
Entry: 0.01882
Targets:
0.01885
0.01886
0.01887
0.01888
SL: 01880`,
    expected: {
      symbol: 'ROSEUSDT',
      entry: 0.01882,
      stopLoss: 0.01880,
      shouldPass: true,
    }
  },
  {
    name: 'Valid stop loss (already correct)',
    signal: `$BTC Buying Now
Entry: 50000
Targets: 52000, 54000, 56000
SL: 48000`,
    expected: {
      symbol: 'BTCUSDT',
      entry: 50000,
      stopLoss: 48000,
      shouldPass: true,
    }
  },
  {
    name: 'Small decimal precision (0.000123 entry, 145 SL → 0.000145)',
    signal: `$SHIB Buying Now
Entry: 0.000150
Targets: 0.000155, 0.000160, 0.000165
SL: 0145`,
    expected: {
      symbol: 'SHIBUSDT',
      entry: 0.000150,
      stopLoss: 0.000145,
      shouldPass: true,
    }
  },
  {
    name: 'Integer entry with integer stop loss (valid)',
    signal: `$ETH Buying Now
Entry: 3000
Targets: 3100, 3200, 3300
SL: 2900`,
    expected: {
      symbol: 'ETHUSDT',
      entry: 3000,
      stopLoss: 2900,
      shouldPass: true,
    }
  },
  {
    name: 'Multiple entries with missing decimal stop loss',
    signal: `$ADA Buying Now
Entry: 0.452 - 0.458
Targets: 0.470, 0.485, 0.500
SL: 0440`,
    expected: {
      symbol: 'ADAUSDT',
      minEntry: 0.452,
      stopLoss: 0.440,
      shouldPass: true,
    }
  },
  {
    name: 'Edge case: Stop loss with correct decimal already',
    signal: `$DOT Buying Now
Entry: 6.28 - 6.31
Targets: 6.50, 6.75, 7.00
SL: 5.69`,
    expected: {
      symbol: 'DOTUSDT',
      entry: 6.28,
      stopLoss: 5.69,
      shouldPass: true,
    }
  },
  {
    name: 'Truly invalid stop loss (above entry, cannot normalize)',
    signal: `$LINK Buying Now
Entry: 10.5
Targets: 11.0, 11.5, 12.0
SL: 15.0`,
    expected: {
      symbol: 'LINKUSDT',
      entry: 10.5,
      stopLoss: 15.0,
      shouldPass: false, // Should fail validation
    }
  },
  {
    name: 'Very small numbers (0.00001882 entry, 01880 SL)',
    signal: `$PEPE Buying Now
Entry: 0.00001882
Targets: 0.00001900, 0.00001920, 0.00001950
SL: 01880`,
    expected: {
      symbol: 'PEPEUSDT',
      entry: 0.00001882,
      stopLoss: 0.00001880,
      shouldPass: true,
    }
  }
];

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  console.log(`\nTest ${index + 1}: ${testCase.name}`);
  console.log('-'.repeat(80));

  try {
    const result = parseSignal(testCase.signal);

    console.log('Parsed Result:');
    console.log(`  Symbol: ${result.symbol}`);
    console.log(`  Entries: [${result.entries.join(', ')}]`);
    console.log(`  Targets: [${result.targets.join(', ')}]`);
    console.log(`  Stop Loss: ${result.stopLoss}`);
    console.log(`  Confidence: ${result.confidence}%`);
    console.log(`  Errors: ${result.errors.length > 0 ? result.errors.join(', ') : 'None'}`);

    // Validation checks
    const hasErrors = result.errors.length > 0;
    const symbolMatch = result.symbol === testCase.expected.symbol;
    const stopLossMatch = Math.abs(result.stopLoss - testCase.expected.stopLoss) < 0.0000001;

    let testPassed = false;

    if (testCase.expected.shouldPass) {
      // Should be valid signal
      testPassed = !hasErrors && symbolMatch && stopLossMatch;

      if (!testPassed) {
        console.log('\n❌ FAILED:');
        if (hasErrors) console.log(`   - Has errors: ${result.errors.join(', ')}`);
        if (!symbolMatch) console.log(`   - Symbol mismatch: expected ${testCase.expected.symbol}, got ${result.symbol}`);
        if (!stopLossMatch) console.log(`   - Stop loss mismatch: expected ${testCase.expected.stopLoss}, got ${result.stopLoss}`);
      }
    } else {
      // Should be invalid signal
      testPassed = hasErrors;

      if (!testPassed) {
        console.log('\n❌ FAILED: Expected validation errors but signal passed');
      }
    }

    if (testPassed) {
      console.log('\n✅ PASSED');
      passed++;
    } else {
      failed++;
    }

    // Additional diagnostic: Check normalization logic
    if (result.stopLoss !== testCase.expected.stopLoss) {
      const minEntry = Math.min(...result.entries);
      const percentBelow = ((minEntry - result.stopLoss) / minEntry) * 100;
      console.log(`\nDiagnostic Info:`);
      console.log(`  Min Entry: ${minEntry}`);
      console.log(`  Stop Loss: ${result.stopLoss} (expected: ${testCase.expected.stopLoss})`);
      console.log(`  Percent Below Entry: ${percentBelow.toFixed(2)}%`);
    }

  } catch (error) {
    console.log(`\n❌ EXCEPTION: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.log(error.stack);
    }
    failed++;
  }
});

console.log('\n' + '='.repeat(80));
console.log('TEST SUMMARY');
console.log('='.repeat(80));
console.log(`Total Tests: ${testCases.length}`);
console.log(`Passed: ${passed} ✅`);
console.log(`Failed: ${failed} ❌`);
console.log(`Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
console.log();

if (failed === 0) {
  console.log('🎉 ALL TESTS PASSED! Stop loss normalization fix is working correctly.');
  process.exit(0);
} else {
  console.log('⚠️  SOME TESTS FAILED. Review the output above for details.');
  process.exit(1);
}
