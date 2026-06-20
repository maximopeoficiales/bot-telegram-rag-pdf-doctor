import { describe, expect, it } from 'vitest';
import {
  SchedulingFlow,
  availableSlotsForLocation,
  validateRequiredIntake
} from '../../../src/application/scheduling/scheduling-flow.js';
import { InMemoryConversationStateStore } from '../../../src/domain/conversation/conversation-state.js';

describe('SchedulingFlow', () => {
  it('blocks booking when required intake fields are missing', () => {
    const missing = validateRequiredIntake({ fullName: 'Ada Patient', age: 40 });

    expect(missing).toContain('dni');
    expect(missing).toContain('district');
  });

  it('keeps state and asks for clarification on invalid input', async () => {
    const store = new InMemoryConversationStateStore();
    const flow = new SchedulingFlow(store);

    await flow.handleMessage('100', '/schedule');
    const response = await flow.handleMessage('100', 'Miraflores');
    const state = await store.get('100');

    expect(response.advanced).toBe(false);
    expect(response.text).toContain('Surco o VMT');
    expect(state?.step).toBe('scheduling.location');
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

  it('holds radiography cases for staff review after intake completion', async () => {
    const store = new InMemoryConversationStateStore();
    const flow = new SchedulingFlow(store);

    await flow.handleMessage('300', '/schedule');
    await flow.handleMessage('300', 'Surco');
    await flow.handleMessage('300', '2026-07-01');
    await flow.handleMessage('300', '10:00');
    await flow.handleMessage('300', 'Ada Patient');
    await flow.handleMessage('300', '12345678');
    await flow.handleMessage('300', '56');
    await flow.handleMessage('300', 'Surco');
    await flow.handleMessage('300', 'back');
    await flow.handleMessage('300', '2 weeks');
    await flow.handleMessage('300', 'limited bending');
    await flow.handleMessage('300', 'normal');
    await flow.handleMessage('300', 'none');
    const response = await flow.handleMessage('300', 'appointment');

    expect(response.state.step).toBe('scheduling.pending_review');
    expect(response.text).toContain('radiografía');
  });
});
