import type { PayrollAdjustmentType } from '../types';

/**
 * Catalogue of pay components that can be added to a payslip as approved adjustments. "Systematic" components
 * (late fine, absent deduction, early-coming reward) are computed by payroll and are not entered by hand.
 * server/documents.cjs mirrors ADJUSTMENT_TYPES and NON_TAXABLE_TYPES.
 */
export type PayrollComponentKind = 'earning' | 'deduction';
export interface PayrollComponent {
  type: PayrollAdjustmentType;
  kind: PayrollComponentKind;
  /** Manual = typed in; Import = usually loaded from a CSV (e.g. the sales system); Systematic = calculated. */
  source: 'Manual' | 'Import' | 'Systematic';
  /** Default for the taxable checkbox; non-taxable kinds cannot be made taxable. */
  taxable: boolean;
}

export const PAYROLL_COMPONENTS: PayrollComponent[] = [
  { type: 'Bonus', kind: 'earning', source: 'Manual', taxable: true },
  { type: 'Commission', kind: 'earning', source: 'Import', taxable: true },
  { type: 'Tip', kind: 'earning', source: 'Import', taxable: true },
  { type: 'Arrears', kind: 'earning', source: 'Manual', taxable: true },
  { type: 'Fuel Allowance', kind: 'earning', source: 'Manual', taxable: true },
  { type: 'Funeral Allowance', kind: 'earning', source: 'Manual', taxable: false },
  { type: 'Grading Reward', kind: 'earning', source: 'Manual', taxable: true },
  { type: 'Surprise Reward', kind: 'earning', source: 'Manual', taxable: true },
  { type: 'Reimbursement', kind: 'earning', source: 'Manual', taxable: false },
  { type: 'Deduction', kind: 'deduction', source: 'Manual', taxable: false },
  { type: 'Penalty / Warning', kind: 'deduction', source: 'Manual', taxable: false },
  { type: 'Short Cash', kind: 'deduction', source: 'Manual', taxable: false },
  { type: 'Shopping', kind: 'deduction', source: 'Manual', taxable: false },
  { type: 'Uniform', kind: 'deduction', source: 'Manual', taxable: false },
  { type: 'Advance (STA)', kind: 'deduction', source: 'Manual', taxable: false },
  { type: 'Loan (LTA)', kind: 'deduction', source: 'Manual', taxable: false },
  { type: 'EOBI', kind: 'deduction', source: 'Manual', taxable: false },
  { type: 'Tax Adjustment', kind: 'deduction', source: 'Manual', taxable: false },
];

export const ADJUSTMENT_TYPES = PAYROLL_COMPONENTS.map(component => component.type);
export const componentOf = (type: string): PayrollComponent | undefined => PAYROLL_COMPONENTS.find(component => component.type === type);
export const isDeductionType = (type: string) => componentOf(type)?.kind === 'deduction';
export const isNonTaxableType = (type: string) => componentOf(type)?.taxable === false;
export const IMPORTABLE_TYPES: PayrollAdjustmentType[] = ['Commission', 'Tip'];
/** Earnings that already have their own payslip line; everything else is itemised under "other adjustments". */
export const DEDICATED_LINE_TYPES: PayrollAdjustmentType[] = ['Bonus', 'Commission', 'Arrears', 'Reimbursement', 'Deduction', 'Tax Adjustment'];
/** The six types every installation had before the catalogue; shown unless the extended components option is on. */
export const STANDARD_ADJUSTMENT_TYPES: PayrollAdjustmentType[] = ['Bonus', 'Commission', 'Arrears', 'Reimbursement', 'Deduction', 'Tax Adjustment'];

/** Splits one CSV line on `separator`, keeping quoted cells (including quoted separators) intact. */
export function splitCsvLine(line: string, separator: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; } else quoted = !quoted;
    } else if (char === separator && !quoted) { cells.push(current.trim()); current = ''; } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

export interface ImportedAdjustmentRow { employeeCode: string; type: PayrollAdjustmentType; amount: number; reason: string; line: number }

/**
 * Parses a CSV exported from the sales system: columns employee code, type, amount, reason (header optional,
 * comma or semicolon separated). Unknown types and bad amounts are reported with their line number.
 */
export function parseAdjustmentCsv(text: string, allowedTypes: PayrollAdjustmentType[] = IMPORTABLE_TYPES): { rows: ImportedAdjustmentRow[]; errors: string[] } {
  const rows: ImportedAdjustmentRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  lines.forEach((line, index) => {
    const cells = splitCsvLine(line, line.includes(';') && !line.includes(',') ? ';' : ',');
    if (index === 0 && /employee|code/i.test(cells[0] || '') && !Number.isFinite(Number(cells[2]))) return; // header
    const [employeeCode, rawType, rawAmount, ...rest] = cells;
    const type = allowedTypes.find(item => item.toLowerCase() === String(rawType || '').toLowerCase());
    const amount = Number(String(rawAmount || '').replace(/[^0-9.-]/g, ''));
    if (!employeeCode) { errors.push(`Line ${index + 1}: employee code is missing.`); return; }
    if (!type) { errors.push(`Line ${index + 1}: type "${rawType || ''}" is not importable (allowed: ${allowedTypes.join(', ')}).`); return; }
    if (!Number.isFinite(amount) || amount <= 0) { errors.push(`Line ${index + 1}: amount "${rawAmount || ''}" must be a positive number.`); return; }
    rows.push({ employeeCode: employeeCode.toUpperCase(), type, amount: Math.round(amount * 100) / 100, reason: rest.join(', ').trim() || `${type} import`, line: index + 1 });
  });
  return { rows, errors };
}
