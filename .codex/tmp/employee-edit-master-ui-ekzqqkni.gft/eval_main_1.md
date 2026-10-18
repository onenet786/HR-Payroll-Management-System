# Evaluation — Attempt 1

## Overall Verdict: PASS

## Overall Assessment

The edit flow presents a compact, deliberately enterprise-oriented migration experience: the indigo/slate shell stays intact while concise amber guidance turns stale values into explicit replacement decisions. The implementation satisfies the important data-flow requirements and is backed by focused tests. Visual browser inspection could not be completed because the local browser automation Chromium session repeatedly closed its CDP channel before navigation; this assessment is therefore source-led rather than screenshot-verified.

## Scores

| Criterion | Score | Status | Weight | Notes |
|-----------|-------|--------|--------|-------|
| Design Quality | 2/3 | PASS | HIGH | The indigo section treatment, slate controls, and restrained amber exception copy form a coherent compact-HR visual system. The organization row is correctly rebuilt as one/ two/ three columns across phone, tablet, and desktop. |
| Originality | 2/3 | PASS | HIGH | The stale-master-data pattern is specific and intentional: saved values appear as actionable placeholders and compact contextual notices, while each department option carries its owning branch. |
| Craft | 1/3 | PASS | MEDIUM | `min-w-0 w-full`, responsive grid breakpoints, and compact notices are consistently applied in the repaired controls. The tablet organization layout gives Designation a full row, and the zone-in-charge area remains visually heavier than the two adjacent controls. |
| Functionality | 2/3 | PASS | MEDIUM | Same-company department ordering, cross-branch synchronization with designation reset, dependent designation/UC lists, and save-time chain validation are implemented. `npm.cmd test` passed all 17 tests and `npm.cmd run lint` passed. |

## What's Working Well

- The organization assignment is materially improved: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` gives equal desktop columns, and long select text is protected with `min-w-0 w-full`.
- Department choices expose every active department in the resolved company, put the selected branch first, label every option with its branch, retain the exact inactive current exception, and exclude another company.
- Choosing a department on another branch deliberately changes the branch, clears Designation, and immediately explains the consequence in amber copy. This removes a subtle but consequential integrity surprise.
- Legacy Zone, UC/Town, and Wage Type values are not shown as selected master data. Their placeholders and small amber notices clearly ask the user to select a replacement; UC/Town stays disabled until its Zone is selected.
- The focused master-data tests cover the most fragile behavior: company scoping and ordering, current inactive preservation, late-resolution preservation, and cross-branch synchronization. The edit submit path still validates the chain before saving.

## Issues Found

### Issue 1: Tablet organization row is not equally balanced

- **What**: At the `sm` breakpoint, Branch and Department occupy the first two columns while Designation uses `sm:col-span-2`, creating a full-width second row.
- **Where**: Edit Employee → Organization & Regional Assignment → Designation control.
- **Why it matters**: It meets the desktop requirement but creates an uneven visual rhythm at 768px, a required target viewport. The Designation field gains disproportionate emphasis despite the brief treating all three assignments as peers.
- **Suggested fix**: At tablet widths, use a deliberate stacked sequence with matching visual grouping, or use a three-column layout only once there is sufficient modal width. If retaining two columns, make the Designation row look intentionally grouped rather than simply spanning leftover grid space.

### Issue 2: Zone-in-charge control dominates the regional row

- **What**: Zone and UC/Town each use one desktop grid column, while the combined zone-in-charge checkbox/name field spans two.
- **Where**: Edit Employee → Organization & Regional Assignment → regional controls row.
- **Why it matters**: The brief calls for balanced, readable regional controls. The two-column zone-in-charge block is understandable for its input, but it leaves the three concepts visually unequal and can look especially sparse when the employee is the zone in charge and the name input is hidden.
- **Suggested fix**: Give the zone-in-charge control its own deliberate sub-row or make the checkbox/name treatment occupy a consistent single conceptual column at desktop, with the name field moved beneath or made conditionally full width.

## Priority Fixes for Next Attempt

1. Refine the 768px organization grid so the Designation field does not read as an accidental full-width remainder.
2. Rebalance the Zone / UC-Town / Zone-in-charge arrangement, including the checked state where the name input disappears.
3. Re-run visual QA at 375, 768, 1024, and 1440 once browser automation is available; no browser screenshots could be captured in this environment.

## Should the next attempt REFINE or PIVOT?

REFINE. The core direction is sound and the required relational-safety behavior is present and tested. Remaining work is limited to responsive compositional polish and visual verification, not a change in design approach.
