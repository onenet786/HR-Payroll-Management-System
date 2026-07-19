import type { Branch, Department, Employee, UcTown, WageType, Zone } from '../types';

export const makeMasterId = (prefix: string) =>
  `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export function resolveWageBasis(employee: Pick<Employee, 'wageTypeId' | 'wageType'>, wageTypes: WageType[] = []): 'Monthly' | 'Daily' {
  return wageTypes.find(item => item.id === employee.wageTypeId)?.calculationBasis
    ?? (employee.wageType === 'Daily Wager' ? 'Daily' : 'Monthly');
}

export const resolveWageTypeName = (employee: Pick<Employee, 'wageTypeId' | 'wageType'>, wageTypes: WageType[]) =>
  wageTypes.find(item => item.id === employee.wageTypeId)?.name ?? employee.wageType ?? '';

export const resolveZoneName = (employee: Pick<Employee, 'zoneId' | 'zone'>, zones: Zone[]) =>
  zones.find(item => item.id === employee.zoneId)?.name ?? employee.zone ?? '';

export const resolveUcTownName = (employee: Pick<Employee, 'ucTownId' | 'ucTown'>, records: UcTown[]) =>
  records.find(item => item.id === employee.ucTownId)?.name ?? employee.ucTown ?? '';

export function resolveRecordId<T extends { id: string; name: string; code?: string }>(items: T[], id?: string, legacy?: string): string {
  if (id && items.some(item => item.id === id)) return id;
  const key = normalizeMasterValue(legacy);
  return key ? items.find(item => normalizeMasterValue(item.name) === key || normalizeMasterValue(item.code) === key)?.id ?? '' : '';
}

export const normalizeMasterValue = (value?: string) =>
  value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase() ?? '';

type CompanyMasterRecord = { id: string; companyId?: string; status?: 'Active' | 'Inactive' };

/** Scope edit choices to the employee company while retaining their current legacy/inactive record. */
export function getEmployeeEditOptions<T extends CompanyMasterRecord>(items: T[], companyId?: string, currentId?: string): T[] {
  return items.filter(item =>
    item.id === currentId
    || ((!companyId || item.companyId === companyId) && item.status !== 'Inactive')
  );
}

/** Prefer an employee's valid company, then their assigned branch company, then the portal default. */
export function resolveEmployeeCompanyId(
  employee: Pick<Employee, 'companyId' | 'branchId'>,
  branches: Array<Pick<Branch, 'id' | 'companyId'>>,
  knownCompanyIds: string[],
  fallbackCompanyId = ''
): string {
  if (employee.companyId && knownCompanyIds.includes(employee.companyId)) return employee.companyId;
  return branches.find(branch => branch.id === employee.branchId)?.companyId
    || employee.companyId
    || fallbackCompanyId;
}

/** Derive a new employee's company from the selected branch instead of a hardcoded ID. */
export function deriveEmployeeCompanyId(
  branchId: string,
  branches: Array<Pick<Branch, 'id' | 'companyId'>>,
  fallbackCompanyId = ''
): string {
  return branches.find(branch => branch.id === branchId)?.companyId || fallbackCompanyId;
}

type DepartmentWithStatus = Department & { status?: 'Active' | 'Inactive' };

/** Same-company edit choices, with the selected branch first and only the exact current exception retained. */
export function getEmployeeEditDepartmentOptions(
  departments: DepartmentWithStatus[],
  branches: Array<Pick<Branch, 'id' | 'companyId' | 'name'>>,
  companyId: string,
  selectedBranchId: string,
  currentDepartmentId?: string
): DepartmentWithStatus[] {
  const companyBranches = branches.filter(branch => !companyId || branch.companyId === companyId);
  const companyBranchIds = new Set(companyBranches.map(branch => branch.id));
  const branchNames = new Map(companyBranches.map(branch => [branch.id, branch.name]));

  return departments
    .filter(department => companyBranchIds.has(department.branchId)
      && (department.status !== 'Inactive' || department.id === currentDepartmentId))
    .sort((left, right) => {
      const leftPriority = left.branchId === selectedBranchId ? 0 : 1;
      const rightPriority = right.branchId === selectedBranchId ? 0 : 1;
      return leftPriority - rightPriority
        || (branchNames.get(left.branchId) ?? '').localeCompare(branchNames.get(right.branchId) ?? '')
        || left.name.localeCompare(right.name);
    });
}

/** A department choice intentionally owns the Branch and always resets Designation. */
export function synchronizeDepartmentSelection(
  departmentId: string,
  currentBranchId: string,
  departments: Array<Pick<Department, 'id' | 'branchId'>>
): { branchId: string; departmentId: string; designationId: string; branchChanged: boolean } {
  const department = departments.find(item => item.id === departmentId);
  const branchId = department?.branchId || currentBranchId;
  return { branchId, departmentId, designationId: '', branchChanged: Boolean(department && branchId !== currentBranchId) };
}

export function validateEmployeeMasterSelection(
  selection: { branchId: string; departmentId: string; designationId: string; zoneId: string; ucTownId: string; wageTypeId: string },
  data: { branches: { id: string }[]; departments: { id: string; branchId: string }[]; designations: { id: string; departmentId: string }[]; zones: { id: string }[]; ucTowns: { id: string; zoneId: string }[]; wageTypes: { id: string }[] }
): string[] {
  const errors: string[] = [];
  if (!data.branches.some(item => item.id === selection.branchId)) errors.push('Select a valid branch.');
  if (!data.departments.some(item => item.id === selection.departmentId && item.branchId === selection.branchId)) errors.push('Select a department that belongs to the selected branch.');
  if (!data.designations.some(item => item.id === selection.designationId && item.departmentId === selection.departmentId)) errors.push('Select a designation that belongs to the selected department.');
  if (selection.zoneId && !data.zones.some(item => item.id === selection.zoneId)) errors.push('Select a valid zone.');
  if (selection.ucTownId && !data.ucTowns.some(item => item.id === selection.ucTownId && item.zoneId === selection.zoneId)) errors.push('Select a UC/Town that belongs to the selected zone.');
  if (!data.wageTypes.some(item => item.id === selection.wageTypeId)) errors.push('Select a valid wage type.');
  return errors;
}
