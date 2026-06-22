# Design: Telegram Bot MVP

## Technical Approach

Dockerized TypeScript Node backend with Telegram as the primary delivery surface. Clean/hexagonal architecture: Telegram, Gemini, Google Calendar, PostgreSQL/pgvector, and Telegram Bot API live behind adapters; scheduling, eligibility, knowledge, and staff workflows stay in application/domain code. Routing uses Chain of Responsibility — adding a command requires one new handler class and one `registerHandler()` call, with no changes to the router.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Runtime | Node.js + TypeScript backend | Next.js/web-first | MVP is Telegram-first and needs webhook/use-case orchestration, not UI. |
| Architecture | Clean/hexagonal modules | Framework-centric modules | Keeps domain rules independent from Telegram/Gemini/Calendar APIs. |
| Routing | Chain of Responsibility (`MessageRouter`) | Single if-else router | Open/Closed Principle — new commands don't require modifying existing router code. |
| Messaging abstraction | `MessagingPort` interface | Direct Telegram SDK calls in handlers | Allows swapping Telegram → WhatsApp without touching domain or application layers. |
| Commands | `BotCommand` enum | Hardcoded string literals | Single source of truth; typos caught at compile time. |
| Environments | Dockerized app everywhere; local Docker Compose with app + pgvector Postgres; production app container + Supabase Postgres | Local native Node/Postgres; managed app platform assumptions | Same app artifact across environments while `DATABASE_URL` selects local or Supabase DB. |
| Local dev image | `Dockerfile.dev` (all deps) vs `Dockerfile` (prod, omit dev) | Single Dockerfile with build args | Explicit separation avoids `tsx not found` errors caused by cached node_modules volumes. |
| Persistence | PostgreSQL + Drizzle + pgvector | In-memory/vector SaaS | One durable store for conversations, cases, rules, events, and embeddings. |
| AI provider | Configurable Gemini/Ollama ports for embeddings and generation; local Docker dev defaults to Ollama | Direct SDK calls in domain | Keeps domain logic provider-agnostic, avoids Gemini quota blocking local development, and preserves Gemini as an alternate provider selected by configuration. |
| Calendar truth | Live Google Calendar free-busy + event creation | Cached slots only | Prevents double booking; final confirmation always rechecks. |
| Authorization | Telegram user ID allowlist (`StaticStaffAllowlistStore`) | Passwords/admin panel | Fits bot-first MVP and supports staff/private group flows. |
| Language | All user-facing messages in Spanish | Bilingual | Target audience is Spanish-speaking patients. |

## Component Map

```
src/
├── config/
│   └── env.ts                          Zod-validated env with all required vars
├── ports/
│   ├── messaging.port.ts               MessagingPort (sendMessage)
│   ├── calendar.port.ts                CalendarPort (freeBusy, createEvent)
│   ├── ai.port.ts                      EmbeddingPort, GenerationPort
│   └── vector-store.port.ts            VectorStorePort
├── adapters/
│   ├── messaging/
│   │   ├── telegram-messaging.adapter.ts    ✅ active
│   │   └── whatsapp-messaging.adapter.ts    🔲 placeholder
│   ├── google-calendar/
│   │   └── google-calendar.adapter.ts       ✅ active (OAuth refresh token)
│   ├── db/
│   │   └── conversation-state.repository.ts ✅ active
│   └── vector-store/                        ✅ implemented, pending wire-up
├── domain/
│   ├── commands/
│   │   ├── bot-commands.ts             BotCommand enum, MessageType enum
│   │   ├── command-handler.interface.ts
│   │   ├── handler-context.ts
│   │   ├── parsed-message.ts
│   │   └── handlers/
│   │       ├── authorization-guard.handler.ts
│   │       ├── reply-command.handler.ts
│   │       ├── file-upload.handler.ts
│   │       ├── staff-command.handler.ts
│   │       ├── start-command.handler.ts
│   │       ├── schedule-command.handler.ts
│   │       └── text-message.handler.ts
│   ├── conversation/
│   │   └── conversation-state.ts
│   └── eligibility/
│       └── eligibility-engine.ts
├── application/
│   ├── scheduling/
│   │   └── scheduling-flow.ts          location→date→slot→intake→confirm
│   ├── calendar/
│   │   └── availability.service.ts     freeBusy + confirmBooking
│   ├── notifications/
│   │   ├── notification.service.ts
│   │   └── staff-reply.service.ts
│   ├── knowledge/                      ✅ implemented, pending Gemini wire-up
│   ├── qa/
│   │   └── rag-qa-flow.ts              ✅ implemented, pending Gemini wire-up
│   └── staff/                          ✅ implemented
├── delivery/
│   ├── message-router/
│   │   ├── message-parser.ts           TelegramUpdate → ParsedMessage
│   │   └── message-router.ts           Chain of Responsibility + StaticStaffAllowlistStore
│   └── telegram/
│       └── webhook.ts                  processTelegramWebhook
└── main.ts                             Wires all adapters and starts Fastify server
```

## Data Flow

### Telegram delivery and scheduling

```text
POST /webhook/telegram
  → MessageParser (TelegramUpdate → ParsedMessage)
  → MessageRouter (chain iteration)
      → AuthorizationGuard       denies unauthorized staff commands
      → ReplyCommandHandler      /reply <caseId> <msg> → StaffReplyService
      → FileUploadHandler        document/photo/audio → NotificationService
      → StaffCommandHandler      authorized staff commands
      → StartCommandHandler      /start
      → ScheduleCommandHandler   /schedule → SchedulingFlow
      → TextMessageHandler       plain text → SchedulingFlow (active step)

SchedulingFlow
  → location → date → AvailabilityService.availableSlots (freeBusy)
  → intake → EligibilityEngine.evaluate
  → confirm → AvailabilityService.confirmBooking
      → CalendarPort.freeBusy (recheck)
      → CalendarPort.createEvent
      → NotificationService.appointmentConfirmed (staff group)
```

### RAG pipeline

```text
Staff PDF/text → Parse → Chunk → EmbeddingPort → pgvector upsert
Patient question → VectorStorePort.search → GenerationPort.answer → Telegram reply
Patient file → PatientCaseFile only (never written to knowledge_documents)
```

Local development uses Ollama at `http://host.docker.internal:11434` from inside Docker Desktop on macOS. `nomic-embed-text` is required for 768-dimensional embeddings that match the current pgvector schema. Gemini remains available by setting `AI_PROVIDER=gemini` and providing `GEMINI_API_KEY`.

### Google Calendar sequence

```text
Patient selects slot → AvailabilityService.availableSlots → CalendarPort.freeBusy
Patient confirms + eligibility pass → CalendarPort.freeBusy recheck → CalendarPort.createEvent
Review-required case → save pending_review → notify staff → no Calendar event until approval
```

### Environment/deployment flow

```text
Local:  docker-compose.local.yml → Dockerfile.dev (all deps) → app + postgres(pgvector)
Prod:   Dockerfile (prod, omit dev) → Dockerized app → Supabase Postgres(pgvector)
Both:   Drizzle migrations → DATABASE_URL-specific target
Tunnel: cloudflared tunnel --url http://localhost:3000 → trycloudflare.com URL → setWebhook
```

## Interfaces / Contracts

Ports: `MessagingPort.sendMessage()`, `CalendarPort.freeBusy()`, `CalendarPort.createEvent()`, `EmbeddingPort.embedChunks()`, `GenerationPort.answer()`/`extractRules()`, repositories for conversations, users, cases, rules, documents, embeddings.

Persistence entities: `telegram_users`, `staff_allowlist`, `conversation_states`, `locations`, `schedules`, `patient_cases`, `case_files`, `rule_definitions`, `rule_drafts`, `appointments`, `knowledge_documents`, `knowledge_chunks(vector)`, `staff_notifications`, `reply_threads`.

Key invariants:
- Only allowlisted Telegram IDs perform staff operations
- Pending-review cases never create Calendar events
- Patient files are never written to `knowledge_documents`/`knowledge_chunks`
- Migrations must be environment-neutral and driven by `DATABASE_URL`
- All user-facing messages are in Spanish

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Eligibility engine, state transitions, RAG boundary guards, handler routing | Vitest; ports mocked. |
| Integration | Drizzle migrations/repositories, scheduling+calendar flow, notifications | Run against Docker Compose pgvector Postgres. |
| E2E | Telegram scheduling, review hold, staff-mediated reply prefix | Webhook fixture tests with mocked Telegram API and fake providers. |

Current status: 27 tests passing, 1 skipped (DB integration requires live DB flag).

## Open Questions

- [x] ~~Exact Google OAuth/service-account ownership model for the shared practice calendar.~~ Resolved: personal Google account OAuth with refresh token.
- [x] ~~Final bilingual copy policy for patient-facing Telegram messages.~~ Resolved: Spanish only.
- [x] ~~Gemini adapter implementation for RAG Q&A activation.~~ Resolved: AI ports can now be backed by Gemini or Ollama through `AI_PROVIDER`.
- [ ] Production deployment guide (Supabase + Dockerfile + webhook URL).
- [ ] WhatsApp migration plan when needed (adapter placeholder exists).
