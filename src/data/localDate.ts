// Calendar date (YYYY-MM-DD) in the computer's own time zone. Use this for "today" and for dates built with
// local midnight: Date#toISOString() is UTC, so in Pakistan (UTC+5) it still gives yesterday until 5 AM.
export function localDateStr(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
