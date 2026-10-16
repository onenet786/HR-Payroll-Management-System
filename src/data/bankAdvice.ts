import type { Payslip } from '../types';

export function bankAdvicePayload(payslips: Payslip[]): string {
  return JSON.stringify(payslips.slice().sort((a, b) => a.id.localeCompare(b.id)).map(item => ({
    id: item.id, employeeId: item.employeeId, employeeCode: item.employeeCode,
    bankName: item.bankName, iban: (item.iban || '').replace(/\s/g, '').toUpperCase(),
    bankAccountNumber: item.bankAccountNumber, netSalary: item.netSalary,
  })));
}

export async function bankAdviceChecksum(payslips: Payslip[]): Promise<string> {
  const bytes = new TextEncoder().encode(bankAdvicePayload(payslips));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
