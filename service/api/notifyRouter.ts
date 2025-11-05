/**
 * Send a message to a Telegram chat
 *
 * @param token Telegram bot's token
 * @param chatId Telegram chat ID
 * @param text Message to send
 */
async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string
) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}

/**
 * Send an error notification to Slack
 *
 * @param webhookUrl Slack webhook URL
 * @param error Error object or message
 */
async function sendSlackErrorNotification(webhookUrl: string, error: any) {
  const errorMessage = error?.message || error?.toString() || "Unknown error";
  const errorStack = error?.stack || "No stack trace available";

  const slackMessage = {
    text: "🚨 Error executing the webhook for uptime-periphery",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🚨 Webhook Error - uptime-periphery",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Error executing the webhook for uptime-periphery*\n\nCheck logs in Vercel.\n\nProject: https://github.com/cowprotocol/uptime-periphery",
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Error Message:*\n\`\`\`${errorMessage}\`\`\``,
          },
          {
            type: "mrkdwn",
            text: `*Timestamp:*\n${new Date().toISOString()}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Stack Trace:*\n\`\`\`${errorStack.slice(0, 2000)}\`\`\``,
        },
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(slackMessage),
    });
    if (!res.ok) {
      console.error("Failed to send Slack notification:", await res.text());
    }
  } catch (slackError) {
    // Don't throw on Slack notification failure - just log it
    console.error("Error sending Slack notification:", slackError);
  }
}

/**
 * Escape a string for MarkdownV2
 *
 * @param s String to escape
 * @returns Escaped string
 */
function escapeMdV2(s: string) {
  // Minimal MarkdownV2 escaping for common symbols
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

export default {
  /**
   * Handle the request to notify the Telegram chat
   *
   * @param request Request object
   * @returns Response object
   */
  async fetch(request: Request) {
    try {
      // Router secret: Used to authenticate requests to the router to secure the hook
      const routerSecret = process.env.ROUTER_SECRET;

      // Telegram bot's token for the alerts
      const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN!;

      // Telegram channels
      const telegramChatNear = process.env.TELEGRAM_CHAT_NEAR;

      // Assert environment variables are set
      if (!routerSecret || !telegramBotToken || !telegramChatNear) {
        throw new Error(
          "Missing environment variables: ROUTER_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_NEAR"
        );
      }

      // Map by endpoint name prefix to Telegram chat ID
      const sitePrefixToTelegramId: Record<
        string,
        string | string[] | undefined
      > = {
        "Bridging - Near": telegramChatNear,
        "TEST - Intentional Failure": telegramChatNear, // For testing. Remove after.
      };

      const url = new URL(request.url);
      if (url.searchParams.get("key") !== routerSecret)
        return new Response("Not Authorized", { status: 401 });

      const payload = await request.json().catch(() => ({} as any));

      console.log("request payload:", payload);

      const textPayload =
        typeof payload === "string" ? payload : JSON.stringify(payload);

      // Try to extract a site name; fall back if not present
      const siteName =
        /"site(Name)?"\s*:\s*"(?<name>[^"]+)"/i.exec(textPayload)?.groups
          ?.name ||
        /(^|>)\s*(?<name>[^<(]+)\s*\(/.exec(textPayload)?.groups?.name ||
        "Unknown Site";

      const match = Object.entries(sitePrefixToTelegramId).find(([k]) =>
        siteName.startsWith(k)
      )?.[1];

      // If no matching route found, skip notification silently
      if (!match) {
        console.log("No route configured for site:", siteName);
        return new Response(null, { status: 204 });
      }

      const siteEsc = escapeMdV2(siteName);
      const rawEsc = escapeMdV2(textPayload.slice(0, 3500));
      const msg = `🚨 *Upptime alert*\n• *Site:* ${siteEsc}\n• *Raw:* \`${rawEsc}\``;

      const targets = Array.isArray(match) ? match : [match];
      await Promise.all(
        targets
          .filter(Boolean)
          .map((chatId) => sendTelegramMessage(telegramBotToken, chatId!, msg))
      );

      return new Response("ok");
    } catch (e: any) {
      console.error("error", e);

      // Send error notification to Slack
      const slackWebhookUrl = process.env.SLACK_ERROR_WEBHOOK_URL;
      if (slackWebhookUrl) {
        await sendSlackErrorNotification(slackWebhookUrl, e).catch(
          (slackErr) => {
            console.error(
              "Failed to send Slack error notification:",
              slackErr.message
            );
            console.error(slackErr);
          }
        );
      } else {
        console.warn("Missing environment variable: SLACK_ERROR_WEBHOOK_URL");
      }

      return new Response(
        `Error handling request: ${
          e?.message || e?.toString() || "Unknown error"
        }`,
        { status: 500 }
      );
    }
  },
};
