const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
import { withAuth } from "@/lib/withAuth";

/**
 * GET /api/telegram/chat-id
 * Get the Telegram chat ID by polling getUpdates.
 * The user must have sent a message to the bot first.
 */
export const GET = withAuth(async (request, context, authContext) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return Response.json(
      { error: "Telegram bot token not configured" },
      { status: 500 }
    );
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?limit=5&offset=-5`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.description || `Telegram API error: ${res.status}`);
    }

    const data = await res.json();
    const updates = data.result || [];

    // Find the latest chat
    const chats = [];
    for (const update of updates) {
      const chat = update?.message?.chat;
      if (chat) {
        chats.push({
          chat_id: chat.id,
          type: chat.type,
          title: chat.title || null,
          username: chat.username || null,
          first_name: chat.first_name || null,
          last_name: chat.last_name || null,
        });
      }
    }

    // Deduplicate by chat_id
    const uniqueChats = [];
    const seen = new Set();
    for (const c of chats) {
      if (!seen.has(c.chat_id)) {
        seen.add(c.chat_id);
        uniqueChats.push(c);
      }
    }

    return Response.json({
      chats: uniqueChats,
      latest_chat_id: uniqueChats[0]?.chat_id || null,
      instructions: uniqueChats.length === 0
        ? "Send a message to the bot first to get your chat ID"
        : "Use one of these chat IDs to receive reports",
    });
  } catch (error) {
    console.error("Get chat ID error:", error);
    return Response.json(
      { error: `Failed to get chat ID: ${error.message}` },
      { status: 500 }
    );
  }
}, { minRole: "viewer" });
