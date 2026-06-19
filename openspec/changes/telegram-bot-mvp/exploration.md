## Exploration: telegram-bot-mvp

### Current State
`rag-pdf` is a greenfield SDD project with OpenSpec and Engram configured, but no source stack, package manager, database, test runner, or application code yet. The previous `stack-selection` exploration recommended a TypeScript/Next.js web-oriented full-stack baseline with clean/hexagonal boundaries, PostgreSQL + pgvector, provider adapters, Google Calendar integration, and background ingestion.

This pivot supersedes and narrows that exploration: the MVP delivery channel is now Telegram bot-first, not web-first. The clean/hexagonal direction, PostgreSQL + pgvector learning path, provider adapter pattern, Google Calendar source-of-truth decision, and background knowledge ingestion still apply. The Next.js/web UI recommendation is deferred to a later admin panel or dashboard, while the initial delivery adapter should be a Telegram webhook/backend.

The confirmed MVP is for a chiropractic business. Patients use the Telegram bot to ask informational questions and schedule appointments. Chiropractor/staff users can upload PDFs/text to update RAG knowledge, change business hours from the bot, receive private staff-group notifications, and reply to patients through the same bot. Google Calendar is included in the MVP and remains the source of truth for real appointments. There is one shared appointment calendar and two initial configurable location schedules: Surco 10:00-13:00 and VMT 18:00-20:00. Appointment slots are max 30 minutes. Patient appointment data requires full name, DNI, and reason/motive. Audio transcription is explicitly out of MVP: audio is acknowledged and staff are notified.

### Affected Areas
- `openspec/config.yaml` — Still valid as greenfield SDD context, but future proposal/design should update product emphasis from generic RAG/web scheduling to Telegram bot-first operations.
- `openspec/changes/stack-selection/exploration.md` — Superseded/narrowed by this pivot: Next.js web-first delivery becomes later-phase, while clean architecture, PostgreSQL + pgvector, provider adapters, Google Calendar, and background ingestion remain useful.
- Future Telegram delivery module — Handles webhook updates, commands, patient conversation state, staff/admin commands, documents, audio messages, and bot-mediated staff replies.
- Future users/roles domain — Distinguishes patient users from authorized chiropractor/staff users and protects privileged actions.
- Future staff authorization module — Stores Telegram user IDs/group IDs and enforces upload, schedule-change, and reply permissions.
- Future knowledge ingestion module — Accepts staff-uploaded PDFs/text, extracts text, chunks content, embeds it, and updates the retrieval index.
- Future retrieval/answering module — Answers only informational/document-based questions using RAG; must avoid booking or policy decisions outside retrieved/configured context.
- Future appointment scheduling module — Drives flow location -> date -> available time slot -> full name/DNI/reason -> Google Calendar event creation.
- Future schedule configuration module — Stores configurable chiropractor name, locations, business hours, appointment duration, and schedule changes instead of hardcoding them.
- Future staff notification module — Sends private staff-group alerts for appointment requests/bookings, audio messages, and patient escalation/reply workflows.
- Future Google Calendar adapter — Reads busy events/free-busy data, computes available slots from configured schedules, and creates appointment events in the shared calendar.
- Future Gemini adapter — Provides generation and embeddings behind provider ports if free-tier availability works for the account/country; should remain swappable.
- Future PDF/audio handling adapters — PDF/text ingestion is in MVP; audio transcription/AI interpretation is not. Audio should be stored or referenced only enough to notify staff and support manual follow-up.

### Approaches
1. **Telegram bot-first backend** — Build a backend service with Telegram webhook as the primary delivery adapter, clean application services, PostgreSQL + pgvector, Google Calendar adapter, and Gemini provider adapter.
   - Pros: Matches the confirmed user channel; avoids building unused web UI; keeps MVP small; supports patient, staff, upload, schedule, notification, and reply flows in one channel; clean boundaries allow later web/admin panel.
   - Cons: Requires careful Telegram conversation state design; staff authorization must be secure from day one; bot UX can become complex if flows are not constrained.
   - Effort: Medium

2. **Next.js/web-first app** — Keep the prior stack-selection direction and build a web/admin/chat app first, adding Telegram later as another delivery channel.
   - Pros: Easier visual admin workflows; familiar full-stack TypeScript path; useful later for dashboards, document management, audit trails, and schedule editing.
   - Cons: Misaligned with the confirmed MVP channel; delays patient scheduling through Telegram; creates web UI work now declared out of MVP; risks spending review budget on non-goals.
   - Effort: Medium/High for the actual MVP because Telegram still remains required.

3. **Hybrid bot + admin panel** — Build Telegram patient/staff flows plus a minimal web admin panel for staff configuration and document management.
   - Pros: Best long-term operator experience; web panel can simplify document upload, schedule editing, role management, and audit review.
   - Cons: Too broad for MVP; splits implementation across two delivery adapters before product workflow is proven; increases testing/deployment surface and likely exceeds the 400-line review budget quickly.
   - Effort: High

### Recommendation
Use the **Telegram bot-first backend** approach for the MVP. Treat Telegram as the initial delivery adapter, not as the whole application. Keep the core in clean/hexagonal modules so later Next.js/admin-panel work can reuse the same use cases and adapters.

Recommended MVP boundaries:
- Telegram patient flow: request information, schedule appointment, provide full name/DNI/reason, receive confirmation or staff-follow-up message.
- Scheduling flow order: location, date, available time slot, patient details, calendar booking.
- Google Calendar as the source of truth for appointments, with available slots computed from configurable business hours minus existing calendar busy events.
- Configurable chiropractor name, locations, business hours, appointment duration, authorized staff Telegram users, and staff group ID.
- Staff bot capabilities: upload PDF/text knowledge, update schedules, receive notifications, and reply to patients through bot mediation.
- RAG scope: informational/document-based answers only, powered by staff-managed PDFs/text and provider ports for Gemini generation/embeddings.
- Data foundation: PostgreSQL for relational state and pgvector for embeddings remains acceptable for learning and semantic retrieval.

Explicit non-goals for MVP:
- Admin web panel/dashboard.
- Audio transcription or AI interpretation of patient audio.
- Multi-calendar scheduling.
- Online payments.
- OCR for scanned PDFs unless later required by real documents.
- Complex CRM, reminders, cancellation/rescheduling automation, or analytics.
- Hardcoded business hours or chiropractor identity.

### Risks
- Telegram conversation state can become fragile if flows are not modeled explicitly as application state machines.
- Staff authorization based only on chat context is risky; privileged actions need stored allowlists for Telegram user IDs and staff group ID.
- Google Calendar availability must be computed from configured schedules plus real busy events; calendar is the source of truth, not local appointment rows alone.
- Gemini free-tier availability may vary by country/account/billing; provider ports should allow replacement without rewriting domain logic.
- PDF quality may limit answer quality; text-based PDFs are MVP-friendly, but scanned or layout-heavy documents may need OCR later.
- Bot-mediated staff replies require careful mapping between patient chats, staff group messages, and reply context to avoid sending messages to the wrong patient.
- Audio messages are common but out of AI scope; the MVP must set expectations clearly and notify staff reliably.

### Ready for Proposal
Yes — the orchestrator should tell the user to proceed with a Telegram bot-first MVP proposal. The proposal should explicitly narrow the previous stack-selection result: keep clean architecture, PostgreSQL + pgvector, Google Calendar, RAG/provider adapters, and background ingestion, but defer Next.js/admin UI until after the bot MVP proves the workflow.
