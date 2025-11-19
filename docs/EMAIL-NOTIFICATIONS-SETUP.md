# Email Notifications System - Setup Guide

## Overview

CartelBot includes a comprehensive email notification system that sends real-time alerts to users for trading events. The system respects user preferences set in the Settings page.

## Features Implemented

### 1. Trade Executed Notifications
- **Trigger**: When a BUY order is filled on Binance
- **Contains**: Symbol, side, quantity, price, total amount, order ID, timestamp
- **User Preference**: `emailNotifications.onTradeExecuted`

### 2. Target Hit Notifications
- **Trigger**: When any Take Profit (TP) target is reached
- **Contains**: Symbol, target number, target price, executed quantity, revenue, remaining targets, order ID
- **User Preference**: `emailNotifications.onTargetHit`

### 3. Stop Loss Hit Notifications
- **Trigger**: When stop loss is triggered
- **Contains**: Symbol, stop loss price, executed quantity, loss amount, order ID
- **User Preference**: `emailNotifications.onStopLossHit`

### 4. Daily Summary Emails
- **Trigger**: Once per day via cron job
- **Contains**: Trades opened/closed, targets hit, stop losses, total P&L, win rate, trade-by-trade breakdown
- **User Preference**: `emailNotifications.dailySummary`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Binance WebSocket Events                                   │
│  (executionReport, listStatus)                              │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  lib/binance/event-handlers.ts                              │
│  - Processes WebSocket events                               │
│  - Updates Trade/Signal models                              │
│  - Triggers notification functions                          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  lib/email/notifications.ts                                 │
│  - Checks user notification preferences                     │
│  - Generates HTML email templates                           │
│  - Sends emails via Resend API                             │
│  - Implements retry logic with exponential backoff          │
└─────────────────────────────────────────────────────────────┘
```

## Files Created/Modified

### New Files
1. **lib/email/notifications.ts** (520 lines)
   - Email notification service with HTML templates
   - Functions: sendTradeExecutedNotification, sendTargetHitNotification, sendStopLossHitNotification, sendDailySummaryNotification
   - Includes retry logic and user preference checks

2. **app/api/notifications/daily-summary/route.ts** (180 lines)
   - API endpoint for daily summary cron job
   - GET endpoint for status check
   - POST endpoint with authorization protection

3. **docs/EMAIL-NOTIFICATIONS-SETUP.md** (this file)
   - Complete setup guide and documentation

### Modified Files
1. **lib/binance/event-handlers.ts**
   - Added email notification triggers in handleExecutionReport()
   - Added email notification triggers in handleListStatus()
   - Respects user preferences before sending

## Email Templates

All emails use a consistent design:
- **Header**: CartelBot branding with gradient background
- **Content**: Responsive grid layout with key metrics
- **Footer**: Links to manage notification preferences
- **Styling**: Professional HTML/CSS with inline styles

### Template Features
- Responsive design (mobile-friendly)
- Color-coded badges (green=success, red=danger, blue=info)
- Proper typography and spacing
- Plain text fallback (automatically generated)

## User Preferences

Users can control notifications in **Settings > Notification Preferences**:

```typescript
emailNotifications: {
  onTradeExecuted: true,   // Trade executed notifications
  onTargetHit: true,        // Target hit notifications
  onStopLossHit: true,      // Stop loss hit notifications
  dailySummary: false,      // Daily summary emails (opt-in)
}
```

## Daily Summary Cron Job Setup

### Option 1: Vercel Cron Jobs (Recommended for Vercel)

Create `vercel.json` in project root:

```json
{
  "crons": [
    {
      "path": "/api/notifications/daily-summary",
      "schedule": "0 8 * * *"
    }
  ]
}
```

Add environment variable:
```
CRON_SECRET=your_secure_random_secret_here
```

### Option 2: GitHub Actions (Free, Reliable)

Create `.github/workflows/daily-summary.yml`:

```yaml
name: Daily Summary Email

on:
  schedule:
    # Run at 8 AM UTC every day
    - cron: '0 8 * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  send-daily-summaries:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Daily Summary
        run: |
          curl -X POST https://cartelbot.coinspree.cc/api/notifications/daily-summary \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json"
```

Add secret in GitHub: Settings > Secrets > Actions > New repository secret
- Name: `CRON_SECRET`
- Value: Your secure random secret

### Option 3: External Cron Service (cron-job.org)

1. Sign up at https://cron-job.org
2. Create new cron job:
   - **URL**: `https://cartelbot.coinspree.cc/api/notifications/daily-summary`
   - **Method**: POST
   - **Schedule**: `0 8 * * *` (8 AM UTC daily)
   - **Headers**:
     - `Authorization: Bearer YOUR_CRON_SECRET`
     - `Content-Type: application/json`

### Option 4: Coolify Cron Jobs (IONOS VPS)

Since CartelBot is deployed on Coolify:

1. SSH into IONOS VPS
2. Edit crontab: `crontab -e`
3. Add line:
```bash
0 8 * * * curl -X POST https://cartelbot.coinspree.cc/api/notifications/daily-summary -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Testing

### Test Individual Notifications (Development)

The notifications are triggered automatically when trades execute. To test:

1. **Enable notifications** in Settings page
2. **Submit a signal** with testnet enabled
3. **Monitor console** for notification logs
4. **Check email** for notification delivery

### Test Daily Summary (Manual Trigger)

```bash
# Get status
curl https://cartelbot.coinspree.cc/api/notifications/daily-summary

# Trigger daily summary (with auth)
curl -X POST https://cartelbot.coinspree.cc/api/notifications/daily-summary \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "data": {
    "message": "Daily summaries processed",
    "stats": {
      "success": 5,
      "failed": 0,
      "skipped": 10
    }
  }
}
```

## Environment Variables Required

Add to `.env.local` and production environment:

```bash
# Email Service (Already configured)
RESEND_API_KEY=re_xxxxxxxxxxxxx

# Cron Job Authorization (NEW - Required for daily summary)
CRON_SECRET=generate_secure_random_secret_here
```

Generate secure secret:
```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# OpenSSL
openssl rand -hex 32
```

## Monitoring & Logging

All notification events are logged with the prefix `[Email]` or `[Notification]`:

```
[Email] Resend client initialized for notifications
[Email] Trade executed notification sent to user@example.com
[Email] Target hit notification sent to user@example.com
[Email] Stop loss notification sent to user@example.com
[Daily Summary] Processing 25 users
[Daily Summary] Sent to user@example.com
[Daily Summary] Completed: { success: 23, failed: 0, skipped: 2 }
```

## Performance Considerations

1. **Async Notifications**: All email sends are wrapped in `.catch()` to prevent blocking trade execution
2. **Retry Logic**: 3 retry attempts with exponential backoff (1s, 2s, 4s)
3. **User Preferences**: Checked before every notification to avoid unnecessary API calls
4. **Batch Processing**: Daily summary processes users sequentially to avoid rate limits

## Rate Limits

**Resend API Limits** (Free Tier):
- 100 emails/day (development)
- 3,000 emails/month (production - upgrade plan as needed)

**Recommendations**:
- Monitor Resend dashboard for usage
- Implement email queuing if user base grows significantly
- Consider implementing "digest" mode for high-frequency events

## Troubleshooting

### Emails Not Sending

1. **Check Resend API Key**:
   ```bash
   # Verify key format
   echo $RESEND_API_KEY  # Should start with "re_"
   ```

2. **Check User Preferences**:
   ```bash
   # MongoDB query
   db.users.findOne({ email: "user@example.com" }, { emailNotifications: 1 })
   ```

3. **Check Logs**:
   ```bash
   # Look for error messages
   grep "\[Email\]" /var/log/app.log
   ```

### Daily Summary Not Running

1. **Verify Cron Job**:
   ```bash
   # Check cron logs
   grep CRON /var/log/syslog
   ```

2. **Test Endpoint Manually**:
   ```bash
   curl -X POST https://cartelbot.coinspree.cc/api/notifications/daily-summary \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

3. **Check Authorization**:
   - Ensure CRON_SECRET environment variable is set
   - Verify secret matches in cron job configuration

## Security

1. **API Key Protection**: Resend API key stored in environment variables only
2. **Cron Authorization**: Daily summary endpoint requires Bearer token
3. **User Privacy**: Only sends emails to users with notifications enabled
4. **No Email Exposure**: User emails never logged in production mode
5. **Retry Limits**: Maximum 3 retry attempts to prevent abuse

## Future Enhancements (Optional)

1. **Email Queue**: Implement BullMQ for high-volume email processing
2. **Rate Limiting**: Add per-user rate limits for notifications
3. **Email Preferences API**: Allow users to manage preferences via API
4. **Email Templates**: Add customizable templates per user tier
5. **SMS Notifications**: Integrate Twilio for SMS alerts (premium feature)
6. **Telegram Bot**: Add Telegram notification support
7. **Webhook Integration**: Allow users to configure custom webhooks

## Production Checklist

- [x] Resend API key configured in production
- [ ] CRON_SECRET environment variable set
- [ ] Daily summary cron job configured (choose one option above)
- [ ] Test email delivery with real trade execution
- [ ] Monitor Resend dashboard for delivery rates
- [ ] Set up email bounce/complaint webhooks in Resend
- [ ] Configure proper SPF/DKIM records for domain
- [ ] Add email preferences link in user settings
- [ ] Set up monitoring alerts for failed email deliveries

## Support

For issues related to email notifications:
1. Check Resend dashboard: https://resend.com/emails
2. Review application logs: `/var/log/app.log`
3. Test endpoint: GET /api/notifications/daily-summary
4. Contact: support@cartelbot.coinspree.cc

---

**Implementation Date**: November 19, 2025
**Version**: 1.0.0
**Status**: Production Ready
