import React from 'react';
import type { Employee } from '../types';

/** A string kept under employee.legacy (records imported from CyberAP), or ''. */
export function legacyText(employee: Employee, key: string): string {
  const value = employee.legacy?.[key];
  return typeof value === 'string' ? value : '';
}

const money = (value: unknown) => `PKR ${Number(value || 0).toLocaleString()}`;

/**
 * Read-only box on the employee form listing what the old CyberAP system held for this person that has no field of
 * its own here: salary withheld, daily allowance, the salary heads, notes. Nothing renders for other employees.
 */
export function LegacyRecordNote({ employee }: { employee: Employee }) {
  const legacy = employee.legacy;
  if (!legacy || employee.importSource !== 'cyberap') return null;
  const heads = legacy.salaryHeads && typeof legacy.salaryHeads === 'object' ? Object.entries(legacy.salaryHeads as Record<string, unknown>) : [];
  const rates = legacy.allowanceRatesPerDay && typeof legacy.allowanceRatesPerDay === 'object' ? Object.entries(legacy.allowanceRatesPerDay as Record<string, unknown>) : [];
  const rows: Array<[string, React.ReactNode]> = [];
  const add = (label: string, value: React.ReactNode) => { if (value !== '' && value !== undefined && value !== null && value !== false) rows.push([label, value]); };
  add('CyberAP employee ID', String(legacy.employeeId ?? ''));
  add('Employment status in CyberAP', legacyText(employee, 'employmentStatus'));
  add('Leaving date', legacyText(employee, 'leavingDate'));
  add('Sub-group', legacyText(employee, 'subGroup'));
  add('Telephone', legacyText(employee, 'telephone'));
  add('Bar code', legacyText(employee, 'barCode'));
  add('CNIC as entered (not valid)', legacyText(employee, 'cnicAsEntered'));
  add('Salary paid', legacyText(employee, 'salaryPaymentMode'));
  add('Daily allowance', legacy.dailyAllowanceGiven ? 'Given in CyberAP' : '');
  add('Fingerprint', legacy.fingerprintArchived ? 'Archived (old DigitalPersona format): enrol again at the kiosk' : '');
  add('Notes', legacyText(employee, 'notes'));

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700" aria-label="CyberAP record">
      <div className="mb-2 font-bold text-slate-900">Imported from CyberAP</div>
      {Boolean(legacy.salaryWithheld) && (
        <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 font-semibold text-amber-800">
          Salary was marked WITHHELD in CyberAP. Check before paying this employee.
        </p>
      )}
      {Boolean(legacy.salaryPlaceholder) && (
        <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 font-semibold text-amber-800">
          CyberAP had no real basic salary for this employee (1.0 placeholder). Enter the salary, or load it with Salary Revisions → Upload salary sheet.
        </p>
      )}
      {rows.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-2"><dt className="shrink-0 text-slate-500">{label}:</dt><dd className="min-w-0 break-words font-medium">{value}</dd></div>
          ))}
        </dl>
      )}
      {rates.length > 0 && (
        <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-sky-900">
          Allowance per day worked in CyberAP: {rates.map(([name, amount]) => `${name} ${money(amount)}`).join(', ')}.
          These are daily rates, so they are not in this employee's monthly allowances. Set the monthly figure under Other Allowances if it should be paid.
        </p>
      )}
      {heads.length > 0 && (
        <div className="mt-2">
          <div className="text-slate-500">Salary heads in CyberAP (basic is monthly; allowances are per day):</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {heads.map(([name, amount]) => <span key={name} className="rounded-md border border-slate-200 bg-white px-2 py-0.5">{name}: {money(amount)}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}
