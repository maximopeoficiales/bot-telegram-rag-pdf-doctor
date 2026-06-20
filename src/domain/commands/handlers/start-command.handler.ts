import { BotCommand } from '../bot-commands.js';
import type { CommandHandler } from '../command-handler.interface.js';
import type { ParsedMessage } from '../parsed-message.js';
import type { HandlerContext, HandlerResult } from '../handler-context.js';

export class StartCommandHandler implements CommandHandler {
  canHandle(message: ParsedMessage): boolean {
    return message.command === BotCommand.START;
  }

  async handle(_message: ParsedMessage, context: HandlerContext): Promise<HandlerResult> {
    await context.messaging.sendMessage(
      context.chatId,
      'Welcome. Send /schedule to start appointment scheduling.'
    );

    return { handled: true };
  }
}
