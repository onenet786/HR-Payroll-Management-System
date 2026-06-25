/**
 * Firestore maintenance CLI for HR Payroll.
 *
 * Commands:
 *   npm run firestore:backup
 *   npm run firestore:cleanup
 *   npm run firestore:cleanup -- --confirm
 *   npm run firestore:delete -- --collections attendances,leaves --confirm
 *   npm run firestore:delete -- --collection employees --documents emp1,emp2 --confirm --allow-required
 *   npm run firestore:restore -- --file backups/firestore/firestore-backup-YYYY-MM-DDTHH-mm-ss.json --confirm
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAA7uvWdIsP9CqFGJEk5SB0FvLFF97DNk4',
  authDomain: 'gen-lang-client-0314098400.firebaseapp.com',
  projectId: 'gen-lang-client-0314098400',
  storageBucket: 'gen-lang-client-0314098400.firebasestorage.app',
  messagingSenderId: '279125201448',
  appId: '1:279125201448:web:60c148c137e9fd60a2db1d',
};

const firestoreDatabaseId = 'ai-studio-0ab7c3a1-e4ca-49b5-86f4-6883897b9163';
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firestoreDatabaseId);

type BackupDocument = { id: string; data: Record<string, unknown> };
type BackupFile = {
  metadata: {
    projectId: string;
    databaseId: string;
    createdAt: string;
    collections: string[];
  };
  collections: Record<string, BackupDocument[]>;
};

const requiredCollections = [
  'employees',
  'branches',
  'departments',
  'designations',
  'taxSlabs',
  'roles',
  'users',
  'holidays',
  'statConfig',
] as const;

const operationalCollections = [
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
] as const;

const allKnownCollections = [...requiredCollections, ...operationalCollections];

const [, , command = 'help', ...rawArgs] = process.argv;
const args = new Set(rawArgs);
const isConfirmed = args.has('--confirm') || args.has('--yes');
const skipBackup = args.has('--skip-backup');
const mergeRestore = args.has('--merge');
const allowRequiredDelete = args.has('--allow-required');

function getArg(name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = rawArgs.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = rawArgs.indexOf(name);
  if (index >= 0) return rawArgs[index + 1];

  return undefined;
}

function getList(name: string): string[] {
  return (getArg(name) ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, removeUndefined(entryValue)])
    );
  }

  return value;
}

function timestampForFile(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function readCollection(dbRef: Firestore, collectionName: string): Promise<BackupDocument[]> {
  const snapshot = await getDocs(collection(dbRef, collectionName));
  return snapshot.docs.map((document) => ({
    id: document.id,
    data: removeUndefined(document.data()) as Record<string, unknown>,
  }));
}

async function backupCollections(collectionNames: string[], reason: string): Promise<string> {
  const uniqueCollections = [...new Set(collectionNames)];
  const backup: BackupFile = {
    metadata: {
      projectId: firebaseConfig.projectId,
      databaseId: firestoreDatabaseId,
      createdAt: new Date().toISOString(),
      collections: uniqueCollections,
    },
    collections: {},
  };

  for (const collectionName of uniqueCollections) {
    backup.collections[collectionName] = await readCollection(db, collectionName);
    console.log(`backup ${collectionName}: ${backup.collections[collectionName].length} doc(s)`);
  }

  const backupDir = path.resolve('backups', 'firestore');
  await fs.mkdir(backupDir, { recursive: true });

  const filePath = path.join(backupDir, `firestore-backup-${timestampForFile()}-${reason}.json`);
  await fs.writeFile(filePath, JSON.stringify(backup, null, 2), 'utf8');
  console.log(`Backup saved: ${filePath}`);
  return filePath;
}

async function deleteWholeCollection(collectionName: string): Promise<number> {
  const snapshot = await getDocs(collection(db, collectionName));

  if (!isConfirmed) {
    return snapshot.size;
  }

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

  if (batchCount > 0) {
    await batch.commit();
  }

  return deleted;
}

async function deleteDocuments(collectionName: string, documentIds: string[]): Promise<number> {
  if (!isConfirmed) {
    return documentIds.length;
  }

  let batch = writeBatch(db);
  let batchCount = 0;
  let deleted = 0;

  for (const documentId of documentIds) {
    batch.delete(doc(db, collectionName, documentId));
    batchCount += 1;
    deleted += 1;

    if (batchCount === 450) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return deleted;
}

function assertRequiredCollectionsAllowed(collectionNames: string[]): void {
  const blocked = collectionNames.filter((name) => requiredCollections.includes(name as typeof requiredCollections[number]));
  if (blocked.length > 0 && !allowRequiredDelete) {
    throw new Error(
      `Refusing to delete required collection(s): ${blocked.join(', ')}. ` +
      'Use --allow-required only if you have a backup and really intend this.'
    );
  }
}

async function runBackup(): Promise<void> {
  const selectedCollections = getList('--collections');
  await backupCollections(selectedCollections.length > 0 ? selectedCollections : allKnownCollections, 'manual');
}

async function runCleanup(): Promise<void> {
  console.log(isConfirmed ? 'Mode: CONFIRMED cleanup' : 'Mode: DRY RUN cleanup');
  console.log('Cleanup deletes operational data only. It does not seed dummy/default data.');

  if (isConfirmed && !skipBackup) {
    await backupCollections(allKnownCollections, 'before-cleanup');
  }

  for (const collectionName of operationalCollections) {
    const deleted = await deleteWholeCollection(collectionName);
    console.log(`${collectionName}: ${isConfirmed ? 'deleted' : 'would delete'} ${deleted} doc(s)`);
  }

  if (!isConfirmed) {
    console.log('Dry run complete. Add --confirm to apply changes.');
  }
}

async function runDelete(): Promise<void> {
  const singleCollection = getArg('--collection');
  const collections = getList('--collections');
  const documentIds = getList('--documents');

  if (singleCollection && documentIds.length > 0) {
    assertRequiredCollectionsAllowed([singleCollection]);
    console.log(isConfirmed ? 'Mode: CONFIRMED document delete' : 'Mode: DRY RUN document delete');
    if (isConfirmed && !skipBackup) {
      await backupCollections([singleCollection], `before-delete-${singleCollection}`);
    }
    const deleted = await deleteDocuments(singleCollection, documentIds);
    console.log(`${singleCollection}: ${isConfirmed ? 'deleted' : 'would delete'} ${deleted} selected doc(s)`);
    return;
  }

  const selectedCollections = collections.length > 0 ? collections : singleCollection ? [singleCollection] : [];
  if (selectedCollections.length === 0) {
    throw new Error('Provide --collections attendances,leaves or --collection employees --documents emp1,emp2');
  }

  assertRequiredCollectionsAllowed(selectedCollections);
  console.log(isConfirmed ? 'Mode: CONFIRMED collection delete' : 'Mode: DRY RUN collection delete');

  if (isConfirmed && !skipBackup) {
    await backupCollections(selectedCollections, `before-delete-${selectedCollections.join('-')}`);
  }

  for (const collectionName of selectedCollections) {
    const deleted = await deleteWholeCollection(collectionName);
    console.log(`${collectionName}: ${isConfirmed ? 'deleted' : 'would delete'} ${deleted} doc(s)`);
  }
}

async function runRestore(): Promise<void> {
  const backupPath = getArg('--file');
  if (!backupPath) {
    throw new Error('Provide --file path/to/firestore-backup.json');
  }

  const fileContent = await fs.readFile(path.resolve(backupPath), 'utf8');
  const backup = JSON.parse(fileContent) as BackupFile;
  const selectedCollections = getList('--collections');
  const collectionsToRestore = selectedCollections.length > 0
    ? selectedCollections
    : Object.keys(backup.collections);

  console.log(isConfirmed ? 'Mode: CONFIRMED restore' : 'Mode: DRY RUN restore');
  console.log(mergeRestore ? 'Restore strategy: merge backup docs into current data' : 'Restore strategy: replace selected collections from backup');

  if (isConfirmed && !skipBackup) {
    await backupCollections(collectionsToRestore, 'before-restore');
  }

  for (const collectionName of collectionsToRestore) {
    const documents = backup.collections[collectionName] ?? [];

    if (!mergeRestore) {
      const deleted = await deleteWholeCollection(collectionName);
      console.log(`${collectionName}: ${isConfirmed ? 'deleted current' : 'would delete current'} ${deleted} doc(s)`);
    }

    if (!isConfirmed) {
      console.log(`${collectionName}: would restore ${documents.length} doc(s)`);
      continue;
    }

    for (const backupDocument of documents) {
      await setDoc(doc(db, collectionName, backupDocument.id), backupDocument.data);
    }
    console.log(`${collectionName}: restored ${documents.length} doc(s)`);
  }

  if (!isConfirmed) {
    console.log('Dry run complete. Add --confirm to restore.');
  }
}

function printHelp(): void {
  console.log(`
Firestore maintenance commands:

  npm run firestore:backup
  npm run firestore:backup -- --collections employees,attendances

  npm run firestore:cleanup
  npm run firestore:cleanup -- --confirm

  npm run firestore:delete -- --collections attendances,leaves --confirm
  npm run firestore:delete -- --collection employees --documents emp1,emp2 --confirm --allow-required

  npm run firestore:restore -- --file backups/firestore/firestore-backup-file.json
  npm run firestore:restore -- --file backups/firestore/firestore-backup-file.json --confirm
  npm run firestore:restore -- --file backups/firestore/firestore-backup-file.json --confirm --merge

Safety:
  - cleanup/delete/restore are dry-run unless --confirm is supplied.
  - confirmed cleanup/delete/restore creates a backup first unless --skip-backup is supplied.
  - required collections cannot be deleted directly unless --allow-required is supplied.
  - no cleanup/delete command inserts dummy data after deletion.
`);
}

async function main(): Promise<void> {
  console.log(`Firestore project: ${firebaseConfig.projectId}`);
  console.log(`Firestore database: ${firestoreDatabaseId}`);
  console.log('');

  if (command === 'backup') return runBackup();
  if (command === 'cleanup') return runCleanup();
  if (command === 'delete') return runDelete();
  if (command === 'restore') return runRestore();

  printHelp();
}

main().catch((error: unknown) => {
  console.error('Firestore maintenance failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
