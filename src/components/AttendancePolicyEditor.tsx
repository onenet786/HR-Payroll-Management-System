import React from 'react';
import type { AttendancePolicy, CompanyOptions, LateFineBand } from '../types';
import { APMS_ATTENDANCE_POLICY, APMS_COMPANY_OPTIONS } from '../data/attendancePolicy';

interface Props { policy: AttendancePolicy; options: CompanyOptions; onChange: (policy: AttendancePolicy, options: CompanyOptions) => void }

const inputClass = 'w-full text-xs font-mono p-2 border border-slate-300 rounded';
const labelClass = 'block text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1';

const OPTION_LABELS: Array<[keyof CompanyOptions, string, string]> = [
  ['kioskThreeExitButtons', 'Kiosk: three exit buttons only', 'Duty Off / Personal Out / Office Work replace the standard checkout list on the kiosk.'],
  ['officialExitsNotDeducted', 'Office work exits do not affect attendance', 'Office Work / official exits are not deducted from worked time and do not use the personal-out allowance.'],
  ['salaryPaymentRegister', 'Salary Unpaid / Paid register', 'Every payslip of an approved run is Unpaid until it is marked Paid (cash hand-over). Bank exceptions stay available.'],
  ['extendedPayComponents', 'Full allowance / deduction catalogue', 'Fuel, funeral, rewards, penalties, uniform, STA, LTA and more as adjustment types, plus commission / tip CSV import.'],
  ['registerShowsPosition', 'Position and branch on registers', 'Attendance and leave registers show each employee\'s position and branch.'],
];

/**
 * Settings panel for the optional company features and the attendance policy (late fines, half day, absent factor,
 * leave-first marking, duty-off cutoff, personal-out allowance). Everything is off / empty by default.
 */
export function AttendancePolicyEditor({ policy, options, onChange }: Props) {
  const set = (patch: Partial<AttendancePolicy>) => onChange({ ...policy, ...patch }, options);
  const setOption = (key: keyof CompanyOptions, value: boolean) => onChange(policy, { ...options, [key]: value });
  const number = (key: keyof AttendancePolicy, value: string) => set({ [key]: value === '' ? undefined : Number(value) } as Partial<AttendancePolicy>);
  const bands: LateFineBand[] = policy.lateFineBands || [];
  const setBand = (index: number, patch: Partial<LateFineBand>) => set({ lateFineBands: bands.map((band, i) => i === index ? { ...band, ...patch } : band) });
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest">Optional company features and attendance policy</label>
          <span className="text-[10px] text-slate-500">All off by default. Policy minutes count from the branch opening time (Master Data → Branch); a day marked as leave carries no fine or reward.</span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onChange({ ...APMS_ATTENDANCE_POLICY }, { ...APMS_COMPANY_OPTIONS })} className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100">Apply company preset</button>
          <button type="button" onClick={() => onChange({}, {})} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100">Reset to standard</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {OPTION_LABELS.map(([key, title, hint]) => (
          <label key={key} className="flex items-start gap-2 rounded border border-slate-200 bg-white p-2 text-xs text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={!!options[key]} onChange={e => setOption(key, e.target.checked)} />
            <span><span className="font-semibold">{title}</span><br /><span className="text-[10px] text-slate-500">{hint}</span></span>
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <label><span className={labelClass}>Late from (minutes after opening)</span><input aria-label="Late grace minutes" type="number" min="0" value={policy.lateGraceMinutes ?? ''} onChange={e => number('lateGraceMinutes', e.target.value)} placeholder="shift grace" className={inputClass} /></label>
        <label><span className={labelClass}>Half day from (minutes)</span><input aria-label="Half day minutes" type="number" min="0" value={policy.halfDayAfterMinutes ?? ''} onChange={e => number('halfDayAfterMinutes', e.target.value)} placeholder="shift rule" className={inputClass} /></label>
        <label><span className={labelClass}>Absent deduction (days of pay)</span><input aria-label="Absent deduction days" type="number" min="0" step="0.5" value={policy.absentDeductionDays ?? ''} onChange={e => number('absentDeductionDays', e.target.value)} placeholder="1" className={inputClass} /></label>
        <label><span className={labelClass}>Day without punch becomes</span>
          <select aria-label="No punch day status" value={policy.noPunchDayStatus || 'Absent'} onChange={e => set({ noPunchDayStatus: e.target.value as AttendancePolicy['noPunchDayStatus'] })} className={`${inputClass} bg-white`}>
            <option value="Absent">Absent (standard)</option>
            <option value="Unpaid Leave">Leave (1 day); HR marks absent by hand</option>
          </select>
        </label>
        <label className="col-span-2 flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={!!policy.dutyOffBeforeHalfTimeIsLeave} onChange={e => set({ dutyOffBeforeHalfTimeIsLeave: e.target.checked })} /> "Duty Off" before the branch half time counts as a leave</label>
        <label><span className={labelClass}>Default half time</span><input aria-label="Default half time" type="time" value={policy.defaultHalfTimeCutoff || ''} onChange={e => set({ defaultHalfTimeCutoff: e.target.value || undefined })} className={inputClass} /></label>
        <label><span className={labelClass}>Personal out allowance (min / day)</span><input aria-label="Personal out allowance minutes" type="number" min="0" value={policy.defaultPersonalOutAllowanceMinutes ?? ''} onChange={e => number('defaultPersonalOutAllowanceMinutes', e.target.value)} className={inputClass} /></label>
        <label><span className={labelClass}>Early coming reward (PKR / day)</span><input aria-label="Early coming reward per day" type="number" min="0" value={policy.earlyComingRewardPerDay ?? ''} onChange={e => number('earlyComingRewardPerDay', e.target.value)} placeholder="0 = off" className={inputClass} /></label>
        <label><span className={labelClass}>Early = minutes before opening</span><input aria-label="Early coming minutes" type="number" min="0" value={policy.earlyComingMinutes ?? ''} onChange={e => number('earlyComingMinutes', e.target.value)} placeholder="0" className={inputClass} /></label>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <span className={labelClass}>Late fine per late day, by number of late days in the month</span>
          <button type="button" onClick={() => set({ lateFineBands: [...bands, { uptoLateDays: (bands[bands.length - 1]?.uptoLateDays || 0) + 5, finePerDay: (bands[bands.length - 1]?.finePerDay || 50) + 50 }] })} className="text-[11px] font-bold text-indigo-700 hover:underline">+ Add band</button>
        </div>
        {bands.length ? <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
          {bands.map((band, index) => (
            <div key={index} className="flex items-center gap-1 text-[11px]">
              <span className="text-slate-500">up to</span>
              <input aria-label={`Band ${index + 1} late days`} type="number" min="1" value={band.uptoLateDays} onChange={e => setBand(index, { uptoLateDays: Number(e.target.value) })} className="w-14 text-xs font-mono p-1.5 border border-slate-300 rounded" />
              <span className="text-slate-500">days: PKR</span>
              <input aria-label={`Band ${index + 1} fine`} type="number" min="0" value={band.finePerDay} onChange={e => setBand(index, { finePerDay: Number(e.target.value) })} className="w-16 text-xs font-mono p-1.5 border border-slate-300 rounded" />
              <button type="button" aria-label="Remove band" onClick={() => set({ lateFineBands: bands.filter((_, i) => i !== index) })} className="text-rose-600 font-bold px-1">×</button>
            </div>
          ))}
        </div> : <p className="text-[10px] text-slate-400 mt-1">No late fine is charged (standard).</p>}
      </div>
    </div>
  );
}
