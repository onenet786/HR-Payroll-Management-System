import assert from 'node:assert/strict';
import test from 'node:test';
import { bankAdviceChecksum } from './bankAdvice';
import type { Payslip } from '../types';

const first = { id: 'p1', employeeId: 'e1', employeeCode: 'EMP-1', bankName: 'HBL', iban: 'pk00 abcd 1234567890123456', bankAccountNumber: '123', netSalary: 1000 } as Payslip;
const second = { ...first, id: 'p2', employeeId: 'e2', employeeCode: 'EMP-2', netSalary: 2000 };

test('bank advice checksum is order-independent and detects amount changes', async () => {
  const normal = await bankAdviceChecksum([first, second]);
  const reversed = await bankAdviceChecksum([second, first]);
  const changed = await bankAdviceChecksum([first, { ...second, netSalary: 2001 }]);
  assert.equal(normal, reversed);
  assert.notEqual(normal, changed);
  assert.match(normal, /^[a-f0-9]{64}$/);
});
