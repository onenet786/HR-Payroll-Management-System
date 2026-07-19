import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRecordId, resolveUcTownName, resolveWageBasis, resolveWageTypeName, resolveZoneName, validateEmployeeMasterSelection } from './masterData';

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

test('employee master selection validation blocks inconsistent chains', () => {
  const errors = validateEmployeeMasterSelection({ branchId: 'b1', departmentId: 'd2', designationId: 'x', zoneId: 'z1', ucTownId: 'u2', wageTypeId: 'missing' }, {
    branches: [{ id: 'b1' }], departments: [{ id: 'd2', branchId: 'b2' }], designations: [{ id: 'x', departmentId: 'd1' }], zones: [{ id: 'z1' }], ucTowns: [{ id: 'u2', zoneId: 'z2' }], wageTypes: [{ id: 'w1' }],
  });
  assert.equal(errors.length, 4);
});
