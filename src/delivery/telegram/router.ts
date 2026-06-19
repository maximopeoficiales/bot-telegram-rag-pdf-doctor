import type { ConversationStateStore } from '../../domain/conversation/conversation-state.js';
import { SchedulingFlow } from '../../application/scheduling/scheduling-flow.js';

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
    conversations: ConversationStateStore,
    private readonly staffAllowlist: StaffAllowlistStore
  ) {
    this.schedulingFlow = new SchedulingFlow(conversations);
  }

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
}
