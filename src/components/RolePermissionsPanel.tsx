import { useState } from 'react';
import type { Role, UserAccount } from '../types';

const PERMISSIONS: Array<{ id: string; label: string }> = [
  { id: 'view_dashboard', label: 'Dashboard' },
  { id: 'manage_employees', label: 'Employees' },
  { id: 'manage_attendance', label: 'Attendance' },
  { id: 'manage_mobile_duty', label: 'Mobile duty' },
  { id: 'manage_leaves', label: 'Leaves' },
  { id: 'manage_payroll', label: 'Payroll' },
  { id: 'manage_settings', label: 'Settings' },
  { id: 'manage_access', label: 'Users & roles' },
  { id: 'use_kiosk', label: 'Use kiosk' },
];

// Built-in roles whose permissions the apps depend on: Super Admin always has everything, Employee drives
// the mobile app, and Kiosk Terminal must hold only use_kiosk.
const LOCKED: Record<string, string> = {
  'role-admin': 'Super Admin always has full access.',
  'role-employee': 'Employee accounts open the mobile app and see only their own records.',
  'role-kiosk': 'Kiosk Terminal accounts can only record attendance.',
};

interface Props {
  roles: Role[];
  users: UserAccount[];
  currentRoleId?: string;
  onUpdateRole: (role: Role) => Promise<void>;
}

/** Every role with what it can do and how many users hold it; permissions are edited in place. */
export default function RolePermissionsPanel({ roles, users, currentRoleId, onUpdateRole }: Props) {
  const [savingKey, setSavingKey] = useState('');

  const toggle = async (role: Role, permission: string, enabled: boolean) => {
    if (permission === 'use_kiosk' && enabled && role.permissions.some(item => item !== 'use_kiosk' && item !== 'view_dashboard')) {
      alert('Kiosk access is for dedicated kiosk accounts only. Use the Kiosk Terminal role instead of adding it to a staff role.');
      return;
    }
    if (permission === 'manage_access' && !enabled && role.id === currentRoleId) {
      alert('You cannot remove "Users & roles" from your own role; you would lock yourself out of this page.');
      return;
    }
    const permissions = enabled ? [...new Set([...role.permissions, permission])] : role.permissions.filter(item => item !== permission);
    setSavingKey(`${role.id}:${permission}`);
    try {
      await onUpdateRole({ ...role, permissions });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'The role could not be updated.');
    } finally {
      setSavingKey('');
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Roles &amp; permissions</h4>
      <p className="mt-0.5 text-[11px] text-slate-500">Tick what each role can do. Changes apply to every user with that role at their next page load.</p>
      {roles.length === 0
        ? <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">No roles found. Run the database migration (<code>npm run postgres:migrate</code>) to add the standard roles.</p>
        : <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-[11px]">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="sticky left-0 bg-slate-50 px-2 py-2">Role</th>
                {PERMISSIONS.map(permission => <th key={permission.id} scope="col" className="px-1 py-2 text-center leading-tight">{permission.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roles.map(role => {
                const holders = users.filter(user => user.roleId === role.id).length;
                const locked = LOCKED[role.id];
                return (
                  <tr key={role.id} className="hover:bg-slate-50/60">
                    <th scope="row" className="sticky left-0 min-w-24 bg-white px-2 py-2 font-normal" title={locked || role.description}>
                      <div className="font-bold text-slate-900">{role.name || role.id}</div>
                      <div className="text-[10px] text-slate-400">{holders} user{holders === 1 ? '' : 's'}{locked ? ' · fixed' : ''}</div>
                    </th>
                    {PERMISSIONS.map(permission => {
                      const checked = role.id === 'role-admin' ? permission.id !== 'use_kiosk' : role.permissions.includes(permission.id);
                      return (
                        <td key={permission.id} className="px-1 py-2 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${role.name}: ${permission.label}`}
                            checked={checked}
                            disabled={!!locked || savingKey === `${role.id}:${permission.id}`}
                            onChange={event => toggle(role, permission.id, event.target.checked)}
                            className="h-3.5 w-3.5 accent-emerald-600 disabled:opacity-60"
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
    </div>
  );
}
