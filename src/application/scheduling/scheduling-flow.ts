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
import type { AvailabilityService, BookingResult } from '../calendar/availability.service.js';
import type { NotificationService } from '../notifications/notification.service.js';

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

export type SchedulingCaseStore = {
  create(input: { telegramUserId: string; status: 'pending_review'; intake: PatientIntake }): Promise<{ id: number }>;
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
    private readonly eligibilityEngine = new EligibilityEngine(),
    private readonly availability?: AvailabilityService,
    private readonly notifications?: NotificationService,
    private readonly cases?: SchedulingCaseStore
  ) {}

  async handleMessage(telegramUserId: string, text: string): Promise<SchedulingReply> {
    const existing = (await this.conversations.get(telegramUserId)) ?? createInitialConversationState(telegramUserId);
    const normalized = text.trim();

    if (normalized === '/schedule' || existing.step === 'idle') {
      return this.persist(existing, 'scheduling.location', {}, 'Elige una sede: Surco o VMT.', true);
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
      case 'scheduling.ready_to_confirm':
        return this.handleConfirmation(existing, normalized);
      default:
        return this.persist(existing, existing.step, existing.data, 'Necesito una respuesta válida para continuar.', false);
    }
  }

  private async handleLocation(state: ConversationState, text: string): Promise<SchedulingReply> {
    const locationId = this.parseLocation(text);
    if (!locationId) {
      return this.persist(state, state.step, state.data, 'Por favor elige entre Surco o VMT.', false);
    }

    return this.persist(
      state,
      'scheduling.date',
      { ...this.draft(state), locationId },
      'Envía la fecha de la cita en formato YYYY-MM-DD.',
      true
    );
  }

  private async handleDate(state: ConversationState, text: string): Promise<SchedulingReply> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return this.persist(state, state.step, state.data, 'Por favor envía una fecha válida en formato YYYY-MM-DD.', false);
    }

    const draft = this.draft(state);
    const locationId = draft.locationId ?? 'surco';
    const slots = this.availability ? await this.availability.availableSlots({ locationId, date: text }) : availableSlotsForLocation(locationId);

    return this.persist(
      state,
      'scheduling.slot',
      { ...draft, date: text },
      `Elige uno de los horarios disponibles de 30 minutos: ${slots.join(', ')}.`,
      true
    );
  }

  private async handleSlot(state: ConversationState, text: string): Promise<SchedulingReply> {
    const draft = this.draft(state);
    const locationId = draft.locationId ?? 'surco';
    const slots = availableSlotsForLocation(locationId);

    if (!slots.includes(text)) {
      return this.persist(state, state.step, state.data, `Por favor elige uno de estos horarios: ${slots.join(', ')}.`, false);
    }

    return this.persist(
      state,
      'scheduling.intake',
      { ...draft, slot: text, intake: {}, intakeField: 'fullName' },
      'Por favor envía el nombre completo del paciente.',
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

    let caseId: number | undefined;
    if (decision.outcome === 'pending_review') {
      const patient = toPatientIntake(intake);
      const patientCase = await this.cases?.create({ telegramUserId: state.telegramUserId, status: 'pending_review', intake: patient });
      if (patientCase) {
        caseId = patientCase.id;
        await this.notifications?.pendingReview({
          caseId: patientCase.id,
          patient,
          reasonCode: decision.reasonCode,
          requiresRadiography: decision.requiresRadiography
        });
      }
    }

    return this.persist(state, nextStep, { ...draft, intake, eligibility: decision, caseId }, message, true);
  }

  private async handleConfirmation(state: ConversationState, text: string): Promise<SchedulingReply> {
    if (!['confirm', 'yes', 'book', 'confirmar', 'sí', 'si', 'reservar'].includes(text.toLowerCase())) {
      return this.persist(state, state.step, state.data, 'Responde confirmar para reservar esta cita, o elige otro horario.', false);
    }

    const draft = this.draft(state);
    if (!draft.locationId || !draft.date || !draft.slot || !draft.intake) {
      return this.persist(state, 'scheduling.location', {}, 'El borrador de reserva está incompleto. Elige una sede: Surco o VMT.', false);
    }

    const patient = toPatientIntake(draft.intake);
    let booking: BookingResult;

    if (this.availability) {
      booking = await this.availability.confirmBooking({
        telegramUserId: state.telegramUserId,
        locationId: draft.locationId,
        date: draft.date,
        slot: draft.slot,
        intake: patient
      });
    } else {
      const startsAt = new Date(`${draft.date}T${draft.slot}:00-05:00`);
      booking = { booked: true, caseId: 0, googleEventId: 'not-configured', startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000) };
    }

    if (!booking.booked) {
      return this.persist(state, 'scheduling.slot', { ...draft, slot: undefined }, 'Ese horario ya no está disponible. Por favor elige otro.', false);
    }

    await this.notifications?.appointmentConfirmed({
      caseId: booking.caseId,
      patient,
      locationId: draft.locationId,
      startsAt: booking.startsAt,
      googleEventId: booking.googleEventId
    });

    return this.persist(state, 'idle', {}, 'Tu cita está confirmada. El equipo ha sido notificado.', true);
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
      fullName: 'Por favor envía el nombre completo del paciente.',
      dni: 'Por favor envía el DNI del paciente.',
      age: 'Por favor envía la edad del paciente (solo número).',
      district: 'Por favor envía el distrito del paciente.',
      painArea: 'Por favor envía la zona de dolor.',
      painDuration: 'Por favor envía el tiempo de evolución del dolor.',
      limitation: 'Por favor describe la limitación funcional.',
      gait: 'Por favor envía la marcha: normal o desequilibrio.',
      assistiveDevice: 'Por favor envía el dispositivo de apoyo, o ninguno.',
      motive: 'Por favor envía el motivo de la consulta.'
    };
    return prompts[field];
  }

  private clarificationFor(field: RequiredIntakeField): string {
    return `Ese valor no es válido. ${this.promptFor(field)}`;
  }

  private messageForDecision(decision: EligibilityDecision): string {
    if (decision.outcome === 'reject') {
      return 'Gracias. Según las reglas del consultorio, no es posible agendar esta cita a través del bot. Por favor comunícate directamente con el consultorio.';
    }

    if (decision.outcome === 'pending_review') {
      return decision.requiresRadiography
        ? 'Gracias. Por favor sube la radiografía por Telegram para que el equipo pueda revisar el caso antes de agendar.'
        : 'Gracias. El caso requiere revisión del equipo antes de agendar.';
    }

    return 'Gracias. Los datos están completos y son elegibles. Responde confirmar para reservar esta cita.';
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
