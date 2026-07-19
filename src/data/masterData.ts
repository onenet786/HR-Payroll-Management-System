import type { Employee, UcTown, WageType, Zone } from '../types';

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
  const key = legacy?.trim().toLowerCase();
  return key ? items.find(item => item.name.trim().toLowerCase() === key || item.code?.trim().toLowerCase() === key)?.id ?? '' : '';
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
