BEGIN;

-- Ensure UUID generation extension
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgcrypto extension unavailable, proceeding with native features';
END $$;

-- ============================================================================
-- 1. ORGANIZATION HIERARCHY TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS companies (
  id VARCHAR(240) PRIMARY KEY,
  name TEXT,
  code VARCHAR(80),
  employee_id VARCHAR(240),
  status VARCHAR(80) DEFAULT 'Active',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_companies_code ON companies(code);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
CREATE INDEX IF NOT EXISTS idx_companies_data_gin ON companies USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS branches (
  id VARCHAR(240) PRIMARY KEY,
  company_id VARCHAR(240),
  name TEXT,
  code VARCHAR(80),
  city TEXT,
  province TEXT,
  employee_id VARCHAR(240),
  status VARCHAR(80) DEFAULT 'Active',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_branches_company ON branches(company_id);
CREATE INDEX IF NOT EXISTS idx_branches_status ON branches(status);
CREATE INDEX IF NOT EXISTS idx_branches_data_gin ON branches USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS departments (
  id VARCHAR(240) PRIMARY KEY,
  branch_id VARCHAR(240),
  name TEXT,
  code VARCHAR(80),
  employee_id VARCHAR(240),
  status VARCHAR(80) DEFAULT 'Active',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_departments_branch ON departments(branch_id);
CREATE INDEX IF NOT EXISTS idx_departments_status ON departments(status);
CREATE INDEX IF NOT EXISTS idx_departments_data_gin ON departments USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS designations (
  id VARCHAR(240) PRIMARY KEY,
  department_id VARCHAR(240),
  title TEXT,
  code VARCHAR(80),
  grade VARCHAR(80),
  employee_id VARCHAR(240),
  status VARCHAR(80) DEFAULT 'Active',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_designations_dept ON designations(department_id);
CREATE INDEX IF NOT EXISTS idx_designations_status ON designations(status);
CREATE INDEX IF NOT EXISTS idx_designations_data_gin ON designations USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS zones (
  id VARCHAR(240) PRIMARY KEY,
  company_id VARCHAR(240),
  name TEXT,
  code VARCHAR(80),
  employee_id VARCHAR(240),
  status VARCHAR(80) DEFAULT 'Active',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zones_company ON zones(company_id);
CREATE INDEX IF NOT EXISTS idx_zones_status ON zones(status);
CREATE INDEX IF NOT EXISTS idx_zones_data_gin ON zones USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS uc_towns (
  id VARCHAR(240) PRIMARY KEY,
  zone_id VARCHAR(240),
  name TEXT,
  code VARCHAR(80),
  employee_id VARCHAR(240),
  status VARCHAR(80) DEFAULT 'Active',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_uc_towns_zone ON uc_towns(zone_id);
CREATE INDEX IF NOT EXISTS idx_uc_towns_status ON uc_towns(status);
CREATE INDEX IF NOT EXISTS idx_uc_towns_data_gin ON uc_towns USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS wage_types (
  id VARCHAR(240) PRIMARY KEY,
  company_id VARCHAR(240),
  name TEXT,
  code VARCHAR(80),
  calculation_basis VARCHAR(80),
  employee_id VARCHAR(240),
  status VARCHAR(80) DEFAULT 'Active',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wage_types_company ON wage_types(company_id);
CREATE INDEX IF NOT EXISTS idx_wage_types_status ON wage_types(status);
CREATE INDEX IF NOT EXISTS idx_wage_types_data_gin ON wage_types USING gin (data jsonb_path_ops);

-- ============================================================================
-- 2. ACCESS & IDENTITY TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(240) PRIMARY KEY,
  name TEXT,
  employee_id VARCHAR(240),
  status VARCHAR(80) DEFAULT 'Active',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roles_status ON roles(status);
CREATE INDEX IF NOT EXISTS idx_roles_data_gin ON roles USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(240) PRIMARY KEY,
  username TEXT,
  email TEXT,
  role_id VARCHAR(240),
  employee_id VARCHAR(240),
  status VARCHAR(80) DEFAULT 'Active',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_employee ON users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_data_gin ON users USING gin (data jsonb_path_ops);

-- ============================================================================
-- 3. PERSONNEL & BIOMETRICS TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS employees (
  id VARCHAR(240) PRIMARY KEY,
  employee_code VARCHAR(80),
  company_id VARCHAR(240),
  branch_id VARCHAR(240),
  department_id VARCHAR(240),
  designation_id VARCHAR(240),
  full_name TEXT,
  email TEXT,
  cnic VARCHAR(80),
  employee_id VARCHAR(240),
  status VARCHAR(80) DEFAULT 'Active',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_cnic ON employees(cnic);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_data_gin ON employees USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS biometric_templates (
  id VARCHAR(240) PRIMARY KEY,
  employee_id VARCHAR(240),
  template_type VARCHAR(80),
  status VARCHAR(80) DEFAULT 'Active',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_biometric_employee ON biometric_templates(employee_id);
CREATE INDEX IF NOT EXISTS idx_biometric_data_gin ON biometric_templates USING gin (data jsonb_path_ops);

-- ============================================================================
-- 4. TIME, ATTENDANCE & FIELD OPERATIONS TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS attendances (
  id VARCHAR(240) PRIMARY KEY,
  employee_id VARCHAR(240) NOT NULL,
  date DATE,
  status VARCHAR(80),
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attendances_emp_date ON attendances(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_attendances_status ON attendances(status);
CREATE INDEX IF NOT EXISTS idx_attendances_data_gin ON attendances USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS mobile_duty_authorizations (
  id VARCHAR(240) PRIMARY KEY,
  employee_id VARCHAR(240) NOT NULL,
  status VARCHAR(80) DEFAULT 'Pending',
  valid_from DATE,
  valid_to DATE,
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mobile_duty_emp ON mobile_duty_authorizations(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_mobile_duty_data_gin ON mobile_duty_authorizations USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS leaves (
  id VARCHAR(240) PRIMARY KEY,
  employee_id VARCHAR(240) NOT NULL,
  leave_type VARCHAR(80),
  status VARCHAR(80) DEFAULT 'Pending',
  start_date DATE,
  end_date DATE,
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leaves_emp_status ON leaves(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_leaves_data_gin ON leaves USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS holidays (
  id VARCHAR(240) PRIMARY KEY,
  name TEXT,
  date DATE,
  employee_id VARCHAR(240),
  status VARCHAR(80) DEFAULT 'Active',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
CREATE INDEX IF NOT EXISTS idx_holidays_data_gin ON holidays USING gin (data jsonb_path_ops);

-- ============================================================================
-- 5. PAYROLL, COMPENSATION & STATUTORY TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS payroll_runs (
  id VARCHAR(240) PRIMARY KEY,
  month VARCHAR(40),
  employee_id VARCHAR(240),
  status VARCHAR(80) DEFAULT 'Draft',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_month ON payroll_runs(month);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(status);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_data_gin ON payroll_runs USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS payroll_payslips (
  id VARCHAR(240) PRIMARY KEY,
  payroll_run_id VARCHAR(240),
  employee_id VARCHAR(240) NOT NULL,
  status VARCHAR(80),
  net_salary NUMERIC(15, 2),
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payslips_run ON payroll_payslips(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payslips_emp ON payroll_payslips(employee_id);
CREATE INDEX IF NOT EXISTS idx_payslips_status ON payroll_payslips(status);
CREATE INDEX IF NOT EXISTS idx_payslips_data_gin ON payroll_payslips USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS tax_slabs (
  id VARCHAR(240) PRIMARY KEY,
  name TEXT,
  employee_id VARCHAR(240),
  status VARCHAR(80) DEFAULT 'Active',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tax_slabs_data_gin ON tax_slabs USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS stat_config (
  id VARCHAR(240) PRIMARY KEY,
  employee_id VARCHAR(240),
  status VARCHAR(80) DEFAULT 'Active',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stat_config_data_gin ON stat_config USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS loan_advances (
  id VARCHAR(240) PRIMARY KEY,
  employee_id VARCHAR(240) NOT NULL,
  amount NUMERIC(15, 2),
  status VARCHAR(80) DEFAULT 'Pending',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loans_emp_status ON loan_advances(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_loans_data_gin ON loan_advances USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS salary_revisions (
  id VARCHAR(240) PRIMARY KEY,
  employee_id VARCHAR(240) NOT NULL,
  status VARCHAR(80) DEFAULT 'Pending',
  effective_date DATE,
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_salary_rev_emp ON salary_revisions(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_rev_status ON salary_revisions(status);
CREATE INDEX IF NOT EXISTS idx_salary_rev_data_gin ON salary_revisions USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS gratuity_settlements (
  id VARCHAR(240) PRIMARY KEY,
  employee_id VARCHAR(240) NOT NULL,
  settlement_amount NUMERIC(15, 2),
  status VARCHAR(80) DEFAULT 'Draft',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gratuity_emp ON gratuity_settlements(employee_id);
CREATE INDEX IF NOT EXISTS idx_gratuity_status ON gratuity_settlements(status);
CREATE INDEX IF NOT EXISTS idx_gratuity_data_gin ON gratuity_settlements USING gin (data jsonb_path_ops);

-- ============================================================================
-- 6. HR OPERATIONS, PERFORMANCE & ANNOUNCEMENTS TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS performance_reviews (
  id VARCHAR(240) PRIMARY KEY,
  employee_id VARCHAR(240) NOT NULL,
  review_cycle VARCHAR(80),
  status VARCHAR(80) DEFAULT 'Draft',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_emp ON performance_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_status ON performance_reviews(status);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_data_gin ON performance_reviews USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS company_assets (
  id VARCHAR(240) PRIMARY KEY,
  employee_id VARCHAR(240),
  asset_code VARCHAR(80),
  name TEXT,
  status VARCHAR(80) DEFAULT 'Available',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assets_emp ON company_assets(employee_id);
CREATE INDEX IF NOT EXISTS idx_assets_status ON company_assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_data_gin ON company_assets USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS job_postings (
  id VARCHAR(240) PRIMARY KEY,
  title TEXT,
  department_id VARCHAR(240),
  employee_id VARCHAR(240),
  status VARCHAR(80) DEFAULT 'Open',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_postings_status ON job_postings(status);
CREATE INDEX IF NOT EXISTS idx_job_postings_data_gin ON job_postings USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS job_applications (
  id VARCHAR(240) PRIMARY KEY,
  job_posting_id VARCHAR(240),
  applicant_name TEXT,
  email TEXT,
  employee_id VARCHAR(240),
  status VARCHAR(80) DEFAULT 'Received',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_apps_posting ON job_applications(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_job_apps_status ON job_applications(status);
CREATE INDEX IF NOT EXISTS idx_job_apps_data_gin ON job_applications USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(240) PRIMARY KEY,
  target_employee_id VARCHAR(240),
  employee_id VARCHAR(240),
  type VARCHAR(80),
  priority VARCHAR(40) DEFAULT 'medium',
  status VARCHAR(80) DEFAULT 'Active',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(target_employee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_data_gin ON notifications USING gin (data jsonb_path_ops);

-- ============================================================================
-- 7. ZERO-DATA-LOSS MIGRATION FROM hr_documents (IF EXISTS)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'hr_documents') THEN
    RAISE NOTICE 'Migrating existing data from hr_documents to dedicated tables...';

    INSERT INTO companies (id, name, code, status, data, version, created_at, updated_at)
    SELECT document_id, data->>'name', data->>'code', COALESCE(data->>'status', 'Active'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'companies'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO branches (id, company_id, name, code, city, province, status, data, version, created_at, updated_at)
    SELECT document_id, data->>'companyId', data->>'name', data->>'code', data->>'city', data->>'province', COALESCE(data->>'status', 'Active'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'branches'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO departments (id, branch_id, name, code, status, data, version, created_at, updated_at)
    SELECT document_id, data->>'branchId', data->>'name', data->>'code', COALESCE(data->>'status', 'Active'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'departments'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO designations (id, department_id, title, code, grade, status, data, version, created_at, updated_at)
    SELECT document_id, data->>'departmentId', data->>'title', data->>'code', data->>'grade', COALESCE(data->>'status', 'Active'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'designations'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO zones (id, company_id, name, code, status, data, version, created_at, updated_at)
    SELECT document_id, data->>'companyId', data->>'name', data->>'code', COALESCE(data->>'status', 'Active'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'zones'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO uc_towns (id, zone_id, name, code, status, data, version, created_at, updated_at)
    SELECT document_id, data->>'zoneId', data->>'name', data->>'code', COALESCE(data->>'status', 'Active'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'ucTowns'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO wage_types (id, company_id, name, code, calculation_basis, status, data, version, created_at, updated_at)
    SELECT document_id, data->>'companyId', data->>'name', data->>'code', data->>'calculationBasis', COALESCE(data->>'status', 'Active'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'wageTypes'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO roles (id, name, status, data, version, created_at, updated_at)
    SELECT document_id, data->>'name', COALESCE(data->>'status', 'Active'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'roles'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO users (id, username, email, role_id, employee_id, status, data, version, created_at, updated_at)
    SELECT document_id, data->>'username', data->>'email', data->>'roleId', data->>'employeeId', COALESCE(data->>'status', 'Active'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'users'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO employees (id, employee_code, company_id, branch_id, department_id, designation_id, full_name, email, cnic, employee_id, status, data, version, created_at, updated_at)
    SELECT document_id, data->>'employeeCode', data->>'companyId', data->>'branchId', data->>'departmentId', data->>'designationId', data->>'fullName', data->>'email', data->>'cnic', document_id, COALESCE(data->>'status', 'Active'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'employees'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO biometric_templates (id, employee_id, template_type, status, data, version, created_at, updated_at)
    SELECT document_id, COALESCE(employee_id, data->>'employeeId'), data->>'type', COALESCE(status, 'Active'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'biometricTemplates'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO attendances (id, employee_id, date, status, data, version, created_at, updated_at)
    SELECT document_id, COALESCE(employee_id, data->>'employeeId', ''), (data->>'date')::date, COALESCE(status, data->>'status'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'attendances'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO mobile_duty_authorizations (id, employee_id, status, valid_from, valid_to, data, version, created_at, updated_at)
    SELECT document_id, COALESCE(employee_id, data->>'employeeId', ''), COALESCE(status, data->>'status', 'Pending'), (data->>'validFrom')::date, (data->>'validTo')::date, data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'mobileDutyAuthorizations'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO leaves (id, employee_id, leave_type, status, start_date, end_date, data, version, created_at, updated_at)
    SELECT document_id, COALESCE(employee_id, data->>'employeeId', ''), data->>'leaveType', COALESCE(status, data->>'status', 'Pending'), (data->>'startDate')::date, (data->>'endDate')::date, data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'leaves'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO holidays (id, name, date, status, data, version, created_at, updated_at)
    SELECT document_id, data->>'name', (data->>'date')::date, COALESCE(status, 'Active'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'holidays'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO payroll_runs (id, month, status, data, version, created_at, updated_at)
    SELECT document_id, data->>'month', COALESCE(status, data->>'status', 'Draft'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'payrollRuns'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO payroll_payslips (id, payroll_run_id, employee_id, status, net_salary, data, version, created_at, updated_at)
    SELECT document_id, data->>'payrollRunId', COALESCE(employee_id, data->>'employeeId', ''), COALESCE(status, data->>'status'), (data->>'netSalary')::numeric, data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'payrollPayslips'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO tax_slabs (id, name, status, data, version, created_at, updated_at)
    SELECT document_id, data->>'name', COALESCE(status, 'Active'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'taxSlabs'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO stat_config (id, status, data, version, created_at, updated_at)
    SELECT document_id, COALESCE(status, 'Active'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'statConfig'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO loan_advances (id, employee_id, amount, status, data, version, created_at, updated_at)
    SELECT document_id, COALESCE(employee_id, data->>'employeeId', ''), (data->>'amount')::numeric, COALESCE(status, data->>'status', 'Pending'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'loanAdvances'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO salary_revisions (id, employee_id, status, effective_date, data, version, created_at, updated_at)
    SELECT document_id, COALESCE(employee_id, data->>'employeeId', ''), COALESCE(status, data->>'status', 'Pending'), (data->>'effectiveDate')::date, data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'salaryRevisions'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO gratuity_settlements (id, employee_id, settlement_amount, status, data, version, created_at, updated_at)
    SELECT document_id, COALESCE(employee_id, data->>'employeeId', ''), (data->>'settlementAmount')::numeric, COALESCE(status, data->>'status', 'Draft'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'gratuitySettlements'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO performance_reviews (id, employee_id, review_cycle, status, data, version, created_at, updated_at)
    SELECT document_id, COALESCE(employee_id, data->>'employeeId', ''), data->>'reviewCycle', COALESCE(status, data->>'status', 'Draft'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'performanceReviews'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO company_assets (id, employee_id, asset_code, name, status, data, version, created_at, updated_at)
    SELECT document_id, COALESCE(employee_id, data->>'employeeId'), data->>'assetCode', data->>'name', COALESCE(status, data->>'status', 'Available'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'companyAssets'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO job_postings (id, title, department_id, status, data, version, created_at, updated_at)
    SELECT document_id, data->>'title', data->>'departmentId', COALESCE(status, data->>'status', 'Open'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'jobPostings'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO job_applications (id, job_posting_id, applicant_name, email, status, data, version, created_at, updated_at)
    SELECT document_id, data->>'jobPostingId', data->>'applicantName', data->>'email', COALESCE(status, data->>'status', 'Received'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'jobApplications'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    INSERT INTO notifications (id, target_employee_id, employee_id, type, priority, status, data, version, created_at, updated_at)
    SELECT document_id, data->>'targetEmployeeId', data->>'targetEmployeeId', data->>'type', COALESCE(data->>'priority', 'medium'), COALESCE(data->>'status', 'Active'), data, version, created_at, updated_at
    FROM hr_documents WHERE collection_name = 'notifications'
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;

    RAISE NOTICE 'Migration from hr_documents to dedicated tables completed successfully.';
  END IF;
END $$;

COMMIT;
