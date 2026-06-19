# Tasks: Telegram Bot MVP

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1,300–1,900 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Bootstrap runtime, Docker, DB, migrations | PR 1 | Base = feature/tracker branch; includes pgvector + migration checks |
| 2 | Telegram delivery + scheduling + eligibility core | PR 2 | Base = PR 1 branch; no RAG yet |
| 3 | Knowledge ingestion + RAG + staff mediation/notifications | PR 3 | Base = PR 2 branch; keeps domain boundaries explicit |
| 4 | Google Calendar finalize + end-to-end verification/docs | PR 4 | Base = PR 3 branch; release-ready integration |

## Phase 1: Foundation / Infrastructure

- [x] 1.1 Create `package.json`, `tsconfig.json`, and `src/main.ts` with Node+TypeScript app bootstrap and scripts (`dev`, `build`, `test`, `db:migrate`).
- [x] 1.2 Add `Dockerfile`, `docker-compose.local.yml`, and `.env.example` for app + local PostgreSQL pgvector; include `DATABASE_URL` patterns for local and Supabase.
- [x] 1.3 Add `drizzle.config.ts`, `src/db/schema.ts`, and first migration in `src/db/migrations/` with `CREATE EXTENSION IF NOT EXISTS vector` and base tables.
- [x] 1.4 Implement `src/config/env.ts` runtime validation for Telegram, Gemini, Google OAuth, staff group IDs, and DB variables (requires API keys/credentials).
- [x] 1.5 Add integration smoke test `tests/integration/db/migrations.spec.ts` to run Drizzle migrations against Docker Compose Postgres.

## Phase 2: Core Scheduling and Telegram Delivery

- [x] 2.1 Build `src/delivery/telegram/webhook.ts` and `src/delivery/telegram/router.ts` for update routing, role resolution, and unauthorized staff denial.
- [x] 2.2 Implement conversation persistence in `src/domain/conversation/` + `src/adapters/db/conversation-state.repository.ts` for state continuity and invalid-input clarification.
- [x] 2.3 Implement scheduling flow in `src/application/scheduling/` covering location → date → slot → intake capture with required fields.
- [x] 2.4 Implement eligibility engine in `src/domain/eligibility/` using DB/config rule definitions (age reject >60, review/radiography outcomes, no hard-coded policy text).
- [x] 2.5 Add unit tests `tests/unit/scheduling/*.spec.ts` and `tests/unit/eligibility/*.spec.ts` for spec scenarios: missing intake blocks booking, age 61 rejection, radiography pending review.

## Phase 3: Knowledge, QA, and Staff Operations

- [ ] 3.1 Implement `VectorStorePort` in `src/ports/vector-store.port.ts` with Postgres pgvector adapter `src/adapters/vector-store/pgvector-store.ts`.
- [ ] 3.2 Build staff ingestion pipeline in `src/application/knowledge/` (parse/chunk/embed/upsert) and enforce patient-file isolation in `src/domain/cases/`.
- [ ] 3.3 Implement RAG QA flow in `src/application/qa/` with read-only boundary: no eligibility/calendar/rule mutations.
- [ ] 3.4 Implement staff management in `src/application/staff/` for allowlist ops, schedule/location config, Gemini rule extraction drafts requiring approval (requires Gemini credentials).
- [ ] 3.5 Add tests `tests/unit/knowledge/*.spec.ts` and `tests/unit/qa/*.spec.ts` for scenarios: unauthorized upload rejected, patient files excluded, insufficient knowledge safe response.

## Phase 4: Calendar, Notifications, and Verification

- [ ] 4.1 Implement Google adapter `src/adapters/google-calendar/google-calendar.adapter.ts` for freeBusy + events.insert using OAuth owner account (requires Google credentials/scopes).
- [ ] 4.2 Add availability service in `src/application/calendar/availability.service.ts` to enforce Surco/VMT windows and recheck slot before confirmation.
- [ ] 4.3 Implement notification flow `src/application/notifications/` + `src/adapters/telegram/staff-group.client.ts` for confirmed appointments, file uploads, and pending-review cases.
- [ ] 4.4 Add integration tests `tests/integration/scheduling-calendar.spec.ts` and `tests/integration/notifications.spec.ts` using Vitest + Testcontainers or Docker Compose Postgres.
- [ ] 4.5 Add e2e webhook tests `tests/e2e/telegram-bot-mvp.spec.ts` covering full booking, review hold (no event), and staff-mediated reply prefix.

## Phase 5: Cleanup and Delivery Readiness

- [ ] 5.1 Document setup and runbook in `README.md` (local Docker flow, Supabase `DATABASE_URL`, migration commands, OAuth setup).
- [ ] 5.2 Add `docs/release/telegram-bot-mvp-checklist.md` with PR chain boundaries, env checklist, and rollback steps.
