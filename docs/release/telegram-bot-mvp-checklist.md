# Telegram Bot MVP Release Checklist

Use this checklist before releasing the Telegram Bot MVP. The current delivery path is direct to `master` for a solo developer; the PR boundaries below preserve the original review slices for audit and rollback planning.

## Release scope

| Work unit | Boundary | Status |
|-----------|----------|--------|
| Work Unit 1 | Runtime bootstrap, Docker, database, Drizzle migrations, env validation, migration smoke test | Complete |
| Work Unit 2 | Telegram delivery, conversation state, scheduling flow, eligibility engine, unit tests | Complete |
| Work Unit 3 | pgvector store, knowledge ingestion, read-only RAG QA, staff management, domain boundary tests | Complete |
| Work Unit 4 | Google Calendar adapter, availability, staff notifications, e2e verification | Complete |
| Work Unit 5 | README runbook and release checklist | Current release documentation |

## Environment checklist

### Application

- [ ] `NODE_ENV` is set for the target environment.
- [ ] `PORT` matches the deployment platform route.
- [ ] `DATABASE_URL` points to the correct PostgreSQL database.
- [ ] Supabase database has pgvector available through the migration/extension path.
- [ ] Database password is URL-encoded if it contains special characters.

### Telegram

- [ ] `TELEGRAM_BOT_TOKEN` belongs to the production bot.
- [ ] `TELEGRAM_STAFF_GROUP_CHAT_ID` points to the private staff group.
- [ ] Bot is installed in the staff group.
- [ ] Telegram webhook points to the deployed app endpoint.
- [ ] Staff Telegram user IDs are allowlisted before staff commands are used.

### Gemini

- [ ] `GEMINI_API_KEY` is configured in deployment secrets.
- [ ] Staff-approved knowledge ingestion is verified with non-sensitive test content.
- [ ] Rule extraction remains draft-only until staff approval.

### Google Calendar

- [ ] `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured.
- [ ] `GOOGLE_REDIRECT_URI` matches the OAuth client settings.
- [ ] `GOOGLE_REFRESH_TOKEN` belongs to the calendar owner account.
- [ ] `GOOGLE_CALENDAR_ID` points to the shared practice calendar.
- [ ] Calendar scopes allow free/busy reads and event creation.

## Migration checklist

- [ ] Local migrations pass against Docker Compose Postgres.
- [ ] Target `DATABASE_URL` has been checked before running production migrations.
- [ ] `npm run db:migrate` completes successfully in the target environment.
- [ ] `knowledge_chunks` vector storage is available after migration.

## Verification checklist

Run before changing the Telegram webhook to production:

```bash
npm test
npm run build
```

Manual smoke checks:

- [ ] Patient can complete location, date, slot, and intake steps.
- [ ] Age over 60 is kindly rejected and no calendar event is created.
- [ ] Radiography or review-required case stays pending and notifies staff.
- [ ] Confirmed appointment creates a Google Calendar event after final free/busy recheck.
- [ ] Patient-uploaded files notify staff but are not added to general RAG knowledge.
- [ ] QA answers only from approved knowledge and redirects booking decisions to scheduling.
- [ ] Staff-mediated reply reaches the patient with a team prefix.

## Rollback steps

1. Disable or repoint the Telegram webhook to stop new production updates.
2. Stop the app container or roll back to the previous image/revision.
3. If migrations were applied and must be reverted, restore the database from the latest known-good backup. Do not manually drop vector or case tables unless data loss has been approved.
4. Rotate exposed credentials immediately if logs, chats, or issue trackers contain secrets.
5. Re-run the verification checklist after redeploying the previous or fixed version.

## Release notes

- Deployment is Docker-first; `DATABASE_URL` selects local Docker Postgres or Supabase.
- Google Calendar is the source of truth for confirmed appointments.
- Patient files are case attachments only and must remain isolated from the general RAG index.
- QA must remain read-only relative to scheduling, eligibility, rules, and calendar state.
