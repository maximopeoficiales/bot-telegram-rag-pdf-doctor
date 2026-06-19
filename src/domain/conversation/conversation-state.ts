export type ConversationStep =
  | 'idle'
  | 'scheduling.location'
  | 'scheduling.date'
  | 'scheduling.slot'
  | 'scheduling.intake'
  | 'scheduling.pending_review'
  | 'scheduling.rejected'
  | 'scheduling.ready_to_confirm';

export type ConversationFlow = 'none' | 'scheduling' | 'qa' | 'staff';

export type ConversationState = {
  telegramUserId: string;
  flow: ConversationFlow;
  step: ConversationStep;
  data: Record<string, unknown>;
  updatedAt: Date;
};

export type ConversationStateSnapshot = Omit<ConversationState, 'updatedAt'> & {
  updatedAt?: Date;
};

export interface ConversationStateStore {
  get(telegramUserId: string): Promise<ConversationState | null>;
  save(state: ConversationStateSnapshot): Promise<ConversationState>;
  clear(telegramUserId: string): Promise<void>;
}

export function createInitialConversationState(telegramUserId: string): ConversationState {
  return {
    telegramUserId,
    flow: 'none',
    step: 'idle',
    data: {},
    updatedAt: new Date()
  };
}

export class InMemoryConversationStateStore implements ConversationStateStore {
  private readonly states = new Map<string, ConversationState>();

  async get(telegramUserId: string): Promise<ConversationState | null> {
    return this.states.get(telegramUserId) ?? null;
  }

  async save(state: ConversationStateSnapshot): Promise<ConversationState> {
    const persisted = { ...state, updatedAt: state.updatedAt ?? new Date() };
    this.states.set(state.telegramUserId, persisted);
    return persisted;
  }

  async clear(telegramUserId: string): Promise<void> {
    this.states.delete(telegramUserId);
  }
}
