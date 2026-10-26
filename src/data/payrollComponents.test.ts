import test from 'node:test';
import assert from 'node:assert/strict';
import { ADJUSTMENT_TYPES, isDeductionType, isNonTaxableType, parseAdjustmentCsv } from './payrollComponents';

test('the component catalogue covers every company allowance and deduction', () => {
  for (const type of ['Funeral Allowance', 'Fuel Allowance', 'Commission', 'Tip', 'Grading Reward', 'Surprise Reward', 'Penalty / Warning', 'Short Cash', 'Shopping', 'Uniform', 'Advance (STA)', 'Loan (LTA)', 'EOBI']) {
    assert.ok(ADJUSTMENT_TYPES.includes(type as never), type);
  }
  assert.equal(isDeductionType('Uniform'), true);
  assert.equal(isDeductionType('Fuel Allowance'), false);
  assert.equal(isNonTaxableType('Funeral Allowance'), true);
  assert.equal(isNonTaxableType('Commission'), false);
});

test('commission and tip CSV import validates each line', () => {
  const csv = 'Employee Code,Type,Amount,Reason\nemp-001,Commission,"12,500",October sales\nEMP-002;Tip;800\nEMP-003,Bonus,500,not importable\n,Tip,100\nEMP-004,Tip,abc';
  const { rows, errors } = parseAdjustmentCsv(csv);
  assert.deepEqual(rows.map(row => [row.employeeCode, row.type, row.amount, row.reason]), [['EMP-001', 'Commission', 12500, 'October sales'], ['EMP-002', 'Tip', 800, 'Tip import']]);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /Line 4: type "Bonus"/);
  assert.match(errors[1], /Line 5: employee code/);
  assert.match(errors[2], /Line 6: amount/);
});
