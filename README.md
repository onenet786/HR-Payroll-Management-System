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

## Deployment security requirements

- The system operates on a dedicated PostgreSQL server backend. Configure aaPanel with Node.js and PostgreSQL services.
- Never place database URLs, OAuth client secrets, JWT signing secrets, or third-party private API keys in `VITE_*` variables or frontend code.
- Always use HTTPS in production with proper reverse proxy and SSL certificates.
