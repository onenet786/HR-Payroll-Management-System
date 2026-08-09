require('dotenv').config({ path: '.env.local' });
const { pool } = require('../server/db.cjs');

async function main() {
  await pool.query(`DELETE FROM hr_documents WHERE collection_name = 'users'`);
  const res = await pool.query(`SELECT COUNT(*) FROM hr_documents WHERE collection_name = 'users'`);
  console.log('User count in database:', res.rows[0].count);
  await pool.end();
}

main().catch(console.error);
