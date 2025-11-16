# Delete Result Dialog - Manual Testing Guide

## Quick Test Steps

### Test 1: Sell Remaining Flow

1. **Navigate to Signal History**:
   - Go to http://localhost:3000/signals/history
   - Find a signal with "executing" or "completed" status
   - Click the "Delete" button

2. **Select Sell Option**:
   - In the Delete Signal Dialog, click the first option:
     - "Sell remaining quantity at market price"
   - Verify the option highlights with purple border

3. **Confirm Deletion**:
   - Click "Confirm Delete"
   - Watch for loading spinner ("Deleting...")

4. **Verify Result Dialog**:
   - After ~300ms, the DeleteResultDialog should appear
   - **Check these elements**:
     - ✅ Green gradient background (from-green-50 via-emerald-50 to-green-100)
     - ✅ Green checkmark icon (CheckCircle2) in center
     - ✅ Title: "Signal Deleted & Sold"
     - ✅ Subtitle: "Your remaining coins have been sold at market price"
     - ✅ Large quantity number (e.g., "0.5")
     - ✅ Symbol next to quantity (e.g., "BNB")
     - ✅ Label: "Sold at market price"
     - ✅ "OCO Orders Cancelled: X orders" row
     - ✅ "Sell Order ID: XXXXXXXXX" row
     - ✅ Green success box with checkmark icon
     - ✅ Success message about trade closed
     - ✅ Green "Close" button

5. **Test Actions**:
   - Click "Close" button
   - Verify dialog closes smoothly
   - Verify signal removed from history list

---

### Test 2: Keep Coins Flow

1. **Navigate to Signal History**:
   - Go to http://localhost:3000/signals/history
   - Find a signal with "executing" or "completed" status
   - Click the "Delete" button

2. **Select Keep Option**:
   - In the Delete Signal Dialog, click the second option:
     - "Keep coins but cancel OCO orders"
   - Verify the option highlights with purple border

3. **Confirm Deletion**:
   - Click "Confirm Delete"
   - Watch for loading spinner ("Deleting...")

4. **Verify Result Dialog**:
   - After ~300ms, the DeleteResultDialog should appear
   - **Check these elements**:
     - ✅ Blue gradient background (from-blue-50 via-sky-50 to-blue-100)
     - ✅ Blue package icon (Package) in center
     - ✅ Title: "Signal Deleted"
     - ✅ Subtitle: "Your coins are safely stored as orphaned assets"
     - ✅ Large quantity number (e.g., "0.5")
     - ✅ Symbol next to quantity (e.g., "BNB")
     - ✅ Label: "Saved to wallet"
     - ✅ "OCO Orders Cancelled: X orders" row
     - ✅ "Asset ID: 6733a1b2...j0j1" row (truncated)
     - ✅ Blue info box with package icon
     - ✅ Info message about coins saved to wallet
     - ✅ "View Orphaned Coins" button (outline style)
     - ✅ Blue "Close" button

5. **Test Navigation**:
   - Click "View Orphaned Coins" button
   - Verify navigation to `/orphaned-coins` page
   - Verify dialog closes

6. **Test Close Button**:
   - Repeat steps 1-4
   - Click "Close" button instead
   - Verify dialog closes smoothly
   - Verify signal removed from history list

---

### Test 3: Edge Cases

#### Edge Case 1: Signal with No Trade
1. Create a new signal (don't execute it)
2. Click "Delete" immediately
3. Choose either option
4. Verify no crash occurs
5. Verify appropriate message shown

#### Edge Case 2: Zero OCO Cancelled
1. Find a signal where all OCO orders already filled
2. Click "Delete"
3. Choose "Sell remaining"
4. Verify "OCO Orders Cancelled: 0 orders" displays correctly

#### Edge Case 3: Rapid Deletions
1. Delete 2-3 signals in quick succession
2. Verify each shows its own result dialog
3. Verify no state conflicts or crashes

---

### Test 4: Responsive Design

#### Mobile (375px)
1. Open DevTools
2. Set viewport to iPhone SE (375px)
3. Perform Test 1 (Sell Flow)
4. Verify:
   - ✅ Dialog takes full width with padding
   - ✅ Gradient background visible
   - ✅ Icon centered
   - ✅ Text readable
   - ✅ Buttons stack vertically
   - ✅ All content fits without horizontal scroll

#### Tablet (768px)
1. Set viewport to iPad (768px)
2. Perform Test 2 (Keep Flow)
3. Verify:
   - ✅ Dialog max-width 500px, centered
   - ✅ Buttons side-by-side
   - ✅ Layout looks balanced

#### Desktop (1024px+)
1. Use full desktop viewport
2. Perform both Test 1 and Test 2
3. Verify optimal layout at larger size

---

### Test 5: Animation & Performance

1. **Icon Animation**:
   - Watch for zoom-in animation on icon (300ms)
   - Should scale smoothly from 0 to 100%

2. **Dialog Transition**:
   - Time the delay between delete dialog close and result dialog open
   - Should be exactly 300ms

3. **Performance**:
   - Open DevTools Performance tab
   - Record during deletion flow
   - Verify no dropped frames (60fps maintained)

---

### Test 6: Accessibility

1. **Keyboard Navigation**:
   - Tab through result dialog
   - Verify buttons are focusable
   - Press Enter to activate "Close" button
   - Verify works correctly

2. **Screen Reader** (Optional):
   - Enable screen reader
   - Verify dialog title announced
   - Verify content readable

---

## Expected API Responses

### Sell Response
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Signal deleted and 0.5 BNB sold at market price",
    "sellOrderId": 12345678,
    "cancelledOCOs": [987654321, 987654322]
  }
}
```

### Keep Response
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Signal deleted. 0.5 BNB saved as orphaned coin.",
    "orphanedCoinId": "6733a1b2c4d5e6f7g8h9i0j1",
    "cancelledOCOs": [987654321, 987654322]
  }
}
```

---

## Known Issues (Expected)

1. **Build Lock**: Cannot run `npm run build` while dev server is running
   - **Workaround**: Stop dev server first

2. **API Rate Limits**: Testing on mainnet may hit rate limits
   - **Workaround**: Use testnet for testing

---

## Success Criteria

All tests should pass with:
- ✅ TypeScript compilation: 0 errors
- ✅ No console errors in browser
- ✅ Smooth animations (60fps)
- ✅ Correct theme colors (green for sell, blue for keep)
- ✅ Proper data parsing (quantity, symbol, IDs)
- ✅ Navigation works (orphaned coins page)
- ✅ Responsive on all screen sizes
- ✅ No memory leaks (state cleaned up on close)

---

## Troubleshooting

### Result Dialog Not Showing
- Check if `handleConfirmDelete` returns result data
- Check browser console for errors
- Verify API response structure matches expected format

### Wrong Colors Displayed
- Check if `isSellChoice` and `isKeepChoice` logic correct
- Verify `sellOrderId` and `orphanedCoinId` in API response

### Quantity/Symbol Not Parsed
- Check API message format: should contain "X.XX SYMBOL"
- Example: "Signal deleted and 0.5 BNB sold at market price"

### Navigation Not Working
- Check if `/orphaned-coins` route exists
- Verify `useRouter` from `next/navigation` imported correctly

---

## Test Results Template

```
Date: [YYYY-MM-DD]
Tester: [Name]
Environment: [Production/Testnet]

✅ Test 1: Sell Remaining Flow - PASSED
✅ Test 2: Keep Coins Flow - PASSED
✅ Test 3: Edge Cases - PASSED (0/3 failures)
✅ Test 4: Responsive Design - PASSED
✅ Test 5: Animation & Performance - PASSED (60fps maintained)
✅ Test 6: Accessibility - PASSED

Overall: PASSED ✅
Notes: [Any observations]
```
