import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from './config/env.js';
import { processTelegramWebhook } from './delivery/telegram/webhook.js';
import type { MessageRouter } from './delivery/message-router/message-router.js';
import type { TelegramUpdate } from './delivery/message-router/message-parser.js';

export function buildServer(
  router: MessageRouter,
  env: Pick<Env, 'NODE_ENV'>
): FastifyInstance {
  const fastify = Fastify({
    logger: env.NODE_ENV !== 'test'
  });

  fastify.get('/health', async (_request, reply) => {
    return reply.status(200).send({ ok: true, service: 'telegram-bot-mvp' });
  });

  fastify.post<{ Body: TelegramUpdate }>('/webhook/telegram', async (request, reply) => {
    await processTelegramWebhook(request.body, router);
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
