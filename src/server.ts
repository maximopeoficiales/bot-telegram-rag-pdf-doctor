import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from './config/env.js';
import { processTelegramWebhook, type TelegramClientPort } from './delivery/telegram/webhook.js';
import type { TelegramUpdate, TelegramUpdateRouter } from './delivery/telegram/router.js';

export function buildServer(
  router: TelegramUpdateRouter,
  telegramClient: TelegramClientPort,
  env: Pick<Env, 'NODE_ENV'>
): FastifyInstance {
  const fastify = Fastify({
    logger: env.NODE_ENV !== 'test'
  });

  fastify.get('/health', async (_request, reply) => {
    return reply.status(200).send({ ok: true, service: 'telegram-bot-mvp' });
  });

  fastify.post<{ Body: TelegramUpdate }>('/webhook', async (request, reply) => {
    await processTelegramWebhook(request.body, router, telegramClient);
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
