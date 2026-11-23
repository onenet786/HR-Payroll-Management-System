import type { LoanAdvance, Payslip } from '../types';

/** One loan's recovery on a payslip; disbursement applies exactly these amounts to the loan ledger. */
export interface PayslipLoanDeduction { loanId: string; amount: number }

/** Payslip as stored after computePayslipDetails / computeFinalSettlementPayslip (older payslips have no lines). */
export type PayslipWithLoanLines = Payslip & { loanDeductions?: PayslipLoanDeduction[] };

/** What is still owed on a loan: approved amount less repayments (legacy loans without an amount: installments left). */
export function loanOutstanding(loan: LoanAdvance): number {
  return loan.approvedAmount > 0 ? Math.max(0, loan.approvedAmount - (loan.totalRepaid || 0)) : loan.monthlyInstallment * Math.max(0, loan.remainingInstallments);
}

const recoverable = (loan: LoanAdvance, employeeId: string, periodEnd?: string) => loan.employeeId === employeeId && loan.status === 'Active'
  && loan.remainingInstallments > 0 && !(periodEnd && loan.disbursedDate && loan.disbursedDate > periodEnd);

/**
 * Regular-month installments: each active loan disbursed by the end of the period pays its monthly installment,
 * never more than its outstanding balance.
 */
export function loanInstallmentsForPeriod(employeeId: string, loans: LoanAdvance[], periodEnd?: string): PayslipLoanDeduction[] {
  return loans.filter(loan => recoverable(loan, employeeId, periodEnd))
    .map(loan => ({ loanId: loan.id, amount: Math.round(Math.max(0, Math.min(loan.monthlyInstallment, loanOutstanding(loan)))) }))
    .filter(line => line.amount > 0);
}

/** Splits a recovery amount (e.g. a final settlement) over the employee's loans, oldest first, up to each balance. */
export function allocateLoanRecovery(employeeId: string, loans: LoanAdvance[], amount: number): PayslipLoanDeduction[] {
  let left = Math.max(0, amount);
  const lines: PayslipLoanDeduction[] = [];
  for (const loan of loans.filter(item => recoverable(item, employeeId)).sort((a, b) => (a.disbursedDate || '').localeCompare(b.disbursedDate || ''))) {
    if (left <= 0) break;
    const share = Math.min(left, loanOutstanding(loan));
    if (share > 0) { lines.push({ loanId: loan.id, amount: share }); left -= share; }
  }
  return lines;
}

/**
 * Applies a disbursed run's loan recoveries to the loan ledger. Payslips carry per-loan lines; payslips created
 * before the lines existed fall back to one capped installment per active loan of an employee who had a recovery.
 */
export function applyLoanRepayments(loans: LoanAdvance[], payslips: PayslipWithLoanLines[]): { loans: LoanAdvance[]; changedLoanIds: Set<string> } {
  const paid = new Map<string, number>();
  for (const sheet of payslips) {
    if (!(sheet.loanRepaymentDeduction > 0)) continue;
    const lines = Array.isArray(sheet.loanDeductions) ? sheet.loanDeductions
      : loanInstallmentsForPeriod(sheet.employeeId, loans, sheet.periodMonth && sheet.periodYear
        ? `${sheet.periodYear}-${String(sheet.periodMonth).padStart(2, '0')}-${String(new Date(sheet.periodYear, sheet.periodMonth, 0).getDate()).padStart(2, '0')}` : undefined);
    for (const line of lines) if (line.amount > 0) paid.set(line.loanId, (paid.get(line.loanId) || 0) + line.amount);
  }
  const changedLoanIds = new Set<string>();
  const updated = loans.map(loan => {
    const amount = paid.get(loan.id);
    if (!amount || loan.status !== 'Active' || loan.remainingInstallments <= 0) return loan;
    changedLoanIds.add(loan.id);
    const totalRepaid = (loan.totalRepaid || 0) + amount;
    const balanceAfter = loanOutstanding({ ...loan, totalRepaid, remainingInstallments: loan.remainingInstallments - 1 });
    const settled = loan.approvedAmount > 0 ? balanceAfter <= 0 : loan.remainingInstallments - 1 <= 0 || amount >= loanOutstanding(loan);
    // A balance left after the last scheduled installment keeps one installment open so it is still recovered.
    const remainingInstallments = settled ? 0 : Math.max(1, loan.remainingInstallments - 1);
    return { ...loan, totalRepaid, remainingInstallments, status: (settled ? 'Closed' : 'Active') as LoanAdvance['status'] };
  });
  return { loans: updated, changedLoanIds };
}
