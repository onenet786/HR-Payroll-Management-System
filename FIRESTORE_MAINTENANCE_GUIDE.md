# Firestore Backup, Cleanup, Delete, and Restore

This project includes a customer-facing GUI inside Web Admin and a guarded Firestore maintenance script:

```text
Web Admin -> Data Backup
```

Use the GUI for normal customer backup, cleanup, restore, and selected collection deletion.

The CLI fallback script is:

```text
scripts/firestore-maintenance.ts
```

All destructive commands are dry-run by default. Add `--confirm` only when you are ready to apply changes.

Cleanup/delete does not insert dummy, sample, or default data after records are removed.

## Required Data Kept By Cleanup

Cleanup preserves the collections required for the app to run:

```text
employees
branches
departments
designations
taxSlabs
roles
users
holidays
statConfig
```

Cleanup deletes operational/demo data:

```text
attendances
leaves
loanAdvances
salaryRevisions
performanceReviews
companyAssets
jobPostings
jobApplications
gratuitySettlements
notifications
payrollRuns
```

## Backup

Backup all known app collections:

```powershell
npm run firestore:backup
```

Backup selected collections only:

```powershell
npm run firestore:backup -- --collections employees,attendances,leaves
```

Backups are saved locally under:

```text
backups/firestore/
```

## Cleanup Operational Data

Preview cleanup without deleting anything:

```powershell
npm run firestore:cleanup
```

Apply cleanup. A backup is created automatically before deletion:

```powershell
npm run firestore:cleanup -- --confirm
```

## Delete Specific Collections

Preview selected collection delete:

```powershell
npm run firestore:delete -- --collections attendances,leaves
```

Delete selected collections. A backup is created automatically before deletion:

```powershell
npm run firestore:delete -- --collections attendances,leaves --confirm
```

Required collections are protected. To delete a required collection, you must explicitly add `--allow-required`.

## Delete Specific Documents

Preview selected document delete:

```powershell
npm run firestore:delete -- --collection employees --documents emp1,emp2 --allow-required
```

Delete selected documents:

```powershell
npm run firestore:delete -- --collection employees --documents emp1,emp2 --confirm --allow-required
```

## Restore

Preview restore:

```powershell
npm run firestore:restore -- --file backups/firestore/firestore-backup-file.json
```

Restore from backup. A new backup is created first:

```powershell
npm run firestore:restore -- --file backups/firestore/firestore-backup-file.json --confirm
```

Restore only selected collections:

```powershell
npm run firestore:restore -- --file backups/firestore/firestore-backup-file.json --collections employees,attendances --confirm
```

Merge backup data into current Firestore without deleting current documents first:

```powershell
npm run firestore:restore -- --file backups/firestore/firestore-backup-file.json --confirm --merge
```
