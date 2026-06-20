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
      'Bienvenido. Envía /schedule para iniciar el agendamiento de tu cita.'
    );

    return { handled: true };
  }
}
