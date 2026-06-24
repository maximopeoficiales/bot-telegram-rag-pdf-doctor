/**
 * Conversational flow tests — TextMessageHandler + SchedulingFlow + RagQaFlow.
 *
 * These tests verify the human-like conversation model:
 *   - Off-topic questions mid-flow are answered by RAG and the flow is offered to resume
 *   - User can resume with "sí" or cancel with "no"
 *   - Idle users who ask questions get RAG answers + a scheduling offer
 *   - Valid scheduling responses advance the flow normally (no RAG overhead)
 */
import { describe, expect, it } from 'vitest';
import { InMemoryConversationStateStore } from '../../../src/domain/conversation/conversation-state.js';
import { TextMessageHandler } from '../../../src/domain/commands/handlers/text-message.handler.js';
import { SchedulingFlow } from '../../../src/application/scheduling/scheduling-flow.js';
import { RagQaFlow } from '../../../src/application/qa/rag-qa-flow.js';
import type { MessagingPort } from '../../../src/ports/messaging.port.js';
import type { EmbeddingPort, GenerationPort } from '../../../src/ports/ai.port.js';
import type { KnowledgeSearchResult, VectorStorePort } from '../../../src/ports/vector-store.port.js';
import type { HandlerContext } from '../../../src/domain/commands/handler-context.js';
import type { ParsedMessage } from '../../../src/domain/commands/parsed-message.js';

// ── Test doubles ──────────────────────────────────────────────────────────────

const embeddings: EmbeddingPort = {
  async embedChunks(chunks) {
    return chunks.map(() => Array(768).fill(0.1));
  },
  async embedQuery() {
    return Array(768).fill(0.1);
  }
};

const generation: GenerationPort = {
  async answer({ question }) {
    return `RAG answer for: ${question}`;
  },
  async extractRules() {
    return [];
  }
};

function vectorStore(results: KnowledgeSearchResult[]): VectorStorePort {
  return {
    async upsertDocument() {
      throw new Error('should not write');
    },
    async deleteByTitle() {
      throw new Error('should not delete');
    },
    async search() {
      return results;
    }
  };
}

function knowledgeResult(content: string): KnowledgeSearchResult {
  return { documentId: 1, chunkId: 1, title: 'FAQ', content, metadata: {}, score: 0.9 };
}

function buildContext(
  conversations: InMemoryConversationStateStore,
  sentMessages: string[],
  ragQaFlow?: RagQaFlow
): HandlerContext {
  const messaging: MessagingPort = {
    async sendMessage(_recipient, text) {
      sentMessages.push(text);
    }
  };
  const schedulingFlow = new SchedulingFlow(conversations);

  return {
    userId: 'user-1',
    chatId: 'chat-1',
    role: 'patient',
    isAuthorized: false,
    messaging,
    conversations,
    schedulingFlow,
    ragQaFlow
  };
}

function makeMessage(text: string): ParsedMessage {
  return { userId: 'user-1', chatId: 'chat-1', text, type: 'text' } as ParsedMessage;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Conversational flow', () => {
  describe('idle user asking a question', () => {
    it('answers with RAG and offers to schedule when docs exist', async () => {
      const conversations = new InMemoryConversationStateStore();
      const sentMessages: string[] = [];
      const rag = new RagQaFlow(embeddings, vectorStore([knowledgeResult('Atendemos de 9 a 18hs.')]), generation);
      const context = buildContext(conversations, sentMessages, rag);
      const handler = new TextMessageHandler();

      await handler.handle(makeMessage('¿qué horario tienen?'), context);

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]).toContain('RAG answer for');
      expect(sentMessages[0]).toContain('¿Le gustaría agendar una cita?');
    });

    it('saves awaitingSchedulingResume=true after RAG answer', async () => {
      const conversations = new InMemoryConversationStateStore();
      const rag = new RagQaFlow(embeddings, vectorStore([knowledgeResult('Atendemos de 9 a 18hs.')]), generation);
      const context = buildContext(conversations, [], rag);
      const handler = new TextMessageHandler();

      await handler.handle(makeMessage('¿qué horario tienen?'), context);

      const state = await conversations.get('user-1');
      expect(state?.data?.awaitingSchedulingResume).toBe(true);
    });

    it('does NOT offer scheduling when knowledge is insufficient', async () => {
      const conversations = new InMemoryConversationStateStore();
      const sentMessages: string[] = [];
      const rag = new RagQaFlow(embeddings, vectorStore([]), generation);
      const context = buildContext(conversations, sentMessages, rag);
      const handler = new TextMessageHandler();

      await handler.handle(makeMessage('¿cuál es el radio de la luna?'), context);

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]).not.toContain('agendar');
      expect(sentMessages[0]).toContain('No tengo información');
    });
  });

  describe('idle user responding to scheduling offer', () => {
    async function setupWithResumeFlag(negative?: boolean): Promise<{
      conversations: InMemoryConversationStateStore;
      sentMessages: string[];
      handler: TextMessageHandler;
      context: HandlerContext;
    }> {
      const conversations = new InMemoryConversationStateStore();
      // Simulate state after RAG answered and offered to schedule
      await conversations.save({
        telegramUserId: 'user-1',
        flow: 'none',
        step: 'idle',
        data: { awaitingSchedulingResume: true }
      });
      const sentMessages: string[] = [];
      const rag = new RagQaFlow(embeddings, vectorStore([]), generation);
      const context = buildContext(conversations, sentMessages, rag);
      const handler = new TextMessageHandler();
      return { conversations, sentMessages, handler, context };
    }

    it('starts scheduling flow when user says "sí"', async () => {
      const { handler, context, sentMessages } = await setupWithResumeFlag();

      await handler.handle(makeMessage('sí'), context);

      expect(sentMessages[0]).toContain('nombre completo');
    });

    it('starts scheduling flow when user says "dale"', async () => {
      const { handler, context, sentMessages } = await setupWithResumeFlag();

      await handler.handle(makeMessage('dale'), context);

      expect(sentMessages[0]).toContain('nombre completo');
    });

    it('resets to idle and acknowledges when user says "no"', async () => {
      const { handler, context, sentMessages, conversations } = await setupWithResumeFlag();

      await handler.handle(makeMessage('no'), context);

      expect(sentMessages[0]).toContain('Entendido');
      const state = await conversations.get('user-1');
      expect(state?.flow).toBe('none');
      expect(state?.step).toBe('idle');
    });
  });

  describe('off-topic question mid-scheduling-flow', () => {
    /**
     * Advance the flow to the `age` step (which only accepts integers).
     * "¿qué horario tienen?" is not a valid age → advanced=false → off-topic path.
     */
    async function setupAtAgeStep(): Promise<{
      conversations: InMemoryConversationStateStore;
      sentMessages: string[];
      handler: TextMessageHandler;
      context: HandlerContext;
      schedulingFlow: SchedulingFlow;
    }> {
      const conversations = new InMemoryConversationStateStore();
      const schedulingFlow = new SchedulingFlow(conversations);

      // Drive through fullName, dni to reach the age step
      await schedulingFlow.handleMessage('user-1', '/schedule');       // → asks fullName
      await schedulingFlow.handleMessage('user-1', 'Juan Pérez');      // → asks DNI
      await schedulingFlow.handleMessage('user-1', '12345678');        // → asks age

      const sentMessages: string[] = [];
      const rag = new RagQaFlow(
        embeddings,
        vectorStore([knowledgeResult('Horario: 9 a 18hs.')]),
        generation
      );

      const context = buildContext(conversations, sentMessages, rag);
      (context as { schedulingFlow: SchedulingFlow }).schedulingFlow = schedulingFlow;

      const handler = new TextMessageHandler();
      return { conversations, sentMessages, handler, context, schedulingFlow };
    }

    it('answers the question with RAG and then asks to resume', async () => {
      const { handler, context, sentMessages } = await setupAtAgeStep();

      await handler.handle(makeMessage('¿qué horario tienen?'), context);

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]).toContain('RAG answer for');
      expect(sentMessages[0]).toContain('años tiene el paciente');
    });

    it('saves awaitingSchedulingResume=true after off-topic question', async () => {
      const { handler, context, conversations } = await setupAtAgeStep();

      await handler.handle(makeMessage('¿qué horario tienen?'), context);

      const state = await conversations.get('user-1');
      expect(state?.data?.awaitingSchedulingResume).toBe(true);
    });

    it('resumes the intake step when user says "sí"', async () => {
      const { handler, context, sentMessages } = await setupAtAgeStep();

      // First: ask off-topic question
      await handler.handle(makeMessage('¿qué horario tienen?'), context);
      sentMessages.length = 0;

      // Then: respond to resume offer
      await handler.handle(makeMessage('sí'), context);

      expect(sentMessages[0]).toContain('años tiene el paciente');
    });

    it('cancels the scheduling flow when user says "no"', async () => {
      const { handler, context, sentMessages, conversations } = await setupAtAgeStep();

      // First: ask off-topic question
      await handler.handle(makeMessage('¿qué horario tienen?'), context);
      sentMessages.length = 0;

      // Then: cancel
      await handler.handle(makeMessage('no'), context);

      expect(sentMessages[0]).toContain('Entendido');
      const state = await conversations.get('user-1');
      expect(state?.flow).toBe('none');
      expect(state?.step).toBe('idle');
    });
  });

  describe('valid scheduling response — fast path', () => {
    it('advances the flow without RAG when response is valid', async () => {
      const conversations = new InMemoryConversationStateStore();
      const schedulingFlow = new SchedulingFlow(conversations);
      await schedulingFlow.handleMessage('user-1', '/schedule');

      const sentMessages: string[] = [];
      // RAG would throw if called — proves it is never invoked on the happy path
      const rag: RagQaFlow = {
        answer() {
          throw new Error('RAG should not be called on valid scheduling responses');
        }
      } as unknown as RagQaFlow;

      const context = buildContext(conversations, sentMessages, rag);
      (context as { schedulingFlow: SchedulingFlow }).schedulingFlow = schedulingFlow;

      const handler = new TextMessageHandler();
      await handler.handle(makeMessage('Juan Pérez García'), context);

      expect(sentMessages[0]).toContain('DNI');
    });
  });
});
