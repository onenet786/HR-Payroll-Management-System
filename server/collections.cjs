const COLLECTION_POLICY = Object.freeze({
  companies: { read: 'signedIn', write: 'manage_settings' }, branches: { read: 'signedIn', write: 'manage_settings' },
  departments: { read: 'signedIn', write: 'manage_settings' }, designations: { read: 'signedIn', write: 'manage_settings' },
  zones: { read: 'signedIn', write: 'manage_settings' }, ucTowns: { read: 'signedIn', write: 'manage_settings' },
  wageTypes: { read: 'signedIn', write: 'manage_settings' }, holidays: { read: 'signedIn', write: 'manage_settings' },
  taxSlabs: { read: 'signedIn', write: 'manage_settings' }, statConfig: { read: 'signedIn', write: 'manage_settings' },
  roles: { read: 'signedIn', write: 'manage_access' }, users: { read: 'selfUserOr:manage_access', write: 'manage_access' },
  employees: { read: 'selfEmployeeOr:manage_employees,manage_payroll,use_kiosk', write: 'manage_employees' },
  biometricTemplates: { read: 'manage_employeesOr:use_kiosk', write: 'manage_employees' },
  attendances: { read: 'selfEmployeeOr:manage_attendance,manage_payroll,use_kiosk', write: 'selfEmployeeOr:manage_attendance,use_kiosk' },
  mobileDutyAuthorizations: { read: 'selfEmployeeOr:manage_mobile_duty', write: 'manage_mobile_duty' },
  leaves: { read: 'selfEmployeeOr:manage_leaves,manage_employees', write: 'selfEmployeeOr:manage_leaves' },
  payrollRuns: { read: 'manage_payroll', write: 'manage_payroll' },
  payrollPayslips: { read: 'selfEmployeeOr:manage_payroll', write: 'manage_payroll' },
  loanAdvances: { read: 'selfEmployeeOr:manage_payroll,manage_employees', write: 'selfEmployeeOr:manage_payroll,manage_employees' },
  salaryRevisions: { read: 'selfEmployeeOr:manage_payroll,manage_employees', write: 'manage_payrollOr:manage_employees' },
  performanceReviews: { read: 'selfEmployeeOr:manage_employees', write: 'manage_employees' },
  companyAssets: { read: 'manage_employees', write: 'manage_employees' },
  jobPostings: { read: 'signedIn', write: 'manage_employees' }, jobApplications: { read: 'manage_employees', write: 'manage_employees' },
  gratuitySettlements: { read: 'manage_payrollOr:manage_employees', write: 'manage_payrollOr:manage_employees' },
  notifications: { read: 'selfEmployeeOr:manage_employees', write: 'manage_employeesOr:manage_payroll' },
});

const COLLECTION_TO_TABLE = Object.freeze({
  companies: 'companies',
  branches: 'branches',
  departments: 'departments',
  designations: 'designations',
  zones: 'zones',
  ucTowns: 'uc_towns',
  uc_towns: 'uc_towns',
  wageTypes: 'wage_types',
  wage_types: 'wage_types',
  holidays: 'holidays',
  taxSlabs: 'tax_slabs',
  tax_slabs: 'tax_slabs',
  statConfig: 'stat_config',
  stat_config: 'stat_config',
  roles: 'roles',
  users: 'users',
  employees: 'employees',
  biometricTemplates: 'biometric_templates',
  biometric_templates: 'biometric_templates',
  attendances: 'attendances',
  mobileDutyAuthorizations: 'mobile_duty_authorizations',
  mobile_duty_authorizations: 'mobile_duty_authorizations',
  leaves: 'leaves',
  payrollRuns: 'payroll_runs',
  payroll_runs: 'payroll_runs',
  payrollPayslips: 'payroll_payslips',
  payroll_payslips: 'payroll_payslips',
  loanAdvances: 'loan_advances',
  loan_advances: 'loan_advances',
  salaryRevisions: 'salary_revisions',
  salary_revisions: 'salary_revisions',
  performanceReviews: 'performance_reviews',
  performance_reviews: 'performance_reviews',
  companyAssets: 'company_assets',
  company_assets: 'company_assets',
  jobPostings: 'job_postings',
  job_postings: 'job_postings',
  jobApplications: 'job_applications',
  job_applications: 'job_applications',
  gratuitySettlements: 'gratuity_settlements',
  gratuity_settlements: 'gratuity_settlements',
  notifications: 'notifications',
});

const VALID_TABLES = new Set(Object.values(COLLECTION_TO_TABLE));

function getTableName(name) {
  if (!name || typeof name !== 'string') return null;
  const mapped = COLLECTION_TO_TABLE[name];
  if (mapped && VALID_TABLES.has(mapped)) return mapped;
  if (VALID_TABLES.has(name)) return name;
  return null;
}

const policyFor = name => {
  if (!name) return null;
  if (COLLECTION_POLICY[name]) return COLLECTION_POLICY[name];
  // Check if snake_case table name was passed, map back to camelCase policy
  for (const [key, table] of Object.entries(COLLECTION_TO_TABLE)) {
    if (table === name && COLLECTION_POLICY[key]) {
      return COLLECTION_POLICY[key];
    }
  }
  return null;
};

const hasAny = (identity, csv) => csv.split(',').some(permission => identity.permissions.has(permission));

function allowed(rule, identity, documentId, employeeId) {
  if (!rule) return false;
  if (identity.roleId === 'role-admin') return true;
  if (rule === 'signedIn') return true;
  if (rule === 'selfUser') return identity.uid === documentId;
  if (rule.startsWith('selfUserOr:')) return identity.uid === documentId || hasAny(identity, rule.slice(11));
  if (rule.startsWith('selfEmployeeOr:')) return identity.employeeId === employeeId || hasAny(identity, rule.slice(15));
  if (rule.includes('Or:')) return hasAny(identity, rule.replace('Or:', ','));
  return identity.permissions.has(rule);
}

module.exports = {
  COLLECTION_POLICY,
  COLLECTION_TO_TABLE,
  VALID_TABLES,
  getTableName,
  policyFor,
  allowed
};
