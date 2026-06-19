import { describe, expect, it } from 'vitest';
import { AvailabilityService } from '../../src/application/calendar/availability.service.js';
import { NotificationService } from '../../src/application/notifications/notification.service.js';
import { StaffReplyService } from '../../src/application/notifications/staff-reply.service.js';
import { SchedulingFlow } from '../../src/application/scheduling/scheduling-flow.js';
import { InMemoryConversationStateStore } from '../../src/domain/conversation/conversation-state.js';
import { StaticStaffAllowlistStore, TelegramUpdateRouter, type TelegramUpdate } from '../../src/delivery/telegram/router.js';
import { processTelegramWebhook } from '../../src/delivery/telegram/webhook.js';
import type { CalendarPort } from '../../src/ports/calendar.port.js';

const intakeAnswers = ['Ada Patient', '12345678', '40', 'Surco', 'back', '2 weeks', 'limited bending', 'normal', 'none', 'appointment'];
const reviewAnswers = ['Review Patient', '87654321', '56', 'Surco', 'back', '2 weeks', 'limited bending', 'normal', 'none', 'appointment'];

describe('telegram bot MVP e2e', () => {
  it('books an eligible patient, creates a calendar event, and notifies staff', async () => {
    const sentMessages: string[] = [];
    const staffMessages: string[] = [];
    const createdEvents: string[] = [];
    const router = createRouter({ staffMessages, createdEvents });

    for (const text of ['/schedule', 'Surco', '2026-07-01', '10:00', ...intakeAnswers, 'confirm']) {
      await send(router, text, sentMessages);
    }

    expect(createdEvents).toEqual(['Appointment - Ada Patient']);
    expect(staffMessages.some((message) => message.includes('New appointment confirmed'))).toBe(true);
    expect(sentMessages.at(-1)).toContain('appointment is confirmed');
  });

  it('holds radiography review cases without creating calendar events', async () => {
    const sentMessages: string[] = [];
    const staffMessages: string[] = [];
    const createdEvents: string[] = [];
    const router = createRouter({ staffMessages, createdEvents });

    for (const text of ['/schedule', 'Surco', '2026-07-01', '10:00', ...reviewAnswers]) {
      await send(router, text, sentMessages);
    }

    expect(createdEvents).toEqual([]);
    expect(staffMessages.some((message) => message.includes('pending staff review'))).toBe(true);
    expect(sentMessages.at(-1)).toContain('upload the radiography');
  });

  it('sends staff-mediated replies with the team prefix', async () => {
    const patientMessages: string[] = [];
    const router = createRouter({ patientMessagesByChatId: patientMessages });

    await send(router, '/reply 99 Please bring your radiography.', [], '900');

    expect(patientMessages).toEqual(['The team replied: Please bring your radiography.']);
  });
});

function createRouter(options: { staffMessages?: string[]; createdEvents?: string[]; patientMessagesByChatId?: string[] } = {}) {
  const conversations = new InMemoryConversationStateStore();
  const calendar: CalendarPort = {
    async freeBusy() {
      return [];
    },
    async createEvent(input) {
      options.createdEvents?.push(input.summary);
      return { id: `event-${(options.createdEvents?.length ?? 1).toString()}` };
    }
  };
  let nextCaseId = 1;
  const cases = {
    async create() {
      return { id: nextCaseId++ };
    },
    async markPendingReview() {}
  };
  const availability = new AvailabilityService(calendar, cases, { async create() {} });
  const notifications = new NotificationService({ async sendMessage(text) { options.staffMessages?.push(text); } });
  const schedulingFlow = new SchedulingFlow(conversations, undefined, availability, notifications, cases);
  const staffReplies = new StaffReplyService(
    { async findByCaseId(caseId) { return caseId === 99 ? { patientTelegramUserId: '200' } : null; } },
    { async sendMessage(_chatId, text) { options.patientMessagesByChatId?.push(text); } }
  );

  return new TelegramUpdateRouter(conversations, new StaticStaffAllowlistStore(['900']), { schedulingFlow, notifications, staffReplies });
}

async function send(router: TelegramUpdateRouter, text: string, sentMessages: string[], from = '200') {
  const update: TelegramUpdate = {
    update_id: Math.floor(Math.random() * 1_000_000),
    message: {
      message_id: Math.floor(Math.random() * 1_000_000),
      text,
      chat: { id: from, type: 'private' },
      from: { id: Number(from) }
    }
  };

  await processTelegramWebhook(update, router, {
    async sendMessage(_chatId, text) {
      sentMessages.push(text);
    }
  });
}
