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

## Deployment security requirements

- The system operates on a dedicated PostgreSQL server backend. Configure aaPanel with Node.js and PostgreSQL services.
- Never place database URLs, OAuth client secrets, JWT signing secrets, or third-party private API keys in `VITE_*` variables or frontend code.
- Always use HTTPS in production with proper reverse proxy and SSL certificates.
- Enable authenticator MFA for every administrator and payroll/access user, verify a second administrator can approve recovery requests, then set `MFA_ENFORCE_PRIVILEGED=true` and restart the service.
- MFA recovery uses a maker-checker workflow: the person who submits a reset request cannot approve it. Approval revokes every active session for the recovered account.
