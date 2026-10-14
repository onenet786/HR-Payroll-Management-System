const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required in .env.local.');

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' } : false,
});

async function main() {
  console.log('Seeding initial HR Suite data into local PostgreSQL database...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const upsert = async (collection, id, data) => {
      const jsonStr = JSON.stringify({ ...data, id });
      const employeeId = data.employeeId || (['employees', 'biometricTemplates'].includes(collection) ? id : null);
      const status = data.status || null;

      await client.query(
        `INSERT INTO hr_documents(collection_name, document_id, employee_id, status, data)
         VALUES($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT(collection_name, document_id) 
         DO UPDATE SET employee_id = EXCLUDED.employee_id, status = EXCLUDED.status, data = EXCLUDED.data, updated_at = now()`,
        [collection, id, employeeId, status, jsonStr],
      );
    };

    // 1. Roles
    await upsert('roles', 'role-admin', {
      name: 'Super Admin',
      description: 'Full administrative access',
      permissions: ['manage_settings', 'manage_access', 'manage_employees', 'manage_attendance', 'manage_leaves', 'manage_payroll', 'manage_mobile_duty', 'use_kiosk'],
    });

    await upsert('roles', 'role-employee', {
      name: 'Employee',
      description: 'Employee Self-Service access',
      permissions: ['self_service'],
    });

    // 2. Admin User
    const passwordHash = await bcrypt.hash('admin123', 10);
    await upsert('users', 'usr-admin', {
      username: 'admin@binishaq.com',
      email: 'admin@binishaq.com',
      passwordHash,
      roleId: 'role-admin',
      status: 'Active',
      fullName: 'Super Administrator',
    });

    // 3. Initial Company
    await upsert('companies', 'c1', {
      name: 'OneNet Solutions Pk.',
      legalName: 'OneNet Solutions Pk.',
      industry: 'Trading & Services',
      taxRegistrationNumber: 'NTN-4567891-2',
      eobiRegistrationNumber: 'EOBI-Karachi-987654',
      socialSecurityRegion: 'SESSI-Sindh',
      status: 'Active',
    });

    // 4. Initial Branches
    await upsert('branches', 'b1', {
      companyId: 'c1',
      name: 'Karachi HQ Office',
      city: 'Karachi',
      province: 'Sindh',
      address: 'Clifton Block 5, Marine Drive, Karachi, Pakistan',
      status: 'Active',
    });

    await upsert('branches', 'b2', {
      companyId: 'c1',
      name: 'Lahore Distribution Hub',
      city: 'Lahore',
      province: 'Punjab',
      address: 'Multan Road Industrial Area, Lahore, Pakistan',
      status: 'Active',
    });

    // 5. Initial Departments
    await upsert('departments', 'd1', { branchId: 'b1', name: 'Information Technology', code: 'IT' });
    await upsert('departments', 'd2', { branchId: 'b1', name: 'Human Resources', code: 'HR' });
    await upsert('departments', 'd3', { branchId: 'b2', name: 'Warehouse & Logistics', code: 'WLOG' });
    await upsert('departments', 'd4', { branchId: 'b2', name: 'Finance & Accounts', code: 'FIN' });

    // 6. Initial Designations
    await upsert('designations', 'ds1', { departmentId: 'd1', title: 'Senior Software Engineer', grade: 'A1' });
    await upsert('designations', 'ds2', { departmentId: 'd2', title: 'HR Manager', grade: 'M2' });

    // 7. Statutory Config
    await upsert('statConfig', 'stat-pk-2026-27', {
      minimumWage: 37000,
      eobiEmployerRate: 5,
      eobiEmployeeRate: 1,
      pessiEmployerRate: 6,
      gratuityRateDaysPerYear: 30,
      providentFundMaxEmployeeContribution: 10,
      taxYear: '2027',
      effectiveFrom: '2026-07-01',
    });

    // 8. FBR Income Tax Slabs (Finance Act 2024 / 2025 - Salaried Individuals)
    const defaultTaxSlabs = [
      { id: 'fbr-slab-1', minIncome: 0, maxIncome: 600000, baseTax: 0, percentage: 0 },
      { id: 'fbr-slab-2', minIncome: 600000, maxIncome: 1200000, baseTax: 0, percentage: 5 },
      { id: 'fbr-slab-3', minIncome: 1200000, maxIncome: 2200000, baseTax: 30000, percentage: 15 },
      { id: 'fbr-slab-4', minIncome: 2200000, maxIncome: 3200000, baseTax: 180000, percentage: 25 },
      { id: 'fbr-slab-5', minIncome: 3200000, maxIncome: 4100000, baseTax: 430000, percentage: 30 },
      { id: 'fbr-slab-6', minIncome: 4100000, maxIncome: 999999999, baseTax: 700000, percentage: 35 }
    ];
    for (const slab of defaultTaxSlabs) {
      await upsert('taxSlabs', slab.id, slab);
    }

    await client.query('COMMIT');
    console.log('✅ Local database successfully seeded!');
    console.log('--------------------------------------------------');
    console.log('🔑 Default Admin Login Credentials:');
    console.log('   Email:    admin@binishaq.com');
    console.log('   Password: admin123');
    console.log('--------------------------------------------------');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

main().finally(() => pool.end());
