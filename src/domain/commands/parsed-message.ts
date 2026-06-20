import type { BotCommand, MessageType } from './bot-commands.js';
import type { PatientFileType } from '../../application/notifications/notification.service.js';

export type ParsedMessage = {
  userId: string;
  chatId: string;
  text: string;
  command: BotCommand | null;
  messageType: MessageType;
  file?: {
    fileId: string;
    fileType: PatientFileType;
  };
  raw: unknown;
};
