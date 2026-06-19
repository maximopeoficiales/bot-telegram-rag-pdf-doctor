# Design: Telegram Bot MVP

## Technical Approach

Build a Dockerized TypeScript Node backend with Telegram as the only MVP delivery surface. The workspace is greenfield: only OpenSpec/ATL artifacts exist; there are no source files, manifests, package manager, test runner, or source patterns to follow yet. Use clean/hexagonal/domain-first structure: Telegram, Gemini, Google Calendar, PostgreSQL/pgvector, and Telegram Bot API live behind adapters; scheduling, eligibility, knowledge, and staff workflows stay in application/domain code.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Runtime | Node.js + TypeScript backend | Next.js/web-first | MVP is Telegram-first and needs webhook/use-case orchestration, not UI. |
| Architecture | Clean/hexagonal modules | Framework-centric modules | Keeps domain rules independent from Telegram/Gemini/Calendar APIs. |
| Environments | Dockerized app everywhere; local Docker Compose with app + pgvector Postgres; production app container + Supabase Postgres | Local native Node/Postgres; managed app platform assumptions | Same app artifact across environments while `DATABASE_URL` selects local or Supabase DB. |
| Persistence | PostgreSQL + Drizzle + pgvector | In-memory/vector SaaS | One durable store for conversations, cases, rules, events, and embeddings; Drizzle migrations run against local Postgres and Supabase. |
| AI provider | Gemini ports for embeddings and generation | Direct SDK calls in domain | Swappable adapters and testable use cases. |
| Calendar truth | Live Google Calendar free-busy + event creation | Cached slots only | Prevents double booking; final confirmation always rechecks. |
| Authorization | Telegram user ID allowlist | Passwords/admin panel | Fits bot-first MVP and supports staff/private group flows. |
| Rules | Code engine + DB/config rule definitions | Hard-coded policy branches | Business policy can evolve; Gemini extraction remains inactive until staff approval. |
| RAG boundary | Staff docs only in vector index | Index every uploaded file | Patient files attach to cases only and never contaminate general QA. |

## Data Flow

Telegram delivery and scheduling:

```text
Telegram webhook -> UpdateRouter -> RoleResolver -> ConversationStateStore
                     |-> PatientUseCases -> SchedulingUseCase -> EligibilityEngine
                                             | pass -> Google CalendarAdapter
                                             | review -> CaseReview + StaffNotify
                     |-> StaffUseCases -> Ingestion/Rules/Replies/Notifications
```

RAG pipeline stages and Gemini external calls:

```text
Staff PDF/text -> Parse -> Chunk -> GeminiEmbeddingAdapter -> pgvector upsert
Patient question -> Retrieve(pgvector) -> PromptBuilder -> GeminiGenerationAdapter -> Telegram reply
Patient file/audio/image/PDF -> PatientCaseFile only -> StaffNotify (no RAG index)
```

Google Calendar sequence:

```text
Patient selects slot -> AvailabilityService -> Google freeBusy
Patient confirms + eligibility pass -> Google freeBusy recheck -> Google events.insert
Review-required case -> save pending review -> notify staff -> no Calendar event until approval
```

Environment/deployment flow:

```text
Local: docker-compose.local.yml -> app container -> postgres(pgvector)
Prod:  Dockerized app -> Supabase Postgres(pgvector enabled by migration/extension)
Both:  Drizzle migrations -> DATABASE_URL-specific target
```

## File Changes

| File | Action | Description |
|---|---|---|
| `package.json`, `tsconfig.json` | Create | TypeScript Node project, scripts, Drizzle/Vitest setup. |
| `Dockerfile` | Create | Production-ready Node app image used by local compose and deployment. |
| `docker-compose.local.yml` | Create | Local app + PostgreSQL container with pgvector enabled. |
| `.env.example` | Create | Documents `DATABASE_URL` per environment plus Telegram, Gemini, Google, staff group config. |
| `drizzle.config.ts` | Create | Reads `DATABASE_URL` so migrations target local Postgres or Supabase. |
| `src/main.ts`, `src/config/env.ts` | Create | Bootstrap, webhook server, validated environment config. |
| `src/delivery/telegram/**` | Create | Webhook endpoint, update router, conversation state handling. |
| `src/application/**`, `src/domain/**`, `src/ports/**` | Create | Use cases, entities, eligibility engine, ports, invariants. |
| `src/adapters/gemini/**`, `src/adapters/google-calendar/**`, `src/adapters/telegram/**` | Create | External service adapters. |
| `src/db/schema.ts`, `src/db/migrations/**` | Create | Drizzle schema and migrations, including `CREATE EXTENSION IF NOT EXISTS vector`. |
| `tests/**` | Create | Unit/integration/e2e tests once stack initializes. |

## Interfaces / Contracts

Ports: `CalendarPort.freeBusy()`, `CalendarPort.createEvent()`, `EmbeddingPort.embedChunks()`, `GenerationPort.answer()`/`extractRules()`, `NotificationPort.notifyStaff()`, repositories for conversations, users, cases, rules, documents, embeddings.

Persistence entities: `telegram_users`, `staff_allowlist`, `conversation_states`, `locations`, `schedules`, `patient_cases`, `case_files`, `rule_definitions`, `rule_drafts`, `appointments`, `knowledge_documents`, `knowledge_chunks(vector)`, `staff_notifications`, `reply_threads`.

Key invariants: only allowlisted Telegram IDs perform staff operations; pending-review cases never create Calendar events; patient files are never written to `knowledge_documents`/`knowledge_chunks`; migrations must be environment-neutral and driven by `DATABASE_URL`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Eligibility engine, state transitions, RAG boundary guards | Vitest after stack init; ports mocked. |
| Integration | Drizzle migrations/repositories, pgvector queries, env config | Run against Docker Compose pgvector Postgres; add optional Supabase migration smoke test with protected credentials. |
| E2E | Telegram scheduling, staff approval, patient upload flows | Webhook fixture tests with mocked Telegram API and fake providers. |

## Migration / Rollout

Greenfield rollout: initialize TypeScript project, add Dockerfile/Compose/env template, create Drizzle schema/migrations including pgvector extension, verify migrations locally, then run the same migrations against Supabase with production `DATABASE_URL`. Local Postgres image must include pgvector; production Supabase project must enable pgvector via migration/extension before vector tables/indexes are used. No existing data migration required.

## Open Questions

- [ ] Exact Google OAuth/service-account ownership model for the shared practice calendar.
- [ ] Final bilingual copy policy for patient-facing Telegram messages.
