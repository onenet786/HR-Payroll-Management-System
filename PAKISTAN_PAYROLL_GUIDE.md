# Pakistan Payroll Configuration

The application is Pakistan-only. Payroll uses FBR salaried tax slabs, EOBI, province-aware social security, provident fund, attendance, approved leave, overtime and active loan instalments.

## Payroll lifecycle

1. Select the payroll month and year.
2. Create a draft and review employee calculations.
3. Approve the run. Approval records the user/time and posts loan instalments once.
4. Mark the approved run as disbursed.

Employee payslips are stored in `payrollPayslips` as snapshots. Historical bank advice and employee mobile payslips use these snapshots rather than recalculating current employee data.

## Annual statutory update

Before processing July payroll, an authorized payroll administrator must verify and update:

- FBR salaried tax slabs and bases;
- statutory effective date and tax year;
- EOBI minimum-wage basis and contribution rates;
- provincial social-security rates and wage ceilings;
- overtime multiplier and standard monthly hours;
- province-specific minimum wage and labour-policy settings.

Keep documentary evidence for every rate change. The system assists calculation but does not replace review by a qualified Pakistan payroll/tax professional.

## Bank advice

The CSV is a general payroll bank-advice export. Confirm column order, identifiers and file encoding with the employer's bank before upload. Do not assume that one bank's corporate bulk-upload schema works for another bank.

## Deployment security

New local application users are stored with PBKDF2 password hashes. A production deployment must additionally enforce Firebase Authentication or an equivalent trusted identity provider, restrictive Firestore Security Rules, least-privilege roles, MFA for payroll administrators, and protected biometric/document storage.
