# Hierarchical Master Code Auto-Generation

## Objective
Add safe, deterministic auto-generated codes to the existing Master Data drawer for Departments, Designations, Zones, UC/Towns, and Wage Types. Codes must visibly reflect the selected company and hierarchy, remain unique, be stable after save, and never silently rewrite existing referenced records.

## Feedback iteration: Department required-code failure
The user created a new Department under `Lahore Main Office`, entered `Information Techonology`, and still received `Code is required.` This iteration overrides any earlier four-kind wording: Department must participate fully in the generated-code workflow.

Department requirements:
- Pattern: company + selected branch + department abbreviation, for example `BI-LHR-IT`.
- Resolve Company through the selected Branch; never assume `companies[0]` when the Branch belongs elsewhere.
- Uniqueness scope is the selected Branch, with collision suffixes `-02`, `-03`, etc.
- New Department opens with Auto ON. An existing coded Department opens with Auto OFF and its code unchanged. An existing code-less Department opens Auto ON but is not mutated until Save.
- Department uses the same preview, hierarchy source trail, manual override, safe-format validation, and responsive behavior already required for the other generated kinds.
- Remove the old unconditional `Code is required.` path when Auto is ON. With Branch and Department name present, generated code is valid and Save must succeed.
- Add pure tests for `BI-LHR-IT`, Branch-to-Company resolution, collision suffixing within Branch, current-record exclusion, and manual validation scope.

## Target audience
HR administrators maintaining multi-branch company reference data. They need recognizable codes without inventing inconsistent abbreviations manually.

## Existing application context
- React + TypeScript + Tailwind.
- Main UI: `src/components/MasterDataModule.tsx`.
- Types: `src/types.ts`.
- Existing master helpers: `src/data/masterData.ts`.
- Firestore save path is generic through `App.tsx`; preserve it.
- `Company.code` is the authoritative company abbreviation when populated. If absent on legacy data, derive a deterministic abbreviation from `Company.name`.
- Designation currently has no code field; add an optional `code?: string` to the type for backward compatibility, but all newly saved designations must have a generated or valid manual code.

## Required generation scheme
All tokens are uppercase ASCII letters/digits, separated by one hyphen. Collapse punctuation/whitespace, remove unsafe characters, and cap human-name tokens to a practical length.

1. **Designation** — company + branch + department + title abbreviation:
   - `BI-HQ-IT-SSE` for Bin Ishaq / HQ / IT / Senior Software Engineer.
   - Resolve Company and Branch through selected Department.
   - Multi-word titles use meaningful initials; single-word titles use a short readable token.
2. **Zone** — company + type + zone token:
   - `BI-ZN-WAGHA`.
3. **UC/Town** — selected parent Zone code + type + location token:
   - `BI-ZN-WAGHA-UC-178` for `UC178`.
   - Avoid doubled `UC-UC178`; strip leading `UC`/`TOWN` noise from the child name token.
4. **Wage Type** — company + type + wage token:
   - `BI-WT-CONTRU` for `Contrual`, or equivalent deterministic readable truncation.

If a generated code already exists within the correct scope, append a stable two-digit suffix (`-02`, `-03`, ...). Ignore the currently edited record during uniqueness checks.

## Scope and hierarchy rules
- Designation uniqueness is within its Department; generated prefix already includes Company/Branch/Department.
- Zone and Wage Type uniqueness is within Company.
- UC/Town uniqueness is within Zone.
- Resolve company from hierarchy for Designation and UC/Town; do not use `companies[0]` when a selected parent points to another company.
- For new Zone/Wage Type, use the form's selected Company. If the module currently lacks Company selection, add a Company select when more than one company exists; default to the primary company. For one company, show a compact read-only company context rather than unnecessary interaction.
- Parent selects must be company-aware and must not expose unrelated hierarchy records once Company is selected.

## Form behavior
- New records: Auto code is ON by default. Code preview updates as the name/title or parent changes.
- Existing records: preserve their saved code exactly and start Auto code OFF. Never regenerate just because the drawer opens.
- Existing legacy Designation without a code: Auto code may start ON so saving creates one, but do not mutate until Save.
- Provide an accessible `Auto-generate code` checkbox/switch beside the Code label.
- While Auto is ON, code input is read-only and visually marked `Generated preview`.
- Turning Auto OFF enables manual code entry.
- Turning Auto back ON immediately recomputes from current inputs.
- Show concise helper text explaining the pattern and parent source, including missing prerequisites (`Select a Department first`, `Enter a Zone name`, etc.).
- Manual codes are normalized to uppercase and validated against the same safe format and scope uniqueness rules.
- Do not auto-migrate or rewrite existing Firestore master records in bulk.

## Validation and tests
Extract pure helpers into a focused data module (for example `src/data/masterCodes.ts`) and add tests covering:
- Company code preferred; legacy company-name abbreviation fallback.
- Punctuation/whitespace normalization.
- All four exact hierarchy patterns.
- `UC178` avoids duplicated UC marker.
- Collision suffixes `-02` and `-03`.
- Current record excluded from collision detection.
- Company derived through Department → Branch for Designation.
- Company derived through Zone for UC/Town.
- Manual unsafe/duplicate codes rejected at form validation.

## Aesthetic direction
Retain the existing clean emerald/slate enterprise reference-data console. The memorable element is a small monospace generated-code preview that makes the hierarchy legible at a glance. Do not redesign the whole drawer.

## Content structure
- Existing parent/name/title controls.
- A compact code block immediately after the parent and name/title inputs.
- Code label row: `Code` + `Auto-generate` control.
- Monospace input/preview and one line of muted hierarchy guidance.

## Typography and colors
Use the existing typography. Use monospace for code values. Emerald for valid generated state, slate for normal controls, amber only for missing prerequisites, and rose for validation errors.

## Responsive behavior
Drawer remains one-column and usable at 375px. Code label/toggle may wrap without overflow. Maintain keyboard focus order and accessible labels/descriptions.

## Image needs
None.

## Output path
Modify the real application files in their appropriate locations, principally:
- `src/components/MasterDataModule.tsx`
- `src/types.ts`
- a pure helper/test module under `src/data/`
- `src/components/CompanySetupModule.tsx` only if needed to preserve/preview the new optional Designation code safely.

Preserve unrelated dirty-worktree changes. Use `apply_patch`. Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, and scoped `git diff --check`.
