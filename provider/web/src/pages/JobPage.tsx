import React, { useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle2, Circle, Eye, Hand, Loader2, RotateCw, XCircle } from 'lucide-react';
import { api, fmtDateTime } from '../api';
import { Badge, Button, Card, Copyable, Notice } from '../ui';
import { canOperate, RoleContext } from '../App';

interface Step { key: string; label: string; status: 'pending' | 'running' | 'done' | 'manual' | 'failed' | 'skipped'; detail: string; instructions: string[]; error: string | null; at: string | null }
interface Job { id: string; client_id: string | null; kind: string; state: string; steps: Step[]; created_by: string; created_at: string; finished_at: string | null; hasAdminPassword?: boolean; adminEmail?: string | null }

const KIND_LABEL: Record<string, string> = { provision: 'Set up new client', 'domain-attach': 'Connect a domain', 'release-switch': 'Switch release' };

export function JobSteps({ jobId, onFinished, compact = false }: { jobId: string; onFinished?: () => void; compact?: boolean }) {
  const user = useContext(RoleContext);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [password, setPassword] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try { const result = await api<{ job: Job }>(`/jobs/${jobId}`); setJob(result.job); return result.job; }
    catch (loadError) { setError((loadError as Error).message); return null; }
  }, [jobId]);
  useEffect(() => {
    let previous = '';
    void load();
    const timer = window.setInterval(async () => {
      const current = await load();
      if (current && previous === 'running' && current.state !== 'running') onFinished?.();
      if (current) previous = current.state;
    }, 2000);
    return () => window.clearInterval(timer);
  }, [load, onFinished]);

  const act = async (label: string, path: string, body?: unknown) => {
    setBusy(label); setError('');
    try { await api(path, { method: 'POST', body: body ?? {} }); await load(); } catch (actError) { setError((actError as Error).message); } finally { setBusy(''); }
  };
  const reveal = async () => { setBusy('reveal'); try { setPassword(await api(`/jobs/${jobId}/admin-password`, { method: 'POST', body: {} })); } catch (revealError) { setError((revealError as Error).message); } finally { setBusy(''); } };
  const forget = async () => { await act('forget', `/jobs/${jobId}/admin-password`, { forget: true }); setPassword(null); };

  if (!job) return <p className="text-sm text-slate-500">{error || 'Loading…'}</p>;
  const icon = (status: Step['status']) => status === 'done' || status === 'skipped' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
    : status === 'running' ? <Loader2 className="h-5 w-5 animate-spin text-sky-600" /> : status === 'manual' ? <Hand className="h-5 w-5 text-amber-500" />
    : status === 'failed' ? <XCircle className="h-5 w-5 text-rose-600" /> : <Circle className="h-5 w-5 text-slate-300" />;

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={job.state === 'done' ? 'green' : job.state === 'failed' ? 'red' : job.state === 'waiting' ? 'amber' : 'blue'}>{job.state === 'waiting' ? 'waiting for you' : job.state}</Badge>
          <span className="text-slate-500">started {fmtDateTime(job.created_at)} by {job.created_by}{job.finished_at ? ` · finished ${fmtDateTime(job.finished_at)}` : ''}</span>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <ol className="space-y-2">
        {job.steps.map(step => (
          <li key={step.key} className={`rounded-lg border p-3 ${step.status === 'manual' ? 'border-amber-300 bg-amber-50' : step.status === 'failed' ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-start gap-3">
              {icon(step.status)}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">{step.label}</p>
                {step.detail && <p className="mt-0.5 break-words text-xs text-slate-600">{step.detail}</p>}
                {step.error && <p className="mt-0.5 break-words text-xs text-rose-700">{step.error}</p>}
                {step.instructions?.length > 0 && (
                  <ul className="mt-2 space-y-1 rounded-md bg-white/80 p-2 font-mono text-[11px] text-slate-700 ring-1 ring-amber-200">
                    {step.instructions.map((line, index) => <li key={index} className="flex items-start justify-between gap-2 break-all"><span>{line}</span>{/[:→]/.test(line) && <Copyable text={line.split(/:\s|→\s*/).slice(-1)[0].trim()} />}</li>)}
                  </ul>
                )}
                {canOperate(user) && step.status === 'manual' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="primary" busy={busy === step.key} onClick={() => act(step.key, `/jobs/${job.id}/steps/${step.key}/done`)}><CheckCircle2 className="h-4 w-4" /> Mark done</Button>
                    <Button busy={busy === 'retry'} onClick={() => act('retry', `/jobs/${job.id}/retry`)}><RotateCw className="h-4 w-4" /> Retry</Button>
                  </div>
                )}
                {canOperate(user) && step.status === 'failed' && <div className="mt-2"><Button busy={busy === 'retry'} onClick={() => act('retry', `/jobs/${job.id}/retry`)}><RotateCw className="h-4 w-4" /> Retry from here</Button></div>}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {job.kind === 'provision' && job.hasAdminPassword && canOperate(user) && (
        <Notice tone="warn">
          <p className="font-semibold">Temporary administrator password</p>
          {password ? (
            <div className="mt-1 space-y-2">
              <p>Sign-in: <b>{password.email}</b> · Password: <code className="rounded bg-white px-1.5 py-0.5 font-mono">{password.password}</code> <Copyable text={password.password} /></p>
              <p className="text-xs">Give it to the client by phone or in person (not in the same email as the address). They must change it at first sign-in.</p>
              <Button onClick={forget} busy={busy === 'forget'}>I have handed it over: delete it</Button>
            </div>
          ) : <Button className="mt-1" onClick={reveal} busy={busy === 'reveal'}><Eye className="h-4 w-4" /> Show password</Button>}
        </Notice>
      )}
    </div>
  );
}

export function JobPage({ id }: { id: string }) {
  const [job, setJob] = useState<Job | null>(null);
  useEffect(() => { api<{ job: Job }>(`/jobs/${id}`).then(result => setJob(result.job)).catch(() => undefined); }, [id]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        {job?.client_id && <a href={`#/clients/${job.client_id}`} className="text-xs font-semibold text-emerald-700 hover:underline">← Back to client</a>}
        <h1 className="text-xl font-bold text-slate-900">{KIND_LABEL[job?.kind || ''] || 'Job'}</h1>
      </div>
      <Card><JobSteps jobId={id} /></Card>
    </div>
  );
}

export { KIND_LABEL };
