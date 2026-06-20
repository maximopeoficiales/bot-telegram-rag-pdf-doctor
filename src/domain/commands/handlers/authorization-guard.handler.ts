import { BotCommand, MessageType } from '../bot-commands.js';
import type { CommandHandler } from '../command-handler.interface.js';
import type { ParsedMessage } from '../parsed-message.js';
import type { HandlerContext, HandlerResult } from '../handler-context.js';

const STAFF_COMMANDS: BotCommand[] = [
  BotCommand.STAFF,
  BotCommand.CONFIG,
  BotCommand.UPLOAD_KNOWLEDGE,
];

export class AuthorizationGuard implements CommandHandler {
  canHandle(message: ParsedMessage): boolean {
    return (
      message.messageType === MessageType.COMMAND &&
      message.command !== null &&
      STAFF_COMMANDS.includes(message.command)
    );
  }

  async handle(message: ParsedMessage, context: HandlerContext): Promise<HandlerResult> {
    if (!context.isAuthorized) {
      await context.messaging.sendMessage(
        context.chatId,
        'Esta acción es solo para usuarios autorizados del consultorio.'
      );
      return { handled: true, denied: true };
    }

    // Authorized — pass to the next handler in the chain
    return { handled: false };
  }
}
