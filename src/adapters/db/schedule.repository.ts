import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { locations, schedules } from '../../db/schema.js';
import type { LocationWindow, ScheduleRepository } from '../../application/scheduling/schedule.repository.js';
import type { LocationId } from '../../application/scheduling/scheduling-flow.js';

const LOCATION_LABELS: Record<LocationId, string> = {
  surco: 'Surco',
  vmt: 'VMT'
};

export class DbScheduleRepository implements ScheduleRepository {
  constructor(private readonly db: PostgresJsDatabase) {}

  async findByLocation(locationId: LocationId): Promise<LocationWindow | null> {
    const rows = await this.db
      .select({
        locationId: locations.id,
        name: locations.name,
        timezone: locations.timezone,
        startTime: schedules.startTime,
        endTime: schedules.endTime,
        durationMinutes: schedules.appointmentDurationMinutes
      })
      .from(schedules)
      .innerJoin(locations, eq(schedules.locationId, locations.id))
      .where(eq(schedules.locationId, locationId))
      .limit(1);

    if (!rows[0]) return null;

    return {
      locationId: rows[0].locationId as LocationId,
      label: rows[0].name,
      start: rows[0].startTime,
      end: rows[0].endTime,
      timeZone: rows[0].timezone,
      durationMinutes: rows[0].durationMinutes
    };
  }

  async upsert(window: LocationWindow): Promise<void> {
    // Ensure location exists
    await this.db
      .insert(locations)
      .values({
        id: window.locationId,
        name: LOCATION_LABELS[window.locationId] ?? window.locationId,
        timezone: window.timeZone,
        enabled: true
      })
      .onConflictDoUpdate({
        target: locations.id,
        set: { name: LOCATION_LABELS[window.locationId] ?? window.locationId }
      });

    // Upsert schedule — use day_of_week=0 as "all days" for MVP
    await this.db
      .insert(schedules)
      .values({
        locationId: window.locationId,
        dayOfWeek: 0,
        startTime: window.start,
        endTime: window.end,
        appointmentDurationMinutes: window.durationMinutes,
        enabled: true
      })
      .onConflictDoUpdate({
        target: [schedules.locationId, schedules.dayOfWeek],
        set: {
          startTime: window.start,
          endTime: window.end,
          appointmentDurationMinutes: window.durationMinutes
        }
      });  }
}
