import type { Branch, Employee, EstablishmentRule, EstablishmentType, Province, SocialSecurityScheme, StatutoryConfig } from '../types';


export const JURISDICTIONS: Province[] = ['Punjab', 'Sindh', 'KPK', 'Balochistan', 'ICT'];
export const JURISDICTION_LABELS: Record<Province, string> = { Punjab: 'Punjab', Sindh: 'Sindh', KPK: 'Khyber Pakhtunkhwa', Balochistan: 'Balochistan', ICT: 'Islamabad (ICT / federal)' };
const schemeByProvince: Record<Province, SocialSecurityScheme> = { Punjab: 'PESSI', Sindh: 'SESSI', KPK: 'KP ESSI', Balochistan: 'BESSI', ICT: 'Federal / ICT' };

export function establishmentRule(config: Pick<StatutoryConfig, 'establishmentRules'> | undefined, type?: EstablishmentType): EstablishmentRule {
  return (type && config?.establishmentRules?.[type]) || {};
}

export function provincialPolicy(config: StatutoryConfig, province?: Province, establishmentType?: EstablishmentType) {
  const resolvedProvince = province || 'Punjab';
  const rule = establishmentRule(config, establishmentType);
  return {
    province: resolvedProvince,
    scheme: config.provincialSocialSecuritySchemes?.[resolvedProvince] || schemeByProvince[resolvedProvince],
    // An establishment-specific notified wage (for example a separate rate for factories) takes precedence.
    minimumWage: rule.minimumWage || (config.provincialMinimumWages?.[resolvedProvince] ?? config.minimumWage),
    socialSecurityRate: config.provincialSocialSecurityRates?.[resolvedProvince] ?? config.pessiEmployerRate,
    wageCeiling: config.provincialSocialSecurityCeilings?.[resolvedProvince] ?? config.socialSecurityWageCeiling ?? 0,
    version: config.statutoryPolicyVersion || config.taxYear || 'Unversioned',
  };
}

export function employeeProvince(employee: Employee, branches: Branch[]): Province | undefined {
  return branches.find(branch => branch.id === employee.branchId)?.province;
}

/**
 * Employer social-security contribution for one employee. Schemes differ by province: some cover every
 * employee on a capped wage, others only "secured persons" earning within the ceiling; both are configurable.
 */
export function socialSecurityContribution(employee: Employee, province: Province | undefined, config: StatutoryConfig, wageBase: number, isDailyWager: boolean) {
  const policy = provincialPolicy(config, province);
  if (config.socialSecurityExcludedCategories?.includes(employee.workerCategory || 'Worker')) return { amount: 0, reason: `${employee.workerCategory} staff are excluded from ${policy.scheme}` };
  if (isDailyWager && !employee.socialSecurityNumber) return { amount: 0, reason: 'Daily wager without social-security registration' };
  const ceiling = policy.wageCeiling || 40000;
  if (config.socialSecurityEligibility === 'Only employees within wage ceiling' && wageBase > ceiling) return { amount: 0, reason: `Wage above the ${policy.scheme} ceiling of PKR ${ceiling.toLocaleString()}` };
  return { amount: Math.round(Math.min(wageBase, ceiling) * (policy.socialSecurityRate / 100)), reason: '' };
}
