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

const policyFor = name => COLLECTION_POLICY[name] || null;
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

module.exports = { COLLECTION_POLICY, policyFor, allowed };
