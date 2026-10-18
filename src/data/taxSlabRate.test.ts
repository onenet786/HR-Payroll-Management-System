import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAnnualTax, slabRatePercent } from './defaults';
import type { TaxSlab } from '../types';

const slabs = (rates: number[]): TaxSlab[] => [
  { id: 's1', minIncome: 0, maxIncome: 600000, baseTax: 0, percentage: rates[0] },
  { id: 's2', minIncome: 600000, maxIncome: 1200000, baseTax: 0, percentage: rates[1] },
  { id: 's3', minIncome: 1200000, maxIncome: 999999999, baseTax: 6000, percentage: rates[2] },
] as TaxSlab[];

test('slab rates are whole percentages', () => {
  assert.equal(calculateAnnualTax(1000000, slabs([0, 1, 11])), 4000); // 1% of 400,000
  assert.equal(calculateAnnualTax(1500000, slabs([0, 1, 11])), 39000); // 6,000 + 11% of 300,000
});

test('rates typed as fractions (0.01 for 1%) give the same tax instead of 100 times less', () => {
  assert.equal(slabRatePercent(0.11), 11);
  assert.equal(slabRatePercent(0), 0);
  assert.equal(slabRatePercent(35), 35);
  assert.equal(calculateAnnualTax(1000000, slabs([0, 0.01, 0.11])), calculateAnnualTax(1000000, slabs([0, 1, 11])));
  assert.equal(calculateAnnualTax(1500000, slabs([0, 0.01, 0.11])), calculateAnnualTax(1500000, slabs([0, 1, 11])));
});
