import assert from 'node:assert/strict';
import test from 'node:test';
import { renderExport, STARTER_EXPORT_TEMPLATES, exportTemplatesFor, type ExportTemplate } from './exportTemplates';
import type { Employee, PayrollRun, Payslip } from '../types';

const run = { id: 'run-oct', periodMonth: 10, periodYear: 2026, endDate: '2026-10-31' } as PayrollRun;
const sheet = (code: string, overrides: Partial<Payslip> = {}) => ({
  id: `p-${code}`, payrollRunId: 'run-oct', employeeId: code, employeeCode: code, employeeName: `Name ${code}`, cnic: '35202-1234567-1',
  iban: 'PK36SCBL0000001123456702', bankAccountNumber: '1123456702', bankName: 'HBL', netSalary: 50000.5, grossSalary: 60000, basicEarnings: 30000,
  eobiEmployeeDeduction: 370, eobiEmployerContribution: 1850, pessiEmployerContribution: 0, ...overrides,
} as Payslip);
const context = { run, companyName: 'Acme', valueDate: '2026-10-31', batchReference: 'B42', employees: [{ id: 'E2', eobiNumber: 'EOBI-9' } as Employee] };

test('delimited template renders header, rows with batch tokens, trailer and totals', () => {
  const template: ExportTemplate = {
    id: 't', name: 'HBL Test', kind: 'Bank Advice', format: 'Delimited', delimiter: '|', debitAccount: '0001234',
    headerLines: ['H|{batchReference}|{debitAccount}|{valueDate|date-ddmmyyyy}|{recordCount}'], trailerLines: ['T|{recordCount}|{totalAmount}|{controlHash}'],
    columns: [{ title: 'Seq', value: '{sequence}' }, { title: 'IBAN', value: '{iban}', required: true }, { title: 'Amt', value: '{netSalary}', format: 'amount-2dp' }, { title: 'Ref', value: 'SAL{period}-{employeeCode}' }],
    verified: true,
  };
  const result = renderExport(template, [sheet('E2'), sheet('E1'), sheet('X', { payrollRunId: 'other' })], context);
  const lines = result.content.trim().split('\r\n');
  assert.equal(lines[0], 'H|B42|0001234|31102026|2');
  assert.equal(lines[1], '1|PK36SCBL0000001123456702|50000.50|SAL202610-E1');
  assert.equal(lines[3], `T|2|100001.00|${result.controlHash}`);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.filename, 'hbl-test-202610-B42.csv');
});

test('fixed-width template pads and rejects overflowing fields', () => {
  const template: ExportTemplate = {
    id: 'f', name: 'Fixed', kind: 'Bank Advice', format: 'Fixed Width', verified: false,
    columns: [{ title: 'Name', value: '{employeeName}', width: 10, format: 'upper' }, { title: 'Amount', value: '{netSalary}', format: 'amount-paisa', width: 12, align: 'right', pad: '0' }],
  };
  const ok = renderExport(template, [sheet('E1')], context);
  assert.equal(ok.content.split('\r\n')[0], 'NAME E1   000005000050');
  assert.match(ok.warnings[0], /not been verified/);
  const long = renderExport(template, [sheet('E1', { employeeName: 'A very long beneficiary name' })], context);
  assert.ok(long.errors.some(error => /allows 10/.test(error)));
});

test('validation catches invalid IBANs, missing required data, unknown tokens and missing debit account', () => {
  const template: ExportTemplate = {
    id: 'v', name: 'V', kind: 'Bank Advice', format: 'Delimited', delimiter: ',', headerLines: ['{debitAccount}'],
    columns: [{ title: 'IBAN', value: '{iban}' }, { title: 'Account', value: '{accountNumber}', required: true }, { title: 'Oops', value: '{notAToken}' }],
  };
  const result = renderExport(template, [sheet('E1', { iban: 'PK12', bankAccountNumber: '' })], context);
  assert.ok(result.errors.some(error => /valid Pakistan IBAN/.test(error)));
  assert.ok(result.errors.some(error => /"Account" is empty/.test(error)));
  assert.ok(result.errors.some(error => /Unknown token \{notAToken\}/.test(error)));
  assert.ok(result.errors.some(error => /debit account/.test(error)));
});

test('statutory templates use contribution amounts and starter templates are unverified for banks', () => {
  const eobi = exportTemplatesFor(undefined, 'EOBI Return')[0];
  const result = renderExport(eobi, [sheet('E2')], context);
  assert.match(result.content, /"EOBI-9","35202123456712?/);
  assert.match(result.content, /"2220"/);
  const banks = STARTER_EXPORT_TEMPLATES.filter(item => item.kind === 'Bank Advice' && item.bank);
  assert.equal(banks.length, 7);
  assert.ok(banks.every(item => !item.verified));
  assert.equal(exportTemplatesFor({ exportTemplates: [{ ...eobi, id: 'mine' }] }, 'Bank Advice').length, 0, 'configured templates replace starters');
});
