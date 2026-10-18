# Existing-Company Mode Evaluation — Attempt 2

## Overall Verdict: PASS

## Overall Assessment
The revised existing-company flow resolves the previous referential-integrity blocker. Late authoritative data now reconciles department and designation identities together, preserves visible dirty edits, scopes matches to the saved branch, and marks reconciliation complete. The create/update presentation, reload behavior, mobile header, progress semantics, and common focus-recovery paths are now suitable for release, with only minor cleanup remaining.

This was a focused source evaluation because deterministic authenticated runtime reproduction of late Firestore snapshot timing is impractical.

## Required Fix Verification

| Requirement | Result | Evidence |
|---|---|---|
| Atomic designation department remapping | PASS | The department reconciliation builds an old-ID → authoritative-ID map, then updates each designation’s `departmentId` through that map before matching its saved ID. |
| Hydration guard | PASS | The late dirty path assigns `hydratedCompanyId.current = savedCompany.id`, preventing repeated snapshot reconciliation. |
| Normalized matching | PASS | Codes, names, titles, and grades are trimmed and lowercased before comparison; designation matching is additionally scoped to the mapped department ID. |
| Mobile header | PASS | Base/mobile styles stack header content and stretch the reload action; desktop retains the side-by-side layout. |
| Active-step semantics | PASS | The current progress button exposes `aria-current="step"`. |
| Focus recovery | PASS with minor limitation | Field IDs, dynamic row-label fallbacks, organization fallback, and confirmation checkbox recovery cover the important invalid paths. Generic compliance-range errors still rely primarily on the announced banner. |

## Scores
| Criterion | Score | Status | Weight | Notes |
|---|---:|---|---|---|
| Design Quality | 2/3 | PASS | HIGH | Existing/new mode remains clear and the mobile header now preserves hierarchy without crowding. |
| Originality | 2/3 | PASS | HIGH | The edit-safe primary-company console and generated organization tree remain specific and purposeful. |
| Craft | 2/3 | PASS | MEDIUM | Reconciliation is normalized and branch/department scoped, responsive behavior is explicit, and progress semantics are improved. |
| Functionality | 2/3 | PASS | MEDIUM | Late pristine hydration, dirty-edit protection, ID adoption, discard/reload, save, and populated post-save review now form a coherent lifecycle. |

## What’s Working Well
- Late dirty edits retain user-entered values while adopting authoritative company, branch, department, and designation IDs.
- Designation matching uses the remapped department ID plus normalized title and optional grade, avoiding cross-department title collisions.
- Normal hydration still scopes departments to the saved primary branch and designations to those departments.
- The hydration ref now closes the one-time reconciliation path and protects ongoing dirty editing from later snapshots.
- Mobile header content stacks and the reload/discard action becomes full width.
- Existing/create/update language remains visible in the header, last step, submit action, and success state.
- Dirty reload still confirms before discarding; post-save mode and local populated state remain consistent.
- `aria-current` improves progress orientation, while focus recovery covers shared fields, dynamic rows, organization, and confirmation.

## Minor Issues Remaining

### 1. Generic compliance errors have no dedicated focus target
- **What**: Negative/out-of-range statutory values create the group key `compliance`, but the focus fallback does not target the compliance fieldset or first invalid numeric control.
- **Impact**: The error banner is announced, but keyboard recovery is less precise than for identity and organization errors.
- **Suggested fix**: Give the statutory grid/fieldset an ID and focus it with `tabIndex={-1}`, or generate per-field numeric errors.

### 2. Legacy registration checkboxes remain redundant
- **What**: The old availability checkboxes and `registrations` state coexist with the authoritative Registered / Pending / Not applicable selectors.
- **Impact**: The controls describe the same concept twice, and the old state does not determine persistence.
- **Suggested fix**: Remove the legacy checkbox grid and unused state.

### 3. Reconciliation uses a nested state setter
- **What**: `setDesgRows` is invoked inside the `setDeptRows` updater to consume the locally built ID map.
- **Impact**: It works for the current path but is harder to reason about under React scheduling and Strict Mode than a single precomputed reconciliation step.
- **Suggested fix**: Extract a pure reconciliation helper returning both arrays, then call the two setters with its results.

## Final Recommendation
Approve this iteration. The remaining items are refinements and do not undermine data integrity, edit safety, mode clarity, or responsive usability.
