import type { MessageRouter } from '../message-router/message-router.js';
import type { TelegramUpdate } from '../message-router/message-parser.js';

export async function processTelegramWebhook(
  update: TelegramUpdate,
  router: MessageRouter
): Promise<void> {
  await router.route(update);
}
