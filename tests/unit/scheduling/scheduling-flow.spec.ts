import { describe, expect, it } from 'vitest';
import {
  SchedulingFlow,
  availableSlotsForLocation,
  validateRequiredIntake
} from '../../../src/application/scheduling/scheduling-flow.js';
import { AvailabilityService } from '../../../src/application/calendar/availability.service.js';
import { InMemoryConversationStateStore } from '../../../src/domain/conversation/conversation-state.js';
import type { CalendarPort } from '../../../src/ports/calendar.port.js';

describe('SchedulingFlow', () => {
  it('blocks booking when required intake fields are missing', () => {
    const missing = validateRequiredIntake({ fullName: 'Ada Patient', age: 40 });

    expect(missing).toContain('dni');
    expect(missing).toContain('district');
  });

  it('keeps state and asks for clarification on invalid input', async () => {
    const store = new InMemoryConversationStateStore();
    const flow = new SchedulingFlow(store);

    // /schedule starts intake — age field rejects non-numbers
    await flow.handleMessage('100', '/schedule');
    await flow.handleMessage('100', 'Ada Patient'); // fullName
    await flow.handleMessage('100', '12345678');    // dni
    const response = await flow.handleMessage('100', 'not-a-number'); // age — invalid
    const state = await store.get('100');

    expect(response.advanced).toBe(false);
    expect(response.text).toContain('válido');
    expect(state?.step).toBe('scheduling.intake');
  });

  it('resumes from saved date step on the next Telegram update', async () => {
    const store = new InMemoryConversationStateStore();
    const flow = new SchedulingFlow(store);

    await store.save({
      telegramUserId: '200',
      flow: 'scheduling',
      step: 'scheduling.date',
      data: { locationId: 'surco' }
    });

    const response = await flow.handleMessage('200', '2026-07-01');

    expect(response.advanced).toBe(true);
    expect(response.state.step).toBe('scheduling.slot');
    expect(response.text).toContain('10:00');
  });

  it('offers initial location slots within configured hours', () => {
    expect(availableSlotsForLocation('surco')).toEqual(['10:00', '10:30', '11:00', '11:30', '12:00', '12:30']);
    expect(availableSlotsForLocation('vmt')).toEqual(['18:00', '18:30', '19:00', '19:30']);
  });

  it('validates selected slots against DB-backed availability for the selected date and location', async () => {
    const store = new InMemoryConversationStateStore();
    const calendar: CalendarPort = {
      async freeBusy() {
        return [];
      },
      async createEvent() {
        return { id: 'event-1' };
      }
    };
    const availability = new AvailabilityService(calendar, undefined, undefined, {
      async findByLocation(locationId) {
        return {
          locationId,
          label: locationId === 'surco' ? 'Surco' : 'VMT',
          start: '09:00',
          end: '10:00',
          timeZone: 'America/Lima',
          durationMinutes: 30
        };
      },
      async upsert() {}
    });
    const flow = new SchedulingFlow(store, undefined, availability);

    await store.save({
      telegramUserId: '250',
      flow: 'scheduling',
      step: 'scheduling.slot',
      data: { locationId: 'surco', date: '2026-07-01' }
    });

    const response = await flow.handleMessage('250', '09:00');

    expect(response.advanced).toBe(true);
    expect(response.state.step).toBe('scheduling.ready_to_confirm');
    expect(response.state.data).toMatchObject({ slot: '09:00' });
  });

  it('holds radiography cases for staff review after intake completion', async () => {
    const store = new InMemoryConversationStateStore();
    const flow = new SchedulingFlow(store);

    // New order: intake first, then location/date/slot
    await flow.handleMessage('300', '/schedule');
    await flow.handleMessage('300', 'Ada Patient');   // fullName
    await flow.handleMessage('300', '12345678');      // dni
    await flow.handleMessage('300', '56');            // age ≥ 56 → pending_review
    await flow.handleMessage('300', 'Surco');         // district
    await flow.handleMessage('300', 'back');          // painArea
    await flow.handleMessage('300', '2 weeks');       // painDuration
    await flow.handleMessage('300', 'limited bending'); // limitation
    await flow.handleMessage('300', 'normal');        // gait
    await flow.handleMessage('300', 'none');          // assistiveDevice
    const response = await flow.handleMessage('300', 'appointment'); // motive → triggers eligibility

    expect(response.state.step).toBe('scheduling.pending_review');
    expect(response.text).toContain('radiografía');
  });
});
