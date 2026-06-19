import type { IncomingMessage, ServerResponse } from 'node:http';
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

export async function handleTelegramWebhookRequest(
  request: IncomingMessage,
  response: ServerResponse,
  router: TelegramUpdateRouter,
  telegramClient: TelegramClientPort
): Promise<void> {
  if (request.method !== 'POST') {
    response.writeHead(405, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  try {
    const body = await readJsonBody<TelegramUpdate>(request);
    await processTelegramWebhook(body, router, telegramClient);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
  } catch {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: false, error: 'invalid_update' }));
  }
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}
