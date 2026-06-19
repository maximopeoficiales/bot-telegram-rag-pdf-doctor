import type { CalendarPort } from '../../ports/calendar.port.js';
import type { PatientIntake } from '../../domain/eligibility/eligibility-engine.js';
import type { LocationId } from '../scheduling/scheduling-flow.js';

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

const locationConfig: Record<LocationId, { label: string; start: string; end: string; timeZone: string }> = {
  surco: { label: 'Surco', start: '10:00', end: '13:00', timeZone: 'America/Lima' },
  vmt: { label: 'VMT', start: '18:00', end: '20:00', timeZone: 'America/Lima' }
};

export class AvailabilityService {
  constructor(
    private readonly calendar: CalendarPort,
    private readonly cases?: PatientCaseRepository,
    private readonly appointments?: AppointmentRepository
  ) {}

  async availableSlots(input: { locationId: LocationId; date: string }): Promise<string[]> {
    const location = locationConfig[input.locationId];
    const candidateSlots = this.windowSlots(input.locationId);
    const dayStart = this.toLimaDate(input.date, location.start);
    const dayEnd = this.toLimaDate(input.date, location.end);
    const busy = await this.calendar.freeBusy({ timeMin: dayStart, timeMax: dayEnd, timeZone: location.timeZone });

    return candidateSlots.filter((slot) => {
      const startsAt = this.toLimaDate(input.date, slot);
      const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
      return !busy.some((interval) => startsAt < interval.end && endsAt > interval.start);
    });
  }

  async confirmBooking(input: BookingRequest): Promise<BookingResult> {
    if (!(await this.isSlotAvailable(input))) {
      return { booked: false, reason: 'slot_unavailable' };
    }

    const startsAt = this.toLimaDate(input.date, input.slot);
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    const patientCase = await this.cases?.create({ telegramUserId: input.telegramUserId, status: 'confirmed', intake: input.intake });
    const caseId = patientCase?.id ?? 0;
    const event = await this.calendar.createEvent({
      summary: `Appointment - ${input.intake.fullName}`,
      description: `DNI: ${input.intake.dni}\nMotive: ${input.intake.motive}`,
      location: locationConfig[input.locationId].label,
      startsAt,
      endsAt,
      timeZone: locationConfig[input.locationId].timeZone,
      metadata: { telegramUserId: input.telegramUserId, caseId: String(caseId), locationId: input.locationId }
    });

    await this.appointments?.create({ caseId, googleEventId: event.id, locationId: input.locationId, startsAt, endsAt });
    return { booked: true, caseId, googleEventId: event.id, startsAt, endsAt };
  }

  async isSlotAvailable(input: { locationId: LocationId; date: string; slot: string }): Promise<boolean> {
    return (await this.availableSlots({ locationId: input.locationId, date: input.date })).includes(input.slot);
  }

  windowSlots(locationId: LocationId): string[] {
    const location = locationConfig[locationId];
    const [startHour, startMinute] = location.start.split(':').map(Number);
    const [endHour, endMinute] = location.end.split(':').map(Number);
    const slots: string[] = [];
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;

    for (let minute = start; minute + 30 <= end; minute += 30) {
      slots.push(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
    }

    return slots;
  }

  private toLimaDate(date: string, time: string): Date {
    return new Date(`${date}T${time}:00-05:00`);
  }
}
