const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isoOf = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/** House display format: DD-MMM-YYYY (e.g. 16-Oct-2026). Storage stays ISO YYYY-MM-DD. */
export function formatDisplayDate(iso?: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!match) return iso || '';
  return `${match[3]}-${MONTHS[Number(match[2]) - 1] ?? match[2]}-${match[1]}`;
}

/** Accepts 16-Oct-2026, 16 Oct 2026, 16/10/2026, 16-10-2026 or 2026-10-16; returns ISO or undefined. */
export function parseDisplayDate(text: string): string | undefined {
  const value = text.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) return isoOf(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[\s\-/.]+([A-Za-z]{3,9})[\s\-/.,]+(\d{4})$/.exec(value);
  if (match) {
    const month = MONTHS.findIndex(name => name.toLowerCase() === match![2].slice(0, 3).toLowerCase());
    return month < 0 ? undefined : isoOf(Number(match[3]), month + 1, Number(match[1]));
  }
  match = /^(\d{1,2})[\-/.](\d{1,2})[\-/.](\d{4})$/.exec(value);
  if (match) return isoOf(Number(match[3]), Number(match[2]), Number(match[1]));
  return undefined;
}
