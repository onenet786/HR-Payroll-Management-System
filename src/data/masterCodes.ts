import type { Branch, Company, Department, Designation, UcTown, WageType, Zone } from '../types';

export type GeneratedCodeKind = 'department' | 'designation' | 'zone' | 'ucTown' | 'wageType';
type CodedRecord = { id: string; code?: string };
export type MasterCodeTrailItem = { value: string; label: string };

const ascii = (value = '') => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const words = (value = '') => ascii(value).match(/[A-Z0-9]+/g) ?? [];
const compactToken = (value = '', max = 8) => words(value).join('').slice(0, max);
const readableToken = (value = '', max = 6) => {
  const parts = words(value);
  if (parts.length > 1) return parts.map(part => part[0]).join('').slice(0, max);
  return (parts[0] ?? '').slice(0, max);
};
const recordToken = (record?: { code?: string; name?: string }, max = 8) =>
  compactToken(record?.code, max) || readableToken(record?.name, max);

/** Prefer the configured company abbreviation and derive stable initials only for legacy companies. */
export const companyCodeToken = (company?: Pick<Company, 'code' | 'name'>) =>
  compactToken(company?.code, 8) || readableToken(company?.name, 6);

export const normalizeManualMasterCode = (value: string) => value.trim().toUpperCase();

export const isSafeMasterCode = (value: string) => /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(value);

export function nextUniqueMasterCode(base: string, records: CodedRecord[], currentId = ''): string {
  if (!base) return '';
  const used = new Set(records
    .filter(record => record.id !== currentId && record.code)
    .map(record => normalizeManualMasterCode(record.code ?? '')));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${String(suffix).padStart(2, '0')}`)) suffix += 1;
  return `${base}-${String(suffix).padStart(2, '0')}`;
}

export function resolveDesignationHierarchy(
  departmentId: string,
  departments: Department[],
  branches: Branch[],
  companies: Company[]
) {
  const department = departments.find(item => item.id === departmentId);
  const branch = branches.find(item => item.id === department?.branchId);
  const company = companies.find(item => item.id === branch?.companyId);
  return { company, branch, department };
}

export function resolveDepartmentHierarchy(branchId: string, branches: Branch[], companies: Company[]) {
  const branch = branches.find(item => item.id === branchId);
  const company = companies.find(item => item.id === branch?.companyId);
  return { company, branch };
}

export function resolveUcTownHierarchy(zoneId: string, zones: Zone[], companies: Company[]) {
  const zone = zones.find(item => item.id === zoneId);
  const company = companies.find(item => item.id === zone?.companyId);
  return { company, zone };
}

export function designationCodeBase(title: string, company?: Company, branch?: Branch, department?: Department) {
  const tokens = [companyCodeToken(company), recordToken(branch), recordToken(department), readableToken(title)];
  return tokens.every(Boolean) ? tokens.join('-') : '';
}

export function departmentCodeBase(name: string, company?: Company, branch?: Branch) {
  const tokens = [companyCodeToken(company), recordToken(branch), readableToken(name)];
  return tokens.every(Boolean) ? tokens.join('-') : '';
}

export function zoneCodeBase(name: string, company?: Company) {
  const tokens = [companyCodeToken(company), 'ZN', readableToken(name, 8)];
  return tokens.every(Boolean) ? tokens.join('-') : '';
}

export function ucTownCodeBase(name: string, zone?: Zone) {
  const child = ascii(name).replace(/^\s*(?:(?:UC|TOWN)\s*[-_./]*\s*)+/i, '');
  const tokens = [words(zone?.code).join('-'), 'UC', compactToken(child, 8)];
  return tokens.every(Boolean) ? tokens.join('-') : '';
}

export function wageTypeCodeBase(name: string, company?: Company) {
  const tokens = [companyCodeToken(company), 'WT', readableToken(name, 6)];
  return tokens.every(Boolean) ? tokens.join('-') : '';
}

export function validateManualMasterCode(value: string, records: CodedRecord[], currentId = ''): string {
  const normalized = normalizeManualMasterCode(value);
  if (!normalized) return 'Code is required.';
  if (!isSafeMasterCode(normalized)) return 'Use uppercase letters, numbers, and single hyphens only.';
  if (records.some(record => record.id !== currentId && normalizeManualMasterCode(record.code ?? '') === normalized)) {
    return 'This code is already in use for the selected scope.';
  }
  return '';
}

export function generateMasterCode(
  kind: GeneratedCodeKind,
  input: { name: string; title: string; company?: Company; branch?: Branch; department?: Department; zone?: Zone },
  records: Array<Department | Designation | Zone | UcTown | WageType>,
  currentId = ''
) {
  const base = kind === 'department'
    ? departmentCodeBase(input.name, input.company, input.branch)
    : kind === 'designation'
      ? designationCodeBase(input.title, input.company, input.branch, input.department)
    : kind === 'zone'
      ? zoneCodeBase(input.name, input.company)
      : kind === 'ucTown'
        ? ucTownCodeBase(input.name, input.zone)
        : wageTypeCodeBase(input.name, input.company);
  return nextUniqueMasterCode(base, records, currentId);
}

/** Explain the generated identifier in the same segments used to construct it. */
export function masterCodeTrail(
  kind: GeneratedCodeKind,
  input: { name: string; title: string; company?: Company; branch?: Branch; department?: Department; zone?: Zone },
  generatedCode: string
): MasterCodeTrailItem[] {
  const items: MasterCodeTrailItem[] = kind === 'department'
    ? [
      { value: companyCodeToken(input.company), label: 'Company' },
      { value: recordToken(input.branch), label: 'Branch' },
      { value: readableToken(input.name), label: 'Department' },
    ]
    : kind === 'designation'
      ? [
      { value: companyCodeToken(input.company), label: 'Company' },
      { value: recordToken(input.branch), label: 'Branch' },
      { value: recordToken(input.department), label: 'Department' },
      { value: readableToken(input.title), label: 'Title' },
    ]
    : kind === 'zone'
      ? [
        { value: companyCodeToken(input.company), label: 'Company' },
        { value: 'ZN', label: 'Zone type' },
        { value: readableToken(input.name, 8), label: 'Zone' },
      ]
      : kind === 'ucTown'
        ? [
          { value: words(input.zone?.code).join('-'), label: 'Parent Zone' },
          { value: 'UC', label: 'Location type' },
          { value: compactToken(ascii(input.name).replace(/^\s*(?:(?:UC|TOWN)\s*[-_./]*\s*)+/i, ''), 8), label: 'Location' },
        ]
        : [
          { value: companyCodeToken(input.company), label: 'Company' },
          { value: 'WT', label: 'Wage type' },
          { value: readableToken(input.name, 6), label: 'Name' },
        ];
  const completeItems = items.filter(item => item.value);
  const base = completeItems.map(item => item.value).join('-');
  if (base && generatedCode.startsWith(`${base}-`)) {
    completeItems.push({ value: generatedCode.slice(base.length + 1), label: 'Collision suffix' });
  }
  return completeItems;
}
