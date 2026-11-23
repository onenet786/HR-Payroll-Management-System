// Narrated video tutorials for the whole system (web portal, phone app, kiosk, setup).
//
//   node tools/tutorials/build.mjs --lang en            # every chapter, English voice
//   node tools/tutorials/build.mjs --lang ur --only 05  # one chapter, Urdu voice
//   node tools/tutorials/build.mjs --lang en --dry      # record without voice (checks the steps quickly)
//   node tools/tutorials/build.mjs --lang en --movie    # only join existing chapter videos into the full movie
//
// Needs: the demo server (see tools/tutorials/README.md), Microsoft Edge, ffmpeg on PATH, Windows voices
// (Hazel for English, Uzma for Urdu). Output: dist-tutorials/<lang>/NN-<chapter>.mp4 and the full movie.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHelpers } from './lib/helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : undefined; };
const LANG = opt('lang') === 'ur' ? 'ur' : 'en';
const ONLY = opt('only') ? String(opt('only')).split(',') : null;
const DRY = !!opt('dry');
const MOVIE_ONLY = !!opt('movie');
const BASE_URL = process.env.TUTORIAL_URL || 'http://localhost:8090/';
// Windows has no Urdu voice, so Urdu uses Microsoft's online neural voice (edge:<name>, lib/edge_tts_batch.py).
const VOICE = LANG === 'ur' ? (process.env.TUTORIAL_UR_VOICE || 'edge:ur-PK-UzmaNeural') : (process.env.TUTORIAL_EN_VOICE || 'Hazel');
const RATE = Number(process.env.TUTORIAL_RATE || (LANG === 'ur' ? 0.92 : 0.95));
const W = 1600, H = 900;
const cacheDir = path.join(root, 'tools', 'tutorials', '.cache');
const outDir = path.join(root, 'dist-tutorials', LANG === 'ur' ? 'Urdu' : 'English');
const workDir = path.join(cacheDir, 'work', LANG);
for (const d of [cacheDir, outDir, workDir]) fs.mkdirSync(d, { recursive: true });

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of [process.env.PLAYWRIGHT_CORE, 'playwright-core', 'playwright'].filter(Boolean)) { try { return require(p); } catch { /* next */ } }
  const npx = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  for (const dir of fs.existsSync(npx) ? fs.readdirSync(npx) : []) {
    const candidate = path.join(npx, dir, 'node_modules', 'playwright-core');
    if (fs.existsSync(candidate)) return require(candidate);
  }
  throw new Error('playwright-core not found. Run "npx playwright-core --version" once, or set PLAYWRIGHT_CORE.');
}

const ACCOUNTS = {
  admin: { email: process.env.TUTORIAL_ADMIN || 'hradmin@aljannatmall.local', password: process.env.TUTORIAL_PASSWORD || 'AlJannat-Demo-2026' },
  employee: { email: process.env.TUTORIAL_EMPLOYEE || 'usman.tariq@example.com', password: process.env.TUTORIAL_PASSWORD || 'AlJannat-Demo-2026' },
};
const t = v => (v && typeof v === 'object' && !Array.isArray(v) ? (v[LANG] ?? v.en) : v);
const other = v => (v && typeof v === 'object' ? (LANG === 'ur' ? v.en : v.ur) : '');
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- chapters
async function loadChapters() { // returns every chapter, in file order
  const dir = path.join(here, 'chapters');
  const files = fs.readdirSync(dir).filter(f => /^\d\d.*\.mjs$/.test(f)).sort();
  const list = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    const chapters = Array.isArray(mod.default) ? mod.default : [mod.default];
    for (const c of chapters) list.push({ file: f, ...c });
  }
  return list;
}

// ---------------------------------------------------------------- voice
function narrationItems(chapter) {
  const items = [];
  if (chapter.intro) items.push({ key: 'intro', text: t(chapter.intro) });
  chapter.steps.forEach((s, i) => { if (s.say) items.push({ key: `s${i}`, text: t(s.say) }); });
  return items.map(it => ({ ...it, id: `${chapter.id}-${it.key}-${hash(`${VOICE}|${RATE}|${it.text}`)}` }));
}
function synthesize(items, chapterId) {
  if (DRY || !items.length) return Object.fromEntries(items.map(it => [it.id, Math.max(2200, it.text.split(/\s+/).length * 330)]));
  const wavDir = path.join(cacheDir, 'tts', LANG);
  const listFile = path.join(workDir, `tts-items-${chapterId}.json`);
  fs.writeFileSync(listFile, JSON.stringify(items.map(({ id, text }) => ({ id, text }))), 'utf8');
  const out = VOICE.startsWith('edge:')
    ? execFileSync(process.env.PYTHON || 'python', [path.join(here, 'lib', 'edge_tts_batch.py'), listFile, wavDir, VOICE.slice(5), String(RATE)], { encoding: 'utf8', maxBuffer: 1 << 26 })
    : execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'lib', 'tts.ps1'), '-Items', listFile, '-OutDir', wavDir, '-Voice', VOICE, '-Rate', String(RATE)], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return JSON.parse(out.trim().split('\n').pop());
}

// ---------------------------------------------------------------- sign-in state (not recorded)
async function storageFor(browser, who, chapterId) {
  if (!who || who === 'none') return undefined;
  const file = path.join(workDir, `auth-${who}-${chapterId}.json`);
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  const res = await page.request.post(new URL('api/auth/login', BASE_URL).toString(), { data: ACCOUNTS[who], headers: { origin: new URL(BASE_URL).origin } });
  const body = await res.json();
  if (!body.token) throw new Error(`Demo sign-in failed for ${who}: ${JSON.stringify(body)}`);
  await page.goto(BASE_URL);
  await page.evaluate(([token, lang]) => { localStorage.setItem('hr_auth_token', token); localStorage.setItem('hr_portal_language', lang); }, [body.token, 'en']);
  await ctx.storageState({ path: file });
  await ctx.close();
  return file;
}

// ---------------------------------------------------------------- record one chapter
async function record(browser, chapter, number, total, durations, items) {
  const videoDir = path.join(workDir, 'video', chapter.id);
  fs.rmSync(videoDir, { recursive: true, force: true });
  const storageState = await storageFor(browser, chapter.as ?? 'admin', chapter.id);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, storageState, recordVideo: { dir: videoDir, size: { width: W, height: H } }, locale: 'en-GB', timezoneId: 'Asia/Karachi' });
  await ctx.addInitScript({ path: path.join(here, 'lib', 'overlay.js') });
  if (chapter.initScript) await ctx.addInitScript(chapter.initScript);
  const page = await ctx.newPage();
  const t0 = Date.now();
  const failures = [];
  const log = msg => console.log(`    ${msg}`);
  const h = createHelpers(page, { baseUrl: BASE_URL, log });
  const events = [];
  const rtl = LANG === 'ur';
  const tut = (fn, ...a) => page.evaluate(([f, x]) => window.__tut && window.__tut[f](...x), [fn, a]).catch(() => undefined);
  const say = (key, line) => {
    const item = items.find(it => it.key === key);
    if (!item) return 0;
    events.push({ t: Date.now() - t0, id: item.id });
    return durations[item.id] || 2000;
  };

  // Title card first: the page loads underneath it.
  if (chapter.open) await chapter.open(page, { baseUrl: BASE_URL, h });
  else await page.goto(new URL(chapter.start || '/', BASE_URL).toString());
  await page.waitForFunction(() => !!window.__tut && !!document.getElementById('tut-card'), null, { timeout: 15000 });
  await tut('card', {
    kicker: LANG === 'ur' ? `باب ${number}` : `CHAPTER ${number} OF ${total}`, title: t(chapter.title), subtitle: t(chapter.subtitle),
    audience: t(chapter.audience) || [], num: String(number).padStart(2, '0'), brand: t(chapter.brand) || 'AlJannat Mall · HR & Payroll', rtl,
  });
  const cardShownAt = Date.now() - t0;
  if (chapter.setup) { try { await chapter.setup(h); } catch (e) { failures.push(`setup: ${e.message}`); } }
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const introMs = say('intro');
  await sleep(Math.max(introMs + 500, 3500));
  await tut('hideCard');
  await tut('chip', String(number), t(chapter.title), rtl);
  await tut('showCursor', true);
  await sleep(500);

  for (let i = 0; i < chapter.steps.length; i++) {
    const step = chapter.steps[i];
    await tut('progress', (i + 1) / chapter.steps.length);
    if (step.say) await tut('caption', t(step.caption || step.say), other(step.caption || step.say), rtl, !rtl);
    const ms = step.say ? say(`s${i}`) : 0;
    const started = Date.now();
    try { if (step.do) await step.do(h); } catch (e) { failures.push(`step ${i + 1}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: path.join(workDir, `fail-${chapter.id}-${i + 1}.png`) }).catch(() => undefined); }
    const left = ms - (Date.now() - started);
    if (left > 0) await sleep(left);
    await sleep(step.hold ?? 550);
    await tut('highlight', null);
  }
  await tut('hideCaption');
  await sleep(900);
  const endAt = Date.now() - t0;
  const video = page.video();
  await ctx.close();
  const webm = await video.path();
  return { webm, events, cardShownAt, endAt, failures };
}

// ---------------------------------------------------------------- audio + video -> mp4
function mux(chapter, number, rec) {
  const out = path.join(outDir, `${String(number).padStart(2, '0')}-${chapter.slug}.mp4`);
  const start = Math.max(0, rec.cardShownAt - 150) / 1000;
  const length = (rec.endAt / 1000) - start;
  const ffArgs = ['-y', '-v', 'error', '-ss', start.toFixed(3), '-t', length.toFixed(3), '-i', rec.webm];
  const filters = [];
  const wavDir = path.join(cacheDir, 'tts', LANG);
  const voiced = DRY ? [] : rec.events.filter(e => fs.existsSync(path.join(wavDir, `${e.id}.wav`)));
  voiced.forEach((e, i) => {
    ffArgs.push('-i', path.join(wavDir, `${e.id}.wav`));
    const delay = Math.max(0, Math.round(e.t - start * 1000));
    filters.push(`[${i + 1}:a]aresample=48000,adelay=${delay}|${delay}[a${i}]`);
  });
  let maps;
  if (voiced.length) {
    filters.push(`${voiced.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voiced.length}:normalize=0:dropout_transition=0,apad,atrim=0:${length.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11[aout]`);
    maps = ['-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[aout]'];
  } else {
    ffArgs.push('-f', 'lavfi', '-t', length.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo');
    maps = ['-map', '0:v', '-map', '1:a'];
  }
  ffArgs.push(...maps, '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', out);
  const run = spawnSync('ffmpeg', ffArgs, { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`ffmpeg failed for ${chapter.id}: ${run.stderr}`);
  return { out, length };
}

function probeSeconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Number(r.stdout.trim()) || 0;
}

// ---------------------------------------------------------------- full movie with chapter marks
function buildMovie(chapters) {
  const files = chapters.map((c, i) => ({ c, file: path.join(outDir, `${String(i + 1).padStart(2, '0')}-${c.slug}.mp4`) })).filter(x => fs.existsSync(x.file));
  if (!files.length) return null;
  const list = path.join(workDir, 'concat.txt');
  fs.writeFileSync(list, files.map(x => `file '${x.file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  let at = 0;
  const meta = [';FFMETADATA1', `title=${LANG === 'ur' ? 'الجنت مال ایچ آر اور پے رول — مکمل ویڈیو گائیڈ' : 'AlJannat Mall HR & Payroll - Complete Video Guide'}`];
  const toc = [];
  for (const x of files) {
    const len = probeSeconds(x.file);
    const startMs = Math.round(at * 1000), endMs = Math.round((at + len) * 1000);
    meta.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${startMs}`, `END=${endMs}`, `title=${t(x.c.title)}`);
    const mm = Math.floor(at / 60), ss = Math.floor(at % 60);
    toc.push(`${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}  ${t(x.c.title)}`);
    at += len;
  }
  const metaFile = path.join(workDir, 'chapters.txt');
  fs.writeFileSync(metaFile, meta.join('\n') + '\n', 'utf8');
  const out = path.join(outDir, LANG === 'ur' ? '00-Complete-Guide-Urdu.mp4' : '00-Complete-Guide-English.mp4');
  const run = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', metaFile, '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', '-movflags', '+faststart', out], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`ffmpeg concat failed: ${run.stderr}`);
  fs.writeFileSync(path.join(outDir, 'Chapters.txt'), toc.join('\r\n') + '\r\n', 'utf8');
  return { out, minutes: at / 60 };
}

// ---------------------------------------------------------------- main
// Every chapter in order (numbers stay the same when only some are recorded), and the ones to record now.
const ordered = await loadChapters({ all: true });
const all = ordered.filter(c => !ONLY || ONLY.some(o => c.id.startsWith(o)));

if (!MOVIE_ONLY) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--force-color-profile=srgb', '--font-render-hinting=none'] });
  const report = [];
  try {
    for (const chapter of all) {
      const number = ordered.findIndex(c => c.id === chapter.id) + 1;
      const items = narrationItems(chapter);
      console.log(`[${LANG}] ${number}/${ordered.length} ${chapter.id} - ${t(chapter.title)}: ${items.length} lines`);
      const durations = synthesize(items, chapter.id);
      const rec = await record(browser, chapter, number, ordered.length, durations, items);
      const { out, length } = mux(chapter, number, rec);
      console.log(`    -> ${path.relative(root, out)} (${length.toFixed(0)} s)${rec.failures.length ? `  ${rec.failures.length} step problem(s)` : ''}`);
      for (const f of rec.failures) console.log(`    !! ${f}`);
      report.push({ id: chapter.id, seconds: Math.round(length), failures: rec.failures });
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(workDir, `report${ONLY ? `-${ONLY.join('_')}` : ''}.json`), JSON.stringify(report, null, 2));
}
if (!ONLY || MOVIE_ONLY) {
  const movie = buildMovie(ordered);
  if (movie) console.log(`[${LANG}] full movie: ${path.relative(root, movie.out)} (${movie.minutes.toFixed(1)} min)`);
}
