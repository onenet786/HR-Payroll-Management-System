# Master Data Add/Edit Management Brief

## Objective
Add a dedicated, production-quality **Master Data** page for ongoing Add/Edit management of:
- Branch
- Department
- Designation
- Zone
- UC/Town
- Wage Type

This page complements Company Setup: Company Setup handles onboarding/baseline creation; Master Data handles later maintenance. Do not use prompt dialogs or component-only temporary arrays.

## Audience
Authorized HR/system administrators maintaining organization and payroll reference data.

## Application and output
- React 19 + TypeScript + Tailwind utilities + lucide-react + Firestore/local fallback.
- Create a focused `src/components/MasterDataModule.tsx` and integrate through existing App → DeviceEmulator → WebPortal flow.
- Preserve unrelated dirty-worktree changes.

## Normalized data model
Keep existing stable-ID models:
- `Branch { id, companyId, code?, name, city, province, address }`
- `Department { id, branchId, name, code }`
- `Designation { id, departmentId, title, grade }`

Add backward-compatible types:
- `Zone { id, companyId, code, name, status: 'Active'|'Inactive' }`
- `UcTown { id, zoneId, code, name, status: 'Active'|'Inactive' }`
- `WageType { id, companyId, code, name, calculationBasis: 'Monthly'|'Daily', status: 'Active'|'Inactive' }`

Extend Employee with optional `zoneId`, `ucTownId`, and `wageTypeId`, while retaining legacy `zone`, `ucTown`, and `wageType` snapshot strings for backward compatibility.

## Persistence
- Add App state and Firestore listeners/localStorage hydration for `zones`, `ucTowns`, and `wageTypes`.
- Include these collections in required snapshot accounting and Firestore maintenance backup/restore.
- Provide cohesive add/update callbacks for all six entities. Preserve IDs on edit and use Firestore merge writes.
- Use `crypto.randomUUID()` with safe fallback for new IDs.
- Keep optimistic/local fallback behavior consistent with the application, but report save errors visibly in the module.
- On first use with no normalized records, provide deterministic/semi-deterministic baseline migration/seeding from existing employee legacy values plus required wage types: Salaried/Monthly and Daily Wager/Daily. Avoid duplicate seeds after reload.

## Payroll safety
- Wage Type `calculationBasis` drives payroll daily/monthly semantics.
- Update payroll calculation and other equality checks to resolve calculation basis by `employee.wageTypeId`, falling back to legacy `employee.wageType === 'Daily Wager'` for unmigrated records.
- Treat calculation basis as locked/immutable once a wage type is referenced by employees, or require a clear blocking message. Renaming code/name must not change calculation behavior.
- Employee add/edit must save both IDs and legacy display strings during migration.

## Page structure
Create one responsive page with six accessible tabs:
1. Branches
2. Departments
3. Designations
4. Zones
5. UC/Towns
6. Wage Types

Each tab includes:
- Clear title, description, total/active count, search/filter.
- Responsive table/list with parent context and reference counts.
- Primary `Add …` button.
- Row-level `Edit` action.
- Active/Inactive badge and edit control where applicable.
- Helpful empty state.

Use a modal/drawer form for Add/Edit, not browser prompts. Forms must have semantic labels, inline validation, accessible errors, cancel/save controls, saving state, and focus management.

## Entity forms and validation

### Branch
- Name, unique code within primary company, city, province, address.
- Bind to primary company ID automatically.

### Department
- Parent branch, name, unique code within branch.
- If the department has employees or designations, do not silently change its branch. Lock parent or block with explanation.

### Designation
- Parent department, title, grade.
- If referenced by employees, do not silently move it to another department. Lock parent or block with explanation.

### Zone
- Name, unique code within primary company, status.

### UC/Town
- Parent zone, name, unique code within zone, status.

### Wage Type
- Name, unique code within primary company, calculation basis Monthly/Daily, status.
- Lock calculation basis when referenced.

Normalize codes uppercase and trim all labels. Validate required parent relationships and duplicates case-insensitively. No destructive delete is requested: use inactive status for new normalized entities; keep referenced values resolvable.

## Employee form/report integration
- Replace temporary `localZones`, `localUcs`, and `localWageTypes` with persisted master-data props/state.
- Employee add/edit selects should show active records plus the employee's currently assigned inactive record.
- Zone selection filters UC/Town options by `zoneId`.
- Department selection remains filtered by branch; Designation remains filtered by department.
- Resolve display by ID first, legacy string second.
- Reports/grouping should use resolved current Zone/UC names, with legacy fallback.
- Remove prompt-based Add options from employee forms or route users clearly to Master Data; avoid duplicate management paths.

## Navigation and permission
- Add `master-data` portal tab under **System**, directly after Company Setup.
- Use an appropriate lucide icon such as `ListTree`.
- Require existing `manage_settings` permission.
- Preserve the single-open sidebar accordion, all-collapsed initial state, mobile closing behavior, badges, and active styling.

## Aesthetic direction
A precise enterprise reference-data console in the existing slate/emerald design language. Compact tabs, clean tables, restrained status badges, and form drawers/modals should make relationships obvious without feeling like six separate pages.

## Accessibility and responsive behavior
- Keyboard-operable tabs with appropriate roles/selection state.
- Labeled controls, visible focus, `aria-invalid`/described errors, and modal focus handling.
- Mobile lists/forms remain usable without clipped actions; tables may become cards or scroll safely.

## Images
None. Use existing lucide-react icons.

## Verification
- Add focused tests for wage calculation-basis resolution and any migration/resolver helpers.
- Run `npm.cmd run lint`, `npm.cmd run test`, and `npm.cmd run build`.
- Verify add/edit persistence, stable IDs, duplicate validation, relationship locks, employee selector integration, report fallback, permission filtering, sidebar accordion behavior, and backup mapping.
- Report exact files changed and known limitations.

## Blocking iteration: employee Add/Edit dropdown population
- Current observed bug: only Branch is populated in employee Add/Edit; Department, Designation, Zone, UC/Town, and Wage Type are empty or still use obsolete local/prompt data.
- Finish the normalized selector integration in both Add Employee and Edit Employee forms.
- Branch options come from persisted branches for the primary company.
- Department options must populate from persisted departments whose `branchId` equals the selected branch. When Branch changes, clear an incompatible Department and Designation.
- Designation options must populate from persisted designations whose `departmentId` equals the selected department. When Department changes, clear an incompatible Designation.
- Zone options must populate from persisted active zones for the primary company, plus the currently assigned inactive zone during edit.
- UC/Town options must populate from persisted active UC/Towns whose `zoneId` equals the selected zone, plus the currently assigned inactive UC/Town during edit. When Zone changes, clear an incompatible UC/Town.
- Wage Type options must populate from persisted active wage types for the primary company, plus the currently assigned inactive wage type during edit.
- On Add/Edit form initialization, migrate/resolve legacy employee string values to normalized IDs by case-insensitive trimmed name/code matching when IDs are absent.
- On submit, save `zoneId`, `ucTownId`, `wageTypeId` and also write the resolved `zone`, `ucTown`, `wageType` display strings for compatibility.
- Each dependent empty dropdown must show an explanatory disabled option such as `Select a branch first` or `No departments configured in Master Data`, rather than appearing broken.
- Remove the obsolete `+ Add` prompt options for Zone, UC/Town, and Wage Type; management belongs in System → Master Data.
- Confirm both new and edit forms behave identically and current existing values remain visible.
