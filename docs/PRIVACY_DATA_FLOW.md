# Personal Data Flow Audit

This document describes the audited application state as of July 2026. “Firestore” means the configured Google Firebase project. Access still depends on externally deployed Firebase Authentication and Firestore Security Rules, which are not present in this repository.

## Collection and flow map

| Collection point | Personal data | In-process path | Persistent destination | External recipient |
|---|---|---|---|---|
| Initial administrator and access-control forms | username, email, password, role, linked employee | React form → bcrypt hashing → `users` write | Firestore `users`; only the bcrypt hash is stored | Google Firebase/Firestore |
| Employee add/edit forms | name, work email, phone, CNIC, gender, birth/join dates, marital status, emergency contact, address/zone, photo, manager, salary, allowances, bank/account/IBAN, NTN/EOBI/social-security IDs | React state → employee handler | Firestore `employees` | Google Firebase/Firestore; a user-supplied remote photo URL is stored but is no longer loaded by the UI |
| Attendance and regularization forms | employee reference, date/time, reason, method, status | React/mobile/kiosk → attendance handler | Firestore `attendances`; kiosk offline queue on the kiosk device | Google Firebase/Firestore |
| Mobile punch | GPS latitude/longitude, derived address if provided, camera frame held temporarily, biometric verification result | browser/native APIs → React state → attendance handler | coordinates in Firestore attendance; camera frame is not written by the web/mobile flow | Google Firebase/Firestore; OS/browser camera, location, and authenticator APIs process data locally |
| Kiosk camera/fingerprint | employee code, face descriptor, fingerprint template, device metadata, optional evidence image | renderer IPC → Electron main → local biometric bridge/matcher | minimized kiosk JSON cache; biometric templates; attendance; optional evidence JPEG under Electron user-data | Google Firebase/Firestore; localhost-only biometric WebSocket bridge |
| Kiosk IP-camera setting | local camera URL/IP address and snapshots | Electron settings → image element/canvas | camera URL in kiosk settings; optional evidence JPEG | The configured camera host on the local/private network |
| Leave/loan/regularization forms | employee reference, dates, free-text reasons, amounts and approval identity | React state → corresponding handler | Firestore `leaves`, `loanAdvances`, `attendances` | Google Firebase/Firestore |
| Payroll and bank advice | identity snapshot, CNIC, salary/deductions, bank name/account/IBAN | employee/attendance/config state → payroll calculation → CSV download | Firestore `payrollRuns` and `payrollPayslips`; downloaded CSV on administrator device | Google Firebase/Firestore; bank only when an administrator manually uploads the CSV |
| Performance, salary revision, gratuity, assets | employee/reviewer references, ratings/comments, compensation, settlement and asset details | React forms → handlers | corresponding Firestore collections | Google Firebase/Firestore |
| Recruitment | applicant name/contact data, CV/application details, interview notes | React form → handler | Firestore `jobApplications` | Google Firebase/Firestore |
| Company setup | company contact email/phone/address and registration numbers | React form → batch write | Firestore company/config collections | Google Firebase/Firestore |
| Maintenance backup/export | every selected document and therefore all PII in those collections | Firestore read → JSON serialization | administrator-selected JSON backup on local disk | No automatic third party; whoever receives the backup file |

## Storage and retention

- Browser `localStorage`: HR, payroll, authentication, and biometric caches are disabled. Startup removes legacy `hr_*` and `webauthn_*` keys. Sensitive state is held in memory and loaded from Firestore.
- Cookies: the application creates no cookies and has no cookie-based session implementation. Cookie security flags are therefore not applicable.
- Firestore: primary persistent store for HR, payroll, access, biometric, recruitment, and audit data.
- Kiosk disk: Electron stores a minimized employee directory (code, display name, status, organization references, picture, and biometric match material), attendance queue, operational settings, and redacted events. Optional camera evidence is stored as JPEG under Electron’s user-data directory.
- Backups and CSV exports: unencrypted files controlled by the administrator. They must be stored, transferred, and deleted under the organization’s retention policy.

## Third parties and SDKs

- Firebase Web/Firestore SDK and Firestore REST API: receives documents explicitly written to the collections above, plus ordinary network metadata such as IP address, TLS/session metadata, and user agent handled by Google infrastructure.
- Browser/OS camera, geolocation, WebAuthn, Android BiometricPrompt, WebHID, and local fingerprint SDKs: process sensor/device data locally. WebAuthn now uses an opaque employee ID and generic display label rather than email/name.
- Google Fonts and Unsplash runtime requests were removed. This prevents those services receiving viewer IP address, user agent, referrer, and timing data.
- No analytics, error tracking, Stripe/payment SDK, email provider, AI API call, OpenAI, SendGrid, Twilio, Supabase, or advertising SDK is invoked by application code. A Gemini environment-variable placeholder exists, but no code sends data to Gemini.

## Deletion behavior

An access administrator can select **Delete data** for a non-current user. The flow deletes the user account and linked employee record, biometric record, attendance, leave, loan, salary-revision, performance-review, and gratuity records. Payroll snapshots are retained for financial/audit continuity but identity, employee code, CNIC, bank name, account number, and IBAN are replaced with `[REDACTED]` or blank values.

## Remaining production requirements

- Move authentication to Firebase Authentication or a trusted server. The current transitional browser login must read bcrypt hashes to verify them, so password hashes are exposed to an authorized browser session. Firestore rules must never allow general users to read `users`.
- Deploy and emulator-test the checked-in deny-by-default Firestore rules. Migrate user documents to Firebase Auth UID keys and provision role profiles through a trusted Admin SDK process.
- Encrypt kiosk cache/evidence and maintenance backups at rest, establish retention periods, and provide a cleanup job for expired evidence and backups.
- Enforce deletion through a trusted backend/Cloud Function so a user cannot bypass or partially execute the multi-document deletion sequence.
