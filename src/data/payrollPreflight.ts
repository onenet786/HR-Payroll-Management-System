import type { Employee, Payslip } from '../types';

export type PayrollPreflightSeverity = 'Critical' | 'Warning';

export interface PayrollPreflightIssue {
  employeeId: string;
  employeeName: string;
  severity: PayrollPreflightSeverity;
  code: 'INVALID_CNIC' | 'MISSING_BANK' | 'INVALID_IBAN' | 'NON_POSITIVE_NET' | 'NET_VARIANCE';
  message: string;
}

export function payrollPreflight(employees: Employee[], draftPayslips: Payslip[], historicalPayslips: Payslip[]): PayrollPreflightIssue[] {
  const issues: PayrollPreflightIssue[] = [];
  for (const sheet of draftPayslips) {
    const employee = employees.find(item => item.id === sheet.employeeId);
    if (!employee) continue;
    const add = (severity: PayrollPreflightSeverity, code: PayrollPreflightIssue['code'], message: string) =>
      issues.push({ employeeId: employee.id, employeeName: employee.fullName, severity, code, message });
    if (!/^\d{5}-\d{7}-\d$/.test(employee.cnic || '')) add('Critical', 'INVALID_CNIC', 'CNIC is missing or invalid.');
    if (!employee.bankName?.trim() || !employee.bankAccountNumber?.trim()) add('Critical', 'MISSING_BANK', 'Bank name or account number is missing.');
    if (employee.iban && !/^PK\d{2}[A-Z0-9]{20}$/i.test(employee.iban.replace(/\s/g, ''))) add('Critical', 'INVALID_IBAN', 'IBAN must be a valid 24-character Pakistan IBAN.');
    if (!Number.isFinite(sheet.netSalary) || sheet.netSalary <= 0) add('Critical', 'NON_POSITIVE_NET', 'Net salary is zero or negative.');
    const previous = historicalPayslips
      .filter(item => item.employeeId === employee.id && item.payrollRunId !== sheet.payrollRunId)
      .sort((a, b) => (b.periodYear || 0) - (a.periodYear || 0) || (b.periodMonth || 0) - (a.periodMonth || 0))[0];
    if (previous?.netSalary > 0) {
      const variance = Math.abs(sheet.netSalary - previous.netSalary) / previous.netSalary;
      if (variance >= 0.25) add('Warning', 'NET_VARIANCE', `Net salary changed by ${Math.round(variance * 100)}% from the previous payroll.`);
    }
  }
  return issues;
}
