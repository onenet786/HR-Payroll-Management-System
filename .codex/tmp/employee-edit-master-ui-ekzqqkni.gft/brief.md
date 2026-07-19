# Employee Edit Master-Data Repair — Iteration 2

## Objective
Repair the existing React/Tailwind Edit Employee modal so HR can understand and replace legacy employee assignments with current Master Data, even when the employee's saved Branch/Department/Zone/UC/Wage Type chain is inconsistent. Preserve strict relational integrity on save and never silently migrate data.

## User evidence and exact data mismatch
- Employee shown: Aqeel Ur Rehman, assigned Branch `Karachi HQ Office`.
- Configured departments are all attached to `Head Office`, including Information Technology, Human Resources, Warehouse & Logistics, Finance & Accounts, and IT. Therefore filtering departments only to Karachi HQ returns none.
- Only current Zone is `Wagha`; only UC/Town is `UC178` under Wagha.
- Only current Wage Type is `Contrual` (Monthly).
- Employee saved values are legacy `East Zone`, `UC-2 Clifton Town`, and `Salaried`; they do not match those masters.
- Screenshot shows a visually unbalanced Organization row: Branch and Department occupy narrow cells while Designation spans half the modal.

## Required behavior
1. Keep the Branch → Department → Designation relationship valid.
2. In Edit Employee, Department must expose all active departments belonging to branches in the employee's resolved company, not only the currently selected branch. Visually group or label them by Branch.
3. Departments belonging to the selected Branch should appear first. Departments from other Branches in the same company must be clearly labeled with their Branch. Selecting one must intentionally synchronize Assigned Branch to that department's Branch and clear Designation; add concise helper feedback so the behavior is not surprising.
4. Preserve the employee's exact current inactive/legacy Department as an exceptional current option if resolvable. Do not expose cross-company departments.
5. Designation remains dependent on Department and shows active designations for the chosen Department. Preserve exact current exceptional designation if applicable.
6. When saved Zone/UC/Wage text does not match a master ID, do not present the legacy text as though it were a selected option. Use actionable placeholder/helper copy such as `Choose master zone (saved: East Zone)` and show the valid current options in the same select. Once Wagha is selected, UC178 must be available.
7. Treat Wage Type similarly: `Choose wage type (saved: Salaried)`, with current master choices available. Do not auto-select Contrual.
8. Save validation must continue to reject invalid chains and require an explicit valid Branch, Department, Designation, and Wage Type.
9. Master snapshots can load after the modal opens; late re-resolution must preserve valid user choices and must not silently overwrite them.
10. Add focused pure tests for company-scoped Department options/order and cross-branch Department selection synchronization logic. Prefer extracting helpers to `src/data/masterData.ts` over embedding hard-to-test logic in JSX.

## Layout and visual direction
- Retain the compact enterprise HR aesthetic, existing indigo header, white/slate controls, typography, and modal shell.
- Make Organization assignment a balanced responsive grid: one column on phone, three equal columns at desktop for Branch, Department, Designation. Do not make Designation double width.
- Zone, UC/Town, and zone-in-charge controls should remain visually balanced and readable.
- Use compact amber legacy notices directly below affected selects; avoid large warning cards or decorative redesign.
- Controls must use `min-w-0 w-full` where needed so long placeholder text does not stretch or distort columns.
- Maintain responsive behavior at 375, 768, 1024, and 1440px.

## Typography and colors
Use the existing project type scale and font choices. Indigo remains the section accent; slate for normal labels/controls; amber only for legacy/mismatch guidance. No new global theme.

## What makes it memorable
The form explains stale data as an explicit migration decision: HR can see the saved legacy value, see the exact current Master Data choices, and make a safe replacement without hidden automatic changes.

## Image needs
None.

## Output
Modify the real application in:
- `src/components/WebPortal.tsx`
- `src/data/masterData.ts`
- `src/data/masterData.test.ts`

Preserve unrelated dirty-worktree changes. Use `apply_patch` for edits. Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, and scoped `git diff --check`.
