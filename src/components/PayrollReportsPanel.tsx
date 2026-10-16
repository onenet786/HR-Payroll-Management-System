import React, { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import type { Company, Employee, GratuitySettlement, PayrollAdjustment, PayrollRun, Payslip, StatutoryConfig, WageType } from '../types';
import { retroAttendanceAdjustment } from '../data/offCyclePayroll';
import {
  annualTaxCertificateHtml, annualTaxCertificatesCsv, gratuityProvision, missingRegistrationReport, providentFundLedger,
  taxDepositLines, taxDepositReconciliation, taxReconciliationReport, taxYearOfPeriod, type CsvReport,
} from '../data/payrollLedgers';
import { openPrintableHtml } from '../data/lifecycle';

interface Props {
  employees: Employee[];
  payrollRuns: PayrollRun[];
  payrollPayslips: Payslip[];
  gratuitySettlements: GratuitySettlement[];
  statConfig: StatutoryConfig;
  wageTypes: WageType[];
  company?: Company;
  periodMonth: number;
  periodYear: number;
  onCreateSupplementaryRun: (month: number, year: number) => void;
  onCreateFinalSettlementRun: (settlementId: string) => void;
  onRecordTaxDeposit: (runId: string, cprNumber: string, amount: number, depositedOn: string) => void;
  currentUser: { id: string; username: string };
  onCreatePayrollAdjustment: (adjustment: PayrollAdjustment) => void | Promise<void>;
  onRetroRecalculate: (payslipId: string, reason: string, target: { month: number; year: number }) => void | Promise<void>;
}

const download = (report: CsvReport) => {
  const url = URL.createObjectURL(new Blob([report.csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = report.filename; link.click(); URL.revokeObjectURL(url);
};

export function PayrollReportsPanel(props: Props) {
  const { employees, payrollRuns, payrollPayslips, gratuitySettlements, statConfig, wageTypes, company, periodMonth, periodYear } = props;
  const [taxYear, setTaxYear] = useState(taxYearOfPeriod(periodMonth, periodYear));
  const [certificateEmployeeId, setCertificateEmployeeId] = useState('');
  const [retro, setRetro] = useState({ payslipId: '', days: '', reason: '' });
  const processedRunIds = new Set(payrollRuns.filter(item => item.status === 'Disbursed' || item.status === 'Approved').map(item => item.id));
  const retroCandidates = payrollPayslips.filter(item => processedRunIds.has(item.payrollRunId) && (item.runType || 'Regular') === 'Regular')
    .sort((a, b) => `${b.periodYear}${String(b.periodMonth).padStart(2, '0')}`.localeCompare(`${a.periodYear}${String(a.periodMonth).padStart(2, '0')}`) || a.employeeName.localeCompare(b.employeeName));
  const submitRetro = async () => {
    const original = payrollPayslips.find(item => item.id === retro.payslipId);
    const employee = original && employees.find(item => item.id === original.employeeId);
    if (!original || !employee) { alert('Choose the paid payslip to correct.'); return; }
    try {
      const adjustment = retroAttendanceAdjustment(original, employee, Number(retro.days), retro.reason, props.currentUser, { month: periodMonth, year: periodYear }, statConfig, wageTypes);
      await props.onCreatePayrollAdjustment(adjustment);
      setRetro({ payslipId: '', days: '', reason: '' });
      alert(`${adjustment.type} of PKR ${adjustment.amount.toLocaleString()} raised for ${periodMonth}/${periodYear}. Another payroll user must approve it.`);
    } catch (error) { alert(error instanceof Error ? error.message : 'Correction could not be created.'); }
  };
  const today = new Date().toISOString().slice(0, 10);
  const deposits = taxDepositLines(payrollRuns, payrollPayslips);
  const outstanding = deposits.filter(line => line.status !== 'Deposited');
  const settlementsReady = gratuitySettlements.filter(item => item.status === 'Processed' && !payrollRuns.some(run => run.settlementId === item.id && run.status !== 'Cancelled'));
  const run = (action: () => void) => { try { action(); } catch (error) { alert(error instanceof Error ? error.message : 'Report could not be generated.'); } };
  const recordDeposit = (line: (typeof deposits)[number]) => {
    const cpr = window.prompt(`CPR / PSID number for ${line.run.title} (tax deducted PKR ${line.deducted.toLocaleString()}):`)?.trim();
    if (!cpr) return;
    const amount = Number(window.prompt('Amount deposited (PKR):', String(line.deducted)) ?? NaN);
    const depositedOn = window.prompt('Deposit date (YYYY-MM-DD):', today)?.trim();
    if (depositedOn) props.onRecordTaxDeposit(line.run.id, cpr, amount, depositedOn);
  };
  const button = 'flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50';

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 text-xs shadow-sm" aria-labelledby="payroll-reports-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="payroll-reports-title" className="text-sm font-bold text-slate-900">Statutory, finance &amp; off-cycle payroll</h3>
          <p className="mt-1 text-slate-500">Reports use approved and disbursed runs only; cancelled runs are excluded.</p>
        </div>
        <label className="flex items-center gap-2 text-slate-600">Tax year
          <input aria-label="Report tax year" value={taxYear} onChange={event => setTaxYear(event.target.value.replace(/\D/g, '').slice(0, 4))} className="w-20 rounded border border-slate-300 p-1.5 font-mono" />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={() => run(() => download(providentFundLedger(payrollRuns, payrollPayslips, taxYear)))}><Download size={13} />PF ledger</button>
        <button type="button" className={button} onClick={() => run(() => download(gratuityProvision(employees, today, statConfig, wageTypes)))}><Download size={13} />Gratuity provision</button>
        <button type="button" className={button} onClick={() => run(() => download(taxDepositReconciliation(payrollRuns, payrollPayslips)))}><Download size={13} />Tax deposit reconciliation</button>
        <button type="button" className={button} onClick={() => run(() => download(annualTaxCertificatesCsv(employees, payrollRuns, payrollPayslips, taxYear)))}><Download size={13} />Annual tax summary</button>
        <button type="button" className={button} onClick={() => run(() => download(missingRegistrationReport(employees)))}><Download size={13} />Missing registrations</button>
        <button type="button" className={button} onClick={() => run(() => download(taxReconciliationReport(employees, payrollRuns, payrollPayslips, taxYear)))}><Download size={13} />Tax vs annual liability</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
        <span className="font-semibold text-slate-700">Salary tax certificate (s.149):</span>
        <select aria-label="Certificate employee" value={certificateEmployeeId} onChange={event => setCertificateEmployeeId(event.target.value)} className="rounded border border-slate-300 bg-white p-1.5">
          <option value="">Select employee</option>
          {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.fullName} ({employee.employeeCode})</option>)}
        </select>
        <button type="button" disabled={!certificateEmployeeId} className={`${button} disabled:opacity-40`} onClick={() => run(() => {
          const employee = employees.find(item => item.id === certificateEmployeeId)!;
          openPrintableHtml(annualTaxCertificateHtml(employee, payrollRuns, payrollPayslips, taxYear, company));
        })}><FileText size={13} />Open certificate</button>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <h4 className="font-bold text-slate-900">Retroactive attendance correction</h4>
        <p className="mt-1 text-[11px] text-slate-500">Paid months stay locked. Days found later are paid (arrears) or recovered (deduction) in {periodMonth}/{periodYear}, after approval by another payroll user.</p>
        <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,2fr)_6rem_minmax(0,2fr)_auto]">
          <select aria-label="Paid payslip to correct" value={retro.payslipId} onChange={event => setRetro({ ...retro, payslipId: event.target.value })} className="rounded border border-slate-300 bg-white p-1.5">
            <option value="">Choose paid payslip</option>
            {retroCandidates.slice(0, 300).map(item => <option key={item.id} value={item.id}>{item.periodYear}-{String(item.periodMonth).padStart(2, '0')} · {item.employeeName} ({item.employeeCode})</option>)}
          </select>
          <input aria-label="Days to add or recover" type="number" placeholder="+/- days" value={retro.days} onChange={event => setRetro({ ...retro, days: event.target.value })} className="rounded border border-slate-300 p-1.5" />
          <input aria-label="Correction reason" placeholder="Reason / evidence" value={retro.reason} onChange={event => setRetro({ ...retro, reason: event.target.value })} className="rounded border border-slate-300 p-1.5" />
          <button type="button" onClick={() => void submitRetro()} className="rounded bg-slate-800 px-3 py-1.5 font-bold text-white">Raise</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
          <span className="text-[11px] text-slate-500">Or fix the employee record (salary, allowances, wage type, shift) and recalculate the chosen month in full:</span>
          <button type="button" disabled={!retro.payslipId} onClick={() => void props.onRetroRecalculate(retro.payslipId, retro.reason, { month: periodMonth, year: periodYear })} className="rounded border border-slate-800 px-3 py-1.5 font-bold text-slate-800 disabled:opacity-40">Recalculate month &amp; raise difference</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3">
          <h4 className="font-bold text-slate-900">FBR deposits pending reconciliation ({outstanding.length})</h4>
          {outstanding.length === 0 ? <p className="mt-2 text-emerald-700">All processed payroll tax has a matching CPR.</p> : <ul className="mt-2 space-y-1">
            {outstanding.slice(0, 8).map(line => <li key={line.run.id} className="flex items-center justify-between gap-2">
              <span>{line.run.title}: deducted PKR {line.deducted.toLocaleString()} · <span className="font-semibold text-amber-800">{line.status}{line.run.taxDeposit ? ` (${line.variance.toLocaleString()})` : ''}</span></span>
              <button type="button" onClick={() => recordDeposit(line)} className="shrink-0 font-semibold text-indigo-700 hover:underline">Record CPR</button>
            </li>)}
          </ul>}
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <h4 className="font-bold text-slate-900">Off-cycle runs</h4>
          <button type="button" onClick={() => props.onCreateSupplementaryRun(periodMonth, periodYear)} className="mt-2 rounded-lg bg-indigo-700 px-3 py-2 font-bold text-white hover:bg-indigo-800">Run supplementary payroll for {periodMonth}/{periodYear}</button>
          <p className="mt-1 text-[11px] text-slate-500">Pays bonuses, arrears and other adjustments approved after the regular run, taxed at the marginal rate.</p>
          <p className="mt-3 font-semibold text-slate-700">Approved settlements awaiting payroll ({settlementsReady.length})</p>
          {settlementsReady.length === 0 ? <p className="text-slate-500">None. A settlement must be processed by an independent approver first.</p> : <ul className="mt-1 space-y-1">
            {settlementsReady.map(item => <li key={item.id} className="flex items-center justify-between gap-2">
              <span>{employees.find(employee => employee.id === item.employeeId)?.fullName || item.employeeId} · {item.separationType} {item.separationDate} · PKR {item.totalSettlementAmount.toLocaleString()}</span>
              <button type="button" onClick={() => props.onCreateFinalSettlementRun(item.id)} className="shrink-0 font-semibold text-indigo-700 hover:underline">Create final settlement run</button>
            </li>)}
          </ul>}
        </div>
      </div>
    </section>
  );
}
