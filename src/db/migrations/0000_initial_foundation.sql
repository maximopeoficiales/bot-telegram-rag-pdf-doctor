CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telegram_users" (
  "id" serial PRIMARY KEY NOT NULL,
  "telegram_user_id" varchar(64) NOT NULL UNIQUE,
  "role" varchar(32) NOT NULL DEFAULT 'patient',
  "display_name" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_allowlist" (
  "id" serial PRIMARY KEY NOT NULL,
  "telegram_user_id" varchar(64) NOT NULL UNIQUE,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "locations" (
  "id" varchar(32) PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "timezone" text NOT NULL DEFAULT 'America/Lima',
  "enabled" boolean NOT NULL DEFAULT true
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedules" (
  "id" serial PRIMARY KEY NOT NULL,
  "location_id" varchar(32) NOT NULL REFERENCES "locations"("id"),
  "day_of_week" integer NOT NULL,
  "start_time" varchar(5) NOT NULL,
  "end_time" varchar(5) NOT NULL,
  "appointment_duration_minutes" integer NOT NULL DEFAULT 30,
  "enabled" boolean NOT NULL DEFAULT true
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_cases" (
  "id" serial PRIMARY KEY NOT NULL,
  "telegram_user_id" varchar(64) NOT NULL,
  "status" varchar(64) NOT NULL DEFAULT 'draft',
  "intake" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_files" (
  "id" serial PRIMARY KEY NOT NULL,
  "case_id" integer NOT NULL REFERENCES "patient_cases"("id"),
  "telegram_file_id" text NOT NULL,
  "file_type" varchar(32) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rule_definitions" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "definition" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rule_drafts" (
  "id" serial PRIMARY KEY NOT NULL,
  "source_document_id" integer,
  "proposed_definition" jsonb NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointments" (
  "id" serial PRIMARY KEY NOT NULL,
  "case_id" integer NOT NULL REFERENCES "patient_cases"("id"),
  "google_event_id" text NOT NULL UNIQUE,
  "location_id" varchar(32) NOT NULL REFERENCES "locations"("id"),
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "source_type" varchar(32) NOT NULL,
  "created_by_telegram_user_id" varchar(64) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
  "id" serial PRIMARY KEY NOT NULL,
  "document_id" integer NOT NULL REFERENCES "knowledge_documents"("id"),
  "content" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "embedding" vector(768)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "case_id" integer REFERENCES "patient_cases"("id"),
  "type" varchar(64) NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reply_threads" (
  "id" serial PRIMARY KEY NOT NULL,
  "case_id" integer NOT NULL REFERENCES "patient_cases"("id"),
  "staff_chat_id" text NOT NULL,
  "patient_telegram_user_id" varchar(64) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
