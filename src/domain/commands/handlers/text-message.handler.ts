import type { CommandHandler } from '../command-handler.interface.js';
import type { ParsedMessage } from '../parsed-message.js';
import type { HandlerContext, HandlerResult } from '../handler-context.js';
import type { ConversationState } from '../conversation/conversation-state.js';

const UPLOAD_FLOW = 'upload_document';

const AFFIRMATIVE = new Set(['si', 'sí', 'yes', 'dale', 'ok', 'okay', 'claro', 'por supuesto', 'confirmar', 'confirm', 'quiero', 'me gustaría', 'me gustaria', 'continuar', 'seguir', 'adelante', 'agendar', 'cita']);
const NEGATIVE = new Set(['no', 'nope', 'nel', 'nah', 'cancelar', 'cancel', 'salir', 'exit', 'no quiero', 'no gracias', 'dejarlo', 'olvidar']);

function isAffirmative(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  if (NEGATIVE.has(normalized)) return false;
  if (AFFIRMATIVE.has(normalized)) return true;
  return Array.from(AFFIRMATIVE).some((word) => normalized.startsWith(word));
}

function isNegative(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return NEGATIVE.has(normalized) || Array.from(NEGATIVE).some((word) => normalized.startsWith(word));
}

function hasActiveScheduling(state: ConversationState | null): boolean {
  return state?.flow === 'scheduling' && state.step !== 'idle';
}

/**
 * Fallback handler — catches any message that no prior handler claimed.
 *
 * Conversational flow:
 *   1. upload_document flow → delegate (unchanged)
 *   2. awaitingSchedulingResume flag → user is responding to "¿querés continuar?"
 *      - affirmative → resume scheduling from saved step
 *      - negative     → reset to idle
 *   3. Active scheduling → pass message to SchedulingFlow first (fast path)
 *      - advanced=true  → flow moved forward, done
 *      - advanced=false → input didn't match the step; try RAG and offer to resume
 *   4. Idle → RAG answers; if answer found, offer to schedule
 *
 * Must be registered last in the handler chain.
 */
export class TextMessageHandler implements CommandHandler {
  canHandle(_message: ParsedMessage): boolean {
    return true;
  }

  async handle(message: ParsedMessage, context: HandlerContext): Promise<HandlerResult> {
    const state = await context.conversations.get(context.userId);
    const flow = state?.flow ?? 'none';

    // ── upload_document flow: delegate unchanged ───────────────────────────────
    if (flow === UPLOAD_FLOW && context.uploadDocumentHandler) {
      return context.uploadDocumentHandler.handle(message, context);
    }

    const text = message.text;

    // ── awaiting "¿querés continuar con tu cita?" response ────────────────────
    if (state?.data?.awaitingSchedulingResume === true) {
      return this.handleResumeResponse(text, state, context);
    }

    // ── active scheduling: try flow first ─────────────────────────────────────
    if (hasActiveScheduling(state)) {
      const reply = await context.schedulingFlow.handleMessage(context.userId, text);

      if (reply.advanced) {
        // Flow moved forward — valid response, nothing extra needed
        await context.messaging.sendMessage(context.chatId, reply.text);
        return { handled: true };
      }

      // Input didn't match the current step — treat it as an off-topic question
      return this.handleOffTopicWithResume(text, state!, context);
    }

    // ── idle: RAG answers and offers scheduling ────────────────────────────────
    return this.handleIdle(text, state, context);
  }

  // ── private helpers ──────────────────────────────────────────────────────────

  private async handleResumeResponse(
    text: string,
    state: ConversationState,
    context: HandlerContext
  ): Promise<HandlerResult> {
    // Clear the flag regardless of the answer
    const cleanData = { ...state.data, awaitingSchedulingResume: false };
    await context.conversations.save({ ...state, data: cleanData });

    if (isNegative(text)) {
      // User doesn't want to continue — reset to idle
      await context.conversations.save({
        telegramUserId: state.telegramUserId,
        flow: 'none',
        step: 'idle',
        data: {}
      });
      await context.messaging.sendMessage(
        context.chatId,
        'Entendido, no hay problema. Quedamos a su disposición si necesita algo más.'
      );
      return { handled: true };
    }

    if (isAffirmative(text)) {
      // Resume scheduling — repeat the current prompt
      if (hasActiveScheduling({ ...state, data: cleanData })) {
        const prompt = context.schedulingFlow.getCurrentPrompt({ ...state, data: cleanData });
        await context.messaging.sendMessage(context.chatId, `Con gusto continuamos. ${prompt}`);
      } else {
        // Was idle when the offer was made — start fresh
        const reply = await context.schedulingFlow.handleMessage(context.userId, '/schedule');
        await context.messaging.sendMessage(context.chatId, reply.text);
      }
      return { handled: true };
    }

    // Ambiguous response — ask again with context
    if (hasActiveScheduling({ ...state, data: cleanData })) {
      const prompt = context.schedulingFlow.getCurrentPrompt({ ...state, data: cleanData });
      await context.messaging.sendMessage(
        context.chatId,
        `¿Desea continuar con su cita? Si es así, necesito que me indique: ${prompt}\nSi prefiere cancelar, responda "no".`
      );
    } else {
      await context.messaging.sendMessage(
        context.chatId,
        '¿Desea agendar una cita? Responda "sí" para comenzar o "no" para cancelar.'
      );
    }
    // Re-set the flag since we're still waiting
    await context.conversations.save({
      ...state,
      data: { ...cleanData, awaitingSchedulingResume: true }
    });
    return { handled: true };
  }

  private async handleOffTopicWithResume(
    text: string,
    state: ConversationState,
    context: HandlerContext
  ): Promise<HandlerResult> {
    const currentPrompt = context.schedulingFlow.getCurrentPrompt(state);
    let ragText: string | null = null;

    if (context.ragQaFlow) {
      const answer = await context.ragQaFlow.answer(text);
      if (answer.kind === 'answer') {
        ragText = answer.text;
      }
    }

    if (ragText) {
      await context.messaging.sendMessage(
        context.chatId,
        `${ragText}\n\n¿Desea continuar con su cita? Si es así, necesito que me indique: ${currentPrompt}`
      );
    } else {
      await context.messaging.sendMessage(
        context.chatId,
        `En este momento no cuento con información sobre eso.\n\n¿Desea continuar con su cita? Necesito que me indique: ${currentPrompt}`
      );
    }

    // Save the flag so next message is handled as a resume response
    await context.conversations.save({
      ...state,
      data: { ...state.data, awaitingSchedulingResume: true }
    });

    return { handled: true };
  }

  private async handleIdle(
    text: string,
    state: ConversationState | null,
    context: HandlerContext
  ): Promise<HandlerResult> {
    if (!context.ragQaFlow) {
      // No RAG configured — start scheduling directly
      const reply = await context.schedulingFlow.handleMessage(context.userId, text || '/schedule');
      await context.messaging.sendMessage(context.chatId, reply.text);
      return { handled: true };
    }

    const answer = await context.ragQaFlow.answer(text);

    if (answer.kind === 'answer') {
      await context.messaging.sendMessage(
        context.chatId,
        `${answer.text}\n\n¿Le gustaría agendar una cita?`
      );

      // Save the flag so next message is handled as a resume response
      const current = state ?? {
        telegramUserId: context.userId,
        flow: 'none' as const,
        step: 'idle' as const,
        data: {},
        updatedAt: new Date()
      };
      await context.conversations.save({
        ...current,
        data: { ...current.data, awaitingSchedulingResume: true }
      });

      return { handled: true };
    }

    // insufficient_knowledge or any other kind — no scheduling offer
    await context.messaging.sendMessage(context.chatId, answer.text);
    return { handled: true };
  }
}
