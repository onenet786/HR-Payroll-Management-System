import React, { useContext, useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api, fmtDateTime } from '../api';
import { Badge, Button, Card, Field, inputClass, Notice } from '../ui';
import { RoleContext } from '../App';

const ROLE_TEXT: Record<string, string> = { owner: 'Everything, including users, template and archiving', operator: 'Clients, domains, licences, backups, releases', viewer: 'Read only' };

export function UsersPage() {
  const me = useContext(RoleContext);
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', email: '', role: 'operator', password: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = () => api('/users').then(result => setUsers(result.users)).catch(loadError => setError(loadError.message));
  useEffect(() => { void load(); }, []);
  const act = async (run: () => Promise<unknown>, done: string) => { setError(''); setMessage(''); try { await run(); setMessage(done); await load(); } catch (actError) { setError((actError as Error).message); } };
  const add = (event: React.FormEvent) => { event.preventDefault(); void act(() => api('/users', { method: 'POST', body: form }), `${form.email} added. They set up their authenticator app at first sign-in.`).then(() => setForm({ name: '', email: '', role: 'operator', password: '' })); };

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold text-slate-900">Provider users</h1><p className="text-sm text-slate-500">OneNet staff who can use this console. Every account needs an authenticator app.</p></div>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <Card title="Accounts">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500"><th className="py-2">Name</th><th>Role</th><th>Status</th><th>Last sign-in</th><th className="text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(user => (
              <tr key={user.id}>
                <td className="py-2"><b>{user.name}</b><p className="text-xs text-slate-500">{user.email}</p></td>
                <td>{user.id === me?.id ? <Badge tone="violet">{user.role} (you)</Badge> : (
                  <select value={user.role} onChange={event => act(() => api(`/users/${user.id}`, { method: 'PUT', body: { role: event.target.value } }), 'Role changed.')} className="rounded border border-slate-300 px-2 py-1 text-xs">
                    {Object.keys(ROLE_TEXT).map(role => <option key={role} value={role}>{role}</option>)}
                  </select>)}</td>
                <td><Badge tone={user.status === 'active' ? 'green' : 'red'}>{user.status}</Badge> {!user.totpEnabled && <Badge tone="amber">no authenticator yet</Badge>}</td>
                <td className="text-xs">{fmtDateTime(user.lastLoginAt)}</td>
                <td className="text-right">{user.id !== me?.id && (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" onClick={() => act(() => api(`/users/${user.id}`, { method: 'PUT', body: { resetMfa: true } }), 'Authenticator reset: they enrol again at next sign-in.')}>Reset authenticator</Button>
                    <Button variant="ghost" onClick={() => act(() => api(`/users/${user.id}`, { method: 'PUT', body: { status: user.status === 'active' ? 'disabled' : 'active' } }), 'Updated.')}>{user.status === 'active' ? 'Disable' : 'Enable'}</Button>
                  </div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Add a user">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className={inputClass} /></Field>
          <Field label="Email"><input type="email" required value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} className={inputClass} /></Field>
          <Field label="Role" hint={ROLE_TEXT[form.role]}><select value={form.role} onChange={event => setForm({ ...form, role: event.target.value })} className={inputClass}>{Object.keys(ROLE_TEXT).map(role => <option key={role} value={role}>{role}</option>)}</select></Field>
          <Field label="Temporary password" hint="At least 12 characters; give it to them in person."><input type="text" required minLength={12} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} className={inputClass} /></Field>
          <div className="sm:col-span-2"><Button type="submit" variant="primary"><UserPlus className="h-4 w-4" /> Add user</Button></div>
        </form>
      </Card>
    </div>
  );
}
