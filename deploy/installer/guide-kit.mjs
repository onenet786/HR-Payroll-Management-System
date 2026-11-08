// Shared look and PDF rendering for the product guides (same style as the New Client Server Setup guide).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cssText = s => String(s ?? '').replace(/["\\]/g, ch => `\\${ch}`);
export const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

// Small builders for guide content.
export const steps = items => `<ol class="steps">${items.map(item => `<li>${item}</li>`).join('')}</ol>`;
export const bullets = items => `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
export const checks = items => `<ul class="check">${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
export const note = (title, body, kind = 'note') => `<div class="${kind}"><b>${title}</b>${body}</div>`;
export const pre = code => `<pre>${code}</pre>`;
export const table = (headers, rows, widths = []) => `<table><tr>${headers.map((h, i) => `<th${widths[i] ? ` style="width:${widths[i]}"` : ''}>${h}</th>`).join('')}</tr>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</table>`;
export const fig = (src, caption) => `<figure><img src="${src}" alt="${esc(caption)}"><figcaption>${caption}</figcaption></figure>`;

const CSS = footer => `
  @page { size: A4; margin: 16mm 15mm 18mm 15mm;
    @bottom-left { content: "${cssText(footer)}"; font: 7.5pt system-ui, sans-serif; color: #94a3b8; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7.5pt system-ui, sans-serif; color: #94a3b8; } }
  @page :first { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
  :root { --ink:#1e293b; --muted:#64748b; --line:#e2e8f0; --brand:#047857; --brand-dk:#064e3b; --soft:#ecfdf5; --warn:#b45309; --warnbg:#fffbeb; --bad:#b91c1c; --badbg:#fef2f2; --code:#0f172a; }
  * { box-sizing: border-box; }
  body { margin:0; font: 10pt/1.5 "Segoe UI", system-ui, -apple-system, sans-serif; color: var(--ink); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-size: 19pt; margin: 0 0 4mm; color: var(--brand-dk); letter-spacing: -.01em; }
  h2 { font-size: 13pt; margin: 7mm 0 2.5mm; color: var(--brand-dk); padding-bottom: 1.5mm; border-bottom: 1.5px solid var(--line); break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 5mm 0 1.5mm; break-after: avoid; }
  p { margin: 0 0 2.5mm; } ul, ol { margin: 0 0 3mm; padding-left: 5.5mm; } li { margin-bottom: 1mm; }
  code { font-family: "Cascadia Mono", Consolas, monospace; font-size: 8.8pt; background: #f1f5f9; padding: .2mm 1.2mm; border-radius: 1mm; }
  pre { background: var(--code); color: #e2e8f0; padding: 3mm 4mm; border-radius: 2mm; font: 8.4pt/1.55 "Cascadia Mono", Consolas, monospace; white-space: pre-wrap; margin: 0 0 3.5mm; break-inside: avoid; }
  pre .c { color: #6ee7b7; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 9pt; }
  th { text-align: left; background: #f8fafc; color: var(--muted); font-weight: 600; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; }
  th, td { padding: 1.6mm 2.5mm; border-bottom: 1px solid var(--line); vertical-align: top; } tr { break-inside: avoid; }
  .page { break-before: page; }
  .note, .warn, .bad { border-left: 3px solid var(--brand); background: var(--soft); padding: 2.5mm 3.5mm; border-radius: 0 2mm 2mm 0; margin: 0 0 4mm; break-inside: avoid; }
  .warn { border-color: var(--warn); background: var(--warnbg); } .bad { border-color: var(--bad); background: var(--badbg); }
  .note b:first-child, .warn b:first-child, .bad b:first-child { display: block; margin-bottom: .8mm; }
  .steps { counter-reset: s; list-style: none; padding: 0; }
  .steps > li { counter-increment: s; position: relative; padding-left: 10mm; margin-bottom: 2.5mm; break-inside: avoid; }
  .steps > li::before { content: counter(s); position: absolute; left: 0; top: .2mm; width: 6.5mm; height: 6.5mm; border-radius: 50%; background: var(--brand); color: #fff; font-weight: 700; font-size: 9pt; display: grid; place-items: center; }
  .check { padding-left: 6mm; } .check li { list-style: none; position: relative; }
  .check li::before { content: ""; position: absolute; left: -6mm; top: .9mm; width: 3.2mm; height: 3.2mm; border: 1.3px solid var(--muted); border-radius: .6mm; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; } .card { border: 1px solid var(--line); border-radius: 2mm; padding: 3mm 4mm; break-inside: avoid; } .card h3 { margin-top: 0; }
  figure { margin: 2mm 0 5mm; break-inside: avoid; } figure img { width: 100%; border: 1px solid var(--line); border-radius: 2mm; box-shadow: 0 1mm 3mm rgba(15,23,42,.08); }
  figcaption { font-size: 8.5pt; color: var(--muted); margin-top: 1.2mm; text-align: center; }
  .toc { columns: 2; column-gap: 10mm; } .toc li { margin-bottom: 1.2mm; break-inside: avoid; }
  .flow { display: flex; gap: 2mm; margin: 2mm 0 5mm; } .flow div { flex: 1; background: var(--soft); border: 1px solid #a7f3d0; border-radius: 2mm; padding: 2.5mm; font-size: 8.5pt; text-align: center; } .flow b { display: block; color: var(--brand-dk); font-size: 9.5pt; margin-bottom: .8mm; }
  .cover { height: 297mm; padding: 26mm 22mm; color: #fff; background: linear-gradient(140deg, #064e3b 0%, #065f46 38%, #0f172a 100%); display: flex; flex-direction: column; }
  .cover .tag { display: inline-block; align-self: flex-start; background: #10b981; color: #fff; font-weight: 700; font-size: 8.5pt; letter-spacing: .08em; text-transform: uppercase; padding: 1.2mm 3mm; border-radius: 1mm; }
  .cover h1 { color: #fff; font-size: 32pt; line-height: 1.12; margin: 12mm 0 5mm; } .cover .sub { font-size: 12.5pt; color: #a7f3d0; max-width: 150mm; }
  .cover .meta { margin-top: auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; border-top: 1px solid rgba(255,255,255,.18); padding-top: 6mm; font-size: 9pt; color: #cbd5e1; } .cover .meta b { display: block; color: #fff; font-size: 10.5pt; }
  .cover .flow div { background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.16); color: #e2e8f0; } .cover .flow b { color: #6ee7b7; }
`;

/**
 * Renders one guide: { file, title, footer, tag, coverTitle, subtitle, flow: [[title, text]], meta: [[label, value]], toc: [], body }.
 * Writes docs/<file>.html + .pdf and copies the PDF into deploy/installer/dist/.
 */
export function renderGuide(root, guide) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(guide.title)}</title><style>${CSS(guide.footer)}</style></head><body>
<section class="cover">
  <span class="tag">${esc(guide.tag)}</span>
  <h1>${guide.coverTitle}</h1>
  <p class="sub">${guide.subtitle}</p>
  ${guide.flow ? `<div class="flow" style="margin-top:16mm">${guide.flow.map(([t, d]) => `<div><b>${t}</b>${d}</div>`).join('')}</div>` : ''}
  <div class="meta">${guide.meta.map(([l, v]) => `<div><b>${l}</b>${v}</div>`).join('')}</div>
</section>
<section class="page"><h1>Contents</h1><ol class="toc">${guide.toc.map(item => `<li>${item}</li>`).join('')}</ol>
${guide.body}
</body></html>`;
  const docsDir = path.join(root, 'docs');
  const htmlPath = path.join(docsDir, `${guide.file}.html`);
  const pdfPath = path.join(docsDir, `${guide.file}.pdf`);
  fs.writeFileSync(htmlPath, html, 'utf8');
  const browsers = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  const browser = browsers.find(candidate => fs.existsSync(candidate));
  if (!browser) throw new Error('No Chrome/Edge found. Set CHROME_PATH to a Chromium-based browser.');
  fs.rmSync(pdfPath, { force: true });
  execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--allow-file-access-from-files', `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href], { stdio: 'ignore' });
  if (!fs.existsSync(pdfPath)) throw new Error(`The browser did not produce ${guide.file}.pdf.`);
  const distDir = path.join(root, 'deploy', 'installer', 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.copyFileSync(pdfPath, path.join(distDir, `${guide.file}.pdf`));
  console.log(`✔ docs/${guide.file}.pdf (${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB)`);
  return pdfPath;
}
