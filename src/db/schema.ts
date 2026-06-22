import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar, vector } from 'drizzle-orm/pg-core';

export const telegramUsers = pgTable('telegram_users', {
  id: serial('id').primaryKey(),
  telegramUserId: varchar('telegram_user_id', { length: 64 }).notNull().unique(),
  role: varchar('role', { length: 32 }).notNull().default('patient'),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const staffAllowlist = pgTable('staff_allowlist', {
  id: serial('id').primaryKey(),
  telegramUserId: varchar('telegram_user_id', { length: 64 }).notNull().unique(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const conversationStates = pgTable('conversation_states', {
  telegramUserId: varchar('telegram_user_id', { length: 64 }).primaryKey(),
  flow: varchar('flow', { length: 32 }).notNull().default('none'),
  step: varchar('step', { length: 64 }).notNull().default('idle'),
  data: jsonb('data').notNull().default(sql`'{}'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const locations = pgTable('locations', {
  id: varchar('id', { length: 32 }).primaryKey(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('America/Lima'),
  enabled: boolean('enabled').notNull().default(true)
});

export const schedules = pgTable('schedules', {
  id: serial('id').primaryKey(),
  locationId: varchar('location_id', { length: 32 }).notNull().references(() => locations.id),
  dayOfWeek: integer('day_of_week').notNull(),
  startTime: varchar('start_time', { length: 5 }).notNull(),
  endTime: varchar('end_time', { length: 5 }).notNull(),
  appointmentDurationMinutes: integer('appointment_duration_minutes').notNull().default(30),
  enabled: boolean('enabled').notNull().default(true)
}, (table) => [
  uniqueIndex('schedules_location_id_day_of_week_unique').on(table.locationId, table.dayOfWeek)
]);

export const patientCases = pgTable('patient_cases', {
  id: serial('id').primaryKey(),
  telegramUserId: varchar('telegram_user_id', { length: 64 }).notNull(),
  status: varchar('status', { length: 64 }).notNull().default('draft'),
  intake: jsonb('intake').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const caseFiles = pgTable('case_files', {
  id: serial('id').primaryKey(),
  caseId: integer('case_id').notNull().references(() => patientCases.id),
  telegramFileId: text('telegram_file_id').notNull(),
  fileType: varchar('file_type', { length: 32 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const ruleDefinitions = pgTable('rule_definitions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  definition: jsonb('definition').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const ruleDrafts = pgTable('rule_drafts', {
  id: serial('id').primaryKey(),
  sourceDocumentId: integer('source_document_id'),
  proposedDefinition: jsonb('proposed_definition').notNull(),
  status: varchar('status', { length: 32 }).notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const appointments = pgTable('appointments', {
  id: serial('id').primaryKey(),
  caseId: integer('case_id').notNull().references(() => patientCases.id),
  googleEventId: text('google_event_id').notNull().unique(),
  locationId: varchar('location_id', { length: 32 }).notNull().references(() => locations.id),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  sourceType: varchar('source_type', { length: 32 }).notNull(),
  createdByTelegramUserId: varchar('created_by_telegram_user_id', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id').notNull().references(() => knowledgeDocuments.id),
    content: text('content').notNull(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    embedding: vector('embedding', { dimensions: 768 })
  },
  (table) => [index('knowledge_chunks_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops'))]
);

export const staffNotifications = pgTable('staff_notifications', {
  id: serial('id').primaryKey(),
  caseId: integer('case_id').references(() => patientCases.id),
  type: varchar('type', { length: 64 }).notNull(),
  payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const replyThreads = pgTable('reply_threads', {
  id: serial('id').primaryKey(),
  caseId: integer('case_id').notNull().references(() => patientCases.id),
  staffChatId: text('staff_chat_id').notNull(),
  patientTelegramUserId: varchar('patient_telegram_user_id', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
