/**
 * Spreadsheet-safe CSV cell. Text that a spreadsheet would run as a formula (leading = + - @, or a tab / carriage
 * return before one) gets a leading apostrophe. Numbers, and text that is just a plain number such as "-1500.00",
 * stay numeric so negative amounts are not turned into text.
 */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function neutraliseFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) && !PLAIN_NUMBER.test(text) ? `'${text}` : text;
}

export function csvCell(value: string | number | undefined | null): string {
  const text = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : neutraliseFormula(String(value ?? ''));
  return `"${text.replace(/"/g, '""')}"`;
}
