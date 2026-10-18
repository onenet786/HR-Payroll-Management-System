const { Pool } = require('pg');
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required in .env.local.');

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' } : false,
});

// Official FBR Tax Slabs (Finance Act 2024 / 2025 - Salaried Individuals)
const FBR_TAX_SLABS = [
  { id: 'fbr-slab-1', minIncome: 0, maxIncome: 600000, baseTax: 0, percentage: 0 },
  { id: 'fbr-slab-2', minIncome: 600000, maxIncome: 1200000, baseTax: 0, percentage: 5 },
  { id: 'fbr-slab-3', minIncome: 1200000, maxIncome: 2200000, baseTax: 30000, percentage: 15 },
  { id: 'fbr-slab-4', minIncome: 2200000, maxIncome: 3200000, baseTax: 180000, percentage: 25 },
  { id: 'fbr-slab-5', minIncome: 3200000, maxIncome: 4100000, baseTax: 430000, percentage: 30 },
  { id: 'fbr-slab-6', minIncome: 4100000, maxIncome: 999999999, baseTax: 700000, percentage: 35 }
];

async function main() {
  console.log('Seeding official FBR Tax Slabs into PostgreSQL hr_documents...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const slab of FBR_TAX_SLABS) {
      const jsonStr = JSON.stringify(slab);
      await client.query(
        `INSERT INTO hr_documents(collection_name, document_id, data)
         VALUES('taxSlabs', $1, $2::jsonb)
         ON CONFLICT(collection_name, document_id) 
         DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [slab.id, jsonStr]
      );
      console.log(`✓ Seeded ${slab.id}: Rs. ${slab.minIncome.toLocaleString()} - ${slab.maxIncome >= 999999999 ? 'Above' : slab.maxIncome.toLocaleString()} @ ${slab.percentage}% (Base: Rs. ${slab.baseTax.toLocaleString()})`);
    }

    await client.query('COMMIT');
    console.log('✅ Successfully seeded all 6 official FBR Tax Slabs into PostgreSQL hr_documents table!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to seed tax slabs:', err);
    throw err;
  } finally {
    client.release();
  }
}

main().finally(() => pool.end());
