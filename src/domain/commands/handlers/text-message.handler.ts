import { BotCommand } from '../bot-commands.js';
import type { CommandHandler } from '../command-handler.interface.js';
import type { ParsedMessage } from '../parsed-message.js';
import type { HandlerContext, HandlerResult } from '../handler-context.js';

/**
 * Fallback handler — catches any message that no prior handler claimed.
 * Delegates to the scheduling flow, which manages its own conversation state.
 * Must be registered last in the chain.
 */
export class TextMessageHandler implements CommandHandler {
  canHandle(_message: ParsedMessage): boolean {
    return true;
  }

  async handle(message: ParsedMessage, context: HandlerContext): Promise<HandlerResult> {
    const reply = await context.schedulingFlow.handleMessage(
      context.userId,
      message.text || BotCommand.SCHEDULE
    );

    await context.messaging.sendMessage(context.chatId, reply.text);
    return { handled: true };
  }
}
