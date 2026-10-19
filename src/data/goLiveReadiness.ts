import type { Branch, Employee, PayrollRun, Role, StatutoryConfig, UserAccount } from '../types';
import { FULL_EDITION, type EditionFeatures } from './edition';
import { JURISDICTIONS } from './provincialCompliance';
import { exportTemplatesFor } from './exportTemplates';
import { complianceAlerts } from './complianceAlerts';

export type ReadinessStatus = 'Ready' | 'Action needed' | 'Optional';
export interface ReadinessItem { id: string; label: string; status: ReadinessStatus; detail: string; where: string }

export interface ReadinessInputs {
  statConfig: StatutoryConfig;
  employees: Employee[];
  branches: Branch[];
  users: UserAccount[];
  roles: Role[];
  payrollRuns: PayrollRun[];
  channels?: { email: boolean; sms: boolean; whatsapp: boolean };
  today?: string;
  /** Edition switches: checks for features that are off are left out of the list. */
  features?: EditionFeatures;
}

const taxYearFor = (date: string) => String(Number(date.slice(5, 7)) >= 7 ? Number(date.slice(0, 4)) + 1 : Number(date.slice(0, 4)));

/** Go-live gate for live payroll: every item is computed from current data, so the list cannot go stale. */
export function goLiveReadiness(inputs: ReadinessInputs): ReadinessItem[] {
  const { statConfig, employees, branches, users, roles, payrollRuns } = inputs;
  const features = inputs.features || FULL_EDITION.features;
  const statutory = features.incomeTax || features.eobi || features.socialSecurity;
  const today = inputs.today || new Date().toISOString().slice(0, 10);
  const items: ReadinessItem[] = [];
  const add = (id: string, label: string, ready: boolean, detail: string, where: string, optional = false) =>
    items.push({ id, label, status: ready ? 'Ready' : optional ? 'Optional' : 'Action needed', detail, where });

  if (features.makerChecker) add('statutory-approved', 'Statutory rates approved by a second user', Boolean(statConfig.changeRequestId),
    statConfig.changeRequestId ? `Live rates approved under ${statConfig.changeRequestId}.` : 'Live rates were never approved through change control. Propose and approve them once.', 'Statutory Config');
  if (statutory) add('statutory-source', 'Official notification recorded and attached', Boolean(statConfig.sourceReference?.trim() && statConfig.sourceDocuments?.length),
    !statConfig.sourceReference?.trim() ? 'No FBR / EOBI / provincial reference recorded.' : statConfig.sourceDocuments?.length ? `${statConfig.sourceDocuments.length} document(s) attached.` : 'Reference recorded; attach the notification file.', 'Statutory Config');
  const expectedTaxYear = taxYearFor(today);
  if (features.incomeTax) add('tax-year', `Tax year ${expectedTaxYear} configuration in force`, statConfig.taxYear === expectedTaxYear && Boolean(statConfig.effectiveFrom && statConfig.effectiveFrom <= today),
    `Configured tax year ${statConfig.taxYear || 'not set'}, effective ${statConfig.effectiveFrom || 'not set'}.`, 'Statutory Config');
  const policyDefaults: Array<[string, unknown]> = [
    ['gratuity resignation rule', statConfig.gratuityResignationUnderFiveYearsPercent], ['settlement daily-rate divisor', statConfig.settlementDailyRateDivisor],
    ['medical exemption', statConfig.medicalAllowanceExemptPercentOfBasic], ['surcharge', statConfig.surchargeRatePercent], ['leave entitlements', statConfig.leaveEntitlements],
    ['absence deduction basis', statConfig.absenceDeductionBasis],
  ];
  const unconfirmed = policyDefaults.filter(([, value]) => value === undefined).map(([label]) => label);
  add('policy-defaults', 'Company policy settings confirmed', !unconfirmed.length,
    unconfirmed.length ? `Still on built-in defaults: ${unconfirmed.join(', ')}. Review and approve them explicitly.` : 'Gratuity, tax, leave and absence policies are explicitly set.', 'Statutory Config');

  const branchProblems = branches.flatMap(branch => [
    !JURISDICTIONS.includes(branch.province) && `${branch.name}: province`, !branch.establishmentType && `${branch.name}: establishment type`,
    !(Number.isFinite(branch.geofenceLatitude) && Number.isFinite(branch.geofenceLongitude) && (branch.geofenceRadiusMeters || 0) >= 25) && `${branch.name}: geofence`,
  ].filter(Boolean) as string[]);
  add('branches', 'Branches fully configured', branches.length > 0 && !branchProblems.length,
    branches.length ? (branchProblems.length ? `Missing ${branchProblems.slice(0, 6).join('; ')}${branchProblems.length > 6 ? '…' : ''}.` : `${branches.length} branch(es) complete.`) : 'No branches set up.', 'Master Data');

  const bank = exportTemplatesFor(statConfig, 'Bank Advice').filter(template => template.bank && template.verified);
  if (features.bankPayroll) add('bank-file', 'Bank upload file verified with your bank', bank.length > 0,
    bank.length ? `Verified: ${bank.map(template => template.bank).join(', ')}.` : 'No bank template is verified. Enter your bank’s specification and test a batch.', 'Statutory Config → file templates');
  const statutoryKinds = ([['EOBI Return', features.eobi], ['Social Security Return', features.socialSecurity]] as const).filter(([, enabled]) => enabled).map(([kind]) => kind);
  const statutoryFiles = statutoryKinds.filter(kind => !exportTemplatesFor(statConfig, kind).some(template => template.verified));
  if (statutoryKinds.length) add('statutory-files', 'EOBI and social-security upload files verified', !statutoryFiles.length,
    statutoryFiles.length ? `Not yet verified: ${statutoryFiles.join(', ')}. CSV schedules remain available meanwhile.` : 'Upload formats verified.', 'Statutory Config → file templates', true);

  const permissionsOf = (user: UserAccount) => user.roleId === 'role-admin' ? ['manage_payroll', 'manage_access', 'manage_settings'] : roles.find(role => role.id === user.roleId)?.permissions || [];
  const payrollUsers = users.filter(user => user.status === 'Active' && permissionsOf(user).includes('manage_payroll'));
  if (features.makerChecker) add('segregation', 'Three separate payroll users (prepare, approve, disburse)', payrollUsers.length >= 3,
    `${payrollUsers.length} active user(s) can process payroll; maker-checker needs three different people for one run.`, 'User Management');
  const privileged = users.filter(user => user.status === 'Active' && permissionsOf(user).some(permission => ['manage_payroll', 'manage_access', 'manage_settings'].includes(permission)));
  const withoutMfa = privileged.filter(user => !user.mfaEnabled);
  add('mfa', 'Multi-factor authentication on privileged accounts', privileged.length > 0 && !withoutMfa.length,
    withoutMfa.length ? `No MFA: ${withoutMfa.slice(0, 6).map(user => user.username).join(', ')}${withoutMfa.length > 6 ? '…' : ''}.` : `${privileged.length} privileged account(s) protected.`, 'User Management');

  const critical = complianceAlerts({ employees, attendances: [], branches, statConfig, today, features }).filter(alert => alert.severity === 'Critical' && alert.category !== 'Documents');
  add('employee-data', 'Employee records free of critical issues', critical.length === 0,
    critical.length ? `${critical.length} critical issue(s) (CNIC, bank account or minimum wage), e.g. ${critical[0].employeeName}: ${critical[0].message}` : `${employees.filter(employee => employee.status !== 'Terminated').length} active record(s) pass CNIC, bank and minimum-wage checks.`, 'Employee Directory');

  const reconciled = payrollRuns.filter(run => run.parallelRun && run.status !== 'Cancelled');
  const clean = reconciled.filter(run => run.parallelRun!.differing === 0 && run.parallelRun!.onlyLegacy === 0 && run.parallelRun!.onlySystem === 0);
  if (features.parallelRun) add('parallel-run', 'Parallel run reconciled against current payroll', clean.length > 0,
    clean.length ? `Matched the legacy payroll for ${clean.map(run => `${run.periodMonth}/${run.periodYear}`).join(', ')}.` : reconciled.length ? `${reconciled.length} comparison(s) recorded, still with differences to explain.` : 'Compare at least one month with your current payroll before switching over.', 'Payroll → parallel run');

  if (inputs.channels) {
    add('email', 'Payslip email configured', inputs.channels.email, inputs.channels.email ? 'SMTP is configured on the server.' : 'Set SMTP_* on the server to email payslips.', 'Server settings', true);
    add('alerts', 'SMS / WhatsApp salary alerts configured', inputs.channels.sms || inputs.channels.whatsapp,
      inputs.channels.sms || inputs.channels.whatsapp ? `Configured: ${[inputs.channels.sms && 'SMS', inputs.channels.whatsapp && 'WhatsApp'].filter(Boolean).join(', ')}.` : 'Optional: add provider credentials on the server.', 'Server settings', true);
  }
  return items;
}
