import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from './config/env.js';
import { buildServer, startServer } from './server.js';
import { DbConversationStateRepository } from './adapters/db/conversation-state.repository.js';
import { DbScheduleRepository } from './adapters/db/schedule.repository.js';
import { TelegramMessagingAdapter } from './adapters/messaging/telegram-messaging.adapter.js';
import { GoogleCalendarAdapter } from './adapters/google-calendar/google-calendar.adapter.js';
import { GeminiAdapter } from './adapters/gemini/gemini.adapter.js';
import { PgVectorStore } from './adapters/vector-store/pgvector-store.js';
import { MessageRouter, StaticStaffAllowlistStore } from './delivery/message-router/message-router.js';
import { AvailabilityService } from './application/calendar/availability.service.js';
import { SchedulingFlow } from './application/scheduling/scheduling-flow.js';
import { RagQaFlow } from './application/qa/rag-qa-flow.js';
import { KnowledgeIngestionService } from './application/knowledge/knowledge-ingestion.js';
import { AuthorizationGuard } from './domain/commands/handlers/authorization-guard.handler.js';
import { ReplyCommandHandler } from './domain/commands/handlers/reply-command.handler.js';
import { FileUploadHandler } from './domain/commands/handlers/file-upload.handler.js';
import { StaffCommandHandler } from './domain/commands/handlers/staff-command.handler.js';
import { StartCommandHandler } from './domain/commands/handlers/start-command.handler.js';
import { ScheduleCommandHandler } from './domain/commands/handlers/schedule-command.handler.js';
import { UploadDocumentHandler } from './domain/commands/handlers/upload-document.handler.js';
import { TextMessageHandler } from './domain/commands/handlers/text-message.handler.js';

async function main() {
  // DB
  const sql = postgres(env.DATABASE_URL, { max: 10, prepare: false });
  const db = drizzle(sql);

  // Infrastructure
  const conversations = new DbConversationStateRepository(db);
  const scheduleRepo = new DbScheduleRepository(db);
  const staffAllowlist = new StaticStaffAllowlistStore(
    env.TELEGRAM_STAFF_GROUP_CHAT_ID.split(',').map((id) => id.trim())
  );
  const messaging = new TelegramMessagingAdapter(env.TELEGRAM_BOT_TOKEN);

  // External services
  const calendar = new GoogleCalendarAdapter({
    calendarId: env.GOOGLE_CALENDAR_ID,
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    refreshToken: env.GOOGLE_REFRESH_TOKEN
  });
  const gemini = new GeminiAdapter({
    apiKey: env.GEMINI_API_KEY,
    generationModel: env.GEMINI_MODEL,
    embeddingModel: env.GEMINI_EMBEDDING_MODEL
  });
  const vectorStore = new PgVectorStore(db);

  // Application services
  const availability = new AvailabilityService(calendar, undefined, undefined, scheduleRepo);
  const schedulingFlow = new SchedulingFlow(conversations, undefined, availability, undefined, undefined, gemini);
  const ragQaFlow = new RagQaFlow(gemini, vectorStore, gemini);
  const knowledgeIngestion = new KnowledgeIngestionService(
    { isAuthorized: (id) => staffAllowlist.isAuthorized(id) },
    gemini,
    vectorStore
  );
  const uploadDocumentHandler = new UploadDocumentHandler(knowledgeIngestion, gemini, scheduleRepo);

  // Router — handlers registered in priority order
  const router = new MessageRouter(
    staffAllowlist,
    conversations,
    schedulingFlow,
    messaging,
    undefined,
    undefined,
    ragQaFlow,
    uploadDocumentHandler
  )
    .registerHandler(new AuthorizationGuard())        // 1. deny unauthorized staff commands
    .registerHandler(new ReplyCommandHandler())        // 2. /reply <caseId> <msg>
    .registerHandler(new FileUploadHandler())          // 3. file uploads
    .registerHandler(new UploadDocumentHandler(knowledgeIngestion, gemini, scheduleRepo))  // 4. /upload_document
    .registerHandler(new StaffCommandHandler())        // 5. authorized staff commands
    .registerHandler(new StartCommandHandler())        // 6. /start
    .registerHandler(new ScheduleCommandHandler())     // 7. /schedule
    .registerHandler(new TextMessageHandler());        // 8. fallback (RAG or scheduling)

  // Server
  const server = buildServer(router, env);
  await startServer(server, env.PORT);

  console.log(`Telegram bot MVP running on port ${env.PORT}`);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
