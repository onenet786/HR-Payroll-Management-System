import type { Employee, StatutoryConfig } from '../types';

/**
 * Product edition (feature profile) of this installation.
 *
 * The full edition keeps every compliance rule (FBR withholding, EOBI, social security, maker-checker approvals).
 * The lite edition is for small shops with 10-15 staff: only what payroll and attendance need to operate. The vendor
 * chooses it from the login screen (login "onenet", password OneNet + DDMonYYYY) and the choice is stored on the server.
 *
 * Mirrors server/edition.cjs (EDITION_FEATURE_KEYS and EDITION_PRESETS must stay identical; edition.test.ts checks it).
 */
export const EDITION_FEATURE_KEYS = [
  'incomeTax', 'eobi', 'socialSecurity', 'providentFund', 'gratuity',
  'bankPayroll', 'makerChecker', 'requireEmployeeEmail',
  'recruitment', 'performance', 'assets', 'loans', 'salaryRevisions', 'parallelRun', 'goLiveChecklist',
] as const;

export type EditionFeatureKey = typeof EDITION_FEATURE_KEYS[number];
export type EditionFeatures = Record<EditionFeatureKey, boolean>;
export type EditionId = 'full' | 'lite';

export interface AppEdition {
  id: EditionId;
  label: string;
  features: EditionFeatures;
  note?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const EDITION_PRESETS: Record<EditionId, EditionFeatures> = {
  full: Object.fromEntries(EDITION_FEATURE_KEYS.map(key => [key, true])) as EditionFeatures,
  lite: {
    incomeTax: false, eobi: false, socialSecurity: false, providentFund: false, gratuity: false,
    bankPayroll: false, makerChecker: false, requireEmployeeEmail: false,
    recruitment: false, performance: false, assets: false, loans: true, salaryRevisions: true, parallelRun: false, goLiveChecklist: false,
  },
};

export const EDITION_LABELS: Record<EditionId, string> = { full: 'Full compliance edition', lite: 'Lite edition (small business)' };

export type EditionFeatureGroup = 'Statutory deductions' | 'Payroll controls' | 'Modules';

/** What each switch does, in the words the vendor console shows. */
export const EDITION_FEATURE_INFO: Record<EditionFeatureKey, { label: string; detail: string; group: EditionFeatureGroup }> = {
  incomeTax: { group: 'Statutory deductions', label: 'FBR income tax withholding', detail: 'Tax slabs, employee NTN, salary tax deduction, CPR deposits, withholding CSVs and annual tax certificates.' },
  eobi: { group: 'Statutory deductions', label: 'EOBI contributions', detail: 'Employee and employer EOBI contributions, registration numbers and EOBI returns.' },
  socialSecurity: { group: 'Statutory deductions', label: 'Provincial social security (PESSI / SESSI)', detail: 'Employer contribution, registration numbers and social-security returns.' },
  providentFund: { group: 'Statutory deductions', label: 'Provident fund', detail: 'PF opt-in on employee records, PF deduction with employer match and the PF ledger.' },
  gratuity: { group: 'Statutory deductions', label: 'Gratuity and final settlement', detail: 'Gratuity opt-in, the Gratuity & Settlement page, gratuity provision report and final-settlement payroll runs.' },
  bankPayroll: { group: 'Payroll controls', label: 'Bank payroll', detail: 'Every employee needs a bank account and the bank advice file must be generated before salaries are marked paid. Off: cash payroll is allowed and bank details are optional.' },
  makerChecker: { group: 'Payroll controls', label: 'Maker-checker approvals', detail: 'A different user must approve payroll, rate changes, salary revisions, adjustments, lifecycle requests and attendance corrections. Off: one owner can do everything.' },
  requireEmployeeEmail: { group: 'Payroll controls', label: 'Employee email required', detail: 'An email address is mandatory on every employee record. Off: email is optional (payslips are still emailed when one is recorded).' },
  recruitment: { group: 'Modules', label: 'Recruitment', detail: 'Job postings and applicant pipeline.' },
  performance: { group: 'Modules', label: 'Performance reviews', detail: 'KPI scoring and appraisal cycles.' },
  assets: { group: 'Modules', label: 'Asset management', detail: 'Company assets assigned to staff and exit clearance.' },
  loans: { group: 'Modules', label: 'Loans and advances', detail: 'Salary advances and loans recovered in payroll.' },
  salaryRevisions: { group: 'Modules', label: 'Salary revisions', detail: 'Increments and promotions with arrears.' },
  parallelRun: { group: 'Modules', label: 'Parallel-run reconciliation', detail: 'Compare a payroll month against a legacy payroll file before going live.' },
  goLiveChecklist: { group: 'Modules', label: 'Live payroll readiness checklist', detail: 'Dashboard checklist of statutory approvals, MFA, segregation of duties and bank templates.' },
};

/** Any stored or received value becomes a complete, valid edition; unknown input means the full edition. */
export function resolveEdition(raw: unknown): AppEdition {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const id: EditionId = source.id === 'lite' ? 'lite' : 'full';
  const features: EditionFeatures = { ...EDITION_PRESETS[id] };
  const overrides = (source.features && typeof source.features === 'object' ? source.features : {}) as Record<string, unknown>;
  for (const key of EDITION_FEATURE_KEYS) if (typeof overrides[key] === 'boolean') features[key] = overrides[key] as boolean;
  const edition: AppEdition = { id, label: EDITION_LABELS[id], features };
  if (typeof source.note === 'string' && source.note.trim()) edition.note = source.note.trim().slice(0, 500);
  if (typeof source.updatedAt === 'string') edition.updatedAt = source.updatedAt;
  if (typeof source.updatedBy === 'string') edition.updatedBy = source.updatedBy;
  return edition;
}

export const FULL_EDITION: AppEdition = resolveEdition({ id: 'full' });

/** True when at least one statutory deduction is switched on (the payroll page then shows deduction columns and returns). */
export const hasStatutoryDeductions = (features: EditionFeatures) => features.incomeTax || features.eobi || features.socialSecurity || features.providentFund;

/**
 * Employee as payroll must see it under this edition: a switched-off deduction is treated as disabled for everyone.
 * Nothing is written back, so switching the edition on again restores the saved flags.
 */
export function editionEmployee(features: EditionFeatures, employee: Employee): Employee {
  if (features.incomeTax && features.eobi && features.providentFund) return employee;
  return {
    ...employee,
    ...(!features.incomeTax && { fbrEnabled: false }),
    ...(!features.eobi && { eobiEnabled: false }),
    ...(!features.providentFund && { providentFundOptIn: false }),
  };
}

/** Statutory rates as payroll must apply them under this edition: a switched-off scheme contributes nothing. */
export function editionStatConfig(features: EditionFeatures, config: StatutoryConfig): StatutoryConfig {
  if (features.eobi && features.socialSecurity) return config;
  const zeroRates = Object.fromEntries(Object.keys(config.provincialSocialSecurityRates || {}).map(province => [province, 0]));
  return {
    ...config,
    ...(!features.eobi && { eobiEmployerRate: 0, eobiEmployeeRate: 0 }),
    ...(!features.socialSecurity && { pessiEmployerRate: 0, provincialSocialSecurityRates: zeroRates }),
  };
}

export function payrollInputsFor(features: EditionFeatures, employees: Employee[], config: StatutoryConfig): { employees: Employee[]; statConfig: StatutoryConfig } {
  return { employees: employees.map(employee => editionEmployee(features, employee)), statConfig: editionStatConfig(features, config) };
}
