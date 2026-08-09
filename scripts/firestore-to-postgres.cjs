const crypto = require('node:crypto');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { Pool } = require('pg');
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });

const COLLECTIONS = [
  'companies','branches','departments','designations','zones','ucTowns','wageTypes','holidays','taxSlabs','statConfig',
  'roles','users','employees','biometricTemplates','attendances','mobileDutyAuthorizations','leaves','payrollRuns',
  'payrollPayslips','loanAdvances','salaryRevisions','performanceReviews','companyAssets','jobPostings','jobApplications',
  'gratuitySettlements','notifications',
];
const confirmed = process.argv.includes('--confirm');
if (!confirmed) throw new Error('Migration is dry-run protected. Re-run with --confirm after taking backups.');
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error('DATABASE_URL is required.');
const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
if (!credentialJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required.');

const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(credentialJson)) }, `migration-${Date.now()}`);
const firestore = getFirestore(app, process.env.FIRESTORE_DATABASE_ID || '(default)');
const pool = new Pool({ connectionString, ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' } : false });
const stable = value => JSON.stringify(value, Object.keys(value).sort());
const checksum = documents => crypto.createHash('sha256').update(documents.map(item => `${item.id}:${stable(item.data)}`).sort().join('\n')).digest('hex');

async function main() {
  const run = await pool.query(`INSERT INTO migration_runs(source,status) VALUES('firestore','running') RETURNING id`);
  const runId = run.rows[0].id;
  const counts = {}; const sourceChecksums = {}; const targetChecksums = {};
  try {
    for (const collectionName of COLLECTIONS) {
      const snapshot = await firestore.collection(collectionName).get();
      const documents = snapshot.docs.map(document => ({ id: document.id, data: document.data() }));
      counts[collectionName] = documents.length;
      sourceChecksums[collectionName] = checksum(documents);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const document of documents) {
          const employeeId = typeof document.data.employeeId === 'string' ? document.data.employeeId : ['employees','biometricTemplates'].includes(collectionName) ? document.id : null;
          await client.query(
            `INSERT INTO hr_documents(collection_name,document_id,employee_id,status,data)
             VALUES($1,$2,$3,$4,$5::jsonb)
             ON CONFLICT(collection_name,document_id) DO UPDATE SET employee_id=EXCLUDED.employee_id,status=EXCLUDED.status,data=EXCLUDED.data,version=hr_documents.version+1,updated_at=now()`,
            [collectionName, document.id, employeeId, typeof document.data.status === 'string' ? document.data.status : null, JSON.stringify({ ...document.data, id: document.id })],
          );
        }
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
      const target = await pool.query(`SELECT document_id AS id,data FROM hr_documents WHERE collection_name=$1 ORDER BY document_id`, [collectionName]);
      targetChecksums[collectionName] = checksum(target.rows);
      if (target.rows.length !== documents.length || targetChecksums[collectionName] !== sourceChecksums[collectionName]) {
        throw new Error(`Verification failed for ${collectionName}: source=${documents.length}, target=${target.rows.length}`);
      }
      console.log(`${collectionName}: ${documents.length} verified`);
    }
    await pool.query(`UPDATE migration_runs SET status='completed',completed_at=now(),collection_counts=$2,source_checksums=$3,target_checksums=$4 WHERE id=$1`, [runId, counts, sourceChecksums, targetChecksums]);
    console.log(`Migration ${runId} completed and verified.`);
  } catch (error) {
    await pool.query(`UPDATE migration_runs SET status='failed',completed_at=now(),collection_counts=$2,source_checksums=$3,target_checksums=$4,error_message=$5 WHERE id=$1`, [runId, counts, sourceChecksums, targetChecksums, String(error.message || error)]);
    throw error;
  }
}

main().finally(async () => { await pool.end(); await app.delete(); });
