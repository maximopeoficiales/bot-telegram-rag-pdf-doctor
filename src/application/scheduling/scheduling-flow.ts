import {
  type ConversationState,
  type ConversationStateStore,
  createInitialConversationState
} from '../../domain/conversation/conversation-state.js';
import {
  EligibilityEngine,
  type EligibilityDecision,
  type PatientIntake
} from '../../domain/eligibility/eligibility-engine.js';

export const requiredIntakeFields = [
  'fullName',
  'dni',
  'age',
  'district',
  'painArea',
  'painDuration',
  'limitation',
  'gait',
  'assistiveDevice',
  'motive'
] as const;

export type RequiredIntakeField = (typeof requiredIntakeFields)[number];

export type LocationId = 'surco' | 'vmt';

export type SchedulingDraft = {
  locationId?: LocationId;
  date?: string;
  slot?: string;
  intake?: Partial<PatientIntake>;
  intakeField?: RequiredIntakeField;
  eligibility?: EligibilityDecision;
};

export type SchedulingReply = {
  text: string;
  state: ConversationState;
  advanced: boolean;
};

const locationWindows: Record<LocationId, { label: string; start: string; end: string }> = {
  surco: { label: 'Surco', start: '10:00', end: '13:00' },
  vmt: { label: 'VMT', start: '18:00', end: '20:00' }
};

export function validateRequiredIntake(intake: Partial<PatientIntake>): RequiredIntakeField[] {
  return requiredIntakeFields.filter((field) => {
    const value = intake[field];
    return value === undefined || value === null || value === '' || (field === 'age' && !Number.isFinite(value));
  });
}

export function toPatientIntake(intake: Partial<PatientIntake>): PatientIntake {
  const missing = validateRequiredIntake(intake);
  if (missing.length > 0) {
    throw new Error(`Missing required intake fields: ${missing.join(', ')}`);
  }

  return intake as PatientIntake;
}

export function availableSlotsForLocation(locationId: LocationId): string[] {
  const window = locationWindows[locationId];
  const [startHour, startMinute] = window.start.split(':').map(Number);
  const [endHour, endMinute] = window.end.split(':').map(Number);
  const slots: string[] = [];

  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;

  for (let minute = start; minute + 30 <= end; minute += 30) {
    const hourText = String(Math.floor(minute / 60)).padStart(2, '0');
    const minuteText = String(minute % 60).padStart(2, '0');
    slots.push(`${hourText}:${minuteText}`);
  }

  return slots;
}

export class SchedulingFlow {
  constructor(
    private readonly conversations: ConversationStateStore,
    private readonly eligibilityEngine = new EligibilityEngine()
  ) {}

  async handleMessage(telegramUserId: string, text: string): Promise<SchedulingReply> {
    const existing = (await this.conversations.get(telegramUserId)) ?? createInitialConversationState(telegramUserId);
    const normalized = text.trim();

    if (normalized === '/schedule' || existing.step === 'idle') {
      return this.persist(existing, 'scheduling.location', {}, 'Choose a location: Surco or VMT.', true);
    }

    switch (existing.step) {
      case 'scheduling.location':
        return this.handleLocation(existing, normalized);
      case 'scheduling.date':
        return this.handleDate(existing, normalized);
      case 'scheduling.slot':
        return this.handleSlot(existing, normalized);
      case 'scheduling.intake':
        return this.handleIntake(existing, normalized);
      default:
        return this.persist(existing, existing.step, existing.data, 'I need a valid scheduling input to continue.', false);
    }
  }

  private async handleLocation(state: ConversationState, text: string): Promise<SchedulingReply> {
    const locationId = this.parseLocation(text);
    if (!locationId) {
      return this.persist(state, state.step, state.data, 'Please choose either Surco or VMT.', false);
    }

    return this.persist(
      state,
      'scheduling.date',
      { ...this.draft(state), locationId },
      'Send the appointment date in YYYY-MM-DD format.',
      true
    );
  }

  private async handleDate(state: ConversationState, text: string): Promise<SchedulingReply> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return this.persist(state, state.step, state.data, 'Please send a valid date in YYYY-MM-DD format.', false);
    }

    const draft = this.draft(state);
    const slots = availableSlotsForLocation(draft.locationId ?? 'surco');

    return this.persist(
      state,
      'scheduling.slot',
      { ...draft, date: text },
      `Choose one available 30-minute slot: ${slots.join(', ')}.`,
      true
    );
  }

  private async handleSlot(state: ConversationState, text: string): Promise<SchedulingReply> {
    const draft = this.draft(state);
    const locationId = draft.locationId ?? 'surco';
    const slots = availableSlotsForLocation(locationId);

    if (!slots.includes(text)) {
      return this.persist(state, state.step, state.data, `Please choose one of these slots: ${slots.join(', ')}.`, false);
    }

    return this.persist(
      state,
      'scheduling.intake',
      { ...draft, slot: text, intake: {}, intakeField: 'fullName' },
      'Please send the patient full name.',
      true
    );
  }

  private async handleIntake(state: ConversationState, text: string): Promise<SchedulingReply> {
    const draft = this.draft(state);
    const field = draft.intakeField ?? 'fullName';
    const intake = { ...(draft.intake ?? {}) };
    const parsedValue = this.parseIntakeValue(field, text);

    if (parsedValue === undefined) {
      return this.persist(state, state.step, state.data, this.clarificationFor(field), false);
    }

    Object.assign(intake, parsedValue);

    const missing = validateRequiredIntake(intake);
    if (missing.length > 0) {
      const nextField = missing[0];
      return this.persist(
        state,
        'scheduling.intake',
        { ...draft, intake, intakeField: nextField },
        this.promptFor(nextField),
        true
      );
    }

    const decision = this.eligibilityEngine.evaluate(toPatientIntake(intake));
    const nextStep = decision.outcome === 'reject' ? 'scheduling.rejected' : decision.outcome === 'pending_review' ? 'scheduling.pending_review' : 'scheduling.ready_to_confirm';
    const message = this.messageForDecision(decision);

    return this.persist(state, nextStep, { ...draft, intake, eligibility: decision }, message, true);
  }

  private draft(state: ConversationState): SchedulingDraft {
    return state.data as SchedulingDraft;
  }

  private parseLocation(text: string): LocationId | null {
    const normalized = text.toLowerCase();
    if (normalized === 'surco') return 'surco';
    if (normalized === 'vmt' || normalized === 'villa maria' || normalized === 'villa maria del triunfo') return 'vmt';
    return null;
  }

  private parseIntakeValue(field: RequiredIntakeField, text: string): Partial<PatientIntake> | undefined {
    if (text.length === 0) return undefined;

    if (field === 'age') {
      const age = Number(text);
      return Number.isInteger(age) && age > 0 ? { age } : undefined;
    }

    if (field === 'gait') {
      const gait = text.toLowerCase();
      if (gait !== 'normal' && gait !== 'imbalance') return undefined;
      return { gait };
    }

    const mapping: Record<Exclude<RequiredIntakeField, 'age' | 'gait'>, string> = {
      fullName: 'fullName',
      dni: 'dni',
      district: 'district',
      painArea: 'painArea',
      painDuration: 'painDuration',
      limitation: 'limitation',
      assistiveDevice: 'assistiveDevice',
      motive: 'motive'
    };

    return { [mapping[field]]: text } as Partial<PatientIntake>;
  }

  private promptFor(field: RequiredIntakeField): string {
    const prompts: Record<RequiredIntakeField, string> = {
      fullName: 'Please send the patient full name.',
      dni: 'Please send the patient DNI.',
      age: 'Please send the patient age as a number.',
      district: 'Please send the patient district.',
      painArea: 'Please send the pain area.',
      painDuration: 'Please send the pain duration.',
      limitation: 'Please describe the limitation.',
      gait: 'Please send gait as normal or imbalance.',
      assistiveDevice: 'Please send the assistive device, or none.',
      motive: 'Please send the appointment motive/reason.'
    };
    return prompts[field];
  }

  private clarificationFor(field: RequiredIntakeField): string {
    return `That value is not valid. ${this.promptFor(field)}`;
  }

  private messageForDecision(decision: EligibilityDecision): string {
    if (decision.outcome === 'reject') {
      return 'Thank you. Based on the scheduling rules, the team cannot schedule this appointment through the bot. Please contact the practice for guidance.';
    }

    if (decision.outcome === 'pending_review') {
      return decision.requiresRadiography
        ? 'Thank you. Please upload the radiography through Telegram so the staff can review the case before scheduling.'
        : 'Thank you. The case needs staff review before scheduling.';
    }

    return 'Thank you. The intake is complete and eligible. Calendar confirmation will be handled before booking.';
  }

  private async persist(
    previous: ConversationState,
    step: ConversationState['step'],
    data: Record<string, unknown>,
    text: string,
    advanced: boolean
  ): Promise<SchedulingReply> {
    const state = await this.conversations.save({
      telegramUserId: previous.telegramUserId,
      flow: 'scheduling',
      step,
      data
    });

    return { text, state, advanced };
  }
}
