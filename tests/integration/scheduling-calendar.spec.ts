import { describe, expect, it } from 'vitest';
import { AvailabilityService } from '../../src/application/calendar/availability.service.js';
import type { CalendarPort } from '../../src/ports/calendar.port.js';
import { GoogleCalendarAdapter } from '../../src/adapters/google-calendar/google-calendar.adapter.js';

const passIntake = {
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

describe('scheduling calendar integration', () => {
  it('excludes busy Google Calendar slots and keeps VMT inside its window', async () => {
    const calendar: CalendarPort = {
      async freeBusy() {
        return [{ start: new Date('2026-07-01T18:30:00-05:00'), end: new Date('2026-07-01T19:00:00-05:00') }];
      },
      async createEvent() {
        return { id: 'event-1' };
      }
    };

    const service = new AvailabilityService(calendar);

    await expect(service.availableSlots({ locationId: 'vmt', date: '2026-07-01' })).resolves.toEqual(['18:00', '19:00', '19:30']);
  });

  it('rechecks the selected slot before creating a confirmed event', async () => {
    const createdEvents: string[] = [];
    const calendar: CalendarPort = {
      async freeBusy() {
        return [{ start: new Date('2026-07-01T10:00:00-05:00'), end: new Date('2026-07-01T10:30:00-05:00') }];
      },
      async createEvent(input) {
        createdEvents.push(input.summary);
        return { id: 'event-1' };
      }
    };

    const service = new AvailabilityService(calendar);
    const result = await service.confirmBooking({ telegramUserId: '200', locationId: 'surco', date: '2026-07-01', slot: '10:00', intake: passIntake });

    expect(result).toEqual({ booked: false, reason: 'slot_unavailable' });
    expect(createdEvents).toEqual([]);
  });

  it('calls Google freeBusy and events.insert with OAuth owner account access', async () => {
    const calls: Array<{ url: string; body: unknown; authorization?: string }> = [];
    const fetchMock = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const target = url.toString();
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      calls.push({ url: target, body, authorization: new Headers(init?.headers).get('authorization') ?? undefined });

      if (target.includes('oauth2.googleapis.com/token')) {
        return Response.json({ access_token: 'owner-access-token', token_type: 'Bearer', expires_in: 3600 });
      }

      if (target.includes('/freeBusy')) {
        return Response.json({ calendars: { primary: { busy: [] } } });
      }

      return Response.json({ id: 'google-event-1', htmlLink: 'https://calendar/event' });
    };

    const adapter = new GoogleCalendarAdapter({
      calendarId: 'primary',
      clientId: 'client',
      clientSecret: 'secret',
      refreshToken: 'refresh',
      fetch: fetchMock as typeof fetch
    });

    await adapter.freeBusy({ timeMin: new Date('2026-07-01T15:00:00.000Z'), timeMax: new Date('2026-07-01T18:00:00.000Z'), timeZone: 'America/Lima' });
    const event = await adapter.createEvent({
      summary: 'Appointment - Ada Patient',
      startsAt: new Date('2026-07-01T15:00:00.000Z'),
      endsAt: new Date('2026-07-01T15:30:00.000Z'),
      timeZone: 'America/Lima'
    });

    expect(event.id).toBe('google-event-1');
    expect(calls.some((call) => call.url.endsWith('/calendar/v3/freeBusy'))).toBe(true);
    expect(calls.some((call) => call.url.endsWith('/calendars/primary/events'))).toBe(true);
    expect(calls.filter((call) => call.url.includes('googleapis.com/calendar')).every((call) => call.authorization === 'Bearer owner-access-token')).toBe(true);
  });
});
