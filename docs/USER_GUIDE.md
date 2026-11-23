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

Employees who sign in from a web browser get the employee self-service screens (the same as the phone app: today's status, attendance punch, leave, payslips and notices), not the HR portal.

### Change your own password

Every user can change their own password: open **My Security** and select **Change password** (employees use the **Change password** button on the self-service screens). Enter the current password and a new password of at least 12 characters, twice. Other signed-in devices are signed out, and remembered devices must enter the MFA code again.

**Screenshot placeholder:** Login and first-admin setup screen.

### Navigation

The web portal uses a left sidebar. The top area shows the current account and Firestore synchronization state. Mobile users use the Home, Attend, Leave and Payslip bottom tabs. The Android app does not allow its data to be backed up or transferred to another phone; on a new phone, install the app and sign in again. Kiosk accounts enter attendance mode directly. Press Ctrl+K ("Jump to record") and choose an employee to open that employee in the Employee Directory. Dates such as "today" use the computer's local date.

### Sign out

Use the logout control in the account area. After sign-out the page reloads completely, so the next person on the same browser sees none of the previous user's data. A kiosk user must choose **Exit Kiosk Terminal** before returning to login.

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
2. Enter identity and contact details, including CNIC. The mobile number can be typed in any common form (+92 321 4444444, 0321-4444444, 3214444444); it is tidied to +923XXXXXXXXX when you leave the field.
3. Enter the **Date of Joining** (defaults to today). Payroll, leave, gratuity and service length count from it; it can be corrected later in the edit form.
4. Choose branch, department and designation.
5. Enter wage type, basic salary, allowances, PF/gratuity choices and statutory identifiers.
6. Enter Pakistani bank/account/IBAN information. The IBAN may be typed with spaces or in lowercase; it is saved in uppercase without spaces and checked with the international IBAN check digits, so a mistyped IBAN is refused.
7. Add a picture (JPEG, PNG or WebP) and operational location fields where applicable.
8. Save the employee.

### Edit or offboard

Open an employee record, update the required fields and save. In the full edition (two-person control on) the salary of an existing employee is read-only here, with the note "Change salary through Salary Revisions (needs a second approver)"; new employees still get a salary on the add form. The edit form also refuses a CNIC that already belongs to another employee. If the server refuses the save or the connection fails, a message is shown and the form stays open. The offboarding flow calculates gratuity and leave encashment inputs before changing employment status.

### Why it exists

Every attendance log, leave request, payslip, loan, review, asset and gratuity record links to an employee ID. Removing the employee master breaks reliable ownership and creates duplicate or orphaned HR records.

**Screenshot placeholder:** Employee table and add/edit employee form.

---

## 6. Attendance

### Administrative use

1. Open **Attendance**.
2. Select a date and daily, weekly, monthly or annual view.
3. Review present, late, half-day, absent, leave and holiday statuses.
4. Add a manual record only when authorized. If the save is refused or the connection fails, the message is shown and the entry is not shown as saved.
5. Review regularization requests and approve or reject them. If the server refuses a decision (locked month, the line manager's 3-day window, no permission), a message is shown and nothing changes on screen.

### Employee mobile punch

1. Open **Attend**.
2. Allow camera and location permissions when requested.
3. Use device biometric verification where supported, or camera punch.
4. Confirm that time, method and GPS coordinates appear.
5. For a missed punch, enter the date/reason and submit regularization.

### Kiosk punch

The kiosk identifies an employee through configured fingerprint/camera support and records punch-in or punch-out without exposing HR administration. The employee's Friday and Ramadan timings apply at the kiosk too. For night shifts, a punch-out after midnight closes the previous day's shift, and punches between midnight and 5 AM get the correct date.

Kiosk security:

- **Admin PIN.** The first time Settings is opened the kiosk asks for an admin PIN (6 to 12 digits; keep it safe; **Change PIN** in Settings changes it). After that the PIN is needed to open or save Settings, Exit the kiosk, clear the local attendance cache, register or remove the device key, and test an IP camera. Five wrong PINs lock it for 30 seconds, doubling up to 15 minutes, and the lock survives a restart. The admin session ends after 5 idle minutes or when Settings is closed.
- **Locked window.** No menu, developer tools, reload, Alt+F4 or other shortcuts; the kiosk cannot navigate away or open windows, and closes only through Exit (with the PIN) or Windows shutdown/log-off. Developers can start it with `KIOSK_DEVTOOLS=1`.
- **Face camera.** The default is single-person mode with the liveness check (turn the head as asked). Multi-face mode (several people at once) is off by default and must be switched on in Settings (**Allow Multi-Face walk-through mode**, with a warning); its punches have no liveness check, so every one goes to Needs Review.
- **Employee-code punches** are recorded as RFID/code punches, never as fingerprint or face.
- **Clock checks.** The server sends a kiosk punch to Needs Review when the kiosk clock is more than 10 minutes wrong, or when a punch saved offline arrives more than 12 hours late. Keep the kiosk PC's date, time and time zone correct (Pakistan, automatic time). A kiosk cannot overwrite attendance HR has corrected; it can still add the punch-out.
- **Server address.** Plain `http://` is accepted only for an IP address (for example `http://192.168.1.10:8080`) or localhost; names such as `HEADOFFICE` or `*.local` need `https://` (run Enable-Https.ps1 on the Windows server, then install its CA on the kiosk PC). A name typed without http/https is treated as https. Setup codes made on a plain-http Windows server contain the server's IP address automatically.

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
4. Approve or reject. In the full edition nobody can approve or reject their own leave; the buttons are disabled on your own request. If a rejection is refused or the connection fails, a message is shown and the request stays unchanged.

**Add Leave Record** (HR records leave directly) checks the leave balance in the same way as an approval; on a refusal the form stays open for correction. A recorded approved leave also marks those days On Leave in attendance, like a normal approval.

Approved unpaid leave contributes to payroll deductions. Cross-month requests are apportioned to the payroll period instead of charging the full request twice. When the absence deduction basis is "Scheduled Working Days", weekly offs and holidays inside a leave are not charged as leave days.

### Why it exists

Leave distinguishes authorized paid absence from unpaid absence. Without it, attendance and payroll cannot know whether a missing day should be paid, deducted or escalated.

**Screenshot placeholder:** Leave request and approval screen.

---

## 8. Pakistan Payroll

### Create and complete payroll

1. Open **Payroll**.
2. Select the month and year.
3. Review the preview register for gross pay, FBR tax, EOBI, provincial social security, PF and net pay.
4. Select **Run New Payroll Cycle** to create a Draft. The button is disabled while it works, so a double click cannot create two runs.
5. Review the frozen employee snapshots.
6. Select **Approve** (a different user from the preparer). Approval records the user/time.
7. After payment authorization, select **Mark Disbursed**. Loan repayments are recorded at this step.
8. Open bank advice and download the CSV. Confirm its layout with the relevant bank before upload.

Once a month has a payroll run that is not cancelled, the preview register shows the payslips that run saved (the amounts in the bank file); only staff not in that run are calculated live.

If the server refuses creating, approving or disbursing a run, or the connection fails, a message is shown and the screen does not pretend it was saved.

Only one run is allowed for a month/year. Historical results come from immutable `payrollPayslips`; changes to a current employee record do not rewrite old payslips.

### Calculation rules

- Active and On Leave employees enter a run.
- Daily wagers are paid for present days, half-days and approved paid leave.
- Salaried employees use configured components and the configured absence basis (calendar days, scheduled working days or fixed 30 days) for explicit absence/unpaid leave.
- House rent, conveyance, medical and other allowances are reduced for absence, and for joiners/leavers, in the same proportion as basic pay.
- A recorded absence covered by unpaid leave is not deducted twice.
- Overtime uses configured standard monthly hours and multiplier.
- FBR tax annualizes the recurring monthly taxable gross and applies the active progressive slab table. A one-off taxable bonus is taxed in the month it is paid, not projected as if repeated. Manual Tax Adjustment items count towards tax already deducted. The high-income surcharge applies only when a surcharge rate is set in Statutory Settings (default 0).
- Arrears from a back-dated salary revision count each past month once.
- EOBI uses configured minimum-wage basis and employee/employer rates when enabled.
- Social security uses the employee branch province, configured rate and wage ceiling.
- PF uses the employee's opt-in/rate with employer match.
- Active loan installments enter deductions; loan balances move forward only when the run is marked disbursed. Each payslip records which loans it deducted and how much, and an installment never exceeds what is still owed. Loans approved after the payroll month are not deducted that month.
- The accounting journal balances, including when there are late fines. CSV exports keep negative amounts as numbers.
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
4. Review/edit every tax slab minimum, maximum, base and percentage. Check them against FBR every tax year.
5. Review minimum wage, EOBI values, provincial social-security rates/ceiling, gratuity and PF controls.
6. Update settings only from verified official notices and keep evidence of the change.

Built-in tax slabs (Finance Act 2026, salaried, Tax Year 2027 from 1 July 2026):

| Yearly taxable salary (PKR) | Tax |
|---|---|
| Up to 600,000 | Nil |
| 600,001 - 1,200,000 | 1% of the amount above 600,000 |
| 1,200,001 - 2,200,000 | 6,000 + 11% of the amount above 1,200,000 |
| 2,200,001 - 3,200,000 | 116,000 + 20% of the amount above 2,200,000 |
| 3,200,001 - 4,100,000 | 316,000 + 25% of the amount above 3,200,000 |
| 4,100,001 - 5,600,000 | 541,000 + 29% of the amount above 4,100,000 |
| 5,600,001 - 7,000,000 | 976,000 + 32% of the amount above 5,600,000 |
| Above 7,000,000 | 1,424,000 + 35% of the amount above 7,000,000 |

The high-income surcharge applies only if a surcharge rate is set in Statutory Settings (default 0). Existing companies keep their current slabs until someone selects **Update from FBR** and a second person approves the proposal.

Statutory settings and Company Options save as you type, but the pending proposal is written to the server once typing pauses (fewer audit entries). A different authorized user approves the proposal before it applies.

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

Security notes: a user account that is not linked to an employee sees only what its role permits (it has no "own records"). Two-step verification is fixed to the enrolled method: an account that uses an authenticator app cannot switch to an email code at sign-in; use an MFA reset if the device is lost. Employee photos must be JPEG, PNG, WebP or GIF images.

### Why it exists

Payroll, biometric and personal data must not be visible to every user. Without role control, confidentiality and separation of duties collapse.

**Screenshot placeholder:** Roles, permissions and user accounts.

---

## 11. Holidays

Create, edit or delete public, company and optional holidays (if a delete is refused or the connection fails, the holiday stays and a message is shown). Record the date, recurrence and description. A holiday marked **Recurring annually** counts every year from the year it was entered. Optional holidays are not days off for everyone: staff who take one apply for leave; others work and are paid normally.

**Why:** Holiday status prevents legitimate closures from being treated as absence and gives employees a shared calendar.

---

## 12. Loans and Salary Advances

Employees/authorized staff create requests with principal, approved amount, installments and reason. The system records who entered each application; a different payroll-authorized user approves or rejects it (the person who entered it, or the employee it is for, cannot decide it). Approving cannot change the amount or installments. In the lite edition (no maker-checker) one owner may do both. After approval a loan's terms are fixed. Active installments are included in payroll; remaining installments and repayment totals move forward only when salary is disbursed. Each payslip records exactly which loans it deducted and how much; an installment never exceeds the amount still owed. A loan approved after the payroll month is not deducted in that month.

**Why:** Without a linked loan ledger, deductions are easy to miss, duplicate or continue after closure.

---

## 13. Salary Revisions

Create a revision with previous/new salary, amount, percentage, effective date, reason, approver and revision type. Every draft records who prepared it, and the preparer cannot approve it (this includes drafts created from performance reviews). In the full edition this is the only way to change an existing employee's salary. A back-dated revision creates arrears that count each past month once.

**Why:** A dated compensation history explains why payroll changed and connects performance/promotion decisions to pay.

---

## 14. Performance Reviews

Create KPI-based reviews with weights, self/manager scores, comments, strengths, improvement areas and increment recommendation. Progress through Draft, Submitted, Reviewed and Acknowledged. Review periods follow the current year: Annual, H1/H2 and Q1-Q4 for last year, this year and next year.

**Why:** Structured evidence makes appraisal and increment recommendations less arbitrary.

---

## 15. Asset Management

Register company assets with tag, category, serial, cost, condition and status. Assign and return assets against employee IDs. While an asset is still assigned to an employee, their final settlement cannot be processed or paid.

**Why:** Without custody records, laptops, phones, SIMs, vehicles and tools can remain unreturned or unaccounted for during transfers/offboarding.

---

## 16. Recruitment

Create job postings, vacancies and requirements. Track candidates through Applied, Shortlisted, Interview Scheduled, Interviewed, Offer Extended, Hired or Rejected. A posting may name an optional **Designation (post)**, which is used when a hired applicant is onboarded. Postings past their closing date show **Closed (expired)** and are not counted as open.

**Why:** A consistent candidate pipeline prevents lost applications and undocumented hiring decisions.

---

## 17. Gratuity and Final Settlement

Create a settlement using separation type/date, service years, basic salary, gratuity, leave encashment, notice pay, pending salary and payment status. Service counts the last working day, so a person who worked exactly 5 years gets 5 years.

**Why:** Separation liabilities must be calculated and tracked independently from ordinary monthly payroll.

---

## 18. Notifications

Create targeted or broadcast messages for leave, payroll, loans, assets, review deadlines, holidays and system notices. Employees can mark items read. HR also sees notices sent to individual employees, marked "Seen by employee" or "Not yet seen by employee"; the Unread count is your own inbox.

**Why:** Transactions without communication generate repeated HR queries and missed decisions.

---

## 19. Biometric Device Management

Use the biometric module and URU 4500 bridge to enroll/manage fingerprint templates and test device communication. Web browsers can use the bridge only when allowed: on an HR PC that enrolls in Chrome/Edge, create `allowed-origins.txt` next to `URU4500Bridge.exe` with the portal address exactly as in the address bar without a path (for example `https://headoffice` or `https://hr.company.com`), one per line, then restart the bridge. The Windows desktop app needs nothing. The kiosk starts its own bridge with a secret and checks it before use; an older bridge installed as a service is refused until it is replaced with the new `URU4500Bridge.exe` from the kiosk package, or until **Allow unverified fingerprint bridge** is switched on in kiosk Settings (not recommended). Camera descriptors support the alternate attendance path. Windows kiosk PCs are registered from **User Management -> Kiosk terminals**: create a setup code and paste it on the kiosk (Settings -> Server Registration -> Setup code), or sign in there once with a Kiosk Terminal account. The list shows the account name for every kiosk, including those registered with a setup code.

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
                               Approval (second person)
                                           |
                              Bank CSV -> Disbursement -> loan repayment
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
6. Loan balances move only when a run is marked Disbursed.
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
| Loan did not reduce in Draft or Approved run | Expected behavior | The balance moves when the run is marked Disbursed |
| Employee cannot see payslip | Run remains Draft or no saved snapshot exists | Approve the relevant payroll run |
| Wrong statutory amount | Firestore values may be older than defaults | Verify tax year, effective date, slabs, rates and ceiling |
| Camera/GPS unavailable | Browser/device permission denied | Enable permissions and retry on HTTPS/native app |
| Fingerprint reader unavailable | Bridge/service/driver not running, or an older bridge service the kiosk refuses | Copy the new URU4500Bridge.exe from the kiosk package and restart the bridge |
| Browser cannot connect to the fingerprint bridge | Portal address missing from allowed-origins.txt | Add it next to URU4500Bridge.exe and restart the bridge |
| Kiosk punches all in Needs Review | Multi-face mode on, or wrong kiosk clock/time zone, or offline punches arriving over 12 hours late | Turn multi-face off; fix the PC clock; fix the internet |
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
Once, when the associated payroll run is marked disbursed.

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
- Review statutory configuration (tax slabs against FBR) before every July payroll and after legal changes.

