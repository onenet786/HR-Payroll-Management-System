# Evaluation — Attempt 1

## Overall Verdict: NEEDS REVISION

## Overall Assessment

The edit modal preserves the existing compact HR-console language well: a restrained white/slate form, indigo section headers, clear labelled controls, and a useful Zone → UC/Town dependency. The repair is substantially supported by focused pure tests and has no TypeScript errors, but the visual treatment remains largely a dense, generic four-column admin form and its unchanged grid has no mobile breakpoint. In addition, the edit-only option helper exposes every active master record missing `companyId`, which conflicts with the brief's requirement to retain a *current* legacy record without weakening company scoping.

## Scores

| Criterion | Score | Status | Weight | Notes |
|-----------|-------|--------|--------|-------|
| Design Quality | 2/3 | PASS | HIGH | The indigo header and section headings consistently organize the large modal, and Zone preceding UC/Town makes the dependency legible. The very compact type and four-column density make the hierarchy harder to scan than it needs to be. |
| Originality | 1/3 | FAIL | HIGH | The requirement-specific dependency messaging and legacy/current labels are deliberate, but nearly all composition is a stock dense Tailwind form: repeated four-column rows, identical bordered controls, and no visual grouping that makes the repaired master-data fields memorable. |
| Craft | 1/3 | PASS | MEDIUM | Desktop styling is orderly, with consistent borders, radii, and section dividers. The edit modal uses `grid-cols-4` throughout without responsive variants, so labels such as “UC / Town Information” and long banking labels will be compressed or overflow on a 375px viewport. |
| Functionality | 1/3 | PASS | MEDIUM | Zone correctly precedes and enables UC/Town, empty states are explicit, validation remains present, and all 15 tests pass. However, `getEmployeeEditOptions` includes every active record whose `companyId` is absent, not only the employee's currently referenced record, weakening multi-company isolation in the edit form. |

## What's Working Well

- The organization row correctly places Branch, Department, and Designation together; the geography row puts Zone before the disabled UC/Town control, followed by the zone-in-charge controls.
- The UC/Town control clearly explains both disabled states: “Select a Zone to enable UC / Town” and the no-records condition. This is concise and materially improves operational confidence.
- Current inactive Zone, UC/Town, and Wage Type records receive explicit current/inactive text rather than vanishing from their selects. The implementation also re-resolves stale values when master snapshots arrive and preserves a valid user selection.
- The pure tests directly cover branch name/code fallback, company resolution, stale master IDs, late re-resolution, Zone/UC matching, and company derivation. `npm.cmd test` passed 15/15 and `npm.cmd run lint` completed cleanly.

## Issues Found

### Issue 1: Edit scoping admits unrelated legacy records

- **What**: `getEmployeeEditOptions` returns any active item with no `companyId` for every employee company. The current record is retained by `item.id === currentId`, but the `!item.companyId` branch also admits unrelated legacy records.
- **Where**: `src/data/masterData.ts`, `getEmployeeEditOptions`; used for edit Branch, Zone, and Wage Type lists in `WebPortal.tsx`.
- **Why it matters**: In a multi-company HR system, an administrator may select a legacy master record belonging to another company. That violates the requested edit-only company scope and makes an otherwise successful repair unsafe.
- **Suggested fix**: Keep company-matched active records plus the exact resolved/current record. Include an unscoped legacy record only when it is that employee's resolved current assignment (or can be conclusively matched from that employee's legacy text), not as a general option.

### Issue 2: No responsive layout for the edit form

- **What**: The modal's personal, organization/geography, wage, and statutory rows are all fixed `grid-cols-4`; only column spans change.
- **Where**: Edit Employee modal in `src/components/WebPortal.tsx`, especially sections beginning around the Personal & Core Details and Organization & Regional Assignment blocks.
- **Why it matters**: At 375px the form will retain four narrow columns, making labels and selection values difficult to read and operate. This undercuts the stated clarity of the repaired relationship fields.
- **Suggested fix**: Use a single-column base grid, then `sm:grid-cols-2` and `lg:grid-cols-4`; reset relevant `col-span-*` values at narrow widths. Keep Zone and UC/Town adjacent from `sm` upward, but stacked on phones.

### Issue 3: Current legacy branch status lacks a clear visual cue

- **What**: Branch options only append “(Current)” if their company differs from the resolved company. Unlike Zone, UC/Town, and Wage Type, an inactive or missing-company current Branch is not clearly marked as retained exceptional data.
- **Where**: Assigned Branch select in the Edit Employee modal.
- **Why it matters**: The brief's memorable quality is that legacy/current assignments never disappear. The user can see such a branch, but cannot tell why it remains selectable or whether it is inactive.
- **Suggested fix**: Apply the same explicit suffix pattern used elsewhere, e.g. “(Inactive — current)” and “(Legacy metadata — current)”, while leaving other options normally scoped.

## Priority Fixes for Next Attempt

1. Tighten edit option filtering so only company-scoped active records and the employee's own resolved legacy/current record are selectable; add a regression test proving an unrelated unscoped record is excluded.
2. Add responsive grid classes to all edit sections and verify the modal at 375px, 768px, and 1440px, with Zone and UC/Town easy to scan and operate at each size.
3. Standardize exceptional-current labels across Branch, Zone, UC/Town, and Wage Type so retained legacy/inactive assignments are visibly intentional.

## Should the next attempt REFINE or PIVOT?

REFINE. The compact enterprise direction, hierarchy, dependency copy, and supporting resolution flow are sound. The next pass should sharpen the existing design's responsive craft and restore strict option scoping rather than replace the modal's visual system.
