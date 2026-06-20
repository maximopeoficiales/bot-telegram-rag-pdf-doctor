import type { MessagingPort } from '../../ports/messaging.port.js';
import type { ConversationStateStore } from '../conversation/conversation-state.js';
import type { SchedulingFlow } from '../../application/scheduling/scheduling-flow.js';
import type { NotificationService } from '../../application/notifications/notification.service.js';
import type { StaffReplyService } from '../../application/notifications/staff-reply.service.js';

export type HandlerContext = {
  userId: string;
  chatId: string;
  role: 'patient' | 'staff';
  isAuthorized: boolean;
  messaging: MessagingPort;
  conversations: ConversationStateStore;
  schedulingFlow: SchedulingFlow;
  notifications?: NotificationService;
  staffReplies?: StaffReplyService;
};

export type HandlerResult = {
  handled: boolean;
  denied?: boolean;
};
