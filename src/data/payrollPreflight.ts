import type { Branch, Employee, Payslip, StatutoryConfig, WageType } from '../types';
import { resolveWageBasis } from './masterData';
import { employeeProvince, provincialPolicy } from './provincialCompliance';

export type PayrollPreflightSeverity = 'Critical' | 'Warning';

export interface PayrollPreflightIssue {
  employeeId: string;
  employeeName: string;
  severity: PayrollPreflightSeverity;
  code: 'INVALID_CNIC' | 'DUPLICATE_CNIC' | 'MISSING_BANK' | 'INVALID_IBAN' | 'DUPLICATE_BANK_ACCOUNT' | 'MISSING_NTN' | 'NON_POSITIVE_NET' | 'NET_VARIANCE' | 'BELOW_MINIMUM_WAGE' | 'MISSING_EOBI_REASON' | 'MISSING_SOCIAL_SECURITY_REASON';
  message: string;
}

export function payrollPreflight(employees: Employee[], draftPayslips: Payslip[], historicalPayslips: Payslip[], branches?: Branch[], statutoryConfig?: StatutoryConfig, wageTypes: WageType[] = []): PayrollPreflightIssue[] {
  const issues: PayrollPreflightIssue[] = [];
  const normalizeIdentity = (value?: string) => (value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const duplicateCNICs = new Map<string, Employee[]>();
  const duplicateBankAccounts = new Map<string, Employee[]>();
  for (const employee of employees.filter(item => item.status !== 'Terminated')) {
    const cnic = normalizeIdentity(employee.cnic);
    // Prefer IBAN when present; an account number alone is only comparable inside the same bank.
    const bankIdentity = normalizeIdentity(employee.iban) || `${normalizeIdentity(employee.bankName)}:${normalizeIdentity(employee.bankAccountNumber)}`;
    if (cnic) duplicateCNICs.set(cnic, [...(duplicateCNICs.get(cnic) || []), employee]);
    if (bankIdentity && bankIdentity !== ':') duplicateBankAccounts.set(bankIdentity, [...(duplicateBankAccounts.get(bankIdentity) || []), employee]);
  }
  for (const sheet of draftPayslips) {
    const employee = employees.find(item => item.id === sheet.employeeId);
    if (!employee) continue;
    const add = (severity: PayrollPreflightSeverity, code: PayrollPreflightIssue['code'], message: string) =>
      issues.push({ employeeId: employee.id, employeeName: employee.fullName, severity, code, message });
    if (!/^\d{5}-\d{7}-\d$/.test(employee.cnic || '')) add('Critical', 'INVALID_CNIC', 'CNIC is missing or invalid.');
    const cnicMatches = duplicateCNICs.get(normalizeIdentity(employee.cnic)) || [];
    if (cnicMatches.length > 1) add('Critical', 'DUPLICATE_CNIC', `CNIC is also assigned to ${cnicMatches.filter(item => item.id !== employee.id).map(item => item.fullName).join(', ')}. Resolve the duplicate before payroll.`);
    if (!employee.bankName?.trim() || !employee.bankAccountNumber?.trim()) add('Critical', 'MISSING_BANK', 'Bank name or account number is missing.');
    if (employee.iban && !/^PK\d{2}[A-Z0-9]{20}$/i.test(employee.iban.replace(/\s/g, ''))) add('Critical', 'INVALID_IBAN', 'IBAN must be a valid 24-character Pakistan IBAN.');
    if (employee.fbrEnabled !== false && !employee.ntn?.trim()) add('Warning', 'MISSING_NTN', 'FBR withholding is enabled but the employee NTN is not recorded.');
    const bankIdentity = normalizeIdentity(employee.iban) || `${normalizeIdentity(employee.bankName)}:${normalizeIdentity(employee.bankAccountNumber)}`;
    const bankMatches = duplicateBankAccounts.get(bankIdentity) || [];
    if (bankIdentity !== ':' && bankMatches.length > 1) add('Warning', 'DUPLICATE_BANK_ACCOUNT', `Payment account is also used by ${bankMatches.filter(item => item.id !== employee.id).map(item => item.fullName).join(', ')}. Confirm this shared account is legitimate before release.`);
    if (!Number.isFinite(sheet.netSalary) || sheet.netSalary <= 0) add('Critical', 'NON_POSITIVE_NET', 'Net salary is zero or negative.');
    if (branches && statutoryConfig) {
      const province = employeeProvince(employee, branches);
      const policy = provincialPolicy(statutoryConfig, province, branches.find(branch => branch.id === employee.branchId)?.establishmentType);
      const monthlyBasic = resolveWageBasis(employee, wageTypes) === 'Daily' ? employee.basicSalary * 26 : employee.basicSalary;
      if (monthlyBasic < policy.minimumWage) add('Critical', 'BELOW_MINIMUM_WAGE', `Basic wage is below the ${policy.province} configured minimum wage of PKR ${policy.minimumWage.toLocaleString()}.`);
      if (employee.eobiEnabled === false && !employee.eobiExemptionReason?.trim()) add('Warning', 'MISSING_EOBI_REASON', 'EOBI is disabled without a documented exemption reason.');
      if (!employee.socialSecurityNumber && !employee.socialSecurityExemptionReason?.trim()) add('Warning', 'MISSING_SOCIAL_SECURITY_REASON', `${policy.scheme} registration is missing without a documented exemption reason.`);
    }
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
