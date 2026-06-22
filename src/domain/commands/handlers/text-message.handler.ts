import { BotCommand } from '../bot-commands.js';
import type { CommandHandler } from '../command-handler.interface.js';
import type { ParsedMessage } from '../parsed-message.js';
import type { HandlerContext, HandlerResult } from '../handler-context.js';

const UPLOAD_FLOW = 'upload_document';

/**
 * Fallback handler — catches any message that no prior handler claimed.
 * Routes based on active conversation flow:
 *   - upload_document flow → delegates to UploadDocumentHandler
 *   - scheduling flow active → SchedulingFlow
 *   - idle → RagQaFlow (if available) or SchedulingFlow
 * Must be registered last in the chain.
 */
export class TextMessageHandler implements CommandHandler {
  canHandle(_message: ParsedMessage): boolean {
    return true;
  }

  async handle(message: ParsedMessage, context: HandlerContext): Promise<HandlerResult> {
    const state = await context.conversations.get(context.userId);
    const flow = state?.flow ?? 'none';
    const step = state?.step ?? 'idle';

    // Active upload_document flow → delegate to UploadDocumentHandler
    if (flow === UPLOAD_FLOW && context.uploadDocumentHandler) {
      return context.uploadDocumentHandler.handle(message, context);
    }

    // Active scheduling flow → keep in SchedulingFlow
    const hasActiveScheduling = flow === 'scheduling' && step !== 'idle';
    if (hasActiveScheduling) {
      const reply = await context.schedulingFlow.handleMessage(context.userId, message.text);
      await context.messaging.sendMessage(context.chatId, reply.text);
      return { handled: true };
    }

    // Idle → try RAG Q&A first (if available)
    if (context.ragQaFlow) {
      const answer = await context.ragQaFlow.answer(message.text);

      if (answer.kind === 'redirect_to_scheduling') {
        // RAG detected scheduling intent — start the scheduling flow
        const reply = await context.schedulingFlow.handleMessage(context.userId, BotCommand.SCHEDULE);
        await context.messaging.sendMessage(context.chatId, reply.text);
        return { handled: true };
      }

      await context.messaging.sendMessage(context.chatId, answer.text);
      return { handled: true };
    }

    // Fallback: no RAG configured → scheduling flow
    const reply = await context.schedulingFlow.handleMessage(
      context.userId,
      message.text || BotCommand.SCHEDULE
    );
    await context.messaging.sendMessage(context.chatId, reply.text);
    return { handled: true };
  }
}
