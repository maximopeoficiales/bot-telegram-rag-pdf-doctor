import { MessageType } from '../bot-commands.js';
import type { CommandHandler } from '../command-handler.interface.js';
import type { ParsedMessage } from '../parsed-message.js';
import type { HandlerContext, HandlerResult } from '../handler-context.js';

export class FileUploadHandler implements CommandHandler {
  canHandle(message: ParsedMessage): boolean {
    return message.messageType === MessageType.FILE && message.file !== undefined;
  }

  async handle(message: ParsedMessage, context: HandlerContext): Promise<HandlerResult> {
    if (message.file && context.notifications) {
      const state = await context.conversations.get(context.userId);
      const caseId = typeof state?.data.caseId === 'number' ? state.data.caseId : 0;

      if (caseId > 0) {
        await context.notifications.patientFileUploaded({
          caseId,
          telegramUserId: context.userId,
          fileId: message.file.fileId,
          fileType: message.file.fileType
        });
      }
    }

    await context.messaging.sendMessage(
      context.chatId,
      'Archivo recibido. El equipo ha sido notificado para su revisión.'
    );

    return { handled: true };
  }
}
