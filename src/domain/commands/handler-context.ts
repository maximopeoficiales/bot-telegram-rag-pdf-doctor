import type { MessagingPort } from '../../ports/messaging.port.js';
import type { ConversationStateStore } from '../conversation/conversation-state.js';
import type { SchedulingFlow } from '../../application/scheduling/scheduling-flow.js';
import type { NotificationService } from '../../application/notifications/notification.service.js';
import type { StaffReplyService } from '../../application/notifications/staff-reply.service.js';
import type { RagQaFlow } from '../../application/qa/rag-qa-flow.js';
import type { UploadDocumentHandler } from './handlers/upload-document.handler.js';

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
  ragQaFlow?: RagQaFlow;
  uploadDocumentHandler?: UploadDocumentHandler;
};

export type HandlerResult = {
  handled: boolean;
  denied?: boolean;
};
