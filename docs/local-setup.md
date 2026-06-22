# Local Development Setup

Get the bot running on your machine end-to-end: Telegram webhooks → local server → PostgreSQL → Google Calendar.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Docker Desktop | Latest | https://www.docker.com/products/docker-desktop |
| Node.js | 22+ | https://nodejs.org |
| cloudflared | Latest | `brew install cloudflare/cloudflare/cloudflared` |
| Ollama | 0.24.0+ | https://ollama.com/download |

---

## Quick Start

```bash
# 1. Clone and enter the project
git clone https://github.com/maximopeoficiales/bot-telegram-rag-pdf-doctor.git
cd bot-telegram-rag-pdf-doctor

# 2. Copy the environment template
cp .env.example .env

# 3. Pull local AI models used by the default Ollama provider
ollama pull qwen2.5:7b
ollama pull nomic-embed-text

# 4. Fill in credentials (see Credentials section below)
nano .env

# 5. Start the stack (PostgreSQL + App)
docker compose -f docker-compose.local.yml up -d --build

# 6. Run database migrations
docker compose -f docker-compose.local.yml exec app npm run db:migrate

# 7. Expose localhost to the internet
cloudflared tunnel --url http://localhost:3000
# Copy the URL printed: https://xxxxx.trycloudflare.com

# 8. Register the Telegram webhook
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://xxxxx.trycloudflare.com/webhook/telegram"}'

# 9. Open Telegram, find @MaxRagIABot, send /start
```

---

## Credentials

Fill every value in `.env` before starting. All fields are required.

### `TELEGRAM_BOT_TOKEN`

1. Open Telegram → search `@BotFather`
2. Send `/newbot` and follow the wizard
3. Copy the token (format: `1234567890:AABBxxxx...`)

### `TELEGRAM_STAFF_GROUP_CHAT_ID`

Your Telegram numeric user ID. Authorizes you as staff.

1. Open Telegram → search `@userinfobot`
2. Send `/start`
3. Copy the `Id:` value (format: `903118957`)

### AI provider (`AI_PROVIDER`)

Local Docker development defaults to Ollama:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_GENERATION_MODEL=qwen2.5:7b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

From inside Docker Desktop on macOS, `localhost` points to the container. Use `http://host.docker.internal:11434` to reach Ollama running natively on your Mac.

Install and verify the required models:

```bash
ollama pull qwen2.5:7b
ollama pull nomic-embed-text

# Optional generation smoke check
curl http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen2.5:7b","prompt":"Responde solo: OK","stream":false}'

# Optional embedding smoke check; expected length is 768
curl http://localhost:11434/api/embed \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-embed-text","input":"prueba"}'
```

Use Gemini only when you intentionally select it as the configured provider:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=<key from Google AI Studio>
```

### `GEMINI_API_KEY` (required only with `AI_PROVIDER=gemini`)

1. Go to https://aistudio.google.com/app/apikey
2. Click **Get API key** → **Create API key**
3. Copy the key (format: `AIzaSy...`)

### Google Calendar OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`)

These three values require a one-time setup in Google Cloud Console.

#### Step 1 — Create a project and enable the API

1. Go to https://console.cloud.google.com/ → create a project (e.g. `rag-bot-local`)
2. Go to https://console.cloud.google.com/apis/library → search `Google Calendar API` → **Enable**
3. Confirm no billing account is attached to the project (safe to use without one)

#### Step 2 — Configure OAuth Consent Screen

1. Go to https://console.cloud.google.com/apis/credentials/consent
2. Select **External** → **Create**
3. Fill in app name and support email, skip optional fields
4. Scopes page → **Add or remove scopes** → select `.../auth/calendar` → **Update** → **Save and Continue**
5. Test users page → **Add users** → enter your Gmail → **Save and Continue**

#### Step 3 — Create OAuth Client

1. Go to https://console.cloud.google.com/apis/credentials
2. **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Authorized redirect URIs → add: `http://localhost:3000/oauth/google/callback`
5. **Create** → copy **Client ID** and **Client Secret**

#### Step 4 — Get Refresh Token

Open this URL in your browser (replace `YOUR_CLIENT_ID`):

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000/oauth/google/callback&response_type=code&scope=https://www.googleapis.com/auth/calendar&access_type=offline&prompt=consent
```

1. Authorize with your Google account
2. Browser redirects to `http://localhost:3000/oauth/google/callback?code=4/0Aea...`
3. Copy the `code` value from the URL (everything between `code=` and `&scope`)
4. Run this command with your values:

```bash
curl -X POST https://oauth2.googleapis.com/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "code=YOUR_CODE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=http://localhost:3000/oauth/google/callback" \
  -d "grant_type=authorization_code"
```

5. Copy the `refresh_token` from the JSON response (format: `1//0g...`)

> The authorization code expires in 10 minutes. If it expires, repeat from Step 4.

---

## `.env` Reference

```env
NODE_ENV=development
PORT=3000

# Local Docker Compose database
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/rag_pdf

# Telegram
TELEGRAM_BOT_TOKEN=<token from BotFather>
TELEGRAM_STAFF_GROUP_CHAT_ID=<your numeric Telegram user ID>

# AI provider: Ollama is the default for local Docker dev
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_GENERATION_MODEL=qwen2.5:7b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# Gemini alternate provider; required only with AI_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash-lite
GEMINI_EMBEDDING_MODEL=text-embedding-004

# Google Calendar OAuth
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/google/callback
GOOGLE_REFRESH_TOKEN=<from OAuth flow>
GOOGLE_CALENDAR_ID=primary
```

---

## Daily Workflow

### Start the stack

```bash
# Start containers in background
docker compose -f docker-compose.local.yml up -d

# Start the tunnel (keep this terminal open)
cloudflared tunnel --url http://localhost:3000
```

### Register the webhook

Every time cloudflared restarts, the URL changes. Update the webhook:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://NEW-URL.trycloudflare.com/webhook/telegram"}'
```

Verify it worked:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

### Watch logs

```bash
docker compose -f docker-compose.local.yml logs -f app
```

### Stop the stack

```bash
# Stop containers, keep database data
docker compose -f docker-compose.local.yml down

# Stop containers and delete all data (full reset)
docker compose -f docker-compose.local.yml down -v
```

### After code changes

`tsx watch` reloads automatically — no restart needed. Changes to `src/` are reflected immediately in the running container.

---

## Testing the Bot

Run the full scheduling flow:

```
/start
→ Bienvenido. Envía /schedule para iniciar el agendamiento de tu cita.

/schedule
→ Elige una sede: Surco o VMT.

Surco
→ Envía la fecha de la cita en formato YYYY-MM-DD.

2026-07-15
→ Elige uno de los horarios disponibles de 30 minutos: 10:00, 10:30...

10:00
→ Por favor envía el nombre completo del paciente.

(complete intake fields)

confirmar
→ Tu cita está confirmada. El equipo ha sido notificado.
```

After confirmation, check https://calendar.google.com — the event appears as `Appointment - <patient name>`.

**Accepted confirmation words:** `confirmar`, `confirm`, `sí`, `si`, `yes`, `reservar`, `book`

---

## Run Tests

Tests run outside Docker, directly against your local environment:

```bash
npm install
npm test
```

Expected output:

```
Test Files  9 passed | 1 skipped (10)
     Tests  27 passed | 1 skipped (28)
```

The skipped test (`migrations.spec.ts`) requires a live database. Run it with:

```bash
RUN_DB_INTEGRATION=true DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rag_pdf npm test
```

---

## Architecture Overview

```
Telegram webhook
      ↓
/webhook/telegram  (Fastify)
      ↓
MessageParser  →  ParsedMessage
      ↓
MessageRouter  (Chain of Responsibility)
  ├── AuthorizationGuard      guards staff commands
  ├── ReplyCommandHandler     /reply <caseId> <msg>
  ├── FileUploadHandler       documents / photos / audio
  ├── StaffCommandHandler     authorized staff ops
  ├── StartCommandHandler     /start
  ├── ScheduleCommandHandler  /schedule
  └── TextMessageHandler      fallback → SchedulingFlow

SchedulingFlow
  └── GoogleCalendarAdapter → Google Calendar API
```

**Key ports (swappable adapters):**

| Port | Current adapter | Future adapter |
|------|-----------------|----------------|
| `MessagingPort` | `TelegramMessagingAdapter` | `WhatsAppMessagingAdapter` |
| `CalendarPort` | `GoogleCalendarAdapter` | Any calendar API |
| `EmbeddingPort` | (pending) | `GeminiEmbeddingAdapter` |
| `GenerationPort` | (pending) | `GeminiGenerationAdapter` |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `sh: tsx: not found` | Docker volume cached old node_modules | `docker compose -f docker-compose.local.yml down -v && docker compose -f docker-compose.local.yml up -d --build` |
| `Route POST:/webhook/telegram not found` | Webhook points to wrong path | Verify URL ends in `/webhook/telegram`, not `/webhook` |
| `Error 403: access_denied` (Google OAuth) | Email not in test users list | Add email at https://console.cloud.google.com/apis/credentials/consent |
| `invalid_grant` (Google OAuth) | Authorization code expired (10 min TTL) | Repeat the OAuth flow from Step 4 |
| Bot not responding | cloudflared URL changed | Run `setWebhook` again with the new URL |
| `Database connection refused` | Postgres container not ready | Wait 5 seconds and retry `db:migrate` |
| `Ollama API error` from the app container | App is using `localhost` instead of the host bridge | Set `OLLAMA_BASE_URL=http://host.docker.internal:11434` |
| `Ollama embedding dimension mismatch` | Wrong embedding model for pgvector schema | Pull/use `nomic-embed-text`; expected embedding length is 768 |
