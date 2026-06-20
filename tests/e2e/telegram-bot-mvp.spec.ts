import { describe, expect, it } from 'vitest';
import { AvailabilityService } from '../../src/application/calendar/availability.service.js';
import { NotificationService } from '../../src/application/notifications/notification.service.js';
import { StaffReplyService } from '../../src/application/notifications/staff-reply.service.js';
import { SchedulingFlow } from '../../src/application/scheduling/scheduling-flow.js';
import { InMemoryConversationStateStore } from '../../src/domain/conversation/conversation-state.js';
import { AuthorizationGuard } from '../../src/domain/commands/handlers/authorization-guard.handler.js';
import { FileUploadHandler } from '../../src/domain/commands/handlers/file-upload.handler.js';
import { ReplyCommandHandler } from '../../src/domain/commands/handlers/reply-command.handler.js';
import { ScheduleCommandHandler } from '../../src/domain/commands/handlers/schedule-command.handler.js';
import { StartCommandHandler } from '../../src/domain/commands/handlers/start-command.handler.js';
import { StaffCommandHandler } from '../../src/domain/commands/handlers/staff-command.handler.js';
import { TextMessageHandler } from '../../src/domain/commands/handlers/text-message.handler.js';
import { MessageRouter, StaticStaffAllowlistStore } from '../../src/delivery/message-router/message-router.js';
import { processTelegramWebhook } from '../../src/delivery/telegram/webhook.js';
import type { MessagingPort } from '../../src/ports/messaging.port.js';
import type { CalendarPort } from '../../src/ports/calendar.port.js';
import type { TelegramUpdate } from '../../src/delivery/message-router/message-parser.js';

const intakeAnswers = ['Ada Patient', '12345678', '40', 'Surco', 'back', '2 weeks', 'limited bending', 'normal', 'none', 'appointment'];
const reviewAnswers = ['Review Patient', '87654321', '56', 'Surco', 'back', '2 weeks', 'limited bending', 'normal', 'none', 'appointment'];

describe('telegram bot MVP e2e', () => {
  it('books an eligible patient, creates a calendar event, and notifies staff', async () => {
    const sentMessages: string[] = [];
    const staffMessages: string[] = [];
    const createdEvents: string[] = [];
    const router = createRouter({ sentMessages, staffMessages, createdEvents });

    for (const text of ['/schedule', 'Surco', '2026-07-01', '10:00', ...intakeAnswers, 'confirm']) {
      await send(router, text);
    }

    expect(createdEvents).toEqual(['Appointment - Ada Patient']);
    expect(staffMessages.some((m) => m.includes('New appointment confirmed'))).toBe(true);
    expect(sentMessages.at(-1)).toContain('cita está confirmada');
  });

  it('holds radiography review cases without creating calendar events', async () => {
    const sentMessages: string[] = [];
    const staffMessages: string[] = [];
    const createdEvents: string[] = [];
    const router = createRouter({ sentMessages, staffMessages, createdEvents });

    for (const text of ['/schedule', 'Surco', '2026-07-01', '10:00', ...reviewAnswers]) {
      await send(router, text);
    }

    expect(createdEvents).toEqual([]);
    expect(staffMessages.some((m) => m.includes('pending staff review'))).toBe(true);
    expect(sentMessages.at(-1)).toContain('radiografía');
  });

  it('sends staff-mediated replies with the team prefix', async () => {
    const patientMessages: string[] = [];
    const router = createRouter({ patientMessages });

    await send(router, '/reply 99 Please bring your radiography.', '900');

    expect(patientMessages).toEqual(['El equipo respondió: Please bring your radiography.']);
  });
});

function createRouter(options: {
  sentMessages?: string[];
  staffMessages?: string[];
  createdEvents?: string[];
  patientMessages?: string[];
} = {}) {
  const conversations = new InMemoryConversationStateStore();

  const calendar: CalendarPort = {
    async freeBusy() { return []; },
    async createEvent(input) {
      options.createdEvents?.push(input.summary);
      return { id: `event-${(options.createdEvents?.length ?? 1).toString()}` };
    }
  };

  let nextCaseId = 1;
  const cases = {
    async create() { return { id: nextCaseId++ }; },
    async markPendingReview() {}
  };

  const notifications = new NotificationService({
    async sendMessage(text) { options.staffMessages?.push(text); }
  });

  const availability = new AvailabilityService(calendar, cases, { async create() {} });
  const schedulingFlow = new SchedulingFlow(conversations, undefined, availability, notifications, cases);

  const staffReplies = new StaffReplyService(
    { async findByCaseId(caseId) { return caseId === 99 ? { patientTelegramUserId: '200' } : null; } },
    { async sendMessage(_chatId: string, text: string) { options.patientMessages?.push(text); } }
  );

  const messaging: MessagingPort = {
    async sendMessage(_recipient: string, text: string) {
      options.sentMessages?.push(text);
    }
  };

  return new MessageRouter(
    new StaticStaffAllowlistStore(['900']),
    conversations,
    schedulingFlow,
    messaging,
    notifications,
    staffReplies
  )
    .registerHandler(new AuthorizationGuard())
    .registerHandler(new ReplyCommandHandler())
    .registerHandler(new FileUploadHandler())
    .registerHandler(new StaffCommandHandler())
    .registerHandler(new StartCommandHandler())
    .registerHandler(new ScheduleCommandHandler())
    .registerHandler(new TextMessageHandler());
}

async function send(router: MessageRouter, text: string, from = '200') {
  const update: TelegramUpdate = {
    update_id: Math.floor(Math.random() * 1_000_000),
    message: {
      message_id: Math.floor(Math.random() * 1_000_000),
      text,
      chat: { id: from, type: 'private' },
      from: { id: Number(from) }
    }
  };

  await processTelegramWebhook(update, router);
}
