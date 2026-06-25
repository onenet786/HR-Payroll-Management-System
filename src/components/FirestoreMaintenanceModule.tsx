import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { AlertTriangle, CheckCircle, Database, Download, RefreshCw, RotateCcw, Trash2, Upload } from 'lucide-react';
import { db } from '../firebase';

type CollectionKey =
  | 'employees'
  | 'branches'
  | 'departments'
  | 'designations'
  | 'taxSlabs'
  | 'roles'
  | 'users'
  | 'holidays'
  | 'statConfig'
  | 'attendances'
  | 'leaves'
  | 'loanAdvances'
  | 'salaryRevisions'
  | 'performanceReviews'
  | 'companyAssets'
  | 'jobPostings'
  | 'jobApplications'
  | 'gratuitySettlements'
  | 'notifications'
  | 'payrollRuns';

type BackupDocument = {
  id: string;
  data: Record<string, unknown>;
};

type BackupFile = {
  metadata: {
    app: string;
    projectId: string;
    databaseId: string;
    createdAt: string;
    collections: CollectionKey[];
  };
  collections: Partial<Record<CollectionKey, BackupDocument[]>>;
};

const REQUIRED_COLLECTIONS: CollectionKey[] = [
  'employees',
  'branches',
  'departments',
  'designations',
  'taxSlabs',
  'roles',
  'users',
  'holidays',
  'statConfig',
];

const OPERATIONAL_COLLECTIONS: CollectionKey[] = [
  'attendances',
  'leaves',
  'loanAdvances',
  'salaryRevisions',
  'performanceReviews',
  'companyAssets',
  'jobPostings',
  'jobApplications',
  'gratuitySettlements',
  'notifications',
  'payrollRuns',
];

const ALL_COLLECTIONS: CollectionKey[] = [...REQUIRED_COLLECTIONS, ...OPERATIONAL_COLLECTIONS];

const COLLECTION_LABELS: Record<CollectionKey, string> = {
  employees: 'Employees',
  branches: 'Branches',
  departments: 'Departments',
  designations: 'Designations',
  taxSlabs: 'Tax Slabs',
  roles: 'Roles',
  users: 'Users',
  holidays: 'Holidays',
  statConfig: 'Statutory Config',
  attendances: 'Attendance Logs',
  leaves: 'Leave Requests',
  loanAdvances: 'Loans & Advances',
  salaryRevisions: 'Salary Revisions',
  performanceReviews: 'Performance Reviews',
  companyAssets: 'Company Assets',
  jobPostings: 'Job Postings',
  jobApplications: 'Job Applications',
  gratuitySettlements: 'Gratuity Settlements',
  notifications: 'Notifications',
  payrollRuns: 'Payroll Runs',
};

const COLLECTION_STORAGE_KEYS: Record<CollectionKey, string[]> = {
  employees: ['hr_employees'],
  branches: ['hr_branches'],
  departments: ['hr_departments'],
  designations: ['hr_designations'],
  taxSlabs: ['hr_tax_slabs'],
  roles: ['hr_roles'],
  users: ['hr_users', 'hr_logged_in_user', 'hr_current_user'],
  holidays: ['hr_holidays'],
  statConfig: ['hr_stat_config'],
  attendances: ['hr_attendances'],
  leaves: ['hr_leaves'],
  loanAdvances: ['hr_loans'],
  salaryRevisions: ['hr_salary_revisions'],
  performanceReviews: ['hr_perf_reviews'],
  companyAssets: ['hr_assets'],
  jobPostings: ['hr_job_postings'],
  jobApplications: ['hr_job_apps'],
  gratuitySettlements: ['hr_gratuity'],
  notifications: ['hr_notifications'],
  payrollRuns: ['hr_payroll_runs'],
};

function cleanData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanData);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, cleanData(entryValue)])
    );
  }
  return value;
}

function timestampForFile(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function readCollection(collectionName: CollectionKey): Promise<BackupDocument[]> {
  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map((document) => ({
    id: document.id,
    data: cleanData(document.data()) as Record<string, unknown>,
  }));
}

async function deleteCollection(collectionName: CollectionKey): Promise<number> {
  const snapshot = await getDocs(collection(db, collectionName));
  let batch = writeBatch(db);
  let batchCount = 0;
  let deleted = 0;

  for (const document of snapshot.docs) {
    batch.delete(document.ref);
    batchCount += 1;
    deleted += 1;

    if (batchCount === 450) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  if (batchCount > 0) await batch.commit();
  return deleted;
}

async function writeDocuments(collectionName: CollectionKey, documents: BackupDocument[]): Promise<void> {
  for (const backupDocument of documents) {
    await setDoc(doc(db, collectionName, backupDocument.id), backupDocument.data);
  }
}

function clearLocalCache(collectionNames: CollectionKey[]): void {
  for (const collectionName of collectionNames) {
    for (const storageKey of COLLECTION_STORAGE_KEYS[collectionName] ?? []) {
      localStorage.removeItem(storageKey);
    }
  }
}

export function FirestoreMaintenanceModule() {
  const [counts, setCounts] = useState<Partial<Record<CollectionKey, number>>>({});
  const [selectedCollections, setSelectedCollections] = useState<CollectionKey[]>(OPERATIONAL_COLLECTIONS);
  const [restoreFile, setRestoreFile] = useState<BackupFile | null>(null);
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restoreCollections, setRestoreCollections] = useState<CollectionKey[]>([]);
  const [status, setStatus] = useState('Ready.');
  const [isBusy, setIsBusy] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [allowRequiredDelete, setAllowRequiredDelete] = useState(false);
  const [mergeRestore, setMergeRestore] = useState(false);

  const selectedRequired = useMemo(
    () => selectedCollections.filter((name) => REQUIRED_COLLECTIONS.includes(name)),
    [selectedCollections]
  );

  const refreshCounts = async () => {
    setIsBusy(true);
    setStatus('Refreshing collection counts...');
    try {
      const nextCounts: Partial<Record<CollectionKey, number>> = {};
      for (const collectionName of ALL_COLLECTIONS) {
        nextCounts[collectionName] = (await readCollection(collectionName)).length;
      }
      setCounts(nextCounts);
      setStatus('Collection counts updated.');
    } catch (error) {
      setStatus(`Failed to refresh counts: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    void refreshCounts();
  }, []);

  const buildBackup = async (collectionsToBackup: CollectionKey[]): Promise<BackupFile> => {
    const backup: BackupFile = {
      metadata: {
        app: 'Bin Ishaq HR Suite',
        projectId: 'gen-lang-client-0314098400',
        databaseId: 'ai-studio-0ab7c3a1-e4ca-49b5-86f4-6883897b9163',
        createdAt: new Date().toISOString(),
        collections: collectionsToBackup,
      },
      collections: {},
    };

    for (const collectionName of collectionsToBackup) {
      backup.collections[collectionName] = await readCollection(collectionName);
    }

    return backup;
  };

  const downloadBackup = async (collectionsToBackup: CollectionKey[], reason: string) => {
    const backup = await buildBackup(collectionsToBackup);
    downloadJson(`firestore-backup-${timestampForFile()}-${reason}.json`, backup);
    return backup;
  };

  const handleBackupAll = async () => {
    setIsBusy(true);
    setStatus('Creating full Firestore backup...');
    try {
      await downloadBackup(ALL_COLLECTIONS, 'full');
      setStatus('Full backup downloaded.');
    } catch (error) {
      setStatus(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleBackupSelected = async () => {
    setIsBusy(true);
    setStatus('Creating selected collection backup...');
    try {
      await downloadBackup(selectedCollections, 'selected');
      setStatus('Selected collection backup downloaded.');
    } catch (error) {
      setStatus(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCleanupOperational = async () => {
    if (confirmText !== 'CLEANUP') {
      setStatus('Type CLEANUP before clearing operational data.');
      return;
    }

    setIsBusy(true);
    setStatus('Creating safety backup before cleanup...');
    try {
      await downloadBackup(ALL_COLLECTIONS, 'before-cleanup');
      for (const collectionName of OPERATIONAL_COLLECTIONS) {
        const deleted = await deleteCollection(collectionName);
        setStatus(`Deleted ${deleted} document(s) from ${COLLECTION_LABELS[collectionName]}...`);
      }
      clearLocalCache(OPERATIONAL_COLLECTIONS);
      await refreshCounts();
      setConfirmText('');
      setStatus('Cleanup complete. No dummy data was inserted.');
    } catch (error) {
      setStatus(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (confirmText !== 'DELETE') {
      setStatus('Type DELETE before deleting selected collections.');
      return;
    }
    if (selectedRequired.length > 0 && !allowRequiredDelete) {
      setStatus(`Protected collections selected: ${selectedRequired.map((name) => COLLECTION_LABELS[name]).join(', ')}`);
      return;
    }

    setIsBusy(true);
    setStatus('Creating safety backup before selected delete...');
    try {
      await downloadBackup(selectedCollections, 'before-selected-delete');
      for (const collectionName of selectedCollections) {
        const deleted = await deleteCollection(collectionName);
        setStatus(`Deleted ${deleted} document(s) from ${COLLECTION_LABELS[collectionName]}...`);
      }
      clearLocalCache(selectedCollections);
      await refreshCounts();
      setConfirmText('');
      setStatus('Selected delete complete. No dummy data was inserted.');
    } catch (error) {
      setStatus(`Delete failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRestoreFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as BackupFile;
        const availableCollections = Object.keys(parsed.collections ?? {}) as CollectionKey[];
        setRestoreFile(parsed);
        setRestoreFileName(file.name);
        setRestoreCollections(availableCollections);
        setStatus(`Backup loaded: ${file.name}`);
      } catch (error) {
        setStatus(`Invalid backup file: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    reader.readAsText(file);
  };

  const handleRestore = async () => {
    if (!restoreFile) {
      setStatus('Choose a backup JSON file first.');
      return;
    }
    if (confirmText !== 'RESTORE') {
      setStatus('Type RESTORE before restoring backup data.');
      return;
    }

    setIsBusy(true);
    setStatus('Creating safety backup before restore...');
    try {
      await downloadBackup(restoreCollections, 'before-restore');
      for (const collectionName of restoreCollections) {
        const documents = restoreFile.collections[collectionName] ?? [];
        if (!mergeRestore) {
          await deleteCollection(collectionName);
        }
        clearLocalCache([collectionName]);
        await writeDocuments(collectionName, documents);
        setStatus(`Restored ${documents.length} document(s) into ${COLLECTION_LABELS[collectionName]}...`);
      }
      await refreshCounts();
      setConfirmText('');
      setStatus('Restore complete.');
    } catch (error) {
      setStatus(`Restore failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const toggleCollection = (collectionName: CollectionKey) => {
    setSelectedCollections((current) =>
      current.includes(collectionName)
        ? current.filter((item) => item !== collectionName)
        : [...current, collectionName]
    );
  };

  const toggleRestoreCollection = (collectionName: CollectionKey) => {
    setRestoreCollections((current) =>
      current.includes(collectionName)
        ? current.filter((item) => item !== collectionName)
        : [...current, collectionName]
    );
  };

  return (
    <div className="h-full overflow-auto bg-slate-50 p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-600" />
            Firestore Backup & Restore
          </h2>
          <p className="text-sm text-slate-500 mt-1">Customer-safe tools for backup, restore, cleanup, and selected collection delete.</p>
        </div>
        <button
          type="button"
          onClick={refreshCounts}
          disabled={isBusy}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-start gap-3">
        <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-slate-800">Safety backup is automatic before cleanup, delete, or restore.</p>
          <p className="text-xs text-slate-500 mt-1">Backup files download to the customer computer as JSON. Cleanup/delete will not insert dummy data after removing records.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="font-bold text-slate-900">Backup</h3>
            <p className="text-xs text-slate-500 mt-1">Download all or selected Firestore collections.</p>
          </div>
          <button
            type="button"
            onClick={handleBackupAll}
            disabled={isBusy}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Backup All Data
          </button>
          <button
            type="button"
            onClick={handleBackupSelected}
            disabled={isBusy || selectedCollections.length === 0}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Backup Selected Collections
          </button>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="font-bold text-slate-900">Cleanup</h3>
            <p className="text-xs text-slate-500 mt-1">Deletes only operational data. It does not create sample or dummy records.</p>
          </div>
          <input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value.toUpperCase())}
            placeholder="Type CLEANUP, DELETE, or RESTORE"
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleCleanupOperational}
            disabled={isBusy}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded bg-amber-500 text-white text-sm font-bold hover:bg-amber-400 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Clear Operational Data
          </button>
          <p className="text-[11px] text-slate-500">Operational data includes attendance, leaves, payroll runs, loans, recruitment, reviews, assets, notifications, and settlements.</p>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="font-bold text-slate-900">Restore</h3>
            <p className="text-xs text-slate-500 mt-1">Load a backup JSON and restore selected collections.</p>
          </div>
          <label className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded border border-slate-300 bg-slate-50 text-slate-800 text-sm font-bold hover:bg-slate-100 cursor-pointer">
            <Upload className="w-4 h-4" />
            Choose Backup File
            <input type="file" accept="application/json,.json" onChange={handleRestoreFile} className="hidden" />
          </label>
          {restoreFileName && <p className="text-xs text-slate-500 truncate">Loaded: {restoreFileName}</p>}
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={mergeRestore} onChange={(event) => setMergeRestore(event.target.checked)} />
            Merge backup without deleting current documents first
          </label>
          <button
            type="button"
            onClick={handleRestore}
            disabled={isBusy || !restoreFile}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Restore Backup
          </button>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900">Collections</h3>
              <p className="text-xs text-slate-500 mt-1">Select collections for backup or selected delete.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSelectedCollections(OPERATIONAL_COLLECTIONS)} className="px-3 py-1.5 text-xs font-bold rounded border border-slate-200 hover:bg-slate-50">Operational</button>
              <button type="button" onClick={() => setSelectedCollections(ALL_COLLECTIONS)} className="px-3 py-1.5 text-xs font-bold rounded border border-slate-200 hover:bg-slate-50">All</button>
              <button type="button" onClick={() => setSelectedCollections([])} className="px-3 py-1.5 text-xs font-bold rounded border border-slate-200 hover:bg-slate-50">None</button>
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[520px] overflow-auto">
            {ALL_COLLECTIONS.map((collectionName) => {
              const isRequired = REQUIRED_COLLECTIONS.includes(collectionName);
              const isSelected = selectedCollections.includes(collectionName);
              return (
                <label key={collectionName} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                  <span className="flex items-center gap-3">
                    <input type="checkbox" checked={isSelected} onChange={() => toggleCollection(collectionName)} />
                    <span>
                      <span className="block text-sm font-bold text-slate-800">{COLLECTION_LABELS[collectionName]}</span>
                      <span className={`text-[10px] font-bold uppercase ${isRequired ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {isRequired ? 'Required' : 'Operational'}
                      </span>
                    </span>
                  </span>
                  <span className="text-xs font-mono text-slate-500">{counts[collectionName] ?? '-'} docs</span>
                </label>
              );
            })}
          </div>
          <div className="p-5 border-t border-slate-100 space-y-3">
            {selectedRequired.length > 0 && (
              <label className="flex items-start gap-2 text-xs text-rose-700">
                <input type="checkbox" checked={allowRequiredDelete} onChange={(event) => setAllowRequiredDelete(event.target.checked)} />
                <span>Allow deleting required selected collections. Use only after taking backup.</span>
              </label>
            )}
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={isBusy || selectedCollections.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded bg-rose-600 text-white text-sm font-bold hover:bg-rose-500 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected Collections
            </button>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="font-bold text-slate-900">Restore Collections</h3>
            <p className="text-xs text-slate-500 mt-1">After loading a backup, choose which collections to restore.</p>
          </div>
          <div className="divide-y divide-slate-100 max-h-[520px] overflow-auto">
            {!restoreFile ? (
              <div className="p-8 text-center text-sm text-slate-500">No backup file selected.</div>
            ) : (
              (Object.keys(restoreFile.collections) as CollectionKey[]).map((collectionName) => (
                <label key={collectionName} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                  <span className="flex items-center gap-3">
                    <input type="checkbox" checked={restoreCollections.includes(collectionName)} onChange={() => toggleRestoreCollection(collectionName)} />
                    <span className="text-sm font-bold text-slate-800">{COLLECTION_LABELS[collectionName] ?? collectionName}</span>
                  </span>
                  <span className="text-xs font-mono text-slate-500">{restoreFile.collections[collectionName]?.length ?? 0} docs</span>
                </label>
              ))
            )}
          </div>
        </section>
      </div>

      <div className={`border rounded-lg p-4 flex items-start gap-3 ${status.toLowerCase().includes('failed') || status.toLowerCase().includes('protected') ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-slate-900 border-slate-800 text-slate-100'}`}>
        <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <p className="text-sm font-mono">{isBusy ? 'Working... ' : ''}{status}</p>
      </div>
    </div>
  );
}
