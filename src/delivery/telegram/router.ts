import type { ConversationStateStore } from '../../domain/conversation/conversation-state.js';
import { SchedulingFlow } from '../../application/scheduling/scheduling-flow.js';
import type { NotificationService, PatientFileType } from '../../application/notifications/notification.service.js';
import type { StaffReplyService } from '../../application/notifications/staff-reply.service.js';

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

export type TelegramRole = 'patient' | 'staff';

export type StaffAllowlistStore = {
  isAuthorized(telegramUserId: string): Promise<boolean>;
};

export type TelegramSendMessage = {
  chatId: string;
  text: string;
};

export type TelegramRouteResult = {
  role: TelegramRole;
  messages: TelegramSendMessage[];
  denied: boolean;
};

export class StaticStaffAllowlistStore implements StaffAllowlistStore {
  private readonly ids: Set<string>;

  constructor(ids: string[]) {
    this.ids = new Set(ids);
  }

  async isAuthorized(telegramUserId: string): Promise<boolean> {
    return this.ids.has(telegramUserId);
  }
}

export class TelegramUpdateRouter {
  private readonly schedulingFlow: SchedulingFlow;

  constructor(
    private readonly conversations: ConversationStateStore,
    private readonly staffAllowlist: StaffAllowlistStore,
    options: { schedulingFlow?: SchedulingFlow; notifications?: NotificationService; staffReplies?: StaffReplyService } = {}
  ) {
    this.schedulingFlow = options.schedulingFlow ?? new SchedulingFlow(conversations);
    this.notifications = options.notifications;
    this.staffReplies = options.staffReplies;
  }

  private readonly notifications?: NotificationService;
  private readonly staffReplies?: StaffReplyService;

  async route(update: TelegramUpdate): Promise<TelegramRouteResult> {
    const message = update.message;
    const telegramUserId = message?.from?.id?.toString();
    const chatId = message?.chat.id.toString();
    const text = message?.text?.trim() ?? '';

    if (!message || !telegramUserId || !chatId) {
      return { role: 'patient', messages: [], denied: false };
    }

    const staffAuthorized = await this.staffAllowlist.isAuthorized(telegramUserId);
    const staffCommand = text.startsWith('/staff') || text.startsWith('/config') || text.startsWith('/upload_knowledge');

    if (staffAuthorized && text.startsWith('/reply ')) {
      const [, caseIdText, ...messageParts] = text.split(' ');
      const delivered = await this.staffReplies?.sendMediatedReply({ caseId: Number(caseIdText), message: messageParts.join(' ') });
      return {
        role: 'staff',
        denied: false,
        messages: [{ chatId, text: delivered ? 'Reply sent to the patient.' : 'No patient thread found for that case.' }]
      };
    }

    const uploadedFile = this.extractUploadedFile(message);
    if (uploadedFile) {
      const state = await this.conversations.get(telegramUserId);
      const caseId = typeof state?.data.caseId === 'number' ? state.data.caseId : 0;
      if (caseId > 0) {
        await this.notifications?.patientFileUploaded({ caseId, telegramUserId, fileId: uploadedFile.fileId, fileType: uploadedFile.fileType });
      }

      return {
        role: staffAuthorized ? 'staff' : 'patient',
        denied: false,
        messages: [{ chatId, text: 'File received. The team has been notified for review.' }]
      };
    }

    if (staffCommand && !staffAuthorized) {
      return {
        role: 'patient',
        denied: true,
        messages: [{ chatId, text: 'This staff action is only available to authorized practice users.' }]
      };
    }

    if (staffAuthorized && staffCommand) {
      return {
        role: 'staff',
        denied: false,
        messages: [{ chatId, text: 'Authorized staff action received. Staff workflows continue in the next delivery slice.' }]
      };
    }

    if (text === '/start') {
      return {
        role: staffAuthorized ? 'staff' : 'patient',
        denied: false,
        messages: [{ chatId, text: 'Welcome. Send /schedule to start appointment scheduling.' }]
      };
    }

    const schedulingReply = await this.schedulingFlow.handleMessage(telegramUserId, text || '/schedule');

    return {
      role: staffAuthorized ? 'staff' : 'patient',
      denied: false,
      messages: [{ chatId, text: schedulingReply.text }]
    };
  }

  private extractUploadedFile(message: NonNullable<TelegramUpdate['message']>): { fileId: string; fileType: PatientFileType } | null {
    if (message.document) {
      return { fileId: message.document.file_id, fileType: message.document.mime_type === 'application/pdf' ? 'pdf' : 'document' };
    }

    const photo = message.photo?.at(-1);
    if (photo) return { fileId: photo.file_id, fileType: 'image' };
    if (message.audio) return { fileId: message.audio.file_id, fileType: 'audio' };
    if (message.voice) return { fileId: message.voice.file_id, fileType: 'audio' };

    return null;
  }
}
