import { TelegramUpdateRouter, type TelegramRouteResult, type TelegramUpdate } from './router.js';

export type TelegramClientPort = {
  sendMessage(chatId: string, text: string): Promise<void>;
};

export async function processTelegramWebhook(
  update: TelegramUpdate,
  router: TelegramUpdateRouter,
  telegramClient: TelegramClientPort
): Promise<TelegramRouteResult> {
  const result = await router.route(update);

  for (const message of result.messages) {
    await telegramClient.sendMessage(message.chatId, message.text);
  }

  return result;
}
