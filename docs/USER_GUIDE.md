# Bin Ishaq HR & Payroll Management System

## Complete User Guide and Internal Logic Manual

**Version:** 2.0 Pakistan Payroll Edition  
**Language:** English with familiar Pakistan HR/payroll terminology  
**Document style:** Arial-compatible, modular reference manual  
**Platforms:** Web portal, Windows desktop wrapper, Android mobile app, and Windows attendance kiosk

---

## 1. System Overview

Bin Ishaq HR & Payroll Management System centralizes employee records, attendance, leave, Pakistan payroll, statutory configuration, loans, salary revisions, performance, recruitment, assets, gratuity, notifications, holidays, access control, biometric devices, and Firestore maintenance.

The system solves a connected business problem: employee information, attendance and leave decisions must reach payroll without spreadsheet reconciliation. It also gives employees mobile access to attendance, leave and approved payslips while maintaining dedicated administrative and kiosk interfaces.

### Technology and deployment

- React 19 and TypeScript frontend built with Vite.
- Firebase Firestore real-time persistence with local browser fallback/cache.
- Capacitor Android wrapper for the mobile experience.
- Electron packages for Windows portal and locked kiosk applications.
- Digital Persona URU 4500 bridge plus camera/face attendance support.
- Firebase Hosting configuration publishes the `dist` production build.

### Important operating note

The product is Pakistan-only. Its payroll concepts include PKR, CNIC, NTN, FBR salaried tax, EOBI, provincial social security, provident fund, gratuity, Pakistani IBANs and bank advice. Statutory values must be reviewed whenever government rules change.

---

## 2. Roles and Access

### Super Admin

Full control through dashboard, employees, attendance, leave, payroll, settings and access permissions. Related modules become visible through those permissions.

### HR Manager

Manages employees, attendance and leave while viewing the dashboard. HR-related modules such as holidays, performance, assets and recruitment are exposed through those base permissions.

### Payroll Specialist

Views the dashboard and manages payroll. Payroll-linked modules include loans, salary revisions and gratuity.

### Employee

Uses the mobile self-service experience for personal attendance, leave requests, regularization and approved payslips. The role has dashboard-level access in the web permission model.

### Kiosk Terminal

Locks a Windows device into the attendance terminal. It is deliberately separated from administrative navigation.

---

## 3. Getting Started

### Sign in

1. Open the hosted URL, Windows app or Android app.
2. Enter the username/email and password assigned by the administrator.
3. Select **Sign in**.
4. The system resolves the account's role and displays only permitted modules.

If the organization has no account yet, the setup screen creates the first Super Admin. New accounts are stored using password hashing; existing legacy accounts should be reset during production migration.

**Screenshot placeholder:** Login and first-admin setup screen.

### Navigation

The web portal uses a left sidebar. The top area shows the current account and Firestore synchronization state. Mobile users use the Home, Attend, Leave and Payslip bottom tabs. Kiosk accounts enter attendance mode directly.

### Sign out

Use the logout control in the account area. A kiosk user must choose **Exit Kiosk Terminal** before returning to login.

---

## 4. Dashboard

### How to use

1. Open **Dashboard**.
2. Review employee, attendance, payroll and workforce summary cards.
3. Use visible operational indicators to decide which module needs attention.

### Why it exists

The dashboard provides orientation before transactional work. Without it, managers must inspect several modules separately to detect missing attendance, pending requests or payroll activity.

**Screenshot placeholder:** Main dashboard with summary cards.

---

## 5. Employee Directory

### Add an employee

1. Open **Employees** and select the add action.
2. Enter identity and contact details, including CNIC.
3. Choose branch, department and designation.
4. Enter wage type, basic salary, allowances, PF/gratuity choices and statutory identifiers.
5. Enter Pakistani bank/account/IBAN information.
6. Add a picture and operational location fields where applicable.
7. Save the employee.

### Edit or offboard

Open an employee record, update the required fields and save. The offboarding flow calculates gratuity and leave encashment inputs before changing employment status.

### Why it exists

Every attendance log, leave request, payslip, loan, review, asset and gratuity record links to an employee ID. Removing the employee master breaks reliable ownership and creates duplicate or orphaned HR records.

**Screenshot placeholder:** Employee table and add/edit employee form.

---

## 6. Attendance

### Administrative use

1. Open **Attendance**.
2. Select a date and daily, weekly, monthly or annual view.
3. Review present, late, half-day, absent, leave and holiday statuses.
4. Add a manual record only when authorized.
5. Review regularization requests and approve or reject them.

### Employee mobile punch

1. Open **Attend**.
2. Allow camera and location permissions when requested.
3. Use device biometric verification where supported, or camera punch.
4. Confirm that time, method and GPS coordinates appear.
5. For a missed punch, enter the date/reason and submit regularization.

### Kiosk punch

The kiosk identifies an employee through configured fingerprint/camera support and records punch-in or punch-out without exposing HR administration.

### Why it exists

Attendance supplies payable presence, absence, lateness, half-days and overtime to payroll. Without controlled attendance, payroll depends on manual estimates and disputes become difficult to audit.

**Screenshot placeholder:** Attendance register, mobile camera punch and kiosk terminal.

---

## 7. Leave Management

### Employee request

1. Open **Leave** on mobile.
2. Choose Casual, Sick, Annual or Unpaid.
3. Select start/end dates and enter a reason.
4. Submit and monitor the request status.

### HR decision

1. Open **Leaves** in the web portal.
2. Filter by period or inspect pending requests.
3. Verify dates, type, reason and employee context.
4. Approve or reject.

Approved unpaid leave contributes to payroll deductions. Cross-month requests are apportioned to the payroll period instead of charging the full request twice.

### Why it exists

Leave distinguishes authorized paid absence from unpaid absence. Without it, attendance and payroll cannot know whether a missing day should be paid, deducted or escalated.

**Screenshot placeholder:** Leave request and approval screen.

---

## 8. Pakistan Payroll

### Create and complete payroll

1. Open **Payroll**.
2. Select the month and year.
3. Review the preview register for gross pay, FBR tax, EOBI, provincial social security, PF and net pay.
4. Select **Run New Payroll Cycle** to create a Draft.
5. Review the frozen employee snapshots.
6. Select **Approve**. Approval records the user/time and posts active loan installments once.
7. After payment authorization, select **Mark Disbursed**.
8. Open bank advice and download the CSV. Confirm its layout with the relevant bank before upload.

Only one run is allowed for a month/year. Historical results come from immutable `payrollPayslips`; changes to a current employee record do not rewrite old payslips.

### Calculation rules

- Active and On Leave employees enter a run.
- Daily wagers are paid for present days, half-days and approved paid leave.
- Salaried employees use configured components and calendar-day deductions for explicit absence/unpaid leave.
- A recorded absence covered by unpaid leave is not deducted twice.
- Overtime uses configured standard monthly hours and multiplier.
- FBR tax annualizes monthly taxable gross and applies the active progressive slab table.
- EOBI uses configured minimum-wage basis and employee/employer rates when enabled.
- Social security uses the employee branch province, configured rate and wage ceiling.
- PF uses the employee's opt-in/rate with employer match.
- Active loan installments enter deductions but loan balances move only when payroll is approved.
- Net salary cannot fall below zero.

### Why it exists

Payroll converts HR evidence into financial obligations. Without a controlled draft/approval/disbursement lifecycle, duplicate runs, changed historical calculations and premature loan deductions can cause direct financial loss.

**Screenshot placeholder:** Payroll preview, historical run card, payslip and bank advice.

---

## 9. Statutory Settings

### How to use

1. Open **Settings**.
2. Confirm Pakistan as the fixed country.
3. Enter FBR tax year and effective date.
4. Review/edit every tax slab minimum, maximum, base and percentage.
5. Review minimum wage, EOBI values, provincial social-security rates/ceiling, gratuity and PF controls.
6. Update settings only from verified official notices and keep evidence of the change.

### Why it exists

Pakistan payroll rates change by tax year and province. Hardcoding them makes old calculations impossible to explain and new payroll silently wrong.

**Screenshot placeholder:** FBR slab and provincial statutory settings.

---

## 10. Roles and User Accounts

### How to use

1. Open **Access Control**.
2. Create a role and choose its base permissions.
3. Create a user, optionally link the user to an employee, and assign a role.
4. Activate/deactivate accounts or change their role.
5. Test with a non-admin account to confirm least-privilege visibility.

### Why it exists

Payroll, biometric and personal data must not be visible to every user. Without role control, confidentiality and separation of duties collapse.

**Screenshot placeholder:** Roles, permissions and user accounts.

---

## 11. Holidays

Create, edit or delete public, company and optional holidays. Record the date, recurrence and description.

**Why:** Holiday status prevents legitimate closures from being treated as absence and gives employees a shared calendar.

---

## 12. Loans and Salary Advances

Employees/authorized staff create requests with principal, approved amount, installments and reason. Payroll-authorized users approve or reject requests. Active installments are included in payroll; remaining installments and repayment totals move at payroll approval.

**Why:** Without a linked loan ledger, deductions are easy to miss, duplicate or continue after closure.

---

## 13. Salary Revisions

Create a revision with previous/new salary, amount, percentage, effective date, reason, approver and revision type.

**Why:** A dated compensation history explains why payroll changed and connects performance/promotion decisions to pay.

---

## 14. Performance Reviews

Create KPI-based reviews with weights, self/manager scores, comments, strengths, improvement areas and increment recommendation. Progress through Draft, Submitted, Reviewed and Acknowledged.

**Why:** Structured evidence makes appraisal and increment recommendations less arbitrary.

---

## 15. Asset Management

Register company assets with tag, category, serial, cost, condition and status. Assign and return assets against employee IDs.

**Why:** Without custody records, laptops, phones, SIMs, vehicles and tools can remain unreturned or unaccounted for during transfers/offboarding.

---

## 16. Recruitment

Create job postings, vacancies and requirements. Track candidates through Applied, Shortlisted, Interview Scheduled, Interviewed, Offer Extended, Hired or Rejected.

**Why:** A consistent candidate pipeline prevents lost applications and undocumented hiring decisions.

---

## 17. Gratuity and Final Settlement

Create a settlement using separation type/date, service years, basic salary, gratuity, leave encashment, notice pay, pending salary and payment status.

**Why:** Separation liabilities must be calculated and tracked independently from ordinary monthly payroll.

---

## 18. Notifications

Create targeted or broadcast messages for leave, payroll, loans, assets, review deadlines, holidays and system notices. Employees can mark items read.

**Why:** Transactions without communication generate repeated HR queries and missed decisions.

---

## 19. Biometric Device Management

Use the biometric module and URU 4500 bridge to enroll/manage fingerprint templates and test device communication. Camera descriptors support the alternate attendance path.

**Why:** Device management separates identity enrollment from ordinary punching and reduces manual attendance impersonation risk.

---

## 20. Firestore Maintenance

Authorized administrators use maintenance tools and documented scripts for backup, cleanup, deletion and restore operations.

**Why:** Real-time data still needs recoverability and controlled housekeeping. Removing maintenance leaves the organization without an operational recovery path.

---

## 21. Internal Data Flow

```text
Organization structure -> Employee master -> User/role and biometric enrollment
                                      |
Attendance punches + approved leave --+-> Payroll calculation
Loans --------------------------------+-> Deductions
Statutory configuration --------------+-> FBR/EOBI/social-security/PF
                                           |
                                           v
                              Draft run + payslip snapshots
                                           |
                               Approval -> loan posting
                                           |
                              Disbursement -> bank CSV
                                           |
                              Mobile approved payslip
```

Firestore listeners synchronize collections into application state and local cache. User actions update the interface first and persist the corresponding document. Payroll is the deliberate exception where employee-level results are saved as snapshots so later employee changes cannot alter history.

---

## 22. Key Business Rules

1. Access is determined by the account's assigned role permissions.
2. Kiosk accounts cannot browse administrative modules.
3. Only Active or On Leave employees enter payroll.
4. Only one payroll run may exist for the same month and year.
5. A run must move Draft → Approved → Disbursed in order.
6. Loan balances move only when a Draft is approved.
7. Historical bank advice and mobile payslips use saved snapshots.
8. Only approved leave affects payroll.
9. Cross-month leave is counted only for overlapping payroll dates.
10. An absent attendance record covered by unpaid leave is not charged twice.
11. Social-security calculation follows the employee's branch province.
12. Net salary is floored at zero.
13. Bank advice is a generic CSV and requires bank-specific confirmation.

---

## 23. Troubleshooting

| Issue | Likely cause | Resolution |
|---|---|---|
| No modules after login | Role has no matching permissions or roles are still syncing | Confirm sync badge, role assignment and permissions |
| Firestore sync warning | Connection, permission or Firebase configuration problem | Check network, project configuration and Firestore rules |
| Cannot create payroll | A run already exists for that period | Open the existing run; do not duplicate it |
| Loan did not reduce in Draft | Expected behavior | Approve the run to post the installment |
| Employee cannot see payslip | Run remains Draft or no saved snapshot exists | Approve the relevant payroll run |
| Wrong statutory amount | Firestore values may be older than defaults | Verify tax year, effective date, slabs, rates and ceiling |
| Camera/GPS unavailable | Browser/device permission denied | Enable permissions and retry on HTTPS/native app |
| Fingerprint reader unavailable | Bridge/service/driver not running | Follow the URU 4500 installation guide and restart bridge |
| Bank rejects CSV | Bank-specific layout differs | Obtain the corporate import specification and map columns |
| Build is slow/large | Single frontend bundle | Build still works; code splitting is a future optimization |

---

## 24. Frequently Asked Questions

**Is this an Indian payroll system?**  
No. It is configured for Pakistan terminology and statutory concepts.

**Can a Draft payroll be paid?**  
It should be reviewed and approved first, then marked disbursed.

**Will editing an employee change an old payslip?**  
No. New payroll runs store employee-level snapshots.

**When are loan installments posted?**  
Once, when the associated payroll run is approved.

**Does the CSV work with every bank?**  
No universal format is claimed. Confirm the schema with the employer's bank.

**Does the system replace a tax professional?**  
No. Authorized staff must verify official FBR, EOBI and provincial notifications.

**Can employees mark attendance remotely?**  
The mobile app records supported biometric/camera methods and GPS coordinates, subject to device permissions.

**Where are records stored?**  
Firestore is the shared store; local browser storage provides cache/fallback behavior.

---

## 25. Production Checklist

- Deploy Firebase Authentication or another trusted identity provider.
- Enforce restrictive Firestore Security Rules and least privilege.
- Reset/migrate legacy plaintext-password accounts.
- Protect biometric templates and employee documents.
- Test a complete payroll with validated employee cases.
- Obtain written bank-file specifications.
- Back up Firestore before bulk maintenance.
- Review statutory configuration before every July payroll and after legal changes.

