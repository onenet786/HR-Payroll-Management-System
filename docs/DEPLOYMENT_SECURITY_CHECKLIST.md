# Deployment Security Gate

Audit date: July 2026.

## Status

| Check | Status | Evidence / action |
|---|---|---|
| Required environment variables | PASS after fix | Vite refuses to build without all Firebase web values. Firebase initialization also fails closed. Kiosk and maintenance entrypoints reject missing Firebase values. The production server rejects missing `APP_URL`/`ALLOWED_ORIGIN`, placeholder values, or `DEBUG=true`. |
| Debug/test artifacts | PASS | No hardcoded test credentials, security TODO/FIXME markers, test/debug/backdoor/seed endpoints, wildcard CORS, or commented-out executable blocks were found. Operational maintenance CLI output remains; it is not browser debug logging. Debug defaults to false in production. |
| Client-facing errors | PASS after fix | Express errors and 404s use generic JSON plus `X-Correlation-ID`. Raw stacks remain server-side. Electron, kiosk renderer, React maintenance/biometric UI, and native bridge no longer return raw exception strings or file paths. Native bridge errors include a correlation ID. |
| Security headers | PASS after fix | Helmet applies CSP, `nosniff`, `DENY`, one-year HSTS, referrer policy, and related headers. Firebase Hosting has equivalent headers. HTML contains a CSP fallback for hosts that ignore repository hosting configuration. |
| Authentication rate limiting | BLOCKED for current auth; guards prepared | Express guards enforce 5/minute/IP for future login/signup/OTP routes and 3/hour/IP for password reset. Current login runs in the browser against Firestore and therefore cannot be protected by server/IP rate limiting. Replace it with Firebase Authentication or trusted server endpoints before launch. |
| CORS | PASS for owned server | No wildcard origin exists. Production requires one exact `ALLOWED_ORIGIN`; absent or different origins receive 403. Firestore CORS is operated by Google and access authorization must be enforced by Security Rules. |
| Database TLS and exposure | PASS for transport; rules added, migration BLOCKED | Every Firestore path uses TLS and no database port/default credential exists. Checked-in rules now deny unauthenticated access and enforce owner/permission checks. They must be deployed and emulator-tested; the legacy custom-login and kiosk flows require Firebase Auth migration before they can access Firestore. |

## Go-live decision

**NO-GO until both blockers are resolved:**

1. Replace browser-side password verification with Firebase Authentication or trusted rate-limited server authentication.
2. Provision Firebase Auth UID-keyed user profiles and emulator-test/deploy the checked-in Firestore rules without weakening them.

The production web process should be started with `npm start` behind an HTTPS reverse proxy, or deployed using the checked-in Firebase Hosting configuration. HSTS is effective only over HTTPS.
