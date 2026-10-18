# Login Password Visibility Brief

## Objective
Update the existing React login screen so every password entry on that screen has an accessible show/hide password control. This includes the normal sign-in password and the initial Super Admin setup password and confirmation fields.

## Audience
HR administrators and employees using the Bin Ishaq HR Suite on desktop, kiosk-sized screens, and mobile.

## Existing application and output
- Framework: React 19, TypeScript, Vite, Tailwind utility classes.
- Existing page: `src/App.tsx`, `LoginScreen` component.
- Make the implementation directly in the existing application. Do not create a standalone page.
- Preserve all unrelated user changes in the dirty worktree.

## Interaction requirements
- Each password field starts masked.
- Add a button inside the right side of each password input to toggle only that field between masked and visible text.
- Use clear eye / eye-off icons, preferably from the project's existing `lucide-react` dependency.
- Buttons must be `type="button"`, keyboard accessible, have a useful dynamic `aria-label`, and expose state with `aria-pressed`.
- Preserve focus behavior, required validation, controlled values, form submission, autofill, and current authentication/setup logic.
- Give inputs enough right padding so typed text never sits beneath the icon.
- Keep the current dark slate/emerald visual language, compact proportions, rounded corners, and visible focus styling.
- The control should have a comfortable touch target and clear hover/focus states without visually overpowering the field.

## Aesthetic direction
Treat the visibility toggle as a quiet, native part of the existing field: slate icon color at rest, lighter/emerald feedback on interaction, consistent with the existing login card. No broader redesign.

## Typography and color
Retain all existing typography and colors. Use existing Tailwind utilities only.

## Memorable quality
Polished interaction details: independent visibility state, obvious icon state change, and accessible labeling.

## Image needs
None. Use code-native icons.

## Verification
Run the TypeScript/lint command and the production build if practical. Report exactly which files changed and any failures.

## Follow-up: discreet Quick Access reveal
- Hide the Quick Access Panel by default on the normal sign-in view.
- Remove the obvious always-visible `Quick Access Panel` header and `Show/Hide` text control.
- Add a very small, stylish dot control at the top-right of the login card. It should be intentionally discreet enough that an ordinary user is unlikely to infer its purpose, while still fitting the slate/emerald visual language.
- Clicking the dot reveals the existing Quick Access Panel; clicking it again hides the panel.
- Keep the dot a real keyboard-accessible `button` with `type="button"`, a useful dynamic `aria-label`, `aria-expanded`, visible keyboard focus, and a sufficiently usable invisible/transparent hit area around the tiny visual dot.
- The visible dot itself should stay tiny. A subtle emerald glow, ring, or state change is welcome; avoid text, a recognizable menu icon, or an attention-grabbing animation.
- Position it so it does not collide with the card border, content, or mobile layout.
- Preserve the existing quick-access autofill behavior and all password visibility work.

## Follow-up: four-corner motif and in-panel hide
- Keep the existing top-right dot as the only corner dot that is clickable and reveals/hides Quick Access.
- Add visually matching tiny dots at the top-left, bottom-left, and bottom-right corners of the login card.
- The three new dots are purely decorative: do not make them buttons, clickable, focusable, or exposed unnecessarily to assistive technology. Use `aria-hidden` where appropriate and ensure they cannot intercept pointer events.
- Match the existing dot's size and understated slate/emerald styling so the four dots read as a quiet corner motif. The non-interactive dots should not imitate the active/open glow strongly enough to imply interaction.
- When Quick Access is open, add a small, tasteful hide/close control inside the panel. It must be an accessible `type="button"` with a clear `aria-label`, keyboard focus styling, and an understated icon or short `Hide` label consistent with the panel.
- Clicking the in-panel control sets Quick Access back to hidden. Keep the top-right dot toggle working in both directions.
- Avoid layout shifts, corner collisions, and overlap on mobile.
