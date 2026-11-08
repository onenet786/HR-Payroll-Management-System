// Step-by-step jobs (provision a client, attach a domain, switch release). Each step is saved as it runs, so a job
// can pause at a manual step (aaPanel action the operator does by hand), resume after "Mark done", and be retried
// after an error without repeating the steps already done.
const crypto = require('node:crypto');
const { pool } = require('./db.cjs');

const definitions = new Map(); // kind -> { steps: [{ key, label, run(ctx) }], onDone?(ctx), onFailed?(ctx) }
const running = new Set();

function defineJob(kind, definition) { definitions.set(kind, definition); }

async function loadJob(id) {
  return (await pool.query(`SELECT * FROM jobs WHERE id=$1`, [id])).rows[0] || null;
}

async function saveJob(job) {
  await pool.query(`UPDATE jobs SET state=$2, steps=$3::jsonb, output=$4::jsonb, updated_at=now(), finished_at=$5 WHERE id=$1`,
    [job.id, job.state, JSON.stringify(job.steps), JSON.stringify(job.output || {}), job.state === 'done' || job.state === 'failed' ? new Date() : null]);
}

async function createJob(kind, { clientId = null, input = {}, createdBy }) {
  const definition = definitions.get(kind);
  if (!definition) throw new Error(`Unknown job kind ${kind}.`);
  const id = crypto.randomUUID();
  const steps = definition.steps.map(step => ({ key: step.key, label: step.label, status: 'pending', detail: '', instructions: [], error: null, at: null }));
  await pool.query(`INSERT INTO jobs(id, client_id, kind, state, steps, input, created_by) VALUES($1,$2,$3,'running',$4::jsonb,$5::jsonb,$6)`,
    [id, clientId, kind, JSON.stringify(steps), JSON.stringify(input), createdBy]);
  void runJob(id);
  return id;
}

/** Runs the job from its first unfinished step until done, a manual step, or an error. */
async function runJob(id) {
  if (running.has(id)) return;
  running.add(id);
  try {
    const job = await loadJob(id);
    if (!job) return;
    const definition = definitions.get(job.kind);
    job.state = 'running';
    const ctx = { job, input: job.input, output: job.output || {}, clientId: job.client_id };
    for (const stepDefinition of definition.steps) {
      const step = job.steps.find(item => item.key === stepDefinition.key);
      if (!step || step.status === 'done' || step.status === 'skipped') continue;
      step.status = 'running'; step.error = null; step.at = new Date().toISOString();
      await saveJob({ ...job, output: ctx.output });
      try {
        const result = (await stepDefinition.run(ctx)) || {};
        if (result.status === 'manual') {
          step.status = 'manual';
          step.detail = result.detail || 'Waiting for the operator.';
          step.instructions = result.instructions || [];
          step.error = result.error || null;
          job.state = 'waiting';
          await saveJob({ ...job, output: ctx.output });
          return;
        }
        step.status = result.status === 'skipped' ? 'skipped' : 'done';
        step.detail = result.detail || '';
        step.instructions = [];
      } catch (error) {
        step.status = 'failed';
        step.error = error.message;
        job.state = 'failed';
        await saveJob({ ...job, output: ctx.output });
        await definition.onFailed?.(ctx, error).catch(() => undefined);
        console.error(`Job ${job.kind} ${id} failed at ${step.key}:`, error.message);
        return;
      }
      await saveJob({ ...job, output: ctx.output });
    }
    job.state = 'done';
    await definition.onDone?.(ctx).catch(error => console.error('Job onDone failed:', error.message));
    await saveJob({ ...job, output: ctx.output });
  } finally {
    running.delete(id);
  }
}

/** Operator confirmed a manual step (did it in aaPanel): mark it done and continue. */
async function markStepDone(id, stepKey, actor) {
  const job = await loadJob(id);
  if (!job) throw new Error('Job not found.');
  const step = job.steps.find(item => item.key === stepKey);
  if (!step || step.status !== 'manual') throw new Error('That step is not waiting for the operator.');
  step.status = 'done'; step.detail = `Done by hand (${actor}).`; step.instructions = []; step.error = null;
  job.state = 'running';
  await saveJob(job);
  void runJob(id);
}

/** Retries a failed or waiting job from the step that stopped it. */
async function retryJob(id) {
  const job = await loadJob(id);
  if (!job) throw new Error('Job not found.');
  if (job.state === 'done') throw new Error('The job is already finished.');
  for (const step of job.steps) if (step.status === 'failed' || step.status === 'manual') { step.status = 'pending'; step.error = null; }
  job.state = 'running';
  await saveJob(job);
  void runJob(id);
}

/** On start-up, continue jobs that were running when the console stopped. */
async function resumeInterruptedJobs() {
  const rows = (await pool.query(`SELECT id FROM jobs WHERE state='running'`)).rows;
  for (const row of rows) void runJob(row.id);
  return rows.length;
}

module.exports = { defineJob, createJob, runJob, markStepDone, retryJob, loadJob, resumeInterruptedJobs };
