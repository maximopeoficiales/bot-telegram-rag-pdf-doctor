import type { LocationId } from '../scheduling/scheduling-flow.js';

export type LocationWindow = {
  locationId: LocationId;
  label: string;
  start: string;
  end: string;
  timeZone: string;
  durationMinutes: number;
};

export type ScheduleRepository = {
  findByLocation(locationId: LocationId): Promise<LocationWindow | null>;
  upsert(window: LocationWindow): Promise<void>;
};
