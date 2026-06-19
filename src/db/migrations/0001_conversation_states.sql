CREATE TABLE IF NOT EXISTS "conversation_states" (
  "telegram_user_id" varchar(64) PRIMARY KEY NOT NULL,
  "flow" varchar(32) NOT NULL DEFAULT 'none',
  "step" varchar(64) NOT NULL DEFAULT 'idle',
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
