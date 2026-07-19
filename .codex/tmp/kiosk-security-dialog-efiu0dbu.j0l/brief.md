# Kiosk Custom Message Dialog Brief

## Objective

Replace the remaining browser-native confirmation used by the Windows attendance kiosk (especially Exit Kiosk) with a reusable, production-quality custom message dialog in the existing Electron renderer.

## Audience

Employees and kiosk administrators using a dedicated full-screen Windows attendance terminal.

## Aesthetic direction

Extend the kiosk's existing dark graphite/navy interface with emerald operational accents and a restrained red danger accent. The dialog should feel like a secure terminal decision surface: compact, calm, high-contrast, and deliberate rather than decorative.

## Content structure

- Modal overlay and compact alert-dialog panel.
- Tone icon/orb, small eyebrow, clear title, concise message, optional detail.
- Close control, Cancel action, and configurable primary action.
- Exit usage: eyebrow `SECURE SESSION`, title `Exit attendance kiosk?`, warning that attendance capture will stop on this terminal, `Cancel` and `Exit Kiosk` actions.
- Reusable Promise-based renderer function supporting info, warning, danger, and success tones.
- Keyboard behavior: focus trap, Escape cancels, restore previous focus, backdrop cancels, initial focus on the safe Cancel action when present.

## Typography and color

Use the existing project fonts, variables, radius language, shadows, and button conventions in `windows-kiosk/renderer/styles.css`. Danger should be visible but not flood the whole dialog red.

## Output path

Modify only:

- `D:/GIT-HUB/HR-Payroll-Management-System/windows-kiosk/renderer/index.html`
- `D:/GIT-HUB/HR-Payroll-Management-System/windows-kiosk/renderer/styles.css`
- `D:/GIT-HUB/HR-Payroll-Management-System/windows-kiosk/renderer/app.js`

Do not change settings, attendance modes, backend handlers, or maintenance confirmation. Another workstream owns security logic. Preserve all existing dirty-worktree changes.

## Image needs

No raster images. Use the existing inline icon approach for a simple warning/exit symbol.

## Constraints

- Remove the renderer's native `confirm()` call.
- Do not trigger `api.exit()` during testing.
- Do not modify the fatal main-process `dialog.showErrorBox`; it is a last-resort crash fallback when the renderer may not exist.
- Keep Content Security Policy compatibility; no inline script or external asset.
- Use accessible semantics and no browser-native alert/confirm/prompt.
