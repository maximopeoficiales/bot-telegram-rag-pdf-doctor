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
import type { AiInterpretationPort } from '../../ports/ai.port.js';

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

export type SchedulingAiInterpreter = Pick<
  AiInterpretationPort,
  | 'interpretConfirmation'
  | 'interpretDate'
  | 'interpretSlot'
  | 'interpretLocation'
  | 'interpretAge'
  | 'interpretDni'
  | 'interpretDistrict'
  | 'interpretGait'
  | 'interpretAssistiveDevice'
>;

// Fallback windows used only when DB has no schedule and AvailabilityService is absent
const fallbackWindows: Record<LocationId, { label: string; start: string; end: string }> = {
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
  const window = fallbackWindows[locationId];
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

/** Convert 24h slot list to 12h AM/PM for user-facing display. */
export function formatSlots12h(slots: string[]): string[] {
  return slots.map((slot) => {
    const [h, m] = slot.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${hour12}:00 ${period}` : `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  });
}

export class SchedulingFlow {
  constructor(
    private readonly conversations: ConversationStateStore,
    private readonly eligibilityEngine = new EligibilityEngine(),
    private readonly availability?: AvailabilityService,
    private readonly notifications?: NotificationService,
    private readonly cases?: SchedulingCaseStore,
    private readonly aiInterpreter?: SchedulingAiInterpreter
  ) {}

  async handleMessage(telegramUserId: string, text: string): Promise<SchedulingReply> {
    const existing = (await this.conversations.get(telegramUserId)) ?? createInitialConversationState(telegramUserId);
    const normalized = text.trim();

    if (normalized === '/schedule' || existing.step === 'idle') {
      return this.persist(
        existing,
        'scheduling.intake',
        { intake: {}, intakeField: 'fullName' },
        'Con gusto le ayudo a agendar su cita. Para comenzar, ¿me podría indicar el nombre completo del paciente?',
        true
      );
    }

    switch (existing.step) {
      case 'scheduling.intake':
        return this.handleIntake(existing, normalized);
      case 'scheduling.location':
        return this.handleLocation(existing, normalized);
      case 'scheduling.date':
        return this.handleDate(existing, normalized);
      case 'scheduling.slot':
        return this.handleSlot(existing, normalized);
      case 'scheduling.ready_to_confirm':
        return this.handleConfirmation(existing, normalized);
      default:
        return this.persist(existing, existing.step, existing.data, 'Necesito una respuesta válida para continuar.', false);
    }
  }

  private async handleLocation(state: ConversationState, text: string): Promise<SchedulingReply> {
    let locationId = this.parseLocation(text);

    if (!locationId && this.aiInterpreter) {
      locationId = await this.aiInterpreter.interpretLocation(text);
    }

    if (!locationId) {
      return this.persist(state, state.step, state.data, 'Por favor indíquenos si prefiere atenderse en Surco o en VMT (Villa María del Triunfo).', false);
    }

    return this.persist(
      state,
      'scheduling.date',
      { ...this.draft(state), locationId },
      '¿Qué día le vendría bien para la cita? Puede escribir, por ejemplo: "mañana", "el lunes", "25 de junio" o "25/06/2026".',
      true
    );
  }

  private async handleDate(state: ConversationState, text: string): Promise<SchedulingReply> {
    let dateText = text;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) && this.aiInterpreter) {
      const interpreted = await this.aiInterpreter.interpretDate(text);
      if (interpreted) dateText = interpreted;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
      return this.persist(state, state.step, state.data, 'Disculpe, no pude entender esa fecha. Puede escribir "mañana", "el lunes" o indicar el día así: 25/06/2026.', false);
    }

    const draft = this.draft(state);
    const locationId = draft.locationId ?? 'surco';
    const slots = await this.availableSlots(locationId, dateText);
    const slots12h = formatSlots12h(slots);

    return this.persist(
      state,
      'scheduling.slot',
      { ...draft, date: dateText },
      `¿A qué hora le podemos atender? Horarios disponibles:\n${slots12h.join(', ')}\n\nPuede indicarlo como "7pm", "7 de la noche", "6 y media", etc.`,
      true
    );
  }

  private async handleSlot(state: ConversationState, text: string): Promise<SchedulingReply> {
    const draft = this.draft(state);
    const locationId = draft.locationId ?? 'surco';
    const slots = await this.availableSlots(locationId, draft.date);

    let selectedSlot = slots.includes(text) ? text : null;

    if (!selectedSlot && this.aiInterpreter) {
      selectedSlot = await this.aiInterpreter.interpretSlot(text, slots);
    }

    const slots12h = formatSlots12h(slots);
    if (!selectedSlot) {
      return this.persist(state, state.step, state.data, `Disculpe, no reconocí ese horario. Los disponibles son: ${slots12h.join(', ')}.`, false);
    }

    return this.persist(
      state,
      'scheduling.ready_to_confirm',
      { ...draft, slot: selectedSlot },
      this.confirmationSummary({ ...draft, slot: selectedSlot }),
      true
    );
  }

  private async handleIntake(state: ConversationState, text: string): Promise<SchedulingReply> {
    const draft = this.draft(state);
    const field = draft.intakeField ?? 'fullName';
    const intake = { ...(draft.intake ?? {}) };
    const parsedValue = await this.parseIntakeValue(field, text);

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

    if (decision.outcome === 'reject') {
      return this.persist(state, 'scheduling.rejected', { ...draft, intake, eligibility: decision }, this.messageForDecision(decision), true);
    }

    if (decision.outcome === 'pending_review') {
      return this.persist(state, 'scheduling.pending_review', { ...draft, intake, eligibility: decision, caseId }, this.messageForDecision(decision), true);
    }

    // pass → now ask for location
    return this.persist(
      state,
      'scheduling.location',
      { ...draft, intake, eligibility: decision },
      '¡Excelente, con gusto le atendemos! ¿En qué sede prefiere atenderse: Surco o VMT (Villa María del Triunfo)?',
      true
    );
  }

  private async handleConfirmation(state: ConversationState, text: string): Promise<SchedulingReply> {
    const exactMatch = ['confirm', 'yes', 'book', 'confirmar', 'sí', 'si', 'reservar'].includes(text.toLowerCase());
    let isConfirmed = exactMatch;

    if (!isConfirmed && this.aiInterpreter) {
      isConfirmed = await this.aiInterpreter.interpretConfirmation(text);
    }

    if (!isConfirmed) {
      return this.persist(state, state.step, state.data, 'Para reservar la cita responda "confirmar", o indíquenos si desea elegir otro horario.', false);
    }

    const draft = this.draft(state);
    if (!draft.locationId || !draft.date || !draft.slot || !draft.intake) {
      return this.persist(
        state,
        'scheduling.intake',
        { intake: {}, intakeField: 'fullName' },
        'Parece que los datos de la reserva están incompletos. ¿Me podría indicar nuevamente el nombre completo del paciente?',
        false
      );
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
      return this.persist(state, 'scheduling.slot', { ...draft, slot: undefined }, 'Ese horario ya no está disponible. Por favor indíquenos otro horario de su preferencia.', false);
    }

    await this.notifications?.appointmentConfirmed({
      caseId: booking.caseId,
      patient,
      locationId: draft.locationId,
      startsAt: booking.startsAt,
      googleEventId: booking.googleEventId
    });

    return this.persist(state, 'idle', {}, 'Su cita ha sido confirmada. El equipo ha sido notificado y pronto le contactaremos.', true);
  }

  /**
   * Returns the current question the bot was asking the user in the active step.
   * Used by TextMessageHandler to remind the user where the flow was paused.
   */
  getCurrentPrompt(state: ConversationState): string {
    const draft = this.draft(state);

    switch (state.step) {
      case 'scheduling.intake': {
        const field = draft.intakeField ?? 'fullName';
        return this.promptFor(field);
      }
      case 'scheduling.location':
        return '¿En qué sede prefiere atenderse: Surco o VMT (Villa María del Triunfo)?';
      case 'scheduling.date':
        return '¿Qué día le vendría bien para la cita?';
      case 'scheduling.slot': {
        const locationId = draft.locationId ?? 'surco';
        const window = fallbackWindows[locationId];
        return `¿A qué hora le podemos atender? El horario disponible es de ${window.start} a ${window.end}.`;
      }
      case 'scheduling.ready_to_confirm':
        return 'Si todo está correcto, responda "confirmar" para reservar la cita.';
      default:
        return 'Estamos en proceso de agendar su cita.';
    }
  }

  private draft(state: ConversationState): SchedulingDraft {
    return state.data as SchedulingDraft;
  }

  private async availableSlots(locationId: LocationId, date?: string): Promise<string[]> {
    return this.availability && date
      ? this.availability.availableSlots({ locationId, date })
      : availableSlotsForLocation(locationId);
  }

  private parseLocation(text: string): LocationId | null {
    const normalized = text.toLowerCase();
    if (normalized === 'surco') return 'surco';
    if (normalized === 'vmt' || normalized === 'villa maria' || normalized === 'villa maria del triunfo') return 'vmt';
    return null;
  }

  private async parseIntakeValue(field: RequiredIntakeField, text: string): Promise<Partial<PatientIntake> | undefined> {
    if (text.length === 0) return undefined;

    if (field === 'age') {
      // Try direct number first
      const direct = Number(text.trim());
      if (Number.isInteger(direct) && direct > 0) return { age: direct };
      // Fall back to AI interpretation
      if (this.aiInterpreter) {
        const age = await this.aiInterpreter.interpretAge(text);
        if (age !== null) return { age };
      }
      return undefined;
    }

    if (field === 'dni') {
      // Accept 8-digit DNI directly
      const directDni = text.trim().replace(/\s/g, '');
      if (/^\d{8}$/.test(directDni)) return { dni: directDni };
      // Fall back to AI interpretation
      if (this.aiInterpreter) {
        const dni = await this.aiInterpreter.interpretDni(text);
        if (dni !== null) return { dni };
      }
      return undefined;
    }

    if (field === 'district') {
      if (this.aiInterpreter) {
        const district = await this.aiInterpreter.interpretDistrict(text);
        if (district !== null) return { district };
      }
      // No AI available — accept text as-is
      return { district: text };
    }

    if (field === 'assistiveDevice') {
      if (this.aiInterpreter) {
        const device = await this.aiInterpreter.interpretAssistiveDevice(text);
        if (device !== null) return { assistiveDevice: device };
      }
      return { assistiveDevice: text };
    }

    if (field === 'gait') {
      const g = text.toLowerCase().trim();
      const isNormal = ['normal', 'bien', 'sin problemas', 'ok', 'buena', 'bueno'].some((v) => g.includes(v));
      const isImbalance = ['dificultad', 'cojeo', 'cojea', 'mal', 'desequilibrio', 'imbalance', 'irregular', 'problemas al caminar'].some((v) => g.includes(v));
      if (isNormal) return { gait: 'normal' };
      if (isImbalance) return { gait: 'imbalance' };
      // Fall back to AI interpretation
      if (this.aiInterpreter) {
        const interpreted = await this.aiInterpreter.interpretGait(text);
        if (interpreted !== null) return { gait: interpreted };
      }
      return undefined;
    }

    const mapping: Record<Exclude<RequiredIntakeField, 'age' | 'gait' | 'dni' | 'district' | 'assistiveDevice'>, string> = {
      fullName: 'fullName',
      painArea: 'painArea',
      painDuration: 'painDuration',
      limitation: 'limitation',
      motive: 'motive'
    };

    return { [mapping[field]]: text } as Partial<PatientIntake>;
  }

  private promptFor(field: RequiredIntakeField): string {
    const prompts: Record<RequiredIntakeField, string> = {
      fullName: '¿Cuál es el nombre completo del paciente?',
      dni: '¿Cuál es el número de DNI del paciente?',
      age: '¿Cuántos años tiene el paciente?',
      district: '¿En qué distrito reside el paciente?',
      painArea: '¿En qué zona del cuerpo siente el dolor?',
      painDuration: '¿Desde hace cuánto tiempo tiene ese dolor?',
      limitation: '¿Tiene alguna limitación para moverse o realizar actividades del día a día?',
      gait: '¿Cómo es su forma de caminar actualmente? Puede responder: normal, o con dificultad.',
      assistiveDevice: '¿Usa algún dispositivo de apoyo para caminar, como bastón o andador? Si no usa ninguno, indíquelo.',
      motive: '¿Cuál es el motivo principal de la consulta?'
    };
    return prompts[field];
  }

  private clarificationFor(field: RequiredIntakeField): string {
    if (field === 'gait') {
      return 'Disculpe, no entendí esa respuesta. ¿Cómo camina el paciente actualmente? Puede responder: normal, o con dificultad para caminar.';
    }
    if (field === 'age') {
      return 'Disculpe, necesito la edad en número. ¿Cuántos años tiene el paciente?';
    }
    return `Disculpe, no pude registrar ese dato. ${this.promptFor(field)}`;
  }

  private messageForDecision(decision: EligibilityDecision): string {
    if (decision.outcome === 'reject') {
      return 'Gracias por su consulta. Lamentablemente, según los criterios del consultorio, no es posible agendar esta cita a través del bot. Le recomendamos comunicarse directamente con el consultorio para recibir orientación personalizada.';
    }

    if (decision.outcome === 'pending_review') {
      return decision.requiresRadiography
        ? 'Gracias por la información. Para continuar con la cita, necesitamos revisar una radiografía. Por favor envíela por Telegram para que el equipo pueda evaluar el caso.'
        : 'Gracias por la información. Su caso requiere una revisión previa por parte del equipo antes de confirmar la cita. Le contactaremos a la brevedad.';
    }

    // pass — replaced by the location prompt
    return '¡Perfecto, podemos atenderle! ¿En qué sede prefiere atenderse: Surco o VMT?';
  }

  private confirmationSummary(draft: SchedulingDraft): string {
    const locationLabel = draft.locationId === 'surco' ? 'Surco' : 'VMT';
    const patientName = draft.intake?.fullName ?? '';

    return [
      'Estos son los datos de su cita:',
      `Sede: ${locationLabel}`,
      `Fecha: ${draft.date ?? ''}`,
      `Hora: ${draft.slot ?? ''}`,
      `Paciente: ${patientName}`,
      '',
      'Si todo está correcto, responda "confirmar" para reservar.'
    ].join('\n');
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
