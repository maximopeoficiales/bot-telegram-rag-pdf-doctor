import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from './config/env.js';
import { processTelegramWebhook } from './delivery/telegram/webhook.js';
import type { MessageRouter } from './delivery/message-router/message-router.js';
import type { TelegramUpdate } from './delivery/message-router/message-parser.js';
import type { MessagingPort } from './ports/messaging.port.js';

// ---------------------------------------------------------------------------
// Deduplication — prevents Telegram retry storms on slow webhook responses.
// Telegram resends the same update_id if it doesn't receive 200 within ~5s.
// Long operations (Ollama embeddings, RAG) regularly exceed that threshold.
// ---------------------------------------------------------------------------
const DEDUP_TTL_MS = 60_000;

function makeDeduplicator() {
  const seen = new Map<number, number>(); // update_id → expiresAt

  function isDuplicate(updateId: number): boolean {
    const now = Date.now();
    // Evict expired entries to avoid unbounded growth
    for (const [id, exp] of seen) {
      if (exp < now) seen.delete(id);
    }
    if (seen.has(updateId)) return true;
    seen.set(updateId, now + DEDUP_TTL_MS);
    return false;
  }

  return { isDuplicate };
}

function isAiUnavailable(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message.includes('EAI_AGAIN') ||
      err.message.includes('fetch failed') ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('AbortError'))
  );
}

function isAiRateLimit(err: unknown): boolean {
  return err instanceof Error && err.message.includes('429');
}

export function buildServer(
  router: MessageRouter,
  env: Pick<Env, 'NODE_ENV'>,
  messaging?: MessagingPort
): FastifyInstance {
  const fastify = Fastify({
    logger: env.NODE_ENV !== 'test'
  });

  const dedup = makeDeduplicator();

  fastify.get('/health', async (_request, reply) => {
    return reply.status(200).send({ ok: true, service: 'telegram-bot-mvp' });
  });

  fastify.post<{ Body: TelegramUpdate }>('/webhook/telegram', async (request, reply) => {
    const update = request.body;
    const updateId = update?.update_id;

    // Deduplicate — ack immediately and skip processing if already seen
    if (typeof updateId === 'number' && dedup.isDuplicate(updateId)) {
      return reply.status(200).send({ ok: true });
    }

    // Respond 200 to Telegram immediately — fire-and-forget processing.
    // This prevents Telegram from retrying while slow operations (Ollama
    // embeddings, RAG vector search) are still in flight.
    reply.status(200).send({ ok: true });

    // Process in background — errors cannot propagate to Telegram here
    processTelegramWebhook(update, router).catch(async (err: unknown) => {
      fastify.log.error(err);

      if (!messaging) return;
      try {
        const chatId = update?.message?.chat?.id?.toString();
        if (!chatId) return;

        if (isAiRateLimit(err)) {
          await messaging.sendMessage(
            chatId,
            'El servicio de inteligencia está temporalmente saturado. Por favor intenta en unos minutos.'
          );
        } else if (isAiUnavailable(err)) {
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
      } catch {
        // Swallow messaging errors — background handler must not throw
      }
    });
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
