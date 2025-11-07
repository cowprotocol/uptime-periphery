## Webhook for Upptime

This is a webhook for Upptime to notify the Telegram chat. It also report unhandled errors to Slack.

## Test the webhook

Assuming the [.upptimerc.yml](../.upptimerc.yml) is configured with a test site, you can test the webhook with the following command:

```bash
curl -X POST "https://uptime-periphery.vercel.app/api/notifyRouter?key=<ROUTER_SECRET>" \
  -H "content-type: application/json" \
  -d '{"data":{"message":"🟥 TEST - Intentional Failure 11 (https://this-url-does-not-exist-12345678411.com) is **down**"}}'
```

## How to add a new notification channel

If there's a site whose status needs to be reported to a new Telegram channel:

1. Create a new Telegram channel for the notifications. Add anyone who needs to be notified to the channel.
2. Add the Telegram Bot to that channel. Write anything in that channel (relevant for next step).
3. Get the Telegram Chat ID of the channel by checking the result of this https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates. Make sure you add the telegram bot token to the URL.
4. Create a new site in [.upptimerc.yml](../.upptimerc.yml) with the URL you want to monitor.
5. Add a URL pattern from that site to the `urlPatternToTelegramId` record in the [notifyRouter.ts](api/notifyRouter.ts) file, and map it to the Telegram Chat ID you got in step 3.
   - Example: For `https://1click.chaindefuser.com/v0/tokens`, use pattern `"1click.chaindefuser.com"`
6. Add the environment variable to the Vercel project.
7. Deploy the changes to the Vercel app.

## Environment Variables

Required environment variables in Vercel:

- `ROUTER_SECRET` - Secret key to authenticate webhook requests
- `TELEGRAM_BOT_TOKEN` - Telegram bot token for sending notifications
- `TELEGRAM_CHAT_NEAR` - Telegram chat ID for Near-related alerts
- `SLACK_ERROR_WEBHOOK_URL` - Slack webhook URL for error notifications (optional but recommended)