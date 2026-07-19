# Daily Attendance Register Enhancement

## Objective

Enhance the existing HR web portal Daily Attendance Register so HR can filter the register to one employee and see the reason recorded when each employee punched out.

## Target audience

HR administrators and attendance reviewers investigating an employee's day-wise in/out activity.

## Existing implementation and data

- Production page: `D:/GIT-HUB/HR-Payroll-Management-System/src/components/WebPortal.tsx`
- Attendance type: `D:/GIT-HUB/HR-Payroll-Management-System/src/types.ts` (`AttendanceLog.outReason?: string`)
- Daily report is in the Attendance module around the existing date selector and Daily Attendance Register table.
- Kiosk records already persist `outReason`; no schema or Firestore migration is needed.

## Required behavior

1. Add employee filter state local to the attendance report, defaulting to All Employees.
2. Add a searchable-looking/native select control beside the daily date selector with All Employees and employees sorted by display name (show employee code in the option label).
3. Apply the employee filter to the Daily Attendance Register rows.
4. Apply the same filter to daily summary metrics/denominators so the cards never contradict the visible table.
5. Add an `Out Reason` column immediately after the Out time.
6. Render a concise badge for a recorded `outReason`.
7. For a completed punch-out with no reason (older/manual records), show `Not recorded`; for no punch-out, show an em dash.
8. Keep the employee/status/method behavior unchanged and do not change attendance data.
9. Empty state must be useful if the selected employee no longer exists or there is no row to display.

## Aesthetic direction

Use the existing enterprise HR portal design system: white/soft-slate report surface, navy typography, emerald for healthy/recorded states, amber for missing legacy metadata, compact table density. The filter should feel like part of a serious audit toolbar, not a decorative card.

## Content structure

- Existing report period selector remains unchanged.
- Daily parameter toolbar: date + employee filter in a responsive grid/row.
- Existing metric cards, recalculated for selected scope.
- Existing table with the new reason column.

## Typography and colors

Reuse all existing Tailwind classes, typography, form controls, spacing, badges, and breakpoints already present in `WebPortal.tsx`. Do not introduce a separate visual language.

## Memorable quality

The reason badge makes punch-out context immediately scannable during attendance investigation while the employee filter turns the broad register into a focused daily audit view.

## Image needs

None. Use the existing icon library only if the surrounding controls already do.

## Output path and constraints

- Modify `D:/GIT-HUB/HR-Payroll-Management-System/src/components/WebPortal.tsx`.
- Add a focused pure helper/test only if it materially improves correctness and fits existing conventions.
- Preserve all unrelated dirty-worktree changes.
- Do not edit Firestore, kiosk attendance creation, payroll, or employee records.
- Validate with `npm.cmd run lint` and relevant tests.
