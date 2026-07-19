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
2. Copy `.env.example` to `.env.local` and fill in the required values. Variables beginning with `VITE_` are embedded in the browser bundle; only the listed Firebase public web configuration belongs there. Keep Gemini, OAuth, JWT, database, service-account, Stripe secret, and other privileged keys server-side without a `VITE_` prefix.
3. Run the app:
   `npm run dev`

## Deployment security requirements

- The checked-in Firestore rules are deny-by-default and require Firebase Authentication. Deploy and emulator-test them before launch. The legacy custom-login client and kiosk cannot satisfy these rules until migrated to Firebase Auth identities; do not weaken the rules to preserve legacy access.
- Never place Firebase Admin/service-account credentials, Supabase service-role keys, Stripe secret keys, database URLs, OAuth client secrets, JWT signing secrets, or third-party private API keys in `VITE_*` variables or frontend code.
- Do not deploy the local-storage authentication fallback for production HR or payroll data.

> **Secret rotation warning:** Firebase configuration and demo passwords were previously hardcoded. Git retains removed values in history and existing clones. Rotate/restrict the previously committed Firebase key immediately, invalidate all previously seeded passwords, review key usage, and consider purging sensitive values from Git history before deployment.
