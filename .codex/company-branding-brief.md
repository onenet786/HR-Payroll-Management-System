# Dynamic Primary Company Branding Brief

## Objective
Remove hardcoded legacy customer identity from runtime HR/payroll screens and generated documents. When the primary company is configured as `OneNet Solutions`, salary slips, bank advice, dashboard copy, employee summaries, and other company-facing runtime output must display OneNet Solutions and its saved details—not Bin Ishaq Logistics Ltd.

## Scope and source of truth
- Use the saved primary company supplied to `WebPortal` as `companies[0]` (or a clearly named derived `primaryCompany`).
- Create concise derived fallbacks for company display name, legal name, code, address/contact/registration values rather than repeating optional chaining throughout large JSX sections.
- Fallbacks apply only when no company record exists, so fresh/reset installations remain usable.
- Do not replace technical product/package branding in documentation, app package names, Electron product names, kiosk product identity, source comments, or login product name unless that text represents the configured customer's legal identity.

## Runtime content to fix
At minimum audit and dynamically bind all company-facing occurrences in `src/components/WebPortal.tsx`, including:
- Dashboard welcome message.
- Employee-directory record summary.
- Salary slip/payslip company heading and any company address, NTN, registration, or footer text.
- Bank advice/export preview paying account/company name and issuer text.
- Any printable report, modal, compliance statement, letter, or generated document containing `Bin Ishaq`, `Bin Ishaq Logistics`, `IND-KHI-456`, or another fixed company identity.
- User-guide iframe title may remain product documentation branding if it is not printed as customer company identity.

Also inspect other runtime `src/components` files for customer identity. Update only where the configured company is meant to be shown. Device/kiosk/app product branding can remain fixed.

## Salary slip requirements
- The prominent employer/company heading must use saved legal name when available, otherwise saved display name.
- Show available registered address/city/province and NTN/STRN/registration details without rendering empty separators or `undefined`.
- The generated-by/compliance footer must use the saved employer legal/display name.
- Existing payroll calculations, payslip employee data, print styling, and modal behavior must not change.

## Bank advice requirements
- Paying account/company text must use saved legal/display name.
- Do not invent a bank account name suffix such as Karachi; use saved company/branch data where appropriate.
- Preserve existing banking/payroll logic and export behavior.

## Data updates
- Company Setup changes should reflect immediately after successful save through existing React state, without reload.
- Existing saved companies loaded from Firestore/localStorage must render dynamically.

## Aesthetic and accessibility
Preserve the existing visual design, print layout, typography, spacing, accessibility, and responsive behavior. This is a data-binding correction, not a redesign.

## Verification
- Run `rg -n -i "bin ishaq|IND-KHI-456" src/components/WebPortal.tsx` and justify any remaining occurrence as product-only fallback/title.
- Run `npm.cmd run lint`, `npm.cmd run test`, and `npm.cmd run build`.
- Report exact customer-facing strings fixed and any intentionally retained product branding.
