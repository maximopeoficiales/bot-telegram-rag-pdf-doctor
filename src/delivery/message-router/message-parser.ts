import { BotCommand, MessageType } from '../../domain/commands/bot-commands.js';
import type { ParsedMessage } from '../../domain/commands/parsed-message.js';
import type { PatientFileType } from '../../application/notifications/notification.service.js';

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number | string; type: string };
    from?: { id: number; first_name?: string; username?: string };
    document?: { file_id: string; mime_type?: string; file_name?: string };
    photo?: Array<{ file_id: string }>;
    audio?: { file_id: string };
    voice?: { file_id: string };
  };
};

export class MessageParser {
  parse(update: TelegramUpdate): ParsedMessage {
    const message = update.message;
    const userId = message?.from?.id?.toString() ?? '';
    const chatId = message?.chat.id.toString() ?? '';
    const text = message?.text?.trim() ?? '';

    return {
      userId,
      chatId,
      text,
      command: this.extractCommand(text),
      messageType: this.determineMessageType(message),
      file: message ? this.extractFile(message) : undefined,
      raw: update
    };
  }

  private extractCommand(text: string): BotCommand | null {
    const word = text.split(' ')[0];
    return (Object.values(BotCommand) as string[]).includes(word)
      ? (word as BotCommand)
      : null;
  }

  private determineMessageType(message: TelegramUpdate['message']): MessageType {
    if (!message) return MessageType.TEXT;
    if (message.document ?? message.photo ?? message.audio ?? message.voice) {
      return MessageType.FILE;
    }
    if (message.text?.startsWith('/')) return MessageType.COMMAND;
    return MessageType.TEXT;
  }

  private extractFile(
    message: NonNullable<TelegramUpdate['message']>
  ): ParsedMessage['file'] | undefined {
    if (message.document) {
      const fileType: PatientFileType =
        message.document.mime_type === 'application/pdf' ? 'pdf' : 'document';
      return { fileId: message.document.file_id, fileType };
    }

    const photo = message.photo?.at(-1);
    if (photo) return { fileId: photo.file_id, fileType: 'image' };
    if (message.audio) return { fileId: message.audio.file_id, fileType: 'audio' };
    if (message.voice) return { fileId: message.voice.file_id, fileType: 'audio' };

    return undefined;
  }
}
