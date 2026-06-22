import type { CalendarPort } from '../../ports/calendar.port.js';
import type { PatientIntake } from '../../domain/eligibility/eligibility-engine.js';
import type { LocationId } from '../scheduling/scheduling-flow.js';
import type { ScheduleRepository } from '../scheduling/schedule.repository.js';

export type AppointmentRepository = {
  create(input: { caseId: number; googleEventId: string; locationId: LocationId; startsAt: Date; endsAt: Date }): Promise<void>;
};

export type PatientCaseRepository = {
  create(input: { telegramUserId: string; status: 'confirmed' | 'pending_review'; intake: PatientIntake }): Promise<{ id: number }>;
  markPendingReview(caseId: number): Promise<void>;
};

export type BookingRequest = {
  telegramUserId: string;
  locationId: LocationId;
  date: string;
  slot: string;
  intake: PatientIntake;
};

export type BookingResult =
  | { booked: true; caseId: number; googleEventId: string; startsAt: Date; endsAt: Date }
  | { booked: false; reason: 'slot_unavailable' };

// Fallback config used only when DB has no schedule for a location
const fallbackConfig: Record<LocationId, { label: string; start: string; end: string; timeZone: string; durationMinutes: number }> = {
  surco: { label: 'Surco', start: '10:00', end: '13:00', timeZone: 'America/Lima', durationMinutes: 30 },
  vmt:   { label: 'VMT',   start: '18:00', end: '20:00', timeZone: 'America/Lima', durationMinutes: 30 }
};

export class AvailabilityService {
  constructor(
    private readonly calendar: CalendarPort,
    private readonly cases?: PatientCaseRepository,
    private readonly appointments?: AppointmentRepository,
    private readonly scheduleRepo?: ScheduleRepository
  ) {}

  async availableSlots(input: { locationId: LocationId; date: string }): Promise<string[]> {
    const config = await this.resolveConfig(input.locationId);
    const candidateSlots = this.windowSlots(config.start, config.end, config.durationMinutes);
    const dayStart = this.toLocalDate(input.date, config.start, config.timeZone);
    const dayEnd = this.toLocalDate(input.date, config.end, config.timeZone);
    const busy = await this.calendar.freeBusy({ timeMin: dayStart, timeMax: dayEnd, timeZone: config.timeZone });

    return candidateSlots.filter((slot) => {
      const startsAt = this.toLocalDate(input.date, slot, config.timeZone);
      const endsAt = new Date(startsAt.getTime() + config.durationMinutes * 60_000);
      return !busy.some((interval) => startsAt < interval.end && endsAt > interval.start);
    });
  }

  async confirmBooking(input: BookingRequest): Promise<BookingResult> {
    if (!(await this.isSlotAvailable(input))) {
      return { booked: false, reason: 'slot_unavailable' };
    }

    const config = await this.resolveConfig(input.locationId);
    const startsAt = this.toLocalDate(input.date, input.slot, config.timeZone);
    const endsAt = new Date(startsAt.getTime() + config.durationMinutes * 60_000);
    const patientCase = await this.cases?.create({ telegramUserId: input.telegramUserId, status: 'confirmed', intake: input.intake });
    const caseId = patientCase?.id ?? 0;
    const event = await this.calendar.createEvent({
      summary: `Cita: ${input.intake.fullName}`,
      description: [
        `Paciente: ${input.intake.fullName}`,
        `DNI: ${input.intake.dni}`,
        `Edad: ${input.intake.age} años`,
        `Distrito: ${input.intake.district}`,
        `Zona de dolor: ${input.intake.painArea}`,
        `Tiempo de evolución: ${input.intake.painDuration}`,
        `Limitación funcional: ${input.intake.limitation}`,
        `Marcha: ${input.intake.gait === 'normal' ? 'Normal' : 'Desequilibrio'}`,
        `Dispositivo de apoyo: ${input.intake.assistiveDevice}`,
        `Motivo: ${input.intake.motive}`
      ].join('\n'),
      location: config.label,
      startsAt,
      endsAt,
      timeZone: config.timeZone,
      metadata: { telegramUserId: input.telegramUserId, caseId: String(caseId), locationId: input.locationId }
    });

    await this.appointments?.create({ caseId, googleEventId: event.id, locationId: input.locationId, startsAt, endsAt });
    return { booked: true, caseId, googleEventId: event.id, startsAt, endsAt };
  }

  async isSlotAvailable(input: { locationId: LocationId; date: string; slot: string }): Promise<boolean> {
    return (await this.availableSlots({ locationId: input.locationId, date: input.date })).includes(input.slot);
  }

  async getLocationLabel(locationId: LocationId): Promise<string> {
    const config = await this.resolveConfig(locationId);
    return config.label;
  }

  windowSlots(start: string, end: string, durationMinutes = 30): string[] {
    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);
    const slots: string[] = [];
    const startMin = startHour * 60 + startMinute;
    const endMin = endHour * 60 + endMinute;

    for (let minute = startMin; minute + durationMinutes <= endMin; minute += durationMinutes) {
      slots.push(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
    }

    return slots;
  }

  private async resolveConfig(locationId: LocationId) {
    if (this.scheduleRepo) {
      const schedule = await this.scheduleRepo.findByLocation(locationId);
      if (schedule) return schedule;
    }
    return fallbackConfig[locationId];
  }

  private toLocalDate(date: string, time: string, _timeZone: string): Date {
    return new Date(`${date}T${time}:00-05:00`);
  }
}
