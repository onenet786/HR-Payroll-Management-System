# Bin Ishaq HR Suite - Full Feature Charter

## 1. Project Overview

Bin Ishaq HR Suite is a multi-platform Human Resource, Attendance, Payroll, and Compliance Management System built with React, TypeScript, Vite, Firebase Firestore, Electron, Capacitor Android, and a native Windows fingerprint bridge for DigitalPersona U.are.U / URU 4500 biometric readers.

The project is designed around Pakistan HR and payroll operations. It supports employee master data, attendance ingestion, leave approvals, payroll calculation, statutory deductions, bank advice generation, user access control, recruitment, assets, performance appraisals, gratuity settlements, notifications, Firestore maintenance, Windows desktop attendance, Android employee self-service, and kiosk-based attendance terminals.

## 2. Technology Stack

- Frontend: React 19, TypeScript, Vite.
- Styling and UI: Tailwind-oriented utility classes, custom CSS modules, lucide-react icons, motion animations.
- Database: Firebase Firestore with real-time collection listeners.
- Local persistence: Browser localStorage fallback/cache for HR data and logged-in user state.
- Desktop app: Electron wrapper for Windows.
- Kiosk app: Separate Electron kiosk application using plain HTML, CSS, and JavaScript.
- Mobile app: Capacitor Android shell for the employee self-service experience.
- Biometric integration: DigitalPersona / URU 4500 bridge over local WebSocket at `ws://127.0.0.1:15896`, with WebHID and simulation fallbacks in browser contexts.
- Build tooling: npm scripts, electron-builder, Capacitor/Gradle, tsx maintenance scripts.

## 3. Platform Coverage

### Web Admin Portal

The web portal is the main administrative workspace. It contains dashboards, employee management, attendance, leave workflows, payroll, settings, RBAC, biometric enrollment, Firestore maintenance, and all HR submodules.

### Windows Desktop Client

The Windows desktop app packages the React HR suite inside Electron. On startup it can launch the bundled URU 4500 bridge silently, open the HR app in a desktop window, and support fingerprint attendance through the local WebSocket bridge.

### Mobile Employee Self-Service

The mobile interface is used by employees for self-service tasks. It includes attendance punch, camera proof, biometric/WebAuthn checks where available, GPS capture, leave request submission, attendance regularization, and payslip viewing.

### Attendance Kiosk

The kiosk mode is a locked attendance terminal for entry points or office gates. It supports employee code entry, fingerprint scan, face/camera scan simulation, live clock display, success/error states, and kiosk-only role behavior.

### Standalone Windows Kiosk

The separate `windows-kiosk` app supports kiosk operation outside the main React portal. It can write attendance locally first, sync to Firestore, use webcam or IP camera proof punches, and integrate with the URU 4500 bridge.

## 4. Authentication and User Access

### Login

- Login accepts username or email.
- User accounts are loaded from Firestore.
- If no user accounts exist, the app presents first Super Admin creation.
- Login state is stored in localStorage.
- Inactive users are blocked from signing in.
- Password checking is currently handled against stored user account data.

### First Admin Setup

When Firestore has no users, the system can create:

- A Super Admin role.
- A first active admin user.
- Local cache entries for roles, users, logged-in user, and current user.

### Role-Based Access Control

Roles contain named permission arrays. The portal uses these permissions to show or block major modules:

- `view_dashboard`
- `manage_employees`
- `manage_attendance`
- `manage_leaves`
- `manage_payroll`
- `manage_settings`
- `manage_access`
- `use_kiosk`

Default roles include:

- Super Admin
- HR Manager
- Payroll Specialist
- Employee
- Kiosk Terminal

### Kiosk Role Lock

A user with username `kiosk` or role `role-kiosk` is routed directly into locked kiosk attendance mode.

## 5. Core Data Model

The project defines structured TypeScript entities for the HR domain:

- Company
- Branch
- Department
- Designation
- Shift
- Employee
- AttendanceLog
- LeaveRequest
- LeaveBalance
- TaxSlab
- StatutoryConfig
- PayrollRun
- Payslip
- BankAdviceItem
- Role
- UserAccount
- Holiday
- LoanAdvance
- SalaryRevision
- KpiScore
- PerformanceReview
- CompanyAsset
- JobPosting
- JobApplication
- GratuitySettlement
- AppNotification

## 6. Firestore Collections

The application synchronizes these collections in real time:

- `employees`
- `attendances`
- `leaves`
- `branches`
- `departments`
- `designations`
- `taxSlabs`
- `roles`
- `users`
- `holidays`
- `loanAdvances`
- `salaryRevisions`
- `performanceReviews`
- `companyAssets`
- `jobPostings`
- `jobApplications`
- `gratuitySettlements`
- `notifications`
- `payrollRuns`
- `statConfig`

The app also maintains localStorage mirrors for many collections so the interface remains resilient when Firestore access is delayed.

## 7. Dashboard Features

The Web Admin dashboard provides a high-level HR and payroll overview:

- Active employees versus total employees.
- Today attendance percentage.
- Pending leave and regularization workload.
- Monthly salary liability estimate.
- Multi-branch compliance scope.
- Recent pending leave requests.
- Quick visibility into attendance and payroll status.

## 8. Employee Management

### Employee Master Record

Employee profiles include:

- Employee code.
- Full name.
- Email and contact number.
- CNIC with formatting support.
- Gender.
- Date of birth.
- Date of joining.
- Employment status.
- Branch, department, and designation.
- Wage type.
- Basic salary or daily wage rate.
- Bank name, account number, branch, and IBAN.
- EOBI number.
- Social security number.
- Profile picture.
- Zone and UC/town.
- Zone in-charge metadata.
- Allowance overrides.
- EOBI and FBR enable/disable switches.
- Provident fund options.
- Gratuity eligibility.
- Marital status.
- Fingerprint templates.

### Employee Creation and Editing

- Add new employees from the web portal.
- Edit existing employee records.
- Upload or store employee profile pictures as base64 data.
- Auto-generate employee codes based on department code and sequence.
- Format CNIC inputs.
- Generate Pakistan-style IBAN values based on selected bank code and account number.
- Configure branch, department, designation, wage type, allowances, and statutory settings.

### Organization Structure

The portal supports runtime creation and use of:

- Branches
- Departments
- Designations
- Wage type options
- UC/town values
- Zone values

### Employee Reporting

Employee reports can group employees by:

- UC/town
- Zone
- Supervisor or zone in-charge

## 9. Attendance Management

### Attendance Sources

Attendance logs support multiple methods:

- Biometric
- Camera
- Mobile GPS
- RFID
- Manual
- Web Punch

### Attendance Statuses

Attendance records can be marked as:

- Present
- Late
- Half Day
- Absent
- On Leave
- Holiday

### Punch Handling

The app can simulate or record punch-in and punch-out activity. It calculates:

- Punch-in time.
- Punch-out time.
- Late status based on default 9:15 grace behavior in app logic.
- Overtime minutes when worked time exceeds standard hours.
- GPS latitude and longitude when mobile attendance provides them.

### Manual Attendance

Admins can manually add attendance logs with:

- Employee.
- Date.
- Punch in.
- Punch out.
- Method.
- Status.

### Attendance Regularization

Employees can request regularization for missed punches. Admins can:

- Approve regularization, changing status to Present.
- Reject regularization.
- Track regularization request reason and approval state.

### Attendance Reports

The attendance module supports reporting by:

- Daily view.
- Weekly aggregate.
- Monthly aggregate.
- Yearly aggregate.

## 10. Leave Management

### Leave Request Types

Supported leave categories are:

- Casual
- Sick
- Annual
- Maternity
- Paternity
- Hajj
- Unpaid

### Leave Workflow

Employees and admins can create leave requests with:

- Employee.
- Leave type.
- Start date.
- End date.
- Total days.
- Reason.
- Status.
- Applied date.

Admins can:

- Approve leave.
- Reject leave.
- Record approver and approval date.

### Automatic Attendance Injection

When a leave request is approved, the app can auto-create attendance logs for the approved date range with status `On Leave`, skipping dates that already have attendance records.

### Leave Reports

The leave module supports:

- Leave list view.
- Daily leave view.
- Weekly summary.
- Monthly summary.
- Annual summary.

## 11. Payroll Engine

### Payroll Runs

Payroll run data includes:

- Title.
- Period month and year.
- Start and end dates.
- Status: Draft, Approved, Disbursed.
- Creation date.
- Gross pay totals.
- Deduction totals.
- Net pay totals.
- Employer EOBI totals.
- Employer social security totals.

### Payslip Calculation

The `computePayslipDetails` function calculates payslip values from employee, attendance, leave, statutory, tax, organization, and loan data.

Payslip output includes:

- Total days in month.
- Present days.
- Absent days.
- Leave days.
- Unpaid leave days.
- Overtime hours.
- Overtime pay.
- Basic earnings.
- House rent allowance.
- Conveyance allowance.
- Medical allowance.
- Other allowances.
- Gross salary.
- Income tax deduction.
- EOBI employee deduction.
- PESSI employee deduction placeholder.
- Provident fund deduction.
- Loan repayment deduction.
- Unpaid leave deduction.
- Total deductions.
- Net salary.
- EOBI employer contribution.
- PESSI employer contribution.
- Provident fund employer contribution.

### Salaried Employee Logic

For salaried employees:

- If custom allowances exist, they are used.
- Otherwise the system applies a default salary split:
  - 50 percent basic component.
  - 30 percent house rent.
  - 10 percent conveyance.
  - 10 percent medical.
- Unpaid leave is deducted using a calendar-day daily rate.
- Overtime is calculated from basic component divided by 208 hours and multiplied by 2.0.

### Daily Wager Logic

For daily wagers:

- Basic earnings are based on present days plus half-day weighting.
- Hourly rate is daily wage divided by 8.
- Overtime is calculated at 1.5x.

### Bank Advice

The payroll interface can preview bank advice data with:

- Beneficiary name.
- IBAN.
- Bank name.
- Net salary.
- Paying account details.
- Total disbursement amount.
- Download action for bank advice flat file / CSV-style output.

### Payslip Preview and Printing

Admins can preview individual payslips and use browser print/save-as-PDF flow.

## 12. Pakistan Compliance Features

### FBR Tax Slabs

Default salaried tax slabs are defined for annual income ranges, with base tax and percentage values. The payroll engine annualizes monthly gross salary and calculates monthly tax deduction from annual liability.

### Statutory Configuration

The statutory configuration includes:

- Minimum wage.
- EOBI employer rate.
- EOBI employee rate.
- PESSI employer rate.
- Gratuity rate days per year.
- Provident fund max employee contribution.
- Updated date.

### EOBI

When enabled, EOBI is calculated from the configured minimum wage:

- Employee deduction percentage.
- Employer contribution percentage.

### Provincial Social Security

PESSI/SESSI employer contribution is calculated from a capped wage base using the configured employer rate.

### Provident Fund

Provident fund is employee-specific:

- Opt-in flag.
- Contribution rate.
- Employee deduction.
- Employer matching contribution.

### Gratuity

The gratuity settlement module supports final settlement calculation based on years of service and configured gratuity days per year.

## 13. Holiday Calendar

The holiday module manages:

- Public holidays.
- Company holidays.
- Optional holidays.
- Recurring annual holidays.
- Date, description, and type.

Default Pakistan public holidays for 2026 are included in seed data.

## 14. Loans and Salary Advances

The loans module supports:

- Loan or advance type.
- Principal amount.
- Approved amount.
- Disbursement date.
- Total installments.
- Remaining installments.
- Monthly installment.
- Total repaid.
- Reason.
- Status lifecycle: Pending, Approved, Active, Closed, Rejected.
- Applied date.
- Approved by and approved on.

Payroll automatically includes active loan monthly installment deductions.

## 15. Salary Revisions and Increments

The salary revision module tracks:

- Employee.
- Previous salary.
- New salary.
- Increment amount.
- Increment percentage.
- Effective date.
- Reason.
- Approved by.
- Approved on.
- Revision type:
  - Annual Increment
  - Promotion
  - Adjustment
  - Market Correction

The module presents current salary register data and revision history.

## 16. Performance Appraisal

Performance reviews include:

- Employee.
- Reviewer.
- Period.
- Review date.
- KPI list.
- KPI weights.
- Self score.
- Manager score.
- Comments.
- Overall self rating.
- Overall manager rating.
- Strengths.
- Areas of improvement.
- Manager comments.
- Review status.
- Increment recommendation.
- Increment percentage.

Supported review statuses:

- Draft
- Submitted
- Reviewed
- Acknowledged

## 17. Asset Management

The asset module manages company assets with:

- Asset tag.
- Name.
- Category.
- Serial number.
- Purchase date.
- Purchase cost.
- Condition.
- Assigned employee.
- Assigned date.
- Return date.
- Status.
- Notes.

Asset categories include:

- Laptop
- Mobile
- SIM Card
- Vehicle
- Furniture
- Tool
- Other

Asset statuses include:

- Available
- Assigned
- Under Repair
- Retired

Features include adding assets, filtering by category/status, assigning assets, and returning assets.

## 18. Recruitment

The recruitment module includes job postings and candidate pipeline management.

### Job Postings

Job postings contain:

- Title.
- Department.
- Branch.
- Number of vacancies.
- Experience required.
- Qualification required.
- Salary range.
- Job type.
- Posted date.
- Closing date.
- Status.
- Description.

Job types:

- Full Time
- Part Time
- Contract
- Internship

Job statuses:

- Open
- Closed
- On Hold
- Filled

### Job Applications

Applications contain:

- Job posting.
- Applicant name.
- Email.
- Phone.
- CNIC.
- Current salary.
- Expected salary.
- Applied date.
- Stage.
- Interview date.
- Interview notes.
- Offer amount.
- Rejection reason.
- Resume URL.

Pipeline stages:

- Applied
- Shortlisted
- Interview Scheduled
- Interviewed
- Offer Extended
- Hired
- Rejected

## 19. Gratuity and Terminal Settlement

The gratuity module supports terminal settlement records with:

- Employee.
- Separation type.
- Last working date.
- Separation date.
- Years of service.
- Basic salary at separation.
- Gratuity amount.
- Encashable leave days.
- Leave encashment amount.
- Notice pay days.
- Notice pay amount.
- Pending salary days.
- Pending salary amount.
- Total settlement amount.
- Paid date.
- Status.
- Notes.

Separation types:

- Resignation
- Termination
- Retirement
- Death
- Redundancy

Settlement statuses:

- Pending
- Processed
- Paid

## 20. Notification Center

The notification center supports:

- Broadcast and employee-targeted notifications.
- Notification types.
- Title and message.
- Priority.
- Read tracking by employee/user.
- Mark one notification as read.
- Mark all notifications as read.
- Delete notification.
- Filter by type and priority.

Notification types include:

- Leave approved.
- Leave rejected.
- Payroll processed.
- Loan approved.
- Loan rejected.
- Asset assigned.
- Review due.
- Holiday reminder.
- System.

Priorities:

- Low
- Medium
- High

## 21. Biometric Device Management

The biometric module is focused on DigitalPersona U.are.U 4500 support.

### Connection Modes

- WebSocket connection to local bridge at `ws://127.0.0.1:15896`.
- Fallback endpoints such as localhost and secure localhost.
- WebHID direct USB path for browsers that expose the device.
- Simulation mode for testing when hardware is unavailable.

### Device Capture Test

The test tab can:

- Connect to the device bridge.
- Query device list.
- Capture sample/template.
- Show quality score.
- Show device info.
- Display bridge logs.
- Provide connection troubleshooting messages.

### Fingerprint Enrollment

Enrollment workflow:

- Select active employee.
- Capture 3 fingerprint samples.
- Show sample progress.
- Store fingerprint templates on employee record.
- Display list of enrolled and not-enrolled employees.

### Biometric Attendance

Attendance workflow:

- Select employee.
- Check enrollment state.
- Scan enrolled finger.
- Verify and mark attendance.
- Show today's biometric attendance log.

## 22. Mobile ESS Features

Mobile Employee Self-Service includes four tabs:

- Home
- Attend
- Leave
- Payslip

### Home

- Employee identity bar.
- Current date and time.
- Today's punch status.
- Geofence status display.
- Monthly streak card.
- Casual leave remaining card.
- Quick attendance CTA.

### Attendance Punch

- Camera preview.
- Selfie capture.
- Face guide overlay.
- GPS capture.
- Biometric availability check.
- WebAuthn registration and verification in browser.
- Capacitor native biometric plugin path for Android/iOS native shell.
- Camera punch fallback.
- Punch-in and punch-out support.
- WhatsApp-style success toast.

### Leave

- Leave type selection.
- Start/end dates.
- Reason.
- Submit request for HR approval.
- Policy note for special documentation categories.

### Payslip

- June 2026 payslip view.
- Basic salary, allowances, overtime, FBR tax, EOBI, and net take-home.

## 23. Kiosk Terminal Features

The embedded React kiosk terminal supports:

- Locked attendance mode.
- Live date/time display.
- Employee ID / code matching.
- Numeric keypad input.
- Fingerprint scan through URU 4500 bridge helper.
- Face scan with webcam access and fallback simulation.
- Success overlay.
- Error overlay.
- Automatic reset after punch.
- Secure access status display.

Punch methods:

- Employee ID / RFID style.
- Fingerprint biometric.
- Face biometric simulation.

## 24. Standalone Windows Kiosk Features

The separate `windows-kiosk` build supports:

- Plain Electron kiosk runtime.
- Employee code / ID / card suffix punch.
- Webcam proof punch.
- IP camera proof punch through snapshot or MJPEG URL.
- URU 4500 fingerprint identification.
- Local-first attendance queue.
- Firestore sync to the same backend as the portal.
- Offline persistence with later sync.
- Settings access to inspect local store.
- Fullscreen kiosk exit flow.

## 25. Firestore Backup, Cleanup, Delete, and Restore

The Firestore maintenance module provides a customer-facing GUI for database operations.

### Backup

- Backup all known collections.
- Backup selected collections.
- Download backup as JSON.
- Include metadata such as app, project ID, database ID, created date, and collections.

### Cleanup

- Clear operational data only.
- Preserve required collections by default.
- Require confirmation text `CLEANUP`.
- Create safety backup before deletion.
- Clear matching localStorage cache keys.

Required collections preserved by cleanup:

- employees
- branches
- departments
- designations
- taxSlabs
- roles
- users
- holidays
- statConfig

Operational collections cleared by cleanup:

- attendances
- leaves
- loanAdvances
- salaryRevisions
- performanceReviews
- companyAssets
- jobPostings
- jobApplications
- gratuitySettlements
- notifications
- payrollRuns

### Selected Delete

- Select any collection set.
- Required collections are protected unless explicitly allowed.
- Require confirmation text `DELETE`.
- Create safety backup before deletion.

### Restore

- Upload JSON backup.
- Select collections to restore.
- Optionally merge without deleting existing documents first.
- Require confirmation text `RESTORE`.
- Create safety backup before restore.

## 26. CLI Maintenance Script

The project also includes `scripts/firestore-maintenance.ts` for command-line backup, cleanup, delete, and restore operations.

Package scripts:

- `npm run firestore:maintenance`
- `npm run firestore:backup`
- `npm run firestore:cleanup`
- `npm run firestore:delete`
- `npm run firestore:restore`

Destructive CLI actions are dry-run by default and require `--confirm` to apply.

## 27. Default Seed Data

The project contains seed/default data for:

- Pakistan FBR tax slabs.
- Pakistan statutory configuration.
- Company information.
- Branches.
- Departments.
- Designations.
- Employees.
- Attendance samples.
- Leave requests.
- Roles.
- Users.
- Pakistan public holidays.
- Loans and advances.
- Salary revisions.
- Performance reviews.
- Company assets.
- Job postings.
- Job applications.
- Notifications.

This seed data supports demos, testing, and initial app behavior.

## 28. Build and Run Commands

### Web

```powershell
npm run dev
npm run build
npm run preview
```

### Windows Desktop

```powershell
npm run windows:run
npm run windows:build
```

Windows output:

```text
dist-windows\Bin Ishaq HR Suite 0.0.0.exe
dist-windows\win-unpacked\Bin Ishaq HR Suite.exe
```

### Windows Kiosk

```powershell
npm run kiosk:run
npm run kiosk:build
```

Kiosk output:

```text
dist-kiosk
```

### Android

Typical Android flow:

```powershell
npm run build
npx cap sync
cd android
.\gradlew.bat assembleDebug
```

APK output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## 29. Native and Hardware Requirements

### Windows Desktop / Biometric

- Windows 10/11 64-bit.
- DigitalPersona U.are.U SDK/driver installed.
- URU 4500 reader connected by USB.
- Local loopback access to `127.0.0.1:15896`.
- Bundled `URU4500Bridge.exe` available in packaged resources or tools folder.

### Android Mobile

- Capacitor Android project.
- Camera permission for selfie attendance.
- Location permission for GPS capture.
- Native biometric plugin path where configured.

### Browser

- Camera access for camera punch.
- Geolocation permission for GPS punch.
- WebAuthn support for platform biometric verification.
- WebHID support in compatible browsers if direct USB device access is attempted.

## 30. Important Current Limitations and Notes

- Authentication is app-level and stores passwords in user records; production deployment should replace this with Firebase Authentication or another secure identity provider.
- Some flows are simulation-friendly for demo and testing, especially face scan and some biometric fallback behavior.
- Payroll values are configurable and Pakistan-oriented, but statutory rates should be reviewed against current official law before production payroll use.
- The README still appears to be the original AI Studio starter README, while the actual project has evolved into the Bin Ishaq HR Suite.
- Built output directories such as `dist-windows` and `dist-kiosk` are present in the repository workspace.
- The Firestore project and database IDs are hardcoded in the Firebase configuration.

## 31. High-Level User Workflows

### Super Admin

1. Create or log in as Super Admin.
2. Configure users, roles, and permissions.
3. Manage statutory payroll settings.
4. Add branches, departments, and designations.
5. Add or edit employees.
6. Enroll fingerprints.
7. Monitor attendance and leaves.
8. Process payroll.
9. Generate payslips and bank advice.
10. Maintain backups and Firestore data.

### HR Manager

1. Manage employee records.
2. Review leave requests.
3. Approve or reject leaves.
4. Monitor attendance.
5. Manage holidays, performance, recruitment, and assets where permitted.

### Payroll Specialist

1. Review attendance and leave inputs.
2. Review statutory settings and tax slabs.
3. Create payroll run.
4. Inspect payslips.
5. Generate bank advice.
6. Track loans, advances, salary revisions, and settlements.

### Employee

1. Log in on mobile or portal.
2. Mark attendance.
3. Submit leave requests.
4. File attendance regularization.
5. View payslip.

### Kiosk Terminal User

1. Log in with kiosk account.
2. System enters locked kiosk mode.
3. Employees punch through code, fingerprint, or face/camera flow.
4. Attendance writes to shared state and Firestore.

## 32. Project Value

The project combines HR administration, payroll compliance, multi-device attendance, biometric hardware integration, and operational maintenance into one connected suite. Its strongest capabilities are:

- Pakistan-specific payroll and statutory logic.
- Shared Firestore-backed state across web, desktop, mobile, and kiosk.
- URU 4500 fingerprint integration.
- Rich HR domain coverage beyond payroll.
- Customer-facing backup, cleanup, delete, and restore tools.
- Multi-role access control.
- Multi-platform packaging for real workplace deployment.

