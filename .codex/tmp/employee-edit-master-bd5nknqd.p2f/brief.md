# Employee Edit Master-Data Repair

## Objective

Repair the production HR portal Edit Employee form so Assigned Branch, Wage Type, Zone, and UC/Town populate and remain editable for normalized, legacy, inactive-current, multi-company, and late-loaded Firestore records.

## Audience

HR administrators maintaining employee assignment and payroll master data.

## Confirmed diagnosis

- `src/components/WebPortal.tsx` derives `primaryCompany` from `companies[0]` and filters edit options against it.
- Branch is copied from `employee.branchId` without legacy/stale-ID resolution.
- Wage/zone/UC resolution is exact and occurs only once when the modal opens.
- UC/Town is disabled whenever normalized Zone is blank and appears before Zone.
- Firestore master collections load independently, but the open edit modal does not re-resolve after they arrive.
- New employee creation hardcodes `companyId: 'c1'`.
- Firestore data is schema-less and can contain legacy text plus optional normalized IDs.

## Required functional changes

1. Determine edit scope from the employee's actual `companyId` and/or current branch before falling back to a default company. Do not assume `companies[0]` owns every employee.
2. Resolve Branch by valid ID and, when possible, legacy name/code. If a current branch exists but is inactive, missing `companyId`, or outside the normal company filter, retain it as a visible current option instead of rendering blank.
3. Resolve Wage Type, Zone, and UC/Town from valid IDs or normalized legacy name/code values. Retain each valid current referenced record even when inactive or legacy/missing-company metadata would normally filter it out.
4. Build edit-only option lists scoped to the employee company; do not weaken new-employee master-data scoping.
5. Re-resolve still-blank or stale edit master IDs when branches/zones/UCs/wage types arrive while the edit modal is open. Never overwrite a valid selection the user has already changed.
6. Put Zone before UC/Town. UC/Town should depend on Zone, show explicit helper text when disabled, and become editable immediately after Zone selection.
7. Remove hardcoded `companyId: 'c1'` from new employee creation; use the company associated with selected branch or the selected/default company.
8. Preserve legacy text fallback on save, but persist normalized IDs and names whenever a master record is selected.
9. Keep existing department/designation cascading behavior and validation intact.
10. Handle empty master collections honestly with a useful message; do not invent IDs or silently free-type relational IDs.

## Tests

Add focused pure tests covering:

- Valid/stale branch ID plus legacy branch name/code resolution.
- Employee whose company is not `companies[0]`.
- Current inactive or missing-company master records retained in edit options.
- Late snapshot re-resolution without overriding a valid user selection.
- Zone/UC dependency and legacy resolution.
- New employee company derived from selected branch rather than `c1`.

## Aesthetic direction

Preserve the compact enterprise HR modal: white/slate controls, indigo section heading, concise helper copy, strong labels, existing typography and Tailwind vocabulary. The memorable quality is clarity of hierarchy: Zone visibly controls UC/Town, and legacy/current assignments never disappear.

## Layout/content

- Organization row: Branch, Department, Designation.
- Geography row: Zone first, then UC/Town, then existing zone-in-charge controls.
- Add one concise helper line under UC/Town only when a zone must be selected or no towns exist.

## Images

None.

## Output paths

Primary files:

- `D:/GIT-HUB/HR-Payroll-Management-System/src/components/WebPortal.tsx`
- `D:/GIT-HUB/HR-Payroll-Management-System/src/data/masterData.ts`
- `D:/GIT-HUB/HR-Payroll-Management-System/src/data/masterData.test.ts`

Modify types only if necessary. Preserve all unrelated dirty-worktree changes. Do not mutate Firestore or employee data during implementation/testing.
