const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const { Pool } = require('pg');
require('dotenv').config({ path: ['.env.local', '.env'] });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const COLLECTIONS = [
  'companies', 'branches', 'departments', 'designations', 'zones', 'ucTowns', 'wageTypes', 'holidays', 'taxSlabs', 'statConfig',
  'roles', 'users', 'employees', 'biometricTemplates', 'attendances', 'mobileDutyAuthorizations', 'leaves', 'payrollRuns',
  'payrollPayslips', 'loanAdvances', 'salaryRevisions', 'performanceReviews', 'companyAssets', 'jobPostings', 'jobApplications',
  'gratuitySettlements', 'notifications',
];

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app, process.env.VITE_FIRESTORE_DATABASE_ID || '(default)');
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' } : false,
});

async function main() {
  console.log('🔄 Fetching all collections from Firebase Firestore into local PostgreSQL...');
  let totalImported = 0;

  for (const collectionName of COLLECTIONS) {
    try {
      const colRef = collection(firestore, collectionName);
      const snapshot = await getDocs(colRef);
      const documents = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));

      if (documents.length > 0) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const docItem of documents) {
            const employeeId = typeof docItem.data.employeeId === 'string' ? docItem.data.employeeId : ['employees', 'biometricTemplates'].includes(collectionName) ? docItem.id : null;
            await client.query(
              `INSERT INTO hr_documents(collection_name, document_id, employee_id, status, data)
               VALUES($1, $2, $3, $4, $5::jsonb)
               ON CONFLICT(collection_name, document_id) 
               DO UPDATE SET employee_id = EXCLUDED.employee_id, status = EXCLUDED.status, data = EXCLUDED.data, version = hr_documents.version + 1, updated_at = now()`,
              [collectionName, docItem.id, employeeId, typeof docItem.data.status === 'string' ? docItem.data.status : null, JSON.stringify({ ...docItem.data, id: docItem.id })],
            );
          }
          await client.query('COMMIT');
          totalImported += documents.length;
          console.log(`  ✓ ${collectionName}: ${documents.length} document(s) imported`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`  ✕ Error importing ${collectionName}:`, err.message);
        } finally {
          client.release();
        }
      } else {
        console.log(`  - ${collectionName}: 0 documents found`);
      }
    } catch (err) {
      console.warn(`  - ${collectionName}: query skipped (${err.message})`);
    }
  }

  console.log(`\n🎉 Data transfer complete! Total documents synced to PostgreSQL: ${totalImported}`);
}

main().finally(() => pool.end().then(() => process.exit(0)));
