import { Bot } from "grammy";

export async function sendCommitMessages(
  bot: Bot<any>,
  messages: string[],
  chatId: bigint,
  threadId?: number | null
) {
  for (const msg of messages) {
    try {
      console.log(`📤 Отправка в чат ${chatId}, поток ${threadId}`);
      await bot.api.sendMessage(Number(chatId), msg, {
        parse_mode: "MarkdownV2",
        message_thread_id: threadId ? Number(threadId) : undefined,
      });
    } catch (err) {
      console.error(`Ошибка при отправке сообщения в чат ${chatId}:`, err);
    }
  }
}
