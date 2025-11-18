/**
 * Test script to verify network retry logic in BinanceClient
 *
 * Run with: node test-network-retry.js
 */

console.log("=== Network Retry Logic Test ===\n");

// Simulate the retry logic behavior
function isNetworkError(error) {
  if (!(error instanceof Error)) return false;

  const networkErrorCodes = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EAI_AGAIN'
  ];

  // Check error code
  if ('code' in error && typeof error.code === 'string') {
    if (networkErrorCodes.includes(error.code)) return true;
  }

  // Check error message for network-related keywords
  const errorMessage = error.message?.toLowerCase() || '';
  return networkErrorCodes.some(code =>
    errorMessage.includes(code.toLowerCase())
  );
}

async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
  let lastError = new Error("Unknown error");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Handle network errors (ECONNRESET, ETIMEDOUT, etc.)
      if (isNetworkError(error)) {
        if (attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt);
          const errorCode = error.code || 'NETWORK_ERROR';
          console.warn(
            `[Retry ${attempt + 1}/${maxRetries + 1}] Network error (${errorCode}), retrying in ${delay}ms`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        } else {
          // After all retries exhausted, throw a user-friendly error
          throw new Error(
            `Network connection failed after ${maxRetries + 1} attempts. ` +
            `Please check your internet connection and try again.`
          );
        }
      }

      // For other errors, retry without specific logging
      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(`[Retry ${attempt + 1}/${maxRetries + 1}] Error, retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Test cases
async function testNetworkErrors() {
  console.log("Test 1: ECONNRESET error (should retry 3 times)");
  let attemptCount = 0;

  try {
    await retryWithBackoff(async () => {
      attemptCount++;
      console.log(`  Attempt ${attemptCount}`);

      // Fail first 2 attempts, succeed on 3rd
      if (attemptCount < 3) {
        const error = new Error('read ECONNRESET');
        error.code = 'ECONNRESET';
        throw error;
      }

      return "Success!";
    });
    console.log("  ✅ Test passed: Succeeded after retries\n");
  } catch (error) {
    console.log(`  ❌ Test failed: ${error.message}\n`);
  }

  console.log("Test 2: ETIMEDOUT error (should exhaust retries)");
  attemptCount = 0;

  try {
    await retryWithBackoff(async () => {
      attemptCount++;
      console.log(`  Attempt ${attemptCount}`);

      const error = new Error('Connection timeout');
      error.code = 'ETIMEDOUT';
      throw error;
    }, 2, 500); // 2 retries, 500ms initial delay

    console.log("  ❌ Test failed: Should have thrown error\n");
  } catch (error) {
    console.log(`  ✅ Test passed: ${error.message}\n`);
  }

  console.log("Test 3: Non-network error (should retry but with different message)");
  attemptCount = 0;

  try {
    await retryWithBackoff(async () => {
      attemptCount++;
      console.log(`  Attempt ${attemptCount}`);

      if (attemptCount < 2) {
        throw new Error('Generic error');
      }

      return "Success!";
    }, 2, 500);

    console.log("  ✅ Test passed: Succeeded after retries\n");
  } catch (error) {
    console.log(`  ❌ Test failed: ${error.message}\n`);
  }

  console.log("=== All tests completed ===");
}

testNetworkErrors().catch(console.error);
