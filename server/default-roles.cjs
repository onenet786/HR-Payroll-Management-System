// Standard roles of a new installation (same set as DEFAULT_ROLES in src/data/defaults.ts).
// Installations created by a setup script (Windows package, Provider Console) have no browser that
// seeds them, so the server makes sure they exist. Existing roles are never changed.
const DEFAULT_ROLES = [
  { id: 'role-admin', name: 'Super Admin', description: 'Full administrative control of the system, including access permissions and roles.', permissions: ['view_dashboard', 'manage_employees', 'manage_attendance', 'manage_mobile_duty', 'manage_leaves', 'manage_payroll', 'manage_settings', 'manage_access', 'manage_data_import'] },
  { id: 'role-hr', name: 'HR Manager', description: 'Manages employee directories, leaves, and attendance records.', permissions: ['view_dashboard', 'manage_employees', 'manage_attendance', 'manage_mobile_duty', 'manage_leaves'] },
  { id: 'role-payroll', name: 'Payroll Specialist', description: 'Processes payroll run cycles, statutory calculations, and bank advice sheets.', permissions: ['view_dashboard', 'manage_payroll'] },
  { id: 'role-employee', name: 'Employee', description: 'Standard access to personal dashboard and attendance simulation.', permissions: ['view_dashboard'] },
  { id: 'role-kiosk', name: 'Kiosk Terminal', description: 'Dedicated account for locking a device into Kiosk Attendance Terminal mode.', permissions: ['use_kiosk'] },
];

/** Adds the standard roles when the Super Admin role is missing. Returns how many roles were added. */
async function ensureDefaultRoles(db) {
  const present = (await db.query(`SELECT 1 FROM roles WHERE id='role-admin'`)).rowCount;
  if (present) return 0;
  let added = 0;
  for (const role of DEFAULT_ROLES) {
    const result = await db.query(
      `INSERT INTO roles(id, name, status, data, version, created_at, updated_at) VALUES($1,$2,'Active',$3::jsonb,1,now(),now()) ON CONFLICT (id) DO NOTHING`,
      [role.id, role.name, JSON.stringify({ ...role, status: 'Active', createdBy: 'system' })],
    );
    added += result.rowCount;
  }
  return added;
}

module.exports = { DEFAULT_ROLES, ensureDefaultRoles };
