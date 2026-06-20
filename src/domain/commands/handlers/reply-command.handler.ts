import { BotCommand } from '../bot-commands.js';
import type { CommandHandler } from '../command-handler.interface.js';
import type { ParsedMessage } from '../parsed-message.js';
import type { HandlerContext, HandlerResult } from '../handler-context.js';

export class ReplyCommandHandler implements CommandHandler {
  canHandle(message: ParsedMessage): boolean {
    return message.command === BotCommand.REPLY && message.text.startsWith('/reply ');
  }

  async handle(message: ParsedMessage, context: HandlerContext): Promise<HandlerResult> {
    if (!context.staffReplies) {
      await context.messaging.sendMessage(context.chatId, 'El servicio de respuesta no está disponible.');
      return { handled: true };
    }

    const parts = message.text.split(' ');
    const caseId = Number(parts[1]);
    const replyMessage = parts.slice(2).join(' ');

    const delivered = await context.staffReplies.sendMediatedReply({ caseId, message: replyMessage });

    await context.messaging.sendMessage(
      context.chatId,
      delivered ? 'Respuesta enviada al paciente.' : 'No se encontró un hilo para ese caso.'
    );

    return { handled: true };
  }
}
