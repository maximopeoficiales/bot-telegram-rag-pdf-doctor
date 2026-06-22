import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from './config/env.js';
import { processTelegramWebhook } from './delivery/telegram/webhook.js';
import type { MessageRouter } from './delivery/message-router/message-router.js';
import type { TelegramUpdate } from './delivery/message-router/message-parser.js';
import type { MessagingPort } from './ports/messaging.port.js';

function isGeminiRateLimit(err: unknown): boolean {
  return err instanceof Error && err.message.includes('429');
}

function isGeminiUnavailable(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message.includes('EAI_AGAIN') ||
      err.message.includes('fetch failed') ||
      err.message.includes('ECONNREFUSED'))
  );
}

export function buildServer(
  router: MessageRouter,
  env: Pick<Env, 'NODE_ENV'>,
  messaging?: MessagingPort
): FastifyInstance {
  const fastify = Fastify({
    logger: env.NODE_ENV !== 'test'
  });

  fastify.get('/health', async (_request, reply) => {
    return reply.status(200).send({ ok: true, service: 'telegram-bot-mvp' });
  });

  fastify.post<{ Body: TelegramUpdate }>('/webhook/telegram', async (request, reply) => {
    try {
      await processTelegramWebhook(request.body, router);
    } catch (err) {
      fastify.log.error(err);

      // Always return 200 to Telegram — prevents infinite retry loops
      // Try to notify the user if we can extract their chat ID
      if (messaging) {
        try {
          const chatId = request.body?.message?.chat?.id?.toString();
          if (chatId) {
            if (isGeminiRateLimit(err)) {
              await messaging.sendMessage(
                chatId,
                'El servicio de inteligencia está temporalmente saturado. Por favor intenta en unos minutos.'
              );
            } else if (isGeminiUnavailable(err)) {
              await messaging.sendMessage(
                chatId,
                'No puedo conectarme al servicio en este momento. Por favor intenta más tarde.'
              );
            } else {
              await messaging.sendMessage(
                chatId,
                'Ocurrió un error inesperado. Por favor intenta de nuevo.'
              );
            }
          }
        } catch {
          // Swallow messaging errors — we must still return 200
        }
      }
    }

    return reply.status(200).send({ ok: true });
  });

  return fastify;
}

export async function startServer(
  fastify: FastifyInstance,
  port: number,
  host = '0.0.0.0'
): Promise<void> {
  await fastify.listen({ port, host });
}
