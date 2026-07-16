/**
 * Parse a date-only string (e.g. "2026-07-15") as local midnight.
 *
 * `new Date("2026-07-15")` is treated as UTC midnight by the JS spec,
 * which shifts it one day back in timezones behind UTC.
 * Appending T00:00:00 (no Z) forces local-time parsing instead.
 */
export function parseLocalDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date();
  return new Date(dateStr.slice(0, 10) + "T00:00:00");
}
