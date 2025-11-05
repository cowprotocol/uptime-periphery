## Webhook for Upptime

This is a webhook for Upptime to notify the Telegram chat.

## Test the webhook

Assuming the [.upptimerc.yml](../.upptimerc.yml) is configured with a site whose name starts with "TEST - Intentional Failure", you can test the webhook with the following command:

```bash
 curl -X POST "https://uptime-periphery.vercel.app/api/notifyRouter?key=<ROUTER_SECRET>" \
  -H "content-type: application/json" \
  -d '{"site":"TEST - Intentional Failure","status":"down"}'
```

## How to add a new notification channel
If there's a site whose status needs to be reported to a new channel. 

1. Create a new Telegram channel for the notifications. Add anyone who needs to be notified to the channel.
2. Add the Telegram Bot to that channel. Write anything in that channel (relevant for next step).
3. Get the Telegram Chat ID of the channel by checking the result of this https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates. Make sure you add the telegram bot token to the URL. 
4. Create a new site. Make sure the name starts with the a given text (let's call this the `prefix`).
5. Add the `prefix` to the `sitePrefixToTelegramId` record in the [notifyRouter.ts](api/notifyRouter.ts) file, and map it to the Telegram Chat ID you got in step 2.
6. Deploy the changes to the Vercel app.

NOTIFICATION_CUSTOM_WEBHOOK=true

NOTIFICATION_CUSTOM_WEBHOOK_URL=https://uptime-periphery.vercel.app/api/upptime?key=cow-upptime-xyz