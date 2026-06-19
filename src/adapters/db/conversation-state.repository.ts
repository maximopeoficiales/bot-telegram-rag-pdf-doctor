import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { conversationStates } from '../../db/schema.js';
import type {
  ConversationFlow,
  ConversationState,
  ConversationStateSnapshot,
  ConversationStateStore,
  ConversationStep
} from '../../domain/conversation/conversation-state.js';

type DrizzleDatabase = PostgresJsDatabase;

type ConversationStateRow = typeof conversationStates.$inferSelect;

export class DbConversationStateRepository implements ConversationStateStore {
  constructor(private readonly db: DrizzleDatabase) {}

  async get(telegramUserId: string): Promise<ConversationState | null> {
    const rows = await this.db
      .select()
      .from(conversationStates)
      .where(eq(conversationStates.telegramUserId, telegramUserId))
      .limit(1);

    return rows[0] ? this.toDomain(rows[0]) : null;
  }

  async save(state: ConversationStateSnapshot): Promise<ConversationState> {
    const now = state.updatedAt ?? new Date();
    const values = {
      telegramUserId: state.telegramUserId,
      flow: state.flow,
      step: state.step,
      data: state.data,
      updatedAt: now
    };

    const rows = await this.db
      .insert(conversationStates)
      .values(values)
      .onConflictDoUpdate({
        target: conversationStates.telegramUserId,
        set: values
      })
      .returning();

    return this.toDomain(rows[0]);
  }

  async clear(telegramUserId: string): Promise<void> {
    await this.db.delete(conversationStates).where(eq(conversationStates.telegramUserId, telegramUserId));
  }

  private toDomain(row: ConversationStateRow): ConversationState {
    return {
      telegramUserId: row.telegramUserId,
      flow: row.flow as ConversationFlow,
      step: row.step as ConversationStep,
      data: row.data as Record<string, unknown>,
      updatedAt: row.updatedAt
    };
  }
}
