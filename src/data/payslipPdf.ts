import type { Payslip } from '../types';

const money = (value: number | undefined) => `PKR ${Math.round(value || 0).toLocaleString('en-PK')}`;
// The built-in Helvetica font only covers Latin-1, so the PDF is the authoritative English record;
// the Urdu view is offered on screen.
const pdfText = (value: string) => value.replace(/[\\()]/g, character => `\\${character}`).replace(/[^\x20-\x7E]/g, '?');
const maskAccount = (value?: string) => value ? `****${value.replace(/\s/g, '').slice(-4)}` : '-';

export function payslipPdfLines(sheet: Payslip, companyName: string): Array<[string, string]> {
  const period = sheet.periodMonth && sheet.periodYear ? `${sheet.periodYear}-${String(sheet.periodMonth).padStart(2, '0')}` : '';
  const rows: Array<[string, string, number | undefined]> = [
    ['Basic earnings', '', sheet.basicEarnings], ['House rent allowance', '', sheet.houseRentAllowance], ['Conveyance allowance', '', sheet.conveyanceAllowance],
    ['Medical allowance', '', sheet.medicalAllowance], ['Other allowances', '', sheet.otherAllowances], ['Overtime', `${sheet.overtimeHours || 0} h`, sheet.overtimePay],
    ['Bonus', '', sheet.bonusEarnings], ['Commission', '', sheet.commissionEarnings], ['Arrears', '', sheet.arrearsEarnings],
    ['Early coming reward', `${sheet.earlyDays || 0} day(s)`, sheet.earlyComingReward],
    ...(sheet.adjustmentLines || []).filter(line => line.kind === 'earning').map(line => [line.type, '', line.amount] as [string, string, number | undefined]),
    ['Gratuity', '', sheet.settlementGratuity], ['Leave encashment', '', sheet.settlementLeaveEncashment], ['Notice pay', '', sheet.settlementNoticePay],
    ['Absence / unpaid leave deduction', `${sheet.daysAbsent || 0} day(s)`, sheet.unpaidLeaveDeduction ? -sheet.unpaidLeaveDeduction : 0],
  ];
  const deductions: Array<[string, number | undefined]> = [
    ['FBR income tax', sheet.incomeTaxDeduction], ['Tax adjustment', sheet.manualTaxAdjustment], ['EOBI (employee)', sheet.eobiEmployeeDeduction],
    ['Provident fund (employee)', sheet.providentFundDeduction], ['Loan / advance recovery', sheet.loanRepaymentDeduction],
    [`Late fine (${sheet.lateDays || 0} late day(s))`, sheet.lateFineDeduction],
    ...(sheet.adjustmentLines || []).filter(line => line.kind === 'deduction').map(line => [line.type, line.amount] as [string, number | undefined]),
    ['Other deductions', (sheet.otherAdjustmentsDeduction || 0) - (sheet.adjustmentLines || []).filter(line => line.kind === 'deduction').reduce((sum, line) => sum + line.amount, 0)],
  ];
  return [
    [`${companyName} - Confidential Payslip`, ''],
    [`Period ${period}${sheet.runType && sheet.runType !== 'Regular' ? ` (${sheet.runType})` : ''}`, ''],
    [`${sheet.employeeName} (${sheet.employeeCode})`, `${sheet.designationTitle} - ${sheet.departmentName}`],
    [`Bank: ${sheet.bankName || '-'} ${maskAccount(sheet.iban || sheet.bankAccountNumber)}`, `Paid days: ${sheet.paidDays ?? sheet.daysPresent}`],
    ['', ''], ['EARNINGS', ''],
    ...rows.filter(([, , amount]) => Boolean(amount)).map(([label, note, amount]) => [`${label}${note ? ` (${note})` : ''}`, money(amount)] as [string, string]),
    ['Gross salary', money(sheet.grossSalary)],
    ...(sheet.reimbursements ? [['Reimbursements (non-taxable)', money(sheet.reimbursements)] as [string, string]] : []),
    ['', ''], ['DEDUCTIONS', ''],
    ...deductions.filter(([, amount]) => Boolean(amount)).map(([label, amount]) => [label, money(amount)] as [string, string]),
    ['Total deductions', money(sheet.totalDeductions)],
    ['', ''], ['NET SALARY', money(sheet.netSalary)], ['', ''],
    ['EMPLOYER CONTRIBUTIONS (not deducted)', ''],
    ['EOBI (employer)', money(sheet.eobiEmployerContribution)], ['Provincial social security', money(sheet.pessiEmployerContribution)], ['Provident fund (employer)', money(sheet.providentFundEmployerContribution)],
    ['', ''],
    [`Tax year ${sheet.taxYear || '-'}: taxable income YTD ${money(sheet.taxableIncomeYtd)}; projected annual liability ${money(sheet.projectedAnnualTaxLiability)}`, ''],
    ['Computer-generated payslip. Report discrepancies to HR within 7 days.', ''],
  ];
}

export function payslipPdfBytes(sheet: Payslip, companyName: string): Uint8Array {
  const lines = payslipPdfLines(sheet, companyName);
  const commands = ['BT', '/F1 10 Tf'];
  let y = 790;
  for (const [left, right] of lines) {
    y -= left.toUpperCase() === left && left && !right ? 18 : 15;
    const bold = /^(EARNINGS|DEDUCTIONS|NET SALARY|EMPLOYER)/.test(left) || /Confidential Payslip$/.test(left);
    commands.push(`/${bold ? 'F2' : 'F1'} ${bold ? 11 : 10} Tf`, `1 0 0 1 50 ${y} Tm (${pdfText(left)}) Tj`);
    if (right) commands.push(`1 0 0 1 ${right.startsWith('PKR') ? 420 : 330} ${y} Tm (${pdfText(right)}) Tj`);
  }
  commands.push('ET');
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Every character is ASCII after pdfText, so string length equals byte length.
  return new TextEncoder().encode(pdf);
}

export function downloadPayslipPdf(sheet: Payslip, companyName: string) {
  const url = URL.createObjectURL(new Blob([payslipPdfBytes(sheet, companyName)], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `payslip-${sheet.periodYear}-${String(sheet.periodMonth).padStart(2, '0')}-${sheet.employeeCode}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
