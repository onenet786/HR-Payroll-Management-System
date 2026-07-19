import assert from 'node:assert/strict';
import test from 'node:test';
import {
  companyCodeToken, departmentCodeBase, designationCodeBase, generateMasterCode, isSafeMasterCode, masterCodeTrail, nextUniqueMasterCode,
  normalizeManualMasterCode, resolveDepartmentHierarchy, resolveDesignationHierarchy, resolveUcTownHierarchy, ucTownCodeBase,
  validateManualMasterCode, wageTypeCodeBase, zoneCodeBase,
} from './masterCodes';
import type { Branch, Company, Department, Zone } from '../types';

const company: Company = { id: 'c1', name: 'Bin Ishaq', code: 'BI', industry: '', taxRegistrationNumber: '', eobiRegistrationNumber: '', socialSecurityRegion: '' };
const branch: Branch = { id: 'b1', companyId: 'c1', code: 'HQ', name: 'Head Office', city: 'Lahore', province: 'Punjab', address: '' };
const department: Department = { id: 'd1', branchId: 'b1', code: 'IT', name: 'Information Technology' };
const zone: Zone = { id: 'z1', companyId: 'c1', code: 'BI-ZN-WAGHA', name: 'Wagha', status: 'Active' };

test('company code is preferred and legacy company name falls back to initials', () => {
  assert.equal(companyCodeToken(company), 'BI');
  assert.equal(companyCodeToken({ name: 'Bin Ishaq Holdings' }), 'BIH');
});

test('tokens collapse punctuation and whitespace into safe uppercase code parts', () => {
  assert.equal(zoneCodeBase('  North / East! ', { ...company, code: 'bi.pk' }), 'BIPK-ZN-NE');
  assert.equal(normalizeManualMasterCode(' bi-hq-01 '), 'BI-HQ-01');
  assert.equal(isSafeMasterCode('BI-HQ-01'), true);
  assert.equal(isSafeMasterCode('BI HQ/01'), false);
});

test('all hierarchy patterns generate exact recognizable codes', () => {
  assert.equal(departmentCodeBase('Information Technology', company, { ...branch, code: 'LHR' }), 'BI-LHR-IT');
  assert.equal(designationCodeBase('Senior Software Engineer', company, branch, department), 'BI-HQ-IT-SSE');
  assert.equal(zoneCodeBase('Wagha', company), 'BI-ZN-WAGHA');
  assert.equal(ucTownCodeBase('UC178', zone), 'BI-ZN-WAGHA-UC-178');
  assert.equal(wageTypeCodeBase('Contrual', company), 'BI-WT-CONTRU');
});

test('Department company resolves through Branch rather than the primary company', () => {
  const otherCompany = { ...company, id: 'c2', name: 'Other Company', code: 'OC' };
  const lahoreBranch = { ...branch, id: 'b2', companyId: 'c2', code: 'LHR' };
  assert.deepEqual(resolveDepartmentHierarchy('b2', [branch, lahoreBranch], [company, otherCompany]), { company: otherCompany, branch: lahoreBranch });
  assert.equal(departmentCodeBase('Information Technology', otherCompany, lahoreBranch), 'OC-LHR-IT');
});

test('Department collisions are stable within Branch and exclude the current record', () => {
  const branchRecords = [{ id: 'd1', code: 'BI-LHR-IT' }, { id: 'd2', code: 'BI-LHR-IT-02' }];
  assert.equal(generateMasterCode('department', { name: 'Information Technology', title: '', company, branch: { ...branch, code: 'LHR' } }, branchRecords as any), 'BI-LHR-IT-03');
  assert.equal(generateMasterCode('department', { name: 'Information Technology', title: '', company, branch: { ...branch, code: 'LHR' } }, branchRecords as any, 'd1'), 'BI-LHR-IT');
  assert.match(validateManualMasterCode('BI LHR/IT', branchRecords), /uppercase letters/);
  assert.match(validateManualMasterCode('bi-lhr-it', branchRecords), /already in use/);
});

test('UC and Town prefixes are stripped rather than duplicated', () => {
  assert.equal(ucTownCodeBase('UC-178', zone), 'BI-ZN-WAGHA-UC-178');
  assert.equal(ucTownCodeBase('UC UC178', zone), 'BI-ZN-WAGHA-UC-178');
  assert.equal(ucTownCodeBase('Town Clifton', zone), 'BI-ZN-WAGHA-UC-CLIFTON');
});

test('collisions receive stable two digit suffixes and current record is excluded', () => {
  const records = [{ id: '1', code: 'BI-ZN-WAGHA' }, { id: '2', code: 'BI-ZN-WAGHA-02' }];
  assert.equal(nextUniqueMasterCode('BI-ZN-WAGHA', records), 'BI-ZN-WAGHA-03');
  assert.equal(nextUniqueMasterCode('BI-ZN-WAGHA', records, '1'), 'BI-ZN-WAGHA');
  assert.equal(generateMasterCode('zone', { name: 'Wagha', title: '', company }, records as any), 'BI-ZN-WAGHA-03');
});

test('designation company resolves through department and branch', () => {
  assert.deepEqual(resolveDesignationHierarchy('d1', [department], [branch], [company]), { company, branch, department });
});

test('UC/Town company resolves through its selected zone', () => {
  assert.deepEqual(resolveUcTownHierarchy('z1', [zone], [company]), { company, zone });
});

test('manual unsafe and scoped duplicate codes are rejected', () => {
  const records = [{ id: '1', code: 'BI-WT-MONTH' }];
  assert.match(validateManualMasterCode('BI WT/MONTH', records), /uppercase letters/);
  assert.match(validateManualMasterCode('bi-wt-month', records), /already in use/);
  assert.equal(validateManualMasterCode('bi-wt-daily', records), '');
});

test('generated hierarchy trail exposes every source segment and collision suffix', () => {
  assert.deepEqual(masterCodeTrail('department', { name: 'Information Technology', title: '', company, branch: { ...branch, code: 'LHR' } }, 'BI-LHR-IT'), [
    { value: 'BI', label: 'Company' }, { value: 'LHR', label: 'Branch' }, { value: 'IT', label: 'Department' },
  ]);
  assert.deepEqual(masterCodeTrail('designation', { name: '', title: 'Senior Software Engineer', company, branch, department }, 'BI-HQ-IT-SSE-02'), [
    { value: 'BI', label: 'Company' }, { value: 'HQ', label: 'Branch' },
    { value: 'IT', label: 'Department' }, { value: 'SSE', label: 'Title' },
    { value: '02', label: 'Collision suffix' },
  ]);
  assert.deepEqual(masterCodeTrail('ucTown', { name: 'UC178', title: '', zone }, 'BI-ZN-WAGHA-UC-178'), [
    { value: 'BI-ZN-WAGHA', label: 'Parent Zone' },
    { value: 'UC', label: 'Location type' }, { value: '178', label: 'Location' },
  ]);
});
