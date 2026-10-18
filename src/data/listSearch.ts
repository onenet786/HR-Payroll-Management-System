// Shared matching rules for the search boxes on list pages.

const normalize = (value: unknown) => String(value ?? '').toLowerCase();
// CNICs, IBANs, phone numbers and codes are typed with or without dashes and spaces.
const compact = (value: string) => value.replace(/[\s\-_/.]/g, '');

/** True when every word of the query appears in at least one of the values. */
export function matchesSearch(query: string, ...values: unknown[]): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = values.flat(Infinity).filter(value => value !== null && value !== undefined && value !== '').map(normalize).join(' \u0000 ');
  const compactHaystack = compact(haystack);
  return words.every(word => haystack.includes(word) || (compact(word).length > 0 && compactHaystack.includes(compact(word))));
}
