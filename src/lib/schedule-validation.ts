/**
 * Shared schedule validation utilities.
 *
 * Both the Gemini and Ollama adapters, as well as the UploadDocumentHandler,
 * use these functions to validate extracted schedule windows before persisting
 * them.  Centralising here avoids duplicated logic and divergence.
 */

/**
 * Parses a "HH:MM" string into total minutes from midnight.
 * Returns `null` if the string is not a valid 24-hour time.
 */
export function parseTimeToMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return hour * 60 + minute;
}

/**
 * Returns `true` when `time` is a well-formed HH:MM value within
 * the 24-hour range (00:00 – 23:59).
 */
export function isValidHhmm(time: string): boolean {
  return parseTimeToMinutes(time) !== null;
}

/**
 * Returns `true` when both `start` and `end` are valid HH:MM values
 * **and** `start` is strictly before `end` (i.e. the window has a positive
 * duration and does not wrap midnight).
 */
export function isValidScheduleWindow(start: string, end: string): boolean {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  return startMinutes !== null && endMinutes !== null && startMinutes < endMinutes;
}

/**
 * Type guard that asserts a value is a `{ start: string; end: string }` record
 * **and** that the window passes `isValidScheduleWindow`.
 */
export function isValidScheduleEntry(value: unknown): value is { start: string; end: string } {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (typeof record['start'] !== 'string' || typeof record['end'] !== 'string') {
    return false;
  }

  return isValidScheduleWindow(record['start'], record['end']);
}
