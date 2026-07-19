# Dynamic Primary Company Branding Evaluation

## Overall Verdict: PASS

## Overall Assessment
The customer-facing Web Portal now derives its identity directly from `companies[0]` during render, so saved Company Setup changes propagate immediately through React state. Dashboard copy, employee summaries, portal chrome, salary slips, and bank advice consistently use the configured display/legal identity, while optional address and registration metadata is assembled without empty separators or `undefined` values.

## Required Surface Audit

| Surface | Result | Evidence |
|---|---|---|
| Immediate primary-company binding | PASS | `primaryCompany = companies[0]` and all derived branding values are recalculated on each render; there is no copied local branding state. |
| Portal header | PASS | Uses `companyDisplayName`, saved/fallback company code, and a display-name initial. |
| Dashboard welcome | PASS | “Welcome to the {companyDisplayName} corporate portal.” |
| Employee summary | PASS | Record count is described as mapped across `{companyDisplayName}`. |
| Salary-slip employer heading | PASS | Uses `companyLegalName`, which prefers saved legal name and falls back to saved display name. |
| Salary-slip address | PASS | Registered address, city, and province are filtered before comma joining. |
| Salary-slip registration metadata | PASS | NTN, STRN, EOBI, and social-security values are conditionally labeled, filtered, and bullet-joined. |
| Salary-slip footer | PASS | Generated-by declaration uses `companyLegalName`. |
| Bank advice paying identity | PASS | Paying Account Name uses `companyLegalName`; originating branch is shown only when a saved primary-company branch exists. No invented Karachi suffix remains. |
| Existing loaded company | PASS | Branding reads from the same hydrated `companies` prop, so Firestore/local-storage records render dynamically. |
| Post-save update | PASS | No memo/local state freezes branding; parent company-state updates are reflected on the next render. |

## Remaining Legacy-Identity Occurrences

### WebPortal.tsx

- `Bin Ishaq` in `companyDisplayName` is a fresh/reset-install fallback when no usable primary display name is present.
- `IND-KHI-456` in `companyCode` is the corresponding fresh/reset-install company-code fallback.
- `Bin Ishaq HR Suite — User Guide` is an iframe accessibility title for fixed product documentation, not printed customer identity; retaining it is within the brief’s exception.

### Other src/components files

- `DeviceEmulator.tsx`: attendance-terminal/kiosk product identity, explicitly allowed to remain fixed.
- `WindowsApp.tsx`: desktop client/product identity and framework help copy, not configured customer output.
- `FirestoreMaintenanceModule.tsx`: backup metadata identifies the application/product, not an employer-facing document.

No remaining legacy customer identity was found in WebPortal salary slips, bank advice, dashboard company copy, or employee summary output.

## Design, Accessibility, and Formatting

- Existing visual hierarchy, modal structure, print content, responsive classes, and payroll calculations are unchanged.
- Optional metadata lines render only when they contain data.
- Registration components cannot produce leading/trailing or doubled separators because empty entries are filtered before joining.
- The bank branch row is conditional and therefore does not expose missing branch data.

## Minor Recommendation

For exact adherence to “fallback only when no company record exists,” the display/code expressions could distinguish `!primaryCompany` from an existing but malformed record with an empty `name` or `code`. Company Setup requires these fields, so this does not affect valid configured companies such as OneNet Solutions and is not release-blocking.

## Final Recommendation

Approve the dynamic branding correction. All required customer-facing runtime surfaces use the saved primary company, and remaining Bin Ishaq references are justified fallbacks or fixed product titles.
