import type { Employee, PayrollRun, Payslip } from '../types';

/**
 * Bank and statutory upload layouts differ per institution and change over time, so they are data,
 * not code: an administrator transcribes the bank's corporate file specification into a template,
 * a second user approves it with the rest of the statutory configuration, and exports render from it.
 */
export type ExportKind = 'Bank Advice' | 'EOBI Return' | 'Social Security Return';
export type ExportFormat = 'Delimited' | 'Fixed Width';
export type ColumnFormat = 'text' | 'upper' | 'digits' | 'amount-2dp' | 'amount-int' | 'amount-paisa' | 'date-yyyymmdd' | 'date-ddmmyyyy' | 'date-dd/mm/yyyy';

export interface ExportColumn {
  title: string;
  /** Row token such as {iban} or literal text; several tokens may be combined. */
  value: string;
  format?: ColumnFormat;
  width?: number;
  align?: 'left' | 'right';
  pad?: string;
  required?: boolean;
}

export interface ExportTemplate {
  id: string;
  name: string;
  kind: ExportKind;
  bank?: string;
  format: ExportFormat;
  delimiter?: string;
  quoteValues?: boolean;
  includeColumnTitles?: boolean;
  headerLines?: string[];
  trailerLines?: string[];
  columns: ExportColumn[];
  fileExtension?: 'csv' | 'txt';
  debitAccount?: string;
  /** Bank / regulator document the layout was transcribed from (title, version, date). */
  specReference?: string;
  verified?: boolean;
}

export const ROW_TOKENS = ['sequence', 'employeeCode', 'employeeName', 'cnic', 'iban', 'accountNumber', 'bankName', 'bankBranch', 'netSalary', 'grossSalary', 'basicEarnings',
  'eobiNumber', 'eobiEmployee', 'eobiEmployer', 'eobiTotal', 'socialSecurityNumber', 'socialSecurityEmployer', 'province', 'contactNumber'] as const;
export const BATCH_TOKENS = ['batchReference', 'period', 'valueDate', 'debitAccount', 'recordCount', 'totalAmount', 'controlHash', 'companyName', 'generatedOn'] as const;

export interface ExportContext {
  run: PayrollRun;
  companyName: string;
  valueDate: string;
  batchReference: string;
  employees: Employee[];
}

export interface ExportResult { content: string; filename: string; recordCount: number; totalAmount: number; controlHash: string; errors: string[]; warnings: string[] }

const amountOf = (kind: ExportKind, sheet: Payslip) => kind === 'Bank Advice' ? sheet.netSalary
  : kind === 'EOBI Return' ? sheet.eobiEmployeeDeduction + sheet.eobiEmployerContribution : sheet.pessiEmployerContribution;

function rowValues(sheet: Payslip, employee: Employee | undefined, index: number): Record<string, string | number> {
  return {
    sequence: index + 1, employeeCode: sheet.employeeCode, employeeName: sheet.employeeName, cnic: sheet.cnic,
    iban: (sheet.retryIban || sheet.iban || '').replace(/\s/g, '').toUpperCase(), accountNumber: (sheet.retryBankAccountNumber || sheet.bankAccountNumber || '').replace(/\s/g, ''),
    bankName: sheet.retryBankName || sheet.bankName, bankBranch: employee?.bankBranchName || '', netSalary: sheet.netSalary, grossSalary: sheet.grossSalary,
    basicEarnings: sheet.basicEarnings, eobiNumber: employee?.eobiNumber || '', eobiEmployee: sheet.eobiEmployeeDeduction, eobiEmployer: sheet.eobiEmployerContribution,
    eobiTotal: sheet.eobiEmployeeDeduction + sheet.eobiEmployerContribution, socialSecurityNumber: employee?.socialSecurityNumber || '',
    socialSecurityEmployer: sheet.pessiEmployerContribution, province: sheet.province || '', contactNumber: employee?.contactNumber || '',
  };
}

function formatValue(raw: string | number, format: ColumnFormat = 'text'): string {
  const text = String(raw ?? '');
  const number = Number(raw);
  switch (format) {
    case 'upper': return text.toUpperCase();
    case 'digits': return text.replace(/\D/g, '');
    case 'amount-2dp': return Number.isFinite(number) ? number.toFixed(2) : '';
    case 'amount-int': return Number.isFinite(number) ? String(Math.round(number)) : '';
    case 'amount-paisa': return Number.isFinite(number) ? String(Math.round(number * 100)) : '';
    case 'date-yyyymmdd': return text.replace(/-/g, '').slice(0, 8);
    case 'date-ddmmyyyy': return /^\d{4}-\d{2}-\d{2}/.test(text) ? `${text.slice(8, 10)}${text.slice(5, 7)}${text.slice(0, 4)}` : text;
    case 'date-dd/mm/yyyy': return /^\d{4}-\d{2}-\d{2}/.test(text) ? `${text.slice(8, 10)}/${text.slice(5, 7)}/${text.slice(0, 4)}` : text;
    default: return text;
  }
}

const substitute = (pattern: string, values: Record<string, string | number>) =>
  pattern.replace(/\{(\w+)\}/g, (_match, token: string) => token in values ? String(values[token] ?? '') : `{${token}}`);

// FNV-1a over the data rows gives the bank-independent control value printed in trailers and audit.
function controlHash(lines: string[]): string {
  let hash = 0x811c9dc5;
  const text = lines.join('\n');
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export function renderExport(template: ExportTemplate, payslips: Payslip[], context: ExportContext): ExportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!template.columns.length) errors.push('The template has no columns.');
  if (!template.verified) warnings.push(`"${template.name}" has not been verified against the ${template.bank || 'institution'} specification. Run a test batch before uploading.`);
  const sheets = payslips.filter(sheet => sheet.payrollRunId === context.run.id && amountOf(template.kind, sheet) > 0)
    .sort((a, b) => (a.employeeCode || '').localeCompare(b.employeeCode || ''));
  if (!sheets.length) errors.push('No payable rows for this template.');
  const separator = template.format === 'Delimited' ? (template.delimiter ?? ',') : '';
  const cell = (value: string) => template.format === 'Delimited' && template.quoteValues ? `"${(/^[=+\-@]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"` : value;

  const fixedBatch: Record<string, string | number> = {
    batchReference: context.batchReference, period: `${context.run.periodYear}${String(context.run.periodMonth).padStart(2, '0')}`, valueDate: context.valueDate,
    debitAccount: template.debitAccount || '', companyName: context.companyName, generatedOn: new Date().toISOString().slice(0, 10),
  };
  const dataLines = sheets.map((sheet, index) => {
    const values = { ...fixedBatch, ...rowValues(sheet, context.employees.find(item => item.id === sheet.employeeId), index) };
    return template.columns.map(column => {
      let value = formatValue(substitute(column.value, values), column.format);
      if (column.required && !value.trim()) errors.push(`${sheet.employeeCode}: "${column.title}" is empty.`);
      if (template.kind === 'Bank Advice' && column.value.includes('{iban}') && value && !/^PK\d{2}[A-Z0-9]{20}$/.test(value)) errors.push(`${sheet.employeeCode}: IBAN is not a valid Pakistan IBAN.`);
      if (template.format === 'Delimited' && separator && value.includes(separator) && !template.quoteValues) errors.push(`${sheet.employeeCode}: "${column.title}" contains the delimiter.`);
      if (template.format === 'Fixed Width') {
        const width = Math.max(1, column.width || value.length || 1);
        if (value.length > width) { errors.push(`${sheet.employeeCode}: "${column.title}" is ${value.length} characters; the field allows ${width}.`); value = value.slice(0, width); }
        const pad = (column.pad || ' ').slice(0, 1);
        value = column.align === 'right' ? value.padStart(width, pad) : value.padEnd(width, pad);
      }
      return cell(value);
    }).join(separator);
  });

  const totalAmount = sheets.reduce((sum, sheet) => sum + amountOf(template.kind, sheet), 0);
  const hash = controlHash(dataLines);
  const batch: Record<string, string | number> = { ...fixedBatch, recordCount: sheets.length, totalAmount: totalAmount.toFixed(2), controlHash: hash };
  if (template.kind === 'Bank Advice' && [...(template.headerLines || []), ...(template.trailerLines || [])].some(line => line.includes('{debitAccount}')) && !template.debitAccount) {
    errors.push('The template uses {debitAccount} but no debit account is configured.');
  }
  const renderBatch = (line: string) => substitute(line, batch).replace(/\{(\w+)\|([\w/-]+)\}/g, (_match, token: string, format: string) => formatValue(batch[token] ?? '', format as ColumnFormat));
  const titles = template.format === 'Delimited' && template.includeColumnTitles ? [template.columns.map(column => cell(column.title)).join(separator)] : [];
  const unresolved = [...(template.headerLines || []), ...(template.trailerLines || []), ...template.columns.map(column => column.value)].join(' ').match(/\{(\w+)\}/g) || [];
  for (const token of new Set(unresolved)) if (![...ROW_TOKENS, ...BATCH_TOKENS].includes(token.slice(1, -1) as never)) errors.push(`Unknown token ${token} in template.`);
  const lines = [...(template.headerLines || []).map(renderBatch), ...titles, ...dataLines, ...(template.trailerLines || []).map(renderBatch)];
  const slug = template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    content: lines.join('\r\n') + '\r\n', recordCount: sheets.length, totalAmount, controlHash: hash, errors: [...new Set(errors)], warnings,
    filename: `${slug}-${batch.period}-${context.batchReference}.${template.fileExtension || (template.format === 'Delimited' ? 'csv' : 'txt')}`,
  };
}

const bankColumns: ExportColumn[] = [
  { title: 'Sequence', value: '{sequence}' }, { title: 'Beneficiary Name', value: '{employeeName}', format: 'upper', required: true },
  { title: 'IBAN', value: '{iban}', required: true }, { title: 'Amount', value: '{netSalary}', format: 'amount-2dp', required: true },
  { title: 'Reference', value: 'SAL{period}-{employeeCode}' },
];

// Starter layouts are deliberately unverified: they show the structure to adapt, not a bank-accepted format.
export const STARTER_EXPORT_TEMPLATES: ExportTemplate[] = [
  { id: 'tpl-generic-csv', name: 'Generic bank advice CSV', kind: 'Bank Advice', format: 'Delimited', delimiter: ',', quoteValues: true, includeColumnTitles: true,
    columns: [{ title: 'Employee Code', value: '{employeeCode}' }, { title: 'Beneficiary Name', value: '{employeeName}', required: true }, { title: 'Bank', value: '{bankName}' },
      { title: 'IBAN', value: '{iban}', required: true }, { title: 'Account Number', value: '{accountNumber}' }, { title: 'Net Amount PKR', value: '{netSalary}', format: 'amount-2dp', required: true }],
    trailerLines: ['"TOTAL","{recordCount} records","","","","{totalAmount}"'], verified: true, specReference: 'Internal review format (not for bank upload)' },
  ...['HBL', 'UBL', 'Meezan Bank', 'MCB', 'Bank Alfalah', 'Allied Bank', 'Standard Chartered'].map(bank => ({
    id: `tpl-${bank.toLowerCase().replace(/[^a-z]+/g, '-')}`, name: `${bank} bulk salary (configure from bank spec)`, kind: 'Bank Advice' as const, bank,
    format: 'Delimited' as const, delimiter: ',', quoteValues: false, includeColumnTitles: false,
    headerLines: ['H,{batchReference},{debitAccount},{valueDate|date-ddmmyyyy},{recordCount},{totalAmount}'], columns: bankColumns,
    trailerLines: ['T,{recordCount},{totalAmount},{controlHash}'], verified: false,
  })),
  { id: 'tpl-eobi-return', name: 'EOBI contribution schedule (configure from EOBI portal spec)', kind: 'EOBI Return', format: 'Delimited', delimiter: ',', quoteValues: true, includeColumnTitles: true,
    columns: [{ title: 'EOBI Registration No', value: '{eobiNumber}', required: true }, { title: 'CNIC', value: '{cnic}', format: 'digits', required: true }, { title: 'Name', value: '{employeeName}' },
      { title: 'Employee Share', value: '{eobiEmployee}', format: 'amount-int' }, { title: 'Employer Share', value: '{eobiEmployer}', format: 'amount-int' }, { title: 'Total', value: '{eobiTotal}', format: 'amount-int' }],
    verified: false },
  { id: 'tpl-social-security-return', name: 'Provincial social security schedule (configure from PESSI/SESSI spec)', kind: 'Social Security Return', format: 'Delimited', delimiter: ',', quoteValues: true, includeColumnTitles: true,
    columns: [{ title: 'SS Registration No', value: '{socialSecurityNumber}', required: true }, { title: 'CNIC', value: '{cnic}', format: 'digits', required: true }, { title: 'Name', value: '{employeeName}' },
      { title: 'Contributory Wage', value: '{basicEarnings}', format: 'amount-int' }, { title: 'Employer Contribution', value: '{socialSecurityEmployer}', format: 'amount-int' }],
    verified: false },
];

export function exportTemplatesFor(config: { exportTemplates?: ExportTemplate[] } | undefined, kind: ExportKind): ExportTemplate[] {
  const configured = config?.exportTemplates?.length ? config.exportTemplates : STARTER_EXPORT_TEMPLATES;
  return configured.filter(template => template.kind === kind);
}
