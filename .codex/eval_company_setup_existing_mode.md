# Existing-Company Mode Evaluation

## Overall Verdict: NEEDS REVISION

## Overall Assessment
The iteration adds a clear and useful create/update mode, scoped normal hydration, a guarded discard/reload action, and an accurate post-save success state. However, the most difficult late-data + dirty-edit path is not safe yet: authoritative department IDs are adopted without remapping designation department references, and the hydration guard is never finalized in that path. That can leave an existing company’s edited organization invalid or repeatedly reconciled as asynchronous data changes.

This is a focused source/accessibility/responsive evaluation because reproducing the required asynchronous Firestore timing states through the authenticated runtime is impractical.

## Scenario Verification

| Scenario | Result | Evidence |
|---|---|---|
| Late data, pristine form | PASS | `hydrateSavedSetup()` reacts to company/branch/org/config props and hydrates once when not dirty. |
| Dirty edits protected from late hydration | PARTIAL | Visible field values are preserved, but ID reconciliation can break designation references and remains re-runnable. |
| Organization records scoped to primary branch | PASS in normal hydration | Departments filter by saved branch ID; designations filter by those department IDs. |
| Create/update mode visible | PASS | Header eyebrow/title/description, last-step title, and submit/success copy distinguish modes. |
| Reload/discard behavior | PASS | Existing mode exposes reload; dirty mode asks for confirmation and force-hydrates saved data. |
| Post-save state | PASS | Save action records created/updated, marks existing mode, clears dirty state, and preserves populated local data for review. |
| Accessibility | PARTIAL | Mode/reload controls are clear, but prior progress and dynamic-error semantic gaps remain. Native `confirm()` is functional but not application-styled. |
| Responsive UI | PARTIAL | Core grids collapse safely; the header’s non-wrapping side-by-side title and reload button may become cramped at 375px. |

## Scores
| Criterion | Score | Status | Weight | Notes |
|---|---:|---|---|---|
| Design Quality | 2/3 | PASS | HIGH | Existing/new mode is communicated clearly within the established console design. |
| Originality | 2/3 | PASS | HIGH | The primary-company edit/reload framing and generated-record hierarchy remain product-specific. |
| Craft | 1/3 | PASS | MEDIUM | Normal scoping is careful, but the late dirty reconciliation has a referential-integrity defect and the mobile header needs a wrapping treatment. |
| Functionality | 0/3 | FAIL | MEDIUM | A supported late-data scenario can leave designation department IDs invalid, which blocks progression or risks incorrect organization updates. |

## What’s Working Well
- `existingBranch` no longer falls back to an unrelated first branch.
- Normal hydration scopes departments to the saved main branch and designations to those departments.
- The `dirty` guard prevents pristine asynchronous hydration from overwriting user-entered values.
- “Existing company setup / Update primary company” and “New company setup / Create primary company” are immediately visible.
- Dirty reload changes its label to “Discard & reload saved data” and requires confirmation.
- Success copy correctly reports whether the company was created or updated and offers a route back to populated setup.
- Save success updates local mode flags and the hydrated company identity, avoiding an immediate destructive re-hydration.

## Issues Found

### Issue 1: Late dirty reconciliation breaks designation department references
- **What**: When company data arrives after edits, department rows adopt matching saved department IDs, but designation rows only adopt matching designation IDs. Their `departmentId` remains the old local/generated ID.
- **Where**: The second hydration effect handling `savedCompany && dirty && !hydratedCompanyId.current`.
- **Why it matters**: After department IDs change, `validate()` cannot find the designation’s department. Existing designations may appear selected incorrectly or block the Organization step with “Choose a valid department.” This violates dirty-edit protection because preserved edits become structurally invalid.
- **Suggested fix**: Build an old-department-ID → authoritative-department-ID map during reconciliation. Update every designation’s `departmentId` through that map, and match saved designations within the correctly mapped department rather than by title alone.

### Issue 2: Late dirty hydration never marks reconciliation complete
- **What**: The dirty-data adoption effect does not assign `hydratedCompanyId.current = savedCompany.id`.
- **Where**: Same late-data dirty effect.
- **Why it matters**: Every later branch/department/designation prop change can re-run identity reconciliation while the form remains dirty. That creates unstable IDs and makes user editing dependent on Firestore snapshot timing.
- **Suggested fix**: After the one-time authoritative identity/ID reconciliation completes, set the hydrated company ref. Continue protecting field values with `dirty`; explicit reload can remain the mechanism for accepting later saved values.

### Issue 3: Dirty late-data matching is under-scoped and ambiguous
- **What**: Departments are matched by code or name without normalizing case, and designations are matched by title across the entire scoped designation list rather than by title plus mapped department.
- **Where**: Late dirty reconciliation effect.
- **Why it matters**: Similar titles in different departments can receive the wrong persisted ID; casing differences can cause duplicate local IDs to survive instead of adopting existing records.
- **Suggested fix**: Normalize codes/names before matching and key designation matching by mapped department ID plus normalized title/grade. Prefer explicit stable client IDs when available.

### Issue 4: Existing-mode header is cramped on narrow screens
- **What**: The header uses a single `flex items-start justify-between` row with a substantial title block and a non-wrapping reload button.
- **Where**: Main console header.
- **Why it matters**: At 375px the content area can become overly compressed or overflow, particularly with “Discard & reload saved data.”
- **Suggested fix**: Use `flex-col` at the base breakpoint and `sm:flex-row`; make the reload action full-width or self-starting on mobile.

### Issue 5: Remaining accessibility cleanup is still outstanding
- **What**: Active progress lacks `aria-current="step"`; dynamic organization/group errors are not consistently rendered beside or associated with their controls; the confirmation error has no reliable focus target.
- **Where**: Progress navigation, Organization step, and review confirmation.
- **Why it matters**: Keyboard and screen-reader recovery remains weaker than the visual experience.
- **Suggested fix**: Complete the semantic changes identified in the previous evaluation and give every group-level error a focusable/announced target.

## Priority Fixes
1. Reconcile department IDs and designation `departmentId` values atomically in the late-data dirty path.
2. Mark late dirty identity reconciliation complete and strengthen normalized, department-scoped matching.
3. Stack the existing-mode header/reload action on mobile, then finish progress and validation accessibility semantics.

## Should the next attempt REFINE or PIVOT?
REFINE. The UX direction and normal existing-company flow are strong; the required change is a focused correction to asynchronous identity reconciliation plus small responsive/accessibility cleanup.
