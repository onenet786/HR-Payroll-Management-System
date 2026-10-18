import type { Payslip } from '../types';

/**
 * Parallel-run reconciliation: before going live, the same month is processed in the legacy payroll and in
 * this system, and every employee's figures are compared. Legacy exports differ, so columns are matched by
 * common header names rather than a fixed layout.
 */
export const COMPARED_FIELDS = [
  { key: 'grossSalary', label: 'Gross', aliases: ['gross', 'gross salary', 'gross pay', 'total earnings', 'gross amount'] },
  { key: 'incomeTaxDeduction', label: 'Income tax', aliases: ['tax', 'income tax', 'fbr tax', 'wht', 'withholding tax', 'income tax deduction'] },
  { key: 'eobiEmployeeDeduction', label: 'EOBI (employee)', aliases: ['eobi', 'eobi employee', 'eobi deduction', 'eobi employee share'] },
  { key: 'providentFundDeduction', label: 'Provident fund', aliases: ['pf', 'provident fund', 'pf deduction', 'pf employee'] },
  { key: 'loanRepaymentDeduction', label: 'Loan recovery', aliases: ['loan', 'loan deduction', 'advance', 'loan recovery', 'loan / advance'] },
  { key: 'totalDeductions', label: 'Total deductions', aliases: ['deductions', 'total deductions', 'total deduction'] },
  { key: 'netSalary', label: 'Net', aliases: ['net', 'net salary', 'net pay', 'take home', 'net amount', 'net payable'] },
] as const;

type FieldKey = (typeof COMPARED_FIELDS)[number]['key'];
const CODE_ALIASES = ['employee code', 'emp code', 'code', 'employee id', 'emp id', 'employee no', 'emp no', 'staff id'];
const CNIC_ALIASES = ['cnic', 'cnic no', 'nic', 'cnic number'];

export interface LegacyRow { code: string; cnic: string; values: Partial<Record<FieldKey, number>> }
export interface ParsedLegacyPayroll { rows: LegacyRow[]; matchedFields: FieldKey[]; errors: string[] }

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === delimiter) { cells.push(cell); cell = ''; }
    else cell += character;
  }
  cells.push(cell);
  return cells.map(value => value.trim());
}

const normalizeHeader = (value: string) => value.toLowerCase().replace(/\(.*?\)|pkr|rs\.?/g, '').replace(/[^a-z/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const toNumber = (value: string) => {
  const cleaned = value.replace(/[,\s]|PKR|Rs\.?/gi, '');
  const negative = /^\(.*\)$/.test(cleaned);
  const number = Number(cleaned.replace(/[()]/g, ''));
  return Number.isFinite(number) ? (negative ? -number : number) : undefined;
};

export function parseLegacyPayrollCsv(text: string): ParsedLegacyPayroll {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return { rows: [], matchedFields: [], errors: ['The file needs a header row and at least one employee row.'] };
  const delimiter = [',', ';', '\t', '|'].map(item => [item, lines[0].split(item).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);
  const codeIndex = headers.findIndex(header => CODE_ALIASES.includes(header));
  const cnicIndex = headers.findIndex(header => CNIC_ALIASES.includes(header));
  const errors: string[] = [];
  if (codeIndex < 0 && cnicIndex < 0) errors.push('No employee code or CNIC column found (for example "Employee Code" or "CNIC").');
  const fieldIndexes = COMPARED_FIELDS.map(field => [field.key, headers.findIndex(header => (field.aliases as readonly string[]).includes(header))] as const).filter(([, index]) => index >= 0);
  if (!fieldIndexes.length) errors.push('No comparable amount columns found (for example "Gross", "Income Tax", "Net").');
  if (errors.length) return { rows: [], matchedFields: [], errors };
  const rows = lines.slice(1).map(line => parseCsvLine(line, delimiter)).filter(cells => cells.some(Boolean))
    .map(cells => ({
      code: codeIndex >= 0 ? cells[codeIndex] || '' : '',
      cnic: cnicIndex >= 0 ? (cells[cnicIndex] || '').replace(/\D/g, '') : '',
      values: Object.fromEntries(fieldIndexes.map(([key, index]) => [key, toNumber(cells[index] || '')]).filter(([, value]) => value !== undefined)) as LegacyRow['values'],
    }))
    .filter(row => (row.code || row.cnic) && !/^total/i.test(row.code));
  return { rows, matchedFields: fieldIndexes.map(([key]) => key), errors: [] };
}

export interface ParallelRunLine {
  employeeCode: string;
  employeeName: string;
  status: 'Match' | 'Difference' | 'Only in legacy' | 'Only in this system';
  differences: Array<{ field: string; legacy: number; system: number; delta: number }>;
}

export interface ParallelRunResult { lines: ParallelRunLine[]; matched: number; differing: number; onlyLegacy: number; onlySystem: number; netDelta: number }

export function compareParallelRun(legacy: ParsedLegacyPayroll, sheets: Payslip[], tolerance = 1): ParallelRunResult {
  const used = new Set<string>();
  const lines: ParallelRunLine[] = [];
  const digits = (value?: string) => (value || '').replace(/\D/g, '');
  for (const row of legacy.rows) {
    const sheet = sheets.find(item => !used.has(item.id) && ((row.code && item.employeeCode.toLowerCase() === row.code.toLowerCase()) || (row.cnic && digits(item.cnic) === row.cnic)));
    if (!sheet) { lines.push({ employeeCode: row.code || row.cnic, employeeName: '', status: 'Only in legacy', differences: [] }); continue; }
    used.add(sheet.id);
    const differences = legacy.matchedFields.flatMap(key => {
      const legacyValue = row.values[key];
      const systemValue = Math.round(Number(sheet[key] || 0));
      if (legacyValue === undefined || Math.abs(legacyValue - systemValue) <= tolerance) return [];
      return [{ field: COMPARED_FIELDS.find(field => field.key === key)!.label, legacy: legacyValue, system: systemValue, delta: Math.round(systemValue - legacyValue) }];
    });
    lines.push({ employeeCode: sheet.employeeCode, employeeName: sheet.employeeName, status: differences.length ? 'Difference' : 'Match', differences });
  }
  for (const sheet of sheets) {
    if (!used.has(sheet.id)) lines.push({ employeeCode: sheet.employeeCode, employeeName: sheet.employeeName, status: 'Only in this system', differences: [] });
  }
  const rank = { 'Difference': 0, 'Only in legacy': 1, 'Only in this system': 2, 'Match': 3 };
  lines.sort((a, b) => rank[a.status] - rank[b.status] || (a.employeeCode || '').localeCompare(b.employeeCode || ''));
  const netDelta = lines.flatMap(line => line.differences).filter(item => item.field === 'Net').reduce((sum, item) => sum + item.delta, 0);
  const count = (status: ParallelRunLine['status']) => lines.filter(line => line.status === status).length;
  return { lines, matched: count('Match'), differing: count('Difference'), onlyLegacy: count('Only in legacy'), onlySystem: count('Only in this system'), netDelta };
}

export function parallelRunCsv(result: ParallelRunResult): string {
  // Text cells are neutralised against spreadsheet formulas; numeric cells (including negatives) stay numeric.
  const cell = (value: string | number) => typeof value === 'number' ? String(value) : `"${value.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`;
  const rows: Array<Array<string | number>> = [['Employee Code', 'Employee Name', 'Status', 'Field', 'Legacy PKR', 'This System PKR', 'Difference PKR']];
  for (const line of result.lines) {
    if (!line.differences.length) rows.push([line.employeeCode, line.employeeName, line.status, '', '', '', '']);
    for (const item of line.differences) rows.push([line.employeeCode, line.employeeName, line.status, item.field, item.legacy, item.system, item.delta]);
  }
  return rows.map(row => row.map(cell).join(',')).join('\r\n');
}
