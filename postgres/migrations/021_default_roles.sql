-- First-time setup created only the Super Admin role, so the standard roles the apps rely on
-- (role-employee for the mobile app, role-kiosk for kiosk terminals) were missing. Existing roles are not changed.
INSERT INTO roles (id, name, status, data) VALUES
  ('role-hr', 'HR Manager', 'Active', '{"id":"role-hr","name":"HR Manager","description":"Manages employee directories, leaves, and attendance records.","permissions":["view_dashboard","manage_employees","manage_attendance","manage_mobile_duty","manage_leaves"]}'::jsonb),
  ('role-payroll', 'Payroll Specialist', 'Active', '{"id":"role-payroll","name":"Payroll Specialist","description":"Processes payroll run cycles, statutory calculations, and bank advice sheets.","permissions":["view_dashboard","manage_payroll"]}'::jsonb),
  ('role-employee', 'Employee', 'Active', '{"id":"role-employee","name":"Employee","description":"Mobile app access to own attendance, leave and payslips.","permissions":["view_dashboard"]}'::jsonb),
  ('role-kiosk', 'Kiosk Terminal', 'Active', '{"id":"role-kiosk","name":"Kiosk Terminal","description":"Dedicated account for attendance kiosks (Windows PC, tablet or phone).","permissions":["use_kiosk"]}'::jsonb)
ON CONFLICT (id) DO NOTHING;
