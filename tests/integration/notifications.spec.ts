import { describe, expect, it } from 'vitest';
import { NotificationService } from '../../src/application/notifications/notification.service.js';
import { StaffGroupTelegramClient } from '../../src/adapters/telegram/staff-group.client.js';

const patient = {
  fullName: 'Ada Patient',
  dni: '12345678',
  age: 40,
  district: 'Surco',
  painArea: 'back',
  painDuration: '2 weeks',
  limitation: 'limited bending',
  gait: 'normal' as const,
  assistiveDevice: 'none',
  motive: 'appointment'
};

describe('notifications integration', () => {
  it('notifies staff for confirmed appointments, file uploads, and pending review cases', async () => {
    const messages: string[] = [];
    const records: Array<{ type: string; caseId?: number }> = [];
    const service = new NotificationService(
      { async sendMessage(text) { messages.push(text); } },
      { async create(input) { records.push({ type: input.type, caseId: input.caseId }); } }
    );

    await service.appointmentConfirmed({ caseId: 1, patient, locationId: 'surco', startsAt: new Date('2026-07-01T15:00:00.000Z'), googleEventId: 'event-1' });
    await service.pendingReview({ caseId: 2, patient, reasonCode: 'RADIOGRAPHY_REVIEW_REQUIRED', requiresRadiography: true });
    await service.patientFileUploaded({ caseId: 2, telegramUserId: '200', fileId: 'file-1', fileType: 'pdf' });

    expect(records.map((record) => record.type)).toEqual(['appointment_confirmed', 'pending_review', 'patient_file_uploaded']);
    expect(messages[0]).toContain('New appointment confirmed');
    expect(messages[1]).toContain('pending staff review');
    expect(messages[2]).toContain('Patient file uploaded');
  });

  it('sends Telegram Bot API messages to the configured staff group', async () => {
    const calls: unknown[] = [];
    const client = new StaffGroupTelegramClient({
      botToken: 'token',
      staffGroupChatId: '-100',
      fetch: (async (_url, init) => {
        calls.push(JSON.parse(init?.body as string));
        return Response.json({ ok: true });
      }) as typeof fetch
    });

    await client.sendMessage('hello staff');

    expect(calls).toEqual([{ chat_id: '-100', text: 'hello staff' }]);
  });
});
