import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from './config/env.js';
import { buildServer, startServer } from './server.js';
import { DbConversationStateRepository } from './adapters/db/conversation-state.repository.js';
import { TelegramMessagingAdapter } from './adapters/messaging/telegram-messaging.adapter.js';
import { MessageRouter } from './delivery/message-router/message-router.js';
import { StaticStaffAllowlistStore } from './delivery/message-router/message-router.js';
import { SchedulingFlow } from './application/scheduling/scheduling-flow.js';
import { AuthorizationGuard } from './domain/commands/handlers/authorization-guard.handler.js';
import { ReplyCommandHandler } from './domain/commands/handlers/reply-command.handler.js';
import { FileUploadHandler } from './domain/commands/handlers/file-upload.handler.js';
import { StaffCommandHandler } from './domain/commands/handlers/staff-command.handler.js';
import { StartCommandHandler } from './domain/commands/handlers/start-command.handler.js';
import { ScheduleCommandHandler } from './domain/commands/handlers/schedule-command.handler.js';
import { TextMessageHandler } from './domain/commands/handlers/text-message.handler.js';

async function main() {
  // DB
  const sql = postgres(env.DATABASE_URL, { max: 10, prepare: false });
  const db = drizzle(sql);

  // Infrastructure
  const conversations = new DbConversationStateRepository(db);
  const staffAllowlist = new StaticStaffAllowlistStore(
    env.TELEGRAM_STAFF_GROUP_CHAT_ID.split(',').map((id) => id.trim())
  );
  const messaging = new TelegramMessagingAdapter(env.TELEGRAM_BOT_TOKEN);

  // Application services
  const schedulingFlow = new SchedulingFlow(conversations);

  // Router — handlers registered in priority order
  const router = new MessageRouter(staffAllowlist, conversations, schedulingFlow, messaging)
    .registerHandler(new AuthorizationGuard())       // 1. deny unauthorized staff commands
    .registerHandler(new ReplyCommandHandler())       // 2. /reply <caseId> <msg>
    .registerHandler(new FileUploadHandler())         // 3. file uploads
    .registerHandler(new StaffCommandHandler())       // 4. authorized staff commands
    .registerHandler(new StartCommandHandler())       // 5. /start
    .registerHandler(new ScheduleCommandHandler())    // 6. /schedule
    .registerHandler(new TextMessageHandler());       // 7. fallback (plain text)

  // Server
  const server = buildServer(router, env);
  await startServer(server, env.PORT);

  console.log(`Telegram bot MVP running on port ${env.PORT}`);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
