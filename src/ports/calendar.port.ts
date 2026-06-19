export type CalendarBusyInterval = {
  start: Date;
  end: Date;
};

export type CalendarEventInput = {
  summary: string;
  description?: string;
  location?: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  metadata?: Record<string, string>;
};

export type CalendarEvent = {
  id: string;
  htmlLink?: string;
};

export interface CalendarPort {
  freeBusy(input: { timeMin: Date; timeMax: Date; timeZone: string }): Promise<CalendarBusyInterval[]>;
  createEvent(input: CalendarEventInput): Promise<CalendarEvent>;
}
