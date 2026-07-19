# Primary Company Setup Page Brief

## Objective
Add a production-quality Company Setup page that lets an authorized administrator create or update the application's primary company and generate the minimum organization records needed to begin HR/payroll operation: company identity, main branch, baseline departments, baseline designations, and reviewed Pakistan statutory/payroll configuration.

This application is currently single-company internally. Do not claim or simulate true multi-company tenancy. The page must clearly present this as setup of the primary company. Do not allow creating multiple active companies unless the entire data model is company-scoped, which is outside this task.

## Audience
Super Admins and implementation staff onboarding a new Pakistani company into the HR Suite.

## Existing application
- React 19, TypeScript, Vite, Tailwind utilities, lucide-react, Firebase/Firestore with local fallback patterns.
- Preserve all unrelated dirty-worktree changes.
- Prefer a dedicated `src/components/CompanySetupModule.tsx` instead of further bloating `WebPortal.tsx`.
- Expected integration files may include `src/types.ts`, `src/App.tsx`, `src/components/DeviceEmulator.tsx`, `src/components/WebPortal.tsx`, and `src/components/FirestoreMaintenanceModule.tsx` where needed.

## Data model
Extend `Company` safely with optional/backward-compatible fields needed by setup, such as:
- `code`, `legalName`, `name` (display/trading name)
- `industry`, `legalType`
- `ntn`, `strn`, `eobiRegistration`, `socialSecurityRegistration`, `socialSecurityRegion`
- registered address, city, province, postal code
- phone, email, website
- fiscal year start month, payroll frequency, default currency, timezone
- status, createdAt, updatedAt, setupCompletedAt

Use Pakistan-friendly defaults: PKR, Asia/Karachi, monthly payroll. Keep fields compatible with existing `Company` records/defaults.

## Functional workflow
Build a multi-step wizard with visible progress and these steps:

1. **Company identity**
   - Legal name, display name, unique company code, industry, legal type.
   - NTN required for normal completion; STRN optional with a clear optional label.
   - Contact email and phone.

2. **Registered office and main branch**
   - Registered address, city, province, postal code.
   - Main branch name/code/address/city/province; offer "same as registered office" behavior.
   - Province is required because provincial social-security calculation depends on it.

3. **Organization baseline**
   - Editable starter departments, defaulting to Human Resources and Finance & Payroll.
   - Require at least one department.
   - Allow add/remove rows and unique department codes.
   - Editable starter designations associated with departments (recommended defaults such as HR Manager and Payroll Officer); allow removal but explain employees will later need designations.

4. **Pakistan payroll compliance**
   - Review/edit the existing `StatutoryConfig` values: tax year/effective date, minimum wage, EOBI employee/employer rates, social-security region/province rate and ceiling, gratuity days/year, provident-fund maximum, overtime multiplier/hours.
   - Show current FBR tax slabs from application state or existing defaults as a review table; do not silently overwrite user-customized slabs.
   - Include explicit checkboxes/choices for registrations not applicable or pending rather than forcing fake numbers.
   - Add a concise notice that rates are configurable templates and the operator must verify them against current official requirements.

5. **Review and create**
   - Summarize all records to be generated.
   - Require confirmation that details and statutory settings were reviewed.
   - Submit once, show in-progress state, prevent double submission, display success or actionable error.

## Persistence and integration
- Add `companies` state to App and hydrate it from Firestore `companies` collection when Firebase is configured, including required snapshot accounting; use localStorage fallback when Firebase is unavailable.
- Add a cohesive callback such as `onSaveCompanySetup` rather than making the page coordinate unrelated low-level callbacks.
- For Firebase mode, use Firestore `writeBatch` to save the company, main branch, departments, designations, and statutory config together where compatible with current singleton config. Update React/localStorage only after a successful commit. For local mode, validate first, then update all related state/localStorage coherently.
- Use `crypto.randomUUID()` with a safe fallback for generated IDs; do not use timestamp-only IDs.
- The setup should update the existing singleton statutory configuration deliberately after user review. Preserve existing tax slabs unless the user explicitly edits/accepts replacements.
- Existing branches/departments/designations must remain compatible. Do not duplicate baseline records on repeated save; support editing/updating the existing primary setup.
- Stop hardcoding new branches to company `c1`; use the primary company id when available.
- Update the portal header to display the saved primary company name/code with a sensible fallback to the existing Bin Ishaq labels.
- Include `companies` in backup/restore collection mapping if that module uses explicit collection lists.

## Navigation and permissions
- Add `company-setup` to the portal tab type and authorization mapping.
- Place **Company Setup** under the existing collapsed **System** menu with an appropriate Building/Settings lucide icon.
- Require the existing `manage_settings` permission.
- Preserve all existing group-collapse behavior: groups start collapsed on page load; selecting the item keeps System open during the mounted session; mobile destination click closes the sidebar.
- Render the new module in the existing authorized main-content switch.

## Validation
- Trim text fields and normalize company/department/branch codes to uppercase.
- Validate required fields, email format, positive/nonnegative numeric rates, percentage ranges, valid dates, unique codes, and department references for designations.
- Prevent accidental duplicate company/branch/department setup during edit.
- Focus or clearly identify the first invalid field/step; provide inline errors rather than browser alerts.

## Aesthetic direction
A trustworthy implementation console within the existing slate/emerald HR interface: a compact step rail or progress header, calm white/slate form cards, precise labels, helpful compliance notes, and a strong review summary. It should feel like structured enterprise onboarding, not a generic long form.

## Typography and color
Reuse the application's typography and slate/emerald palette. Use amber only for compliance cautions, rose for validation errors, and emerald for completed steps/success.

## Memorable quality
The review step should make the generated organization tangible: one primary company flowing into its branch, departments, designations, and payroll baseline in a clear hierarchy.

## Accessibility and responsive behavior
- Full keyboard operation, semantic labels/fieldsets, visible focus, and an announced step title.
- Avoid color-only progress indicators.
- Desktop and mobile layouts must remain usable; tables may scroll horizontally where necessary.
- Preserve values when moving backward/forward between steps.

## Images
None. Use existing lucide-react icons and code-native hierarchy visuals only.

## Verification
- Run `npm.cmd run lint`, `npm.cmd run test`, and `npm.cmd run build`.
- Verify the new navigation item is permission-filtered and occurs once.
- Verify local fallback persistence and Firestore batch code paths at least through static/unit checks.
- Report exact files changed, tests, and any known limitation.

## Approved iteration: reset/new-customer and existing-company modes
- This page is used after a data reset for a new customer, and later to view/update that customer's existing setup.
- If no saved company exists, show a clear `New company setup` state and initialize the guided defaults.
- If a company already exists, show a clear `Existing company setup` / `Update company` state and prefill every persisted field in all wizard steps: company identity/contact/payroll preferences, registration statuses/numbers, main branch, departments, designations, and statutory configuration.
- Existing-data hydration must work when Firestore/local data arrives after the component first mounts. Do not rely only on `useState` initializers.
- Do not overwrite unsaved user edits if a background snapshot updates while the user is actively editing. Hydrate once when the existing record first becomes available, and rehydrate after a confirmed successful save or via an explicit Reset/Reload saved data action.
- Scope the displayed branch to the primary company and departments to that branch; scope designations to those departments. Do not accidentally pull unrelated orphan records into the form.
- The review/summary must show that the action will `Update primary company` when existing data is loaded and `Create primary company` for a fresh setup.
- After save, keep the form populated with the returned/current saved data and visibly confirm whether it was created or updated.
- Provide a safe `Reload saved data` or `Discard unsaved changes` action in existing mode, with confirmation if it would discard edits.
- Preserve all prior validation, accessibility, persistence, navigation, and single-primary-company safeguards.
