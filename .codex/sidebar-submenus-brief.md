# Grouped Left Sidebar Brief

## Objective
Reorganize the existing permission-aware left navigation in `src/components/WebPortal.tsx` into a polished collapsible sidebar with related pages grouped under submenus. Preserve every existing reachable destination, permission rule, badge, icon, and rendered module. Do not create new routes or placeholder pages.

## Audience
HR administrators, payroll staff, managers, and employees using the Bin Ishaq HR Suite on desktop and mobile.

## Existing application and output
- React 19 + TypeScript + Vite + Tailwind utilities + lucide-react.
- Implement directly in `src/components/WebPortal.tsx` and only touch another application file if strictly necessary.
- The working tree contains unrelated user changes; preserve them.
- Existing navigation state is `activeTab`; existing mobile state is `sidebarOpen`.
- Use existing permissions and the existing `hasPermission` logic. Main content authorization must remain intact.

## Information architecture

### Standalone
- Operations Dashboard (`dashboard`)

### People
- Employee Directory (`employees`)
- Recruitment (`recruitment`)
- Performance (`performance`)
- Asset Management (`assets`)

### Time & Attendance
- Attendance Logs (`attendance`)
- Leave Management (`leaves`)
- Holiday Calendar (`holidays`)
- Biometric Enrollment (`biometric`)

### Payroll & Benefits
- Payroll Processing (`payroll`)
- Salary Revisions (`revisions`)
- Loans & Advances (`loans`)
- Gratuity & Settlement (`gratuity`)
- Statutory Config (FBR) (`settings`)

### System
- Access Control (`access`)
- Data Backup (`maintenance`)
- Notifications (`notifications`)
- User Guide (`help`)

Each existing destination must appear exactly once. Do not invent Branch, Department, Designation, Settings, or User Account destinations because they are not standalone routes in the current app.

## Permissions and visibility
- Retain the current per-tab permission semantics exactly.
- Filter submenu children by permission.
- Hide a group if it has no permitted children.
- Keep Dashboard visible only under its existing permission logic.
- Preserve all existing dynamic badges: attendance regularizations, pending leaves/loans, face/fingerprint, holiday count, performance count, asset count, open jobs, unread notifications, and User Guide NEW.

## Interaction
- Group headers are accessible `button` elements with chevrons, dynamic `aria-expanded`, and `aria-controls` where useful.
- Clicking a group header expands/collapses it and must not navigate.
- Automatically expand the group containing the active page. A user may still collapse it; selecting a destination must ensure its group is open.
- Keep expanded/collapsed group state for the current browser session using `sessionStorage`, with a safe fallback when unavailable.
- On mobile, tapping a group header must not close the sidebar. Tapping a destination should navigate and close it.
- Preserve the existing mobile slide-out, backdrop, hamburger, and close button behavior.
- Add a desktop collapsed/icon-only mode if it can be implemented cleanly without weakening accessibility. Persist that preference for the browser session. In collapsed mode, provide accessible labels/tooltips and a clear expand control. If this creates material risk in the monolithic component, prioritize robust grouped navigation and mobile behavior.
- Active child and active group should both be visually apparent.
- Keep logout and signed-in user controls working. They may remain in the header; do not duplicate them.

## Aesthetic direction
A dense, professional HR operations console: deep slate surfaces, emerald active accents, restrained dividers, and compact hierarchy. Group headers should feel structural and calm; child links should be clearly nested with indentation or a subtle guide line. Avoid oversized cards, gradients, or decorative animation in the sidebar.

## Typography
Retain the existing application font and compact uppercase/semibold navigation language. Use hierarchy through weight, spacing, indentation, and muted slate colors.

## Color
Retain the existing slate and emerald palette. Active children use the established emerald treatment; expanded/active group headers receive a quieter emerald/slate indication.

## Memorable quality
The sidebar should make a large HR suite feel immediately understandable: four crisp domains, reliable auto-expansion, preserved live badges, and excellent keyboard/mobile behavior.

## Images
None. Reuse existing lucide-react icons; chevrons may use lucide icons already available.

## Accessibility
- Full keyboard operation and visible focus styles.
- Correct button semantics for group toggles.
- Do not rely on color alone for expanded or active state.
- Maintain readable contrast and reasonable touch targets.

## Verification
- Run `npm.cmd run lint` and `npm.cmd run build`.
- Confirm every current tab key remains represented once, permission filtering still applies, badges remain, mobile group toggles do not close the sidebar, and destination clicks do close it.
- Report exact files changed and any warnings/failures.

## Approved iteration: collapsed initial state
- On every fresh page load, initialize all four submenu groups as collapsed.
- Do not automatically expand the group containing the default/current active tab during initial render.
- Do not restore expanded groups from `sessionStorage` on page load; remove the expanded-group persistence if present so stale session state cannot reopen groups.
- Group headers must continue to expand/collapse normally when clicked.
- When a user selects a submenu destination, its group may remain open for the rest of the current mounted session, but refreshing/reloading must collapse all groups again.
- Preserve permission filtering, active styling, badges, keyboard support, and mobile behavior.

## Approved iteration: single-open accordion
- Allow at most one submenu group to be expanded at any time.
- All groups still initialize collapsed on every fresh page load.
- Opening a collapsed group must close every other group in the same state update.
- Clicking the currently open group header must collapse it, leaving all groups closed.
- When selecting/navigating to a submenu destination, keep only that destination's parent group open for the current mounted session.
- Apply the same behavior on desktop and mobile; group-header clicks must not close the mobile sidebar, while destination clicks retain existing mobile-close behavior.
- Preserve ARIA expanded states, permissions, badges, active styling, and keyboard support.
