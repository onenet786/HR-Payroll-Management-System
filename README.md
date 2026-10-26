<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

Pakistan payroll operations and annual statutory-update guidance: [PAKISTAN_PAYROLL_GUIDE.md](PAKISTAN_PAYROLL_GUIDE.md).

Personal-data inventory, storage destinations, external transfers, deletion behavior, and remaining privacy requirements: [docs/PRIVACY_DATA_FLOW.md](docs/PRIVACY_DATA_FLOW.md).

Pre-deployment pass/fail security gate: [docs/DEPLOYMENT_SECURITY_CHECKLIST.md](docs/DEPLOYMENT_SECURITY_CHECKLIST.md).

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/0ab7c3a1-e4ca-49b5-86f4-6883897b9163

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and fill in the required values. Keep database passwords, server secrets, and privileged keys server-side without a `VITE_` prefix.
3. Run the app:
   `npm run dev`

## Editions: full compliance or lite (small shops)

Every installation runs in one of two editions. The **full edition** (default) keeps every rule: FBR withholding and tax slabs, EOBI, provincial social security, provident fund, gratuity, bank payroll with a bank advice file, and maker-checker approvals. The **lite edition** is for shops and small businesses with 10-15 staff: attendance, leave, salaries, advances and payslips only. FBR, EOBI and social-security data are not asked for, salaries may be paid in cash, employee email and bank account are optional, and one owner can prepare, approve and pay payroll alone.

The vendor (OneNet) chooses the edition from the sign-in screen: login `onenet`, password `OneNet` followed by today's date as `DDMonYYYY` on Pakistan time (for example `OneNet19Oct2026`; the day before and after are also accepted). This opens the edition console, which can change nothing but the edition. The choice is stored in the `app_settings` table, applies to every browser, kiosk and phone on their next page load, and is recorded in the audit log. Switching back to the full edition restores every rule; no customer data is changed either way. On a fresh database the setup wizard has a link to the sign-in screen so the edition can be set before the first company is created.

Server options (`.env`): `VENDOR_LOGIN` (default `onenet`), `VENDOR_PASSWORD_PREFIX` (default `OneNet`), `VENDOR_CONSOLE_DISABLED=true` to switch the console off. Feature switches and presets live in `src/data/edition.ts` (mirrored by `server/edition.cjs`).

## Optional company features and attendance policy (all off by default)

Nothing in this section changes an installation unless it is switched on. Settings has a **Company Options & Attendance Policy** section (its own card at the bottom of the Settings page, in both editions) (saved in `statConfig.companyOptions` and `statConfig.attendancePolicy`; preset in `src/data/attendancePolicy.ts`). **Apply company preset** switches everything on at once; **Reset to standard** switches everything off.

Feature switches (`companyOptions`):

- **Kiosk: three exit buttons only** — the kiosk offers Duty Off / Personal Out / Office Work instead of the standard twelve checkout reasons.
- **Office work exits do not affect attendance** — Office Work / official exits are not deducted from worked time and do not use the personal-out allowance.
- **Salary Unpaid / Paid register** — every payslip of an approved run is Unpaid until marked Paid (cash hand-over) in Payroll → "Salary paid / unpaid". Off, the run shows the standard "Payment exceptions" window (bank returns and retries) only.
- **Full allowance / deduction catalogue** — arrears, funeral, fuel, grading and surprise rewards, penalties / warnings, short cash, shopping, uniform, advance (STA), loan (LTA) and manual EOBI as adjustment types, each as its own payslip line, plus a CSV import for commission and tips (employee code, type, amount, reason). Off, the six standard types remain.
- **Position and branch on registers** — the attendance and leave registers show each employee's position and branch.

Attendance policy (`attendancePolicy`, empty = standard shift rules): late from N minutes after the branch opening time (preset 10, so late from the 11th minute), half day from N minutes (preset 20), an escalating late-fine table by number of late days in the month (preset 100 / 150 / 200 / 250 / 300 / 350 per day for days 1–5, 6–10, … 26–30), the cost of an absent day (preset 1.5 days of pay; unpaid leave always costs one day), whether a day without any punch is marked as leave first so HR decides absences by hand, "Duty Off" before the branch half time counting as a leave, the personal-out allowance per day, and an optional early-coming reward. Each branch (Master Data → Branch) may set its own opening time, half time and personal-out allowance. A day turned into a leave carries no fine or reward. Payroll computes the late fine, the absent deduction and the early-coming reward itself.

## Deployment security requirements

- The system operates on a dedicated PostgreSQL server backend. Configure aaPanel with Node.js and PostgreSQL services.
- Never place database URLs, OAuth client secrets, JWT signing secrets, or third-party private API keys in `VITE_*` variables or frontend code.
- Always use HTTPS in production with proper reverse proxy and SSL certificates.
- Enable authenticator MFA for every administrator and payroll/access user, verify a second administrator can approve recovery requests, then set `MFA_ENFORCE_PRIVILEGED=true` and restart the service.
- MFA recovery uses a maker-checker workflow: the person who submits a reset request cannot approve it. Approval revokes every active session for the recovered account.
