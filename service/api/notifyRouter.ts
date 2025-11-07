/**
 * Required environment variable keys
 */
const REQUIRED_ENV_KEYS = [
  "ROUTER_SECRET", // webhook auth secret
  "TELEGRAM_BOT_TOKEN", // telegram bot token
  "TELEGRAM_CHAT_NEAR", // Near alerts
  "TELEGRAM_CHAT_BUNGEE", // Bungee alerts
  "TELEGRAM_CHAT_ACROSS", // Across alerts
  "TELEGRAM_CHAT_LIFI", // Lifi alerts
] as const;

type RequiredEnv = Record<(typeof REQUIRED_ENV_KEYS)[number], string>;

/**
 * Map Endpoint URL patterns to Telegram chat environment variables
 */
const URL_PATTERN_TO_ENV_KEY: Record<
  string,
  keyof RequiredEnv | Array<keyof RequiredEnv>
> = {
  "1click.chaindefuser.com": "TELEGRAM_CHAT_NEAR",
  "backend.bungee.exchange": "TELEGRAM_CHAT_BUNGEE",
};

export default {
  /**
   * Handle the request to notify the Telegram chat
   *
   * @param request Request object
   * @returns Response object
   */
  async fetch(request: Request) {
    try {
      // Get and validate required environment variables
      const env = getRequiredEnv();

      const url = new URL(request.url);
      if (url.searchParams.get("key") !== env.ROUTER_SECRET)
        return new Response("Not Authorized", { status: 401 });

      const payload = await request.json().catch(() => ({} as any));
      console.log("request payload:", payload);

      // Extract and clean the message from the payload
      const message = extractMessage(payload).replace(/^["']|["']$/g, "");
      console.log("extracted message:", message);

      // Extract site URL and name from the message
      const siteUrl = extractUrl(message);
      const siteName = extractSiteName(message);

      console.log("extracted URL:", siteUrl);
      console.log("extracted site name:", siteName);

      // Find matching Telegram chat ID(s) based on URL
      const chatIds = getTelegramChatId(siteUrl, env);

      // If no matching route found, skip notification silently
      if (!chatIds) {
        console.log(
          `No route configured for URL: ${siteUrl}. Available patterns: ${Object.keys(
            URL_PATTERN_TO_ENV_KEY
          ).join(", ")}`
        );
        return new Response(null, { status: 204 });
      }

      // Truncate message if needed (Telegram has a 4096 character limit)
      const telegramMessage = message.slice(0, 4000);

      console.log("Sending to Telegram:", {
        siteName,
        siteUrl,
        targets: chatIds,
      });

      const targets = Array.isArray(chatIds) ? chatIds : [chatIds];
      await Promise.all(
        targets
          .filter(Boolean)
          .map((chatId) =>
            sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, telegramMessage)
          )
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
 * Extract the message from the Upptime webhook payload
 *
 * @param payload The webhook payload
 * @returns The extracted message string
 */
function extractMessage(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const payloadObj = payload as any;
    if (payloadObj.data?.message) {
      return payloadObj.data.message;
    }
    if (payloadObj.message) {
      return payloadObj.message;
    }
  }

  return JSON.stringify(payload);
}

/**
 * Extract the URL from an Upptime alert message
 *
 * @param message The alert message
 * @returns The extracted URL or null
 */
function extractUrl(message: string): string | null {
  // Message format: "🟥 Site Name (https://example.com) is **down** : ..."
  const urlMatch = /\((?<url>https?:\/\/[^)]+)\)/.exec(message);
  return urlMatch?.groups?.url || null;
}

/**
 * Extract the site name from an Upptime alert message
 *
 * @param message The alert message
 * @returns The extracted site name
 */
function extractSiteName(message: string): string {
  // First try to extract from JSON format
  const jsonMatch = /"site(Name)?"\s*:\s*"(?<name>[^"]+)"/i.exec(message);
  if (jsonMatch?.groups?.name) {
    return jsonMatch.groups.name;
  }

  // Then try message format (with or without emoji)
  const messageMatch = /^\s*(?<name>[^(]+?)\s*\(/.exec(message);
  return messageMatch?.groups?.name?.trim() || "Unknown Site";
}

/**
 * Validate and return required environment variables
 *
 * @returns The validated environment variables
 * @throws Error if any required environment variable is missing
 */
function getRequiredEnv(): RequiredEnv {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  return Object.fromEntries(
    REQUIRED_ENV_KEYS.map((key) => [key, process.env[key]!])
  ) as RequiredEnv;
}

/**
 * Get Telegram chat ID(s) for a given URL
 *
 * @param url The site URL from the alert
 * @param env The environment variables object
 * @returns The chat ID(s) or undefined if no match found
 */
function getTelegramChatId(
  url: string | null,
  env: RequiredEnv
): string | string[] | undefined {
  if (!url) return undefined;

  const envKey = Object.entries(URL_PATTERN_TO_ENV_KEY).find(([pattern]) =>
    url.includes(pattern)
  )?.[1];

  if (!envKey) return undefined;

  if (Array.isArray(envKey)) {
    return envKey.map((key) => env[key]);
  }

  return env[envKey];
}
