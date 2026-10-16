import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDisplayDate, parseDisplayDate } from '../utils/dateFormat';

test('dates display as DD-MMM-YYYY and store as ISO', () => {
  assert.equal(formatDisplayDate('2026-10-16'), '16-Oct-2026');
  assert.equal(formatDisplayDate('2026-01-05T10:00:00Z'), '05-Jan-2026');
  assert.equal(formatDisplayDate(''), '');
  assert.equal(formatDisplayDate(undefined), '');
});

test('typed dates are accepted in common Pakistani formats and validated', () => {
  for (const text of ['16-Oct-2026', '16 oct 2026', '16-October-2026', '16/10/2026', '16-10-2026', '2026-10-16']) assert.equal(parseDisplayDate(text), '2026-10-16', text);
  assert.equal(parseDisplayDate('29-Feb-2028'), '2028-02-29');
  assert.equal(parseDisplayDate('29-Feb-2026'), undefined, 'not a leap year');
  assert.equal(parseDisplayDate('31/04/2026'), undefined);
  assert.equal(parseDisplayDate('16-Foo-2026'), undefined);
  assert.equal(parseDisplayDate('tomorrow'), undefined);
});
