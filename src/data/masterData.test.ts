import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveEmployeeCompanyId, getEmployeeEditDepartmentOptions, getEmployeeEditOptions, resolveEmployeeCompanyId, resolveRecordId, resolveUcTownName, resolveWageBasis, resolveWageTypeName, resolveZoneName, synchronizeDepartmentSelection, validateEmployeeMasterSelection } from './masterData';

test('wage basis resolves normalized ID before legacy text', () => {
  assert.equal(resolveWageBasis({ wageTypeId: 'daily', wageType: 'Salaried' }, [{ id: 'daily', companyId: 'c1', code: 'DAY', name: 'Field', calculationBasis: 'Daily', status: 'Active' }]), 'Daily');
});

test('wage basis falls back for unmigrated employees', () => {
  assert.equal(resolveWageBasis({ wageType: 'Daily Wager' }), 'Daily');
  assert.equal(resolveWageBasis({ wageType: 'Contract' }), 'Monthly');
});

test('location display resolves ID with legacy fallback', () => {
  assert.equal(resolveZoneName({ zoneId: 'z1', zone: 'Old zone' }, [{ id: 'z1', companyId: 'c1', code: 'N', name: 'North', status: 'Active' }]), 'North');
  assert.equal(resolveUcTownName({ ucTown: 'Legacy town' }, []), 'Legacy town');
});

test('wage display resolves current master name with legacy fallback', () => {
  const records = [{ id: 'monthly', companyId: 'c1', code: 'MON', name: 'Monthly Staff', calculationBasis: 'Monthly' as const, status: 'Inactive' as const }];
  assert.equal(resolveWageTypeName({ wageTypeId: 'monthly', wageType: 'Old label' }, records), 'Monthly Staff');
  assert.equal(resolveWageTypeName({ wageType: 'Legacy' }, records), 'Legacy');
});

test('stale IDs fall back to legacy matching and UC matching can be zone scoped', () => {
  const towns = [{ id: 'u1', zoneId: 'z1', code: 'C', name: 'Central', status: 'Active' as const }, { id: 'u2', zoneId: 'z2', code: 'C2', name: 'Central', status: 'Active' as const }];
  assert.equal(resolveRecordId(towns, 'stale', 'Central'), 'u1');
  assert.equal(resolveRecordId(towns.filter(item => item.zoneId === 'z2'), 'stale', 'Central'), 'u2');
});

test('branch IDs and normalized legacy branch names or codes resolve', () => {
  const branches = [
    { id: 'b1', name: 'Karachi Head Office', code: 'KHI' },
    { id: 'b2', name: 'Lahore Office', code: 'LHR' },
  ];
  assert.equal(resolveRecordId(branches, 'b1', 'LHR'), 'b1');
  assert.equal(resolveRecordId(branches, 'stale', '  karachi   HEAD office '), 'b1');
  assert.equal(resolveRecordId(branches, undefined, 'lhr'), 'b2');
  assert.equal(resolveRecordId(branches, 'KHI', 'KHI'), 'b1', 'legacy branch code stored in branchId resolves');
});

test('employee edit scope follows the employee company instead of companies[0]', () => {
  const branches = [
    { id: 'b1', companyId: 'c1' },
    { id: 'b2', companyId: 'c2' },
  ];
  assert.equal(resolveEmployeeCompanyId({ companyId: 'c2', branchId: 'b2' }, branches, ['c1', 'c2'], 'c1'), 'c2');
  assert.equal(resolveEmployeeCompanyId({ companyId: 'legacy', branchId: 'b2' }, branches, ['c1', 'c2'], 'c1'), 'c2');
});

test('edit options retain only the current inactive or missing-company exception', () => {
  const records = [
    { id: 'active', companyId: 'c2', status: 'Active' as const },
    { id: 'inactive', companyId: 'c2', status: 'Inactive' as const },
    { id: 'other', companyId: 'c1', status: 'Active' as const },
    { id: 'legacy', status: 'Active' as const },
  ];
  assert.deepEqual(getEmployeeEditOptions(records, 'c2', 'inactive').map(item => item.id), ['active', 'inactive']);
  assert.deepEqual(getEmployeeEditOptions(records, 'c2', 'legacy').map(item => item.id), ['active', 'legacy']);
});

test('late master resolution preserves a valid user selection', () => {
  const lateRecords = [
    { id: 'z-new', name: 'North Zone', code: 'N' },
    { id: 'z-user', name: 'South Zone', code: 'S' },
  ];
  assert.equal(resolveRecordId(lateRecords, '', 'North Zone'), 'z-new');
  assert.equal(resolveRecordId(lateRecords, 'z-user', 'North Zone'), 'z-user');
});

test('zone-scoped UC legacy resolution does not select a town from another zone', () => {
  const towns = [
    { id: 'u1', zoneId: 'z1', code: 'C', name: 'Central' },
    { id: 'u2', zoneId: 'z2', code: 'C', name: 'Central' },
  ];
  assert.equal(resolveRecordId(towns.filter(item => item.zoneId === 'z2'), 'stale', 'Central'), 'u2');
  assert.equal(resolveRecordId(towns.filter(item => item.zoneId === ''), 'stale', 'Central'), '');
});

test('new employee company is derived from the selected branch', () => {
  assert.equal(deriveEmployeeCompanyId('b2', [{ id: 'b1', companyId: 'c1' }, { id: 'b2', companyId: 'c2' }], 'c1'), 'c2');
});

test('edit departments are company scoped with selected branch first and current inactive retained', () => {
  const branches = [
    { id: 'hq', companyId: 'c1', name: 'Head Office' },
    { id: 'khi', companyId: 'c1', name: 'Karachi HQ Office' },
    { id: 'other', companyId: 'c2', name: 'Other Company' },
  ];
  const departments = [
    { id: 'finance', branchId: 'hq', name: 'Finance', code: 'FIN' },
    { id: 'khi-it', branchId: 'khi', name: 'IT Karachi', code: 'ITK' },
    { id: 'legacy', branchId: 'hq', name: 'Legacy IT', code: 'LIT', status: 'Inactive' as const },
    { id: 'foreign', branchId: 'other', name: 'Foreign', code: 'FOR' },
  ];
  assert.deepEqual(
    getEmployeeEditDepartmentOptions(departments, branches, 'c1', 'khi', 'legacy').map(item => item.id),
    ['khi-it', 'finance', 'legacy']
  );
});

test('cross-branch department choice synchronizes branch and clears designation', () => {
  const update = synchronizeDepartmentSelection('finance', 'khi', [
    { id: 'finance', branchId: 'hq' },
    { id: 'khi-it', branchId: 'khi' },
  ]);
  assert.deepEqual(update, { branchId: 'hq', departmentId: 'finance', designationId: '', branchChanged: true });
  assert.equal(synchronizeDepartmentSelection('khi-it', 'khi', [{ id: 'khi-it', branchId: 'khi' }]).branchChanged, false);
});

test('employee master selection validation blocks inconsistent chains', () => {
  const errors = validateEmployeeMasterSelection({ branchId: 'b1', departmentId: 'd2', designationId: 'x', zoneId: 'z1', ucTownId: 'u2', wageTypeId: 'missing' }, {
    branches: [{ id: 'b1' }], departments: [{ id: 'd2', branchId: 'b2' }], designations: [{ id: 'x', departmentId: 'd1' }], zones: [{ id: 'z1' }], ucTowns: [{ id: 'u2', zoneId: 'z2' }], wageTypes: [{ id: 'w1' }],
  });
  assert.equal(errors.length, 4);
});
