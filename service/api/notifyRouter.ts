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
    console.log("request", request);
    try {
      // Router secret: Used to authenticate requests to the router to secure the hook
      const routerSecret = process.env.ROUTER_SECRET;
      console.log("routerSecret", routerSecret);

      // Telegram bot's token for the alerts
      const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN!;
      console.log("telegramBotToken", telegramBotToken);

      // NEAR Telegram chat IDs
      const telegramChatNear = process.env.TELEGRAM_CHAT_NEAR;
      console.log("telegramChatNear", telegramChatNear);

      // Assert environment variables are set
      if (!routerSecret || !telegramBotToken || !telegramChatNear) {
        throw new Error(
          "3Missing environment variables: ROUTER_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_NEAR"
        );
      }

      // Map by endpoint name prefix to Telegram chat ID
      const NAME_PREFIX_TO_TELEGRAM_CHAT_ID: Record<
        string,
        string | string[] | undefined
      > = {
        "Bridging - Near": telegramChatNear,
        "TEST - Intentional Failure": telegramChatNear, // For testing. Remove after.
      };

      const url = new URL(request.url);
      if (url.searchParams.get("key") !== routerSecret)
        return new Response("unauthorized", { status: 401 });

      const payload = await request.json().catch(() => ({} as any));
      const textPayload =
        typeof payload === "string" ? payload : JSON.stringify(payload);

      // Try to extract a site name; fall back if not present
      const siteName =
        /"site(Name)?"\s*:\s*"(?<name>[^"]+)"/i.exec(textPayload)?.groups
          ?.name ||
        /(^|>)\s*(?<name>[^<(]+)\s*\(/.exec(textPayload)?.groups?.name ||
        "Unknown Site";

      const match = Object.entries(NAME_PREFIX_TO_TELEGRAM_CHAT_ID).find(
        ([k]) => siteName.startsWith(k)
      )?.[1];

      // If no matching route found, skip notification silently
      if (!match) {
        return new Response("no route configured - skipping", { status: 204 });
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
      return new Response(`error: ${e?.message || e}`, { status: 500 });
    }
  },
};
