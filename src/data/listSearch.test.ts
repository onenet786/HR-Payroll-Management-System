import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch } from './listSearch';

test('an empty query matches everything', () => {
  assert.equal(matchesSearch('', 'Ali'), true);
  assert.equal(matchesSearch('   ', undefined), true);
});

test('matching ignores case and needs every word somewhere', () => {
  assert.equal(matchesSearch('ali LAHORE', 'Ali Raza', 'Lahore Head Office'), true);
  assert.equal(matchesSearch('ali karachi', 'Ali Raza', 'Lahore Head Office'), false);
});

test('CNIC, IBAN and codes match with or without separators', () => {
  assert.equal(matchesSearch('3520112345671', '35201-1234567-1'), true);
  assert.equal(matchesSearch('35201-1234567', '3520112345671'), true);
  assert.equal(matchesSearch('pk36 scbl', 'PK36SCBL0000001123456702'), true);
  assert.equal(matchesSearch('emp0001', 'EMP-0001'), true);
});

test('missing values and numbers are handled', () => {
  assert.equal(matchesSearch('85000', null, undefined, 85000), true);
  assert.equal(matchesSearch('x', null, undefined), false);
  assert.equal(matchesSearch('ali', ['Ali', 'Raza']), true);
});

test('words from different values do not join into a false match', () => {
  assert.equal(matchesSearch('aliraza', 'Ali Raza'), true);
  assert.equal(matchesSearch('aliraza', 'Ali', 'Raza'), false);
});
