// Joins src/*.html into guide.html (with a generated contents list) and prints it to PDF with page numbers.
// Usage: electron build-pdf.cjs <output.pdf>
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const out = process.argv[process.argv.length - 1];
const parts = fs.readdirSync(path.join(dir, 'src')).filter(f => f.endsWith('.html')).sort();
let html = parts.map(f => fs.readFileSync(path.join(dir, 'src', f), 'utf8')).join('\n');

// Contents: every PART divider and every numbered section (h2 with an id). Page numbers come from a
// previous build (pages.json, written by the review step) when available.
const entries = [];
const needles = [];
const pagesFile = path.join(dir, 'pages.json');
const pages = fs.existsSync(pagesFile) ? JSON.parse(fs.readFileSync(pagesFile, 'utf8')) : [];
const decode = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
const re = /<div class="part"><div class="label">(PART [A-Z])<\/div><div class="title">([^<]+)<\/div>|<h2 id="([^"]+)"><span class="num">([^<]+)<\/span>([^<]+(?:<[^>]+>[^<]*)*?)<\/h2>/g;
let m;
while ((m = re.exec(html))) {
  if (m[1]) { entries.push(`<li class="part-row">${m[1]} — ${m[2]}</li>`); continue; }
  const title = decode(m[5]);
  const page = pages[needles.length];
  needles.push(`${m[4]} ${title}`.slice(0, 40));
  entries.push(`<li class="sub"><a href="#${m[3]}">${m[4]} &nbsp;${m[5].replace(/<[^>]+>/g, '')}</a>${page ? `<span class="pg">${page}</span>` : ''}</li>`);
}
fs.writeFileSync(path.join(dir, 'needles.json'), JSON.stringify(needles));
html = html.replace('<!--TOC-->', `<ol>${entries.join('')}</ol>`);
const htmlPath = path.join(dir, 'guide.html');
fs.writeFileSync(htmlPath, html);
console.log(`sections: ${entries.length}`);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1240, height: 1754 });
  await win.loadFile(htmlPath);
  await win.webContents.executeJavaScript('Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })))');
  const broken = await win.webContents.executeJavaScript('[...document.images].filter(i => !i.naturalWidth).map(i => i.getAttribute("src"))');
  if (broken.length) console.log('MISSING IMAGES', broken);
  const pdf = await win.webContents.printToPDF({
    pageSize: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-family:Segoe UI,Arial;font-size:8px;color:#6b7280;padding:0 15mm;display:flex;justify-content:space-between"><span>HR, Payroll &amp; Attendance System — User Guide</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
  });
  fs.writeFileSync(out, pdf);
  console.log(`pdf ${out} ${(pdf.length / 1048576).toFixed(1)} MB`);
  app.quit();
});
