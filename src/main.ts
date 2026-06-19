import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from './config/env.js';
import { buildServer, startServer } from './server.js';
import { DbConversationStateRepository } from './adapters/db/conversation-state.repository.js';
import { StaticStaffAllowlistStore, TelegramUpdateRouter } from './delivery/telegram/router.js';

async function main() {
  // DB
  const sql = postgres(env.DATABASE_URL, { max: 10, prepare: false });
  const db = drizzle(sql);

  // Dependencies
  const conversations = new DbConversationStateRepository(db);
  const staffAllowlist = new StaticStaffAllowlistStore(
    env.TELEGRAM_STAFF_GROUP_CHAT_ID.split(',').map((id) => id.trim())
  );

  // Telegram client (real HTTP calls to Bot API)
  const telegramClient = {
    async sendMessage(chatId: string, text: string): Promise<void> {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text })
      });
    }
  };

  // Router
  const router = new TelegramUpdateRouter(conversations, staffAllowlist);

  // Server
  const server = buildServer(router, telegramClient, env);
  await startServer(server, env.PORT);

  console.log(`Telegram bot MVP running on port ${env.PORT}`);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
