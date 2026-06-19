# RAG PDF Telegram Bot MVP

Telegram-first appointment scheduling and RAG assistant for a chiropractic practice. The app runs as a Dockerized Node.js + TypeScript backend, stores operational data in PostgreSQL/pgvector, answers from staff-approved knowledge, and creates confirmed appointments in Google Calendar.

## Quick start

1. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

2. Fill the required values in `.env`:

   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_STAFF_GROUP_CHAT_ID`
   - `GEMINI_API_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
   - `GOOGLE_REFRESH_TOKEN`
   - `GOOGLE_CALENDAR_ID`

3. Start the local stack:

   ```bash
   docker compose -f docker-compose.local.yml up --build
   ```

4. Run database migrations against the local Postgres service:

   ```bash
   docker compose -f docker-compose.local.yml exec app npm run db:migrate
   ```

5. Verify the project:

   ```bash
   npm test
   npm run build
   ```

## Local Docker flow

`docker-compose.local.yml` starts two services:

| Service | Purpose | Local endpoint |
|---------|---------|----------------|
| `app` | TypeScript backend running `npm run dev` | `http://localhost:3000` |
| `postgres` | PostgreSQL 16 with pgvector | `localhost:5432` |

Use this local `DATABASE_URL` inside the app container:

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/rag_pdf
```

If you run Node commands directly from the host instead of inside Docker, use the host-mapped database endpoint:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rag_pdf
```

Useful commands:

```bash
# Start or rebuild the full local stack
docker compose -f docker-compose.local.yml up --build

# Run migrations from inside the app container
docker compose -f docker-compose.local.yml exec app npm run db:migrate

# Stop containers without deleting Postgres data
docker compose -f docker-compose.local.yml down

# Stop containers and remove local Postgres data
docker compose -f docker-compose.local.yml down -v
```

## Database and migrations

Migrations are driven by `DATABASE_URL` and live in `src/db/migrations/`. The initial migration enables pgvector with `CREATE EXTENSION IF NOT EXISTS vector` before vector tables are used.

```bash
# Generate a migration after schema changes
npm run db:generate

# Apply migrations to the DATABASE_URL target
npm run db:migrate
```

For Supabase, use the project connection string format from `.env.example`:

```env
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@db.<project-ref>.supabase.com:5432/postgres
```

Before production use, confirm the Supabase project allows the `vector` extension and that the database password is URL-encoded when it contains special characters.

## Telegram bot setup

1. Create a bot with BotFather and copy the token into `TELEGRAM_BOT_TOKEN`.
2. Add the bot to the private staff group.
3. Capture the staff group chat ID and set `TELEGRAM_STAFF_GROUP_CHAT_ID`.
4. Expose the local app when testing Telegram webhooks locally, then point Telegram to the webhook endpoint served by the app.

Staff-only operations are authorized by Telegram user ID allowlists in the application data model. Keep the staff group private and avoid sharing bot tokens in chat or issue trackers.

## Google Calendar OAuth setup

The MVP uses a shared owner account calendar as the source of truth for confirmed appointments.

1. Create a Google Cloud OAuth client for the owner account.
2. Configure `GOOGLE_REDIRECT_URI`; local development defaults to `http://localhost:3000/oauth/google/callback`.
3. Grant Calendar access for the shared practice calendar.
4. Store the OAuth client credentials and refresh token in `.env`:

   ```env
   GOOGLE_CLIENT_ID=replace-me
   GOOGLE_CLIENT_SECRET=replace-me
   GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/google/callback
   GOOGLE_REFRESH_TOKEN=replace-me
   GOOGLE_CALENDAR_ID=primary
   ```

The scheduling flow checks free/busy state before offering slots and rechecks the selected slot before creating an event.

## Gemini setup

Set `GEMINI_API_KEY` for embeddings, generated answers, and rule-draft extraction. The application keeps Gemini behind adapters: approved staff knowledge can be embedded for QA, while extracted rule drafts remain inactive until staff approval.

## Release runbook

1. Confirm `.env` or deployment secrets match the environment checklist in `docs/release/telegram-bot-mvp-checklist.md`.
2. Run migrations against the target database:

   ```bash
   npm run db:migrate
   ```

3. Build and test the app:

   ```bash
   npm test
   npm run build
   ```

4. Deploy the Docker image with the production `DATABASE_URL` and API credentials.
5. Configure the Telegram webhook to point at the deployed app.
6. Smoke test the happy path: patient scheduling, pending-review hold, staff notification, and staff-mediated reply.

## Safety boundaries

- Patient-uploaded files are attached to patient cases only; they must not be indexed as general RAG knowledge.
- QA is informational and must not mutate eligibility rules, scheduling state, or calendar events.
- Pending-review cases must not create Google Calendar events until approved.
- Final booking must recheck Google Calendar availability before creating an event.
