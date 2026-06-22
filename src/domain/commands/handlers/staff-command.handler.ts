import { BotCommand } from '../bot-commands.js';
import type { CommandHandler } from '../command-handler.interface.js';
import type { ParsedMessage } from '../parsed-message.js';
import type { HandlerContext, HandlerResult } from '../handler-context.js';

const STAFF_COMMANDS: BotCommand[] = [
  BotCommand.STAFF,
  BotCommand.CONFIG,
];

export class StaffCommandHandler implements CommandHandler {
  canHandle(message: ParsedMessage): boolean {
    return message.command !== null && STAFF_COMMANDS.includes(message.command);
  }

  async handle(message: ParsedMessage, context: HandlerContext): Promise<HandlerResult> {
    // AuthorizationGuard already passed — user is authorized here
    await context.messaging.sendMessage(
      context.chatId,
      `Comando ${message.command} recibido. Las funciones de staff estarán disponibles pronto.`
    );

    return { handled: true };
  }
}
