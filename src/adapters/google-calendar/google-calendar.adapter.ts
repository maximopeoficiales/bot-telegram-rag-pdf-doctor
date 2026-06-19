import type { CalendarBusyInterval, CalendarEvent, CalendarEventInput, CalendarPort } from '../../ports/calendar.port.js';

export type GoogleCalendarAdapterConfig = {
  calendarId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetch?: typeof fetch;
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  token_type: string;
};

type GoogleFreeBusyResponse = {
  calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
};

type GoogleEventResponse = {
  id?: string;
  htmlLink?: string;
};

export class GoogleCalendarAdapter implements CalendarPort {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly config: GoogleCalendarAdapterConfig) {
    this.fetchFn = config.fetch ?? fetch;
  }

  async freeBusy(input: { timeMin: Date; timeMax: Date; timeZone: string }): Promise<CalendarBusyInterval[]> {
    const response = await this.authorizedJson<GoogleFreeBusyResponse>('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      body: JSON.stringify({
        timeMin: input.timeMin.toISOString(),
        timeMax: input.timeMax.toISOString(),
        timeZone: input.timeZone,
        items: [{ id: this.config.calendarId }]
      })
    });

    const busy = response.calendars?.[this.config.calendarId]?.busy ?? [];
    return busy.map((interval) => ({ start: new Date(interval.start), end: new Date(interval.end) }));
  }

  async createEvent(input: CalendarEventInput): Promise<CalendarEvent> {
    const event = await this.authorizedJson<GoogleEventResponse>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.config.calendarId)}/events`,
      {
        method: 'POST',
        body: JSON.stringify({
          summary: input.summary,
          description: input.description,
          location: input.location,
          start: { dateTime: input.startsAt.toISOString(), timeZone: input.timeZone },
          end: { dateTime: input.endsAt.toISOString(), timeZone: input.timeZone },
          extendedProperties: input.metadata ? { private: input.metadata } : undefined
        })
      }
    );

    if (!event.id) {
      throw new Error('Google Calendar did not return an event id');
    }

    return { id: event.id, htmlLink: event.htmlLink };
  }

  private async authorizedJson<T>(url: string, init: RequestInit): Promise<T> {
    const accessToken = await this.getAccessToken();
    const response = await this.fetchFn(url, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
        ...init.headers
      }
    });

    if (!response.ok) {
      throw new Error(`Google Calendar request failed with ${response.status}`);
    }

    return (await response.json()) as T;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.config.refreshToken,
      grant_type: 'refresh_token'
    });

    const response = await this.fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!response.ok) {
      throw new Error(`Google OAuth token refresh failed with ${response.status}`);
    }

    const token = (await response.json()) as GoogleTokenResponse;
    this.accessToken = token.access_token;
    this.accessTokenExpiresAt = Date.now() + (token.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }
}
