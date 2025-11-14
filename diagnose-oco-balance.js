/**
 * Diagnostic script to understand OCO balance issue
 *
 * From the logs:
 * - Buy order executed: 41.20 NEAR purchased
 * - Balance check shows: Available=76.40 NEAR
 * - Trying to create OCO for: 30.0 NEAR (75% of 41.20)
 * - Error: Insufficient balance
 *
 * Question: Why does Binance reject 30.0 NEAR when we have 76.40 available?
 *
 * Answer: The 76.40 NEAR is the balance BEFORE the buy order.
 * The 41.20 NEAR we just bought is NOT included in the 76.40.
 * So the actual available balance for NEW orders is 76.40 NEAR.
 * But we need 30.0 NEAR from the NEWLY PURCHASED 41.20 NEAR.
 *
 * The issue: Binance's internal system knows that the 41.20 NEAR
 * is "pending settlement" and won't let us use those coins yet.
 *
 * Timeline:
 * 1. Before buy: 76.40 NEAR available
 * 2. Buy order executes: 41.20 NEAR purchased (total should be 117.6)
 * 3. Wait 3s for settlement
 * 4. Check balance: STILL shows 76.40 (not updated yet!)
 * 5. Try to create OCO for 30.0 NEAR
 * 6. Binance internal system: "Those 41.20 NEAR are locked/settling, can't use them"
 * 7. Error: Insufficient balance
 *
 * The fix: Verify that the balance has INCREASED by the buy amount before creating OCO
 */

console.log("=== OCO Balance Diagnostic ===\n");

const beforeBuyBalance = 76.40;
const buyQuantity = 41.20;
const expectedAfterBuy = beforeBuyBalance + buyQuantity; // 117.6
const actualAfterBuy = 76.40; // What the API returned

console.log("Before buy:", beforeBuyBalance, "NEAR");
console.log("Buy quantity:", buyQuantity, "NEAR");
console.log("Expected after buy:", expectedAfterBuy, "NEAR");
console.log("Actual after buy (from API):", actualAfterBuy, "NEAR");
console.log("Settlement complete?", actualAfterBuy >= expectedAfterBuy - 0.00000001 ? "YES" : "NO");

console.log("\n=== The Problem ===");
console.log("The balance API returned the OLD balance (before buy)");
console.log("Settlement delay (3s) was NOT enough");
console.log("Binance testnet needs MORE time to update balances");

console.log("\n=== The Solution ===");
console.log("1. Check if balance >= (beforeBalance + buyQuantity)");
console.log("2. If not, wait additional time and recheck");
console.log("3. Verify settlement actually completed before creating OCO");

console.log("\n=== New Code Logic ===");
console.log("if (currentBalance < buyQuantity) {");
console.log("  // Balance hasn't settled yet!");
console.log("  // Apply additional delay and recheck");
console.log("}");
