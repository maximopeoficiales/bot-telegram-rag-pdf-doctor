import type { CommandHandler } from '../../domain/commands/command-handler.interface.js';
import type { HandlerContext } from '../../domain/commands/handler-context.js';
import type { MessagingPort } from '../../ports/messaging.port.js';
import type { ConversationStateStore } from '../../domain/conversation/conversation-state.js';
import type { SchedulingFlow } from '../../application/scheduling/scheduling-flow.js';
import type { NotificationService } from '../../application/notifications/notification.service.js';
import type { StaffReplyService } from '../../application/notifications/staff-reply.service.js';
import { MessageParser, type TelegramUpdate } from './message-parser.js';

export type StaffAllowlistStore = {
  isAuthorized(userId: string): Promise<boolean>;
};

export class StaticStaffAllowlistStore implements StaffAllowlistStore {
  private readonly ids: Set<string>;

  constructor(ids: string[]) {
    this.ids = new Set(ids);
  }

  async isAuthorized(userId: string): Promise<boolean> {
    return this.ids.has(userId);
  }
}

export type RouteResult = {
  role: 'patient' | 'staff';
  handled: boolean;
  denied: boolean;
};

export class MessageRouter {
  private readonly handlers: CommandHandler[] = [];
  private readonly parser = new MessageParser();

  constructor(
    private readonly staffAllowlist: StaffAllowlistStore,
    private readonly conversations: ConversationStateStore,
    private readonly schedulingFlow: SchedulingFlow,
    private readonly messaging: MessagingPort,
    private readonly notifications?: NotificationService,
    private readonly staffReplies?: StaffReplyService
  ) {}

  registerHandler(handler: CommandHandler): this {
    this.handlers.push(handler);
    return this;
  }

  async route(update: TelegramUpdate): Promise<RouteResult> {
    const message = this.parser.parse(update);

    if (!message.userId || !message.chatId) {
      return { role: 'patient', handled: false, denied: false };
    }

    const context = await this.buildContext(message);

    for (const handler of this.handlers) {
      if (handler.canHandle(message)) {
        const result = await handler.handle(message, context);
        if (result.handled) {
          return {
            role: context.role,
            handled: true,
            denied: result.denied ?? false
          };
        }
      }
    }

    return { role: context.role, handled: false, denied: false };
  }

  private async buildContext(message: import('../../domain/commands/parsed-message.js').ParsedMessage): Promise<HandlerContext> {
    const isAuthorized = await this.staffAllowlist.isAuthorized(message.userId);

    return {
      userId: message.userId,
      chatId: message.chatId,
      role: isAuthorized ? 'staff' : 'patient',
      isAuthorized,
      messaging: this.messaging,
      conversations: this.conversations,
      schedulingFlow: this.schedulingFlow,
      notifications: this.notifications,
      staffReplies: this.staffReplies
    };
  }
}
