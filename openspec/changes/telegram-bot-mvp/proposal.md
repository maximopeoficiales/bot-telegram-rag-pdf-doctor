# Proposal: Telegram Bot MVP

## Intent

Build the first working version of a chiropractic practice assistant delivered entirely through Telegram. Patients schedule appointments and ask informational questions; chiropractor/staff manage knowledge, schedules, and patient cases — all from the same bot. Solves the complete absence of any digital scheduling or knowledge-sharing channel for the practice.

## Scope

### In Scope
- Patient conversation flow: informational Q&A (RAG), appointment scheduling, file/radiography upload
- Appointment scheduling flow: location → date → available slot → patient intake form → Google Calendar event
- Patient intake fields: full name, DNI, age, district, pain area, pain duration, limitation, gait (normal/imbalance), assistive device, motive/reason
- Eligibility rule engine: age limit (≤ 60 yr), radiography triggers (age ≥ 56, fall, long-term pain + gait/walking limitation, septal hit < 1 month), jaw deviation → staff review
- Staff capabilities: PDF/text knowledge upload, rule extraction via Gemini (chiropractor/authorized approval required), schedule/location config, patient reply mediation, private group notifications
- Google Calendar: free-busy slot computation, confirmed event creation (pending cases held until approved)
- RAG pipeline: staff document ingestion only; patient files must NOT enter general knowledge base
- Tech foundation: TypeScript backend, Telegram webhook, PostgreSQL + pgvector, Drizzle ORM, Gemini adapters, clean/hexagonal architecture

### Out of Scope
- Audio transcription, image/PDF interpretation (AI), OCR
- Online payments, CRM, reminders, analytics
- Admin web panel / Next.js UI
- Multi-calendar support
- Cancellation/rescheduling automation

## Capabilities

### New Capabilities
- `telegram-delivery`: Webhook handler, command router, conversation state machine, patient/staff role resolution
- `patient-scheduling`: Appointment flow orchestration, intake form, eligibility rule evaluation, Google Calendar slot booking
- `eligibility-rules`: Configurable business rule engine (age, radiography conditions, jaw review); rule definitions in config/DB, not code
- `staff-management`: Authorized user allowlist, PDF/text upload, Gemini-assisted rule extraction, schedule config, patient reply mediation
- `knowledge-ingestion`: Staff document chunking, embedding (Gemini), pgvector upsert; patient files isolated to case records only
- `rag-qa`: Retrieval-augmented informational Q&A; strictly read-only for appointments/policy decisions
- `google-calendar-adapter`: Free-busy query, available slot computation from configured schedules, event creation for confirmed appointments
- `staff-notifications`: Private group alerts for new appointments, patient file uploads, cases pending review

### Modified Capabilities
None — greenfield project.

## Approach

Telegram bot-first backend with clean/hexagonal architecture. A thin Telegram webhook adapter dispatches updates to application use cases. Domain modules (scheduling, rules, RAG, staff) are independent and share no direct coupling. Google Calendar is the source of truth for confirmed appointments. Gemini provides generation and embeddings behind provider ports (swappable). PostgreSQL + pgvector stores relational state and vector index. Staff/patient roles enforced by stored Telegram user ID allowlists.

**Google Calendar API scopes required:** `https://www.googleapis.com/auth/calendar.readonly` (free-busy), `https://www.googleapis.com/auth/calendar.events` (event creation).

**RAG domain affected:** knowledge-ingestion (staff PDF pipeline), qa-answering (informational retrieval), calendar-scheduling (appointment booking, not RAG-driven).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/delivery/telegram/` | New | Webhook, router, conversation state, role guard |
| `src/domain/scheduling/` | New | Booking flow, intake, eligibility rules, slot logic |
| `src/domain/staff/` | New | Auth allowlist, upload, config, reply mediation |
| `src/domain/knowledge/` | New | Ingestion pipeline, embeddings, RAG QA |
| `src/adapters/google-calendar/` | New | Free-busy, slot computation, event write |
| `src/adapters/gemini/` | New | LLM generation + embedding provider port |
| `src/adapters/telegram/` | New | Bot API client |
| `src/db/` | New | Drizzle schema, migrations, pgvector extension |
| `openspec/config.yaml` | Modified | Update product emphasis to Telegram bot-first |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Telegram conversation state fragility | Med | Explicit state machine per patient session; persisted in DB |
| Staff authorization bypass | Low | Stored Telegram user ID allowlist; reject all unlisted users for privileged actions |
| Google Calendar free-busy accuracy | Med | Always recheck live before confirming slot; never trust cached availability |
| Gemini provider unavailability | Low | Provider ports abstract LLM/embedding; swap without domain changes |
| Patient files contaminating knowledge base | Med | Hard boundary: patient uploads go to case records only, never to RAG index |
| Bot reply misdirection | Med | Reply mapping stores patient→staff thread context; verified before sending |

## Rollback Plan

All changes are additive (greenfield). Rollback = stop the bot webhook, take the Telegram bot offline, and restore last known Postgres backup. No existing user-facing service is disrupted. Google Calendar events created before rollback must be manually cancelled by staff.

## Dependencies

- Google Cloud project with Calendar API enabled and OAuth credentials
- Telegram Bot Token (BotFather)
- PostgreSQL instance with pgvector extension
- Gemini API key (free-tier acceptable for MVP)

## Success Criteria

- [ ] Patient can complete full scheduling flow through Telegram and see a confirmed Google Calendar event
- [ ] Eligibility rules reject or escalate correctly (age > 60 rejected with kind message; radiography cases held for review)
- [ ] Staff can upload a PDF and the bot indexes it into RAG without affecting patient-uploaded files
- [ ] Staff-authorized users can configure locations, hours, and reply to patients through the bot
- [ ] RAG Q&A answers informational questions without making scheduling or policy decisions
- [ ] All staff reply messages are presented as "The team replied..." / "El equipo respondió..."
