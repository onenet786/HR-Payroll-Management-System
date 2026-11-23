// Bulk salary sheet: HR fills basic salaries in Excel, saves as CSV and uploads it on Salary Revisions. Every row
// becomes a Draft salary revision, so the maker-checker approval and the audit trail apply as for a single revision.
import type { Employee } from '../types';
import { parseCsvLine } from './parallelRun';
import { csvCell } from './csvSafe';

export interface SalarySheetRow {
  line: number;
  code: string;
  employee?: Employee;
  newSalary: number;
  effectiveDate: string;
  reason: string;
  /** Why the row is not used, or '' when it becomes a revision. */
  problem: string;
}

export interface SalarySheetPlan {
  rows: SalarySheetRow[];
  usable: SalarySheetRow[];
  errors: string[];
}

const header = (value: string) => value.toLowerCase().replace(/\(.*?\)|pkr|rs\.?/g, '').replace(/[^a-z]+/g, ' ').trim();
const CODE = ['employee code', 'emp code', 'code', 'employee id', 'emp id'];
const SALARY = ['basic salary', 'basic', 'salary', 'new salary', 'new basic salary', 'basic wage', 'monthly salary'];
const DATE = ['effective date', 'effective from', 'date'];
const REASON = ['reason', 'remarks', 'notes'];

const amount = (value: string) => {
  const cleaned = value.replace(/[,\s]|PKR|Rs\.?/gi, '');
  if (!cleaned) return NaN;
  return Number(cleaned);
};

/** Accepts YYYY-MM-DD or DD/MM/YYYY (as Excel in Pakistan writes it); '' when blank, null when unreadable. */
function isoDate(value: string): string | null {
  const v = value.trim();
  if (!v) return '';
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Reads the sheet and checks every row against the employee list. Nothing is saved here. */
export function planSalarySheet(text: string, employees: Employee[], defaults: { effectiveDate: string; reason: string }): SalarySheetPlan {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const firstLine = lines.findIndex(line => line.trim());
  if (firstLine < 0) return { rows: [], usable: [], errors: ['The file is empty.'] };
  const delimiter = [',', ';', '\t'].map(item => [item, lines[firstLine].split(item).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const headers = parseCsvLine(lines[firstLine], delimiter).map(header);
  const find = (aliases: string[]) => headers.findIndex(h => aliases.includes(h));
  const codeAt = find(CODE); const salaryAt = find(SALARY); const dateAt = find(DATE); const reasonAt = find(REASON);
  const errors: string[] = [];
  if (codeAt < 0) errors.push('No "Employee Code" column found.');
  if (salaryAt < 0) errors.push('No "Basic Salary" column found.');
  if (errors.length) return { rows: [], usable: [], errors };

  const byCode = new Map(employees.map(e => [(e.employeeCode || '').trim().toUpperCase(), e]));
  const seen = new Set<string>();
  const rows: SalarySheetRow[] = [];
  for (let i = firstLine + 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    const cells = parseCsvLine(lines[i], delimiter);
    const code = (cells[codeAt] || '').trim();
    const rawSalary = (cells[salaryAt] || '').trim();
    if (!code && !rawSalary) continue;
    const employee = byCode.get(code.toUpperCase());
    const newSalary = amount(rawSalary);
    const date = dateAt >= 0 ? isoDate(cells[dateAt] || '') : '';
    const row: SalarySheetRow = {
      line: i + 1, code, employee, newSalary: Number.isFinite(newSalary) ? newSalary : 0,
      effectiveDate: date || defaults.effectiveDate,
      reason: (reasonAt >= 0 ? (cells[reasonAt] || '').trim() : '') || defaults.reason,
      problem: '',
    };
    if (!code) row.problem = 'No employee code';
    else if (!employee) row.problem = 'Employee code not found';
    else if (seen.has(code.toUpperCase())) row.problem = 'Code appears twice in the sheet';
    else if (!rawSalary) row.problem = 'Salary left blank';
    else if (!Number.isFinite(newSalary) || newSalary <= 1) row.problem = 'Salary must be a number above 1';
    else if (newSalary > 10_000_000) row.problem = 'Salary looks wrong (over PKR 10 million)';
    else if (date === null) row.problem = 'Effective date unreadable (use YYYY-MM-DD or DD/MM/YYYY)';
    else if (employee.status === 'Terminated') row.problem = 'Employee has left';
    else if (Math.round(employee.basicSalary || 0) === Math.round(newSalary)) row.problem = 'Same as current salary';
    seen.add(code.toUpperCase());
    rows.push(row);
  }
  if (!rows.length) errors.push('The sheet has a header row but no employee rows.');
  return { rows, usable: rows.filter(r => !r.problem), errors };
}


/** The template to fill in: current staff, those without a real salary first. */
export function salarySheetTemplate(employees: Employee[], branchName: (id: string) => string): string {
  const current = employees.filter(e => e.status !== 'Terminated')
    .sort((a, b) => Number((a.basicSalary || 0) > 1) - Number((b.basicSalary || 0) > 1) || (a.employeeCode || '').localeCompare(b.employeeCode || '', undefined, { numeric: true }));
  const rows = [['Employee Code', 'Employee Name', 'Branch', 'Current Basic Salary', 'Basic Salary', 'Effective Date', 'Reason'],
    ...current.map(e => [e.employeeCode, e.fullName, branchName(e.branchId), (e.basicSalary || 0) > 1 ? e.basicSalary : '', '', '', ''])];
  return '﻿' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
