// Chapter 30: installing on the client's own Windows Server. Real servers cannot be recorded, so this chapter plays a
// simulated server desktop (tools/tutorials/sim/30-windows-server.html) whose console text is copied from
// deploy/windows/setup/*.ps1. The browser window shows a picture of the real sign-in page of the demo server.
import { appShot, mark, play, rightClick, run, simUrl } from '../sim/it-sim.mjs';

const ZIP_MENU = ['*Open', 'Open in new window', 'Extract All...', '-', 'Share', 'Send to', '-', 'Cut', 'Copy', '-', 'Create shortcut', 'Delete', 'Rename', '-', 'Properties'];
const CMD_MENU = ['*Open', 'Edit', 'Print', '-', 'Run as administrator', 'Troubleshoot compatibility', '-', 'Send to', '-', 'Cut', 'Copy', '-', 'Delete', 'Rename', '-', 'Properties'];

async function runAsAdmin(h, css) {
  await rightClick(h, css, CMD_MENU);
  await h.click({ css: '#ctx-run-as-administrator' }, { after: 500 });
  await run(h, () => window.sim.uac());
  await h.click({ css: '#uac-yes' }, { after: 400 });
}

export default {
  id: '30',
  slug: 'Installing-on-Windows-Server',
  as: 'none',
  title: { en: 'Installing on Windows Server', ur: 'ونڈوز سرور پر انسٹالیشن' },
  subtitle: {
    en: 'Install HR & Payroll on your own Windows Server, then keep it backed up, updated and secure.',
    ur: 'ایچ آر اور پے رول کو اپنے ونڈوز سرور پر انسٹال کریں، پھر اس کا بیک اپ، اپ ڈیٹ اور حفاظت جاری رکھیں۔',
  },
  audience: { en: ['IT administrator'], ur: ['آئی ٹی ایڈمنسٹریٹر'] },
  intro: {
    en: 'For the IT administrator: we install HR and Payroll on the company\'s own Windows Server, HEADOFFICE, then look at status, backups, updates, port 80 and HTTPS.',
    ur: 'یہ باب آئی ٹی ایڈمنسٹریٹر کے لیے ہے۔ ہم ایچ آر اور پے رول کو کمپنی کے اپنے ونڈوز سرور HEADOFFICE پر انسٹال کریں گے، پھر اسٹیٹس، بیک اپ، اپ ڈیٹ، پورٹ نمبر کے بغیر کھولنے اور HTTPS کے ٹولز دیکھیں گے۔',
  },
  open: async (page, { baseUrl }) => {
    const shot = await appShot(page, baseUrl);
    await page.goto(simUrl('30-windows-server.html'));
    await page.evaluate(src => { window.sim.setShot(src); window.sim.view('setup'); }, shot);
  },
  steps: [
    {
      say: {
        en: 'Copy the package, the HRPayroll Windows Setup zip, to the server, for example to C Setup. Right-click it and choose Extract All, so the whole zip is extracted.',
        ur: 'پیکج، یعنی HRPayroll Windows Setup کی zip فائل، سرور پر کاپی کریں، مثلاً C Setup فولڈر میں۔ اس پر رائٹ کلک کر کے "Extract All" منتخب کریں۔ ہمیشہ پوری zip فائل نکالیں، صرف ایک فائل نہیں۔',
      },
      caption: {
        en: 'Copy HRPayroll-Windows-Setup-<version>.zip to the server (e.g. C:\\Setup), right-click → Extract All. Always extract the whole zip.',
        ur: 'HRPayroll-Windows-Setup-<version>.zip سرور پر کاپی کریں (مثلاً C:\\Setup)، رائٹ کلک ← "Extract All"۔ ہمیشہ پوری zip نکالیں۔',
      },
      do: async h => {
        await rightClick(h, '#f-zip', ZIP_MENU);
        await h.click({ css: '#ctx-extract-all' }, { after: 700 });
        await run(h, () => window.sim.view('extracted'));
      },
    },
    {
      say: {
        en: 'The package has everything, including its own database engine, so the server needs no internet. The docs folder has the Windows Server guide.',
        ur: 'پیکج میں سب کچھ موجود ہے: ایپلیکیشن، اس کا اپنا ڈیٹا بیس انجن اور سیٹ اپ اسکرپٹس، اس لیے سرور پر انٹرنیٹ کی ضرورت نہیں۔ docs فولڈر میں ونڈوز سرور گائیڈ PDF کی شکل میں موجود ہے۔',
      },
      do: async h => {
        await h.point({ css: '#f-payload' }, { hold: 1500 });
        await h.point({ css: '#f-docs' }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Now right-click Setup dot cmd and choose Run as administrator. Windows asks for permission: click Yes.',
        ur: 'اب Setup.cmd پر رائٹ کلک کر کے "Run as administrator" منتخب کریں۔ ونڈوز اجازت مانگے گا: "Yes" پر کلک کریں۔',
      },
      caption: { en: 'Right-click Setup.cmd → Run as administrator, then Yes.', ur: 'Setup.cmd پر رائٹ کلک ← "Run as administrator"، پھر "Yes"۔' },
      do: async h => {
        await runAsAdmin(h, '#f-setupcmd');
        await run(h, () => window.sim.show('#con'));
      },
    },
    {
      say: {
        en: 'Setup asks a few questions. Type the company name, the administrator\'s email address, which is used to sign in, and the administrator\'s name.',
        ur: 'سیٹ اپ چند سوال پوچھتا ہے۔ کمپنی کا نام، ایڈمنسٹریٹر کا ای میل، جس سے لاگ ان ہوگا، اور ایڈمنسٹریٹر کا نام لکھیں۔',
      },
      do: async h => { await play(h, '#t-con', 'setup-start'); },
    },
    {
      say: {
        en: 'For the edition, press Enter for full, with FBR tax, EOBI and provident fund, or type lite for a small business. Leave the address empty to use the server\'s name.',
        ur: 'ایڈیشن کے لیے Enter دبائیں تو full ایڈیشن آئے گا، جس میں ایف بی آر انکم ٹیکس، ای او بی آئی اور پراویڈنٹ فنڈ شامل ہیں، یا چھوٹے کاروبار کے لیے lite لکھیں۔ ایڈریس خالی چھوڑ دیں: صارفین سرور کو اس کے اپنے نام سے کھولیں گے۔',
      },
      do: async h => { await play(h, '#t-con', 'setup-edition'); },
    },
    {
      say: {
        en: 'Next come two folders: the program folder, C HRPayroll, and the data folder, which grows over time. If the server has a second disk, setup suggests it for the data. Check the summary and type Y.',
        ur: 'سیٹ اپ ڈسکیں دکھاتا ہے اور دو فولڈر پوچھتا ہے: پروگرام فولڈر C HRPayroll، اور ڈیٹا فولڈر جس میں ڈیٹا بیس، دستاویزات، بیک اپ اور لاگز ہوتے ہیں اور یہ وقت کے ساتھ بڑھتا ہے۔ اگر سرور میں دوسری ڈسک ہو تو سیٹ اپ ڈیٹا کے لیے وہی تجویز کرتا ہے۔ پھر خلاصہ چیک کر کے Y لکھیں۔',
      },
      caption: {
        en: 'Program folder C:\\HRPayroll, data folder C:\\HRPayrollData (a second disk is suggested when there is one). Check the summary and type Y.',
        ur: 'پروگرام فولڈر C:\\HRPayroll، ڈیٹا فولڈر C:\\HRPayrollData (دوسری ڈسک ہو تو وہ تجویز ہوتی ہے)۔ خلاصہ چیک کر کے Y لکھیں۔',
      },
      do: async h => {
        await play(h, '#t-con', 'setup-folders');
        await play(h, '#t-con', 'setup-confirm');
      },
    },
    {
      say: {
        en: 'Setup copies the files and creates the built-in database as the Windows service HR Payroll Database. It listens only on this server, on port 5433, never on the network.',
        ur: 'سیٹ اپ سرور چیک کرتا ہے، فائلیں کاپی کرتا ہے اور بلٹ اِن PostgreSQL ڈیٹا بیس کو ونڈوز سروس HR Payroll Database کے طور پر بناتا ہے۔ یہ صرف اسی سرور پر پورٹ 5433 پر سنتا ہے، اس لیے ڈیٹا بیس نیٹ ورک پر کبھی کھلا نہیں ہوتا۔',
      },
      do: async h => {
        await play(h, '#t-con', 'setup-run1');
        await mark(h, 'r-db', 1200);
      },
    },
    {
      say: {
        en: 'Then it creates the tables and the first administrator, starts the service HR Payroll Application, opens port 8080 for Domain and Private networks, and schedules a nightly backup at 1:30. It takes about five minutes.',
        ur: 'پھر یہ ٹیبلز اور پہلا ایڈمنسٹریٹر بناتا ہے، دوسری سروس HR Payroll Application چلاتا ہے، فائر وال میں Domain اور Private نیٹ ورکس کے لیے پورٹ 8080 کھولتا ہے، اور ہر رات ڈیڑھ بجے بیک اپ شیڈول کرتا ہے۔ پورا سیٹ اپ تقریباً پانچ منٹ لیتا ہے۔',
      },
      caption: {
        en: 'Tables, first administrator, service "HR Payroll Application", firewall TCP 8080 (Domain + Private), nightly backup at 01:30. About 5 minutes.',
        ur: 'ٹیبلز، پہلا ایڈمنسٹریٹر، سروس "HR Payroll Application"، فائر وال TCP 8080 (Domain + Private)، رات 01:30 بیک اپ۔ تقریباً 5 منٹ۔',
      },
      do: async h => {
        await play(h, '#t-con', 'setup-run2');
        await mark(h, 'r-fw', 900);
        await mark(h, 'r-backup', 900);
      },
    },
    {
      say: {
        en: 'At the end it shows the address to open: http colon slash slash headoffice colon 8080, and the server\'s IP address as a second address.',
        ur: 'آخر میں یہ کھولنے کا ایڈریس دکھاتا ہے: http://headoffice:8080، اور دوسرے ایڈریس کے طور پر سرور کا آئی پی ایڈریس۔',
      },
      caption: { en: 'Open: http://headoffice:8080 — also reachable at http://192.168.86.83:8080', ur: 'کھولیں: http://headoffice:8080 — یا http://192.168.86.83:8080' },
      do: async h => {
        await play(h, '#t-con', 'setup-summary');
        await mark(h, 's-open', 1200);
      },
    },
    {
      say: {
        en: 'Important: the generated administrator password is shown only this once and is not saved anywhere, not even in the setup log. Write it down now, and change it at the first sign-in. The OneNet vendor console password shown below it is for OneNet’s records only.',
        ur: 'اہم: بنایا گیا ایڈمنسٹریٹر پاس ورڈ صرف ایک بار دکھایا جاتا ہے اور کہیں محفوظ نہیں ہوتا، سیٹ اپ لاگ میں بھی نہیں۔ اسے ابھی لکھ لیں، اور پہلی بار لاگ ان کرتے وقت تبدیل کریں۔ اس کے نیچے دکھایا گیا ون نیٹ وینڈر کنسول پاس ورڈ صرف ون نیٹ کے ریکارڈ کے لیے ہے۔',
      },
      do: async h => { await mark(h, 's-pw', 2600); },
    },
    {
      say: {
        en: 'Also copy the settings file, C HRPayroll config dot env, to a safe place off the server. It holds the backup key. Without it, no backup can be restored.',
        ur: 'سیٹنگز فائل C HRPayroll config .env کی ایک کاپی بھی سرور سے باہر کسی محفوظ جگہ رکھیں۔ اس میں بیک اپ کی چابی ہے۔ اس کے بغیر کوئی بیک اپ بحال نہیں ہو سکتا۔',
      },
      caption: { en: 'Keep a copy of C:\\HRPayroll\\config\\.env OFF the server: it holds BACKUP_ENCRYPTION_KEY.', ur: 'C:\\HRPayroll\\config\\.env کی کاپی سرور سے باہر رکھیں: اس میں BACKUP_ENCRYPTION_KEY ہے۔' },
      do: async h => { await mark(h, 's-env', 2400); },
    },
    {
      say: {
        en: 'Now, on any office PC, open http colon slash slash headoffice colon 8080 in the browser and sign in with the administrator email and that password.',
        ur: 'اب دفتر کے کسی بھی کمپیوٹر پر براؤزر میں http://headoffice:8080 کھولیں اور ایڈمنسٹریٹر ای میل اور اسی پاس ورڈ سے لاگ ان کریں۔',
      },
      caption: { en: 'On any office PC open http://headoffice:8080 and sign in.', ur: 'دفتر کے کسی کمپیوٹر پر http://headoffice:8080 کھول کر لاگ ان کریں۔' },
      do: async h => {
        await run(h, () => { window.sim.hide('#con'); window.sim.browser('headoffice:8080', false); });
        await h.point({ css: '#br-url' }, { hold: 1800 });
      },
    },
    {
      say: {
        en: 'The tools are in C HRPayroll tools; run them in PowerShell as administrator. hrpayroll-status shows the services, health, addresses, database size, last backup and free disk.',
        ur: 'ٹولز C HRPayroll tools میں ہیں۔ وہاں ونڈوز پاور شیل ایڈمنسٹریٹر کے طور پر کھولیں۔ hrpayroll-status دونوں سروسز، ہیلتھ چیک، ایڈریس، ڈیٹا بیس کا سائز، آخری بیک اپ اور ڈسک کی خالی جگہ دکھاتا ہے۔',
      },
      caption: { en: 'C:\\HRPayroll\\tools → .\\hrpayroll-status.ps1: services, health, addresses, database size, last backup, free disk.', ur: 'C:\\HRPayroll\\tools ← .\\hrpayroll-status.ps1: سروسز، ہیلتھ، ایڈریس، ڈیٹا بیس سائز، آخری بیک اپ، خالی ڈسک۔' },
      do: async h => {
        await run(h, () => { window.sim.hide('#br'); window.sim.view('tools'); });
        await h.point({ css: '#f-hrpayroll-status-ps1' }, { hold: 1000 });
        await run(h, () => window.sim.show('#ps'));
        await play(h, '#t-ps', 'ps-start');
        await play(h, '#t-ps', 'ps-status');
        await mark(h, 'p-health', 900);
      },
    },
    {
      say: {
        en: 'Backups run every night; fourteen encrypted copies are kept in C HRPayrollData backups. hrpayroll-backup makes one by hand.',
        ur: 'بیک اپ ہر رات خود بخود چلتا ہے اور تازہ ترین چودہ خفیہ کاپیاں C HRPayrollData backups میں رکھی جاتی ہیں۔ آپ کسی بھی وقت hrpayroll-backup خود بھی چلا سکتے ہیں۔',
      },
      caption: { en: 'Nightly encrypted backup, 14 kept in C:\\HRPayrollData\\backups. By hand: .\\hrpayroll-backup.ps1', ur: 'ہر رات خفیہ بیک اپ، 14 کاپیاں C:\\HRPayrollData\\backups میں۔ خود چلائیں: .\\hrpayroll-backup.ps1' },
      do: async h => {
        await play(h, '#t-ps', 'ps-backup');
        await mark(h, 'p-bok', 1000);
      },
    },
    {
      say: {
        en: 'To restore, run hrpayroll-restore with the backup file and type RESTORE. It first takes a safety backup, then replaces the whole database. Everything entered after that backup is lost.',
        ur: 'بحال کرنے کے لیے hrpayroll-restore کو بیک اپ فائل کے ساتھ چلائیں اور RESTORE لکھیں۔ یہ پہلے حفاظتی بیک اپ لیتا ہے، پھر پورا ڈیٹا بیس بدل دیتا ہے۔ اس بیک اپ کے بعد درج کیا گیا سب کچھ ختم ہو جاتا ہے۔',
      },
      do: async h => {
        await run(h, () => window.sim.clear('#t-ps'));
        await play(h, '#t-ps', 'ps-restore');
      },
    },
    {
      say: {
        en: 'If the administrator password is forgotten, run Reset-AdminPassword with the email. Press Enter, and a new password is generated and shown once.',
        ur: 'اگر ایڈمنسٹریٹر پاس ورڈ بھول جائے تو Reset-AdminPassword کو ای میل کے ساتھ چلائیں۔ Enter دبائیں، نیا پاس ورڈ بن کر ایک بار دکھایا جائے گا۔',
      },
      caption: { en: '.\\Reset-AdminPassword.ps1 -Email hradmin@aljannatmall.local → Enter = generate a new password (shown once).', ur: '.\\Reset-AdminPassword.ps1 -Email hradmin@aljannatmall.local ← Enter = نیا پاس ورڈ (ایک بار دکھایا جاتا ہے)۔' },
      do: async h => {
        await play(h, '#t-ps', 'ps-reset');
        await mark(h, 'p-newpw', 1000);
      },
    },
    {
      say: {
        en: 'Every update is done the same way. Copy and extract the new package, then right-click Update dot cmd and choose Run as administrator. There is nothing to type.',
        ur: 'ہر اپ ڈیٹ ایک ہی طریقے سے ہوتی ہے۔ نیا پیکج کاپی کر کے نکالیں، پھر Update.cmd پر رائٹ کلک کر کے "Run as administrator" منتخب کریں۔ کچھ لکھنے کی ضرورت نہیں۔',
      },
      caption: { en: 'Updates: extract the NEW package, right-click Update.cmd → Run as administrator.', ur: 'اپ ڈیٹ: نیا پیکج نکالیں، Update.cmd پر رائٹ کلک ← "Run as administrator"۔' },
      do: async h => {
        await run(h, () => { window.sim.hide('#ps'); window.sim.view('update'); });
        await runAsAdmin(h, '#f-update2');
      },
    },
    {
      say: {
        en: 'It takes a safety backup, installs the new version beside the old one, updates the database and restarts. If the new version does not answer, it switches back automatically.',
        ur: 'اپ ڈیٹ پہلے حفاظتی بیک اپ لیتی ہے، نیا ورژن پرانے کے ساتھ انسٹال کرتی ہے، ڈیٹا بیس اپ ڈیٹ کرتی ہے، ری اسٹارٹ کر کے چیک کرتی ہے۔ اگر نیا ورژن جواب نہ دے تو خود بخود پرانے ورژن پر واپس چلی جاتی ہے۔',
      },
      do: async h => {
        await run(h, () => { window.sim.clear('#t-con'); window.sim.show('#con'); });
        await play(h, '#t-con', 'update');
        await mark(h, 'u-done', 900);
      },
    },
    {
      say: {
        en: 'To open the system without colon 8080, run Enable-Port80. Users can then simply type http colon slash slash headoffice. Addresses with 8080 keep working, so the kiosks need no change.',
        ur: 'سسٹم کو :8080 کے بغیر کھولنے کے لیے Enable-Port80 چلائیں۔ پھر صارفین صرف http://headoffice لکھ سکتے ہیں۔ 8080 والے ایڈریس بھی چلتے رہتے ہیں، اس لیے کیوسک میں کوئی تبدیلی نہیں کرنی پڑتی۔',
      },
      caption: { en: '.\\Enable-Port80.ps1 → http://headoffice (addresses with :8080 keep working).', ur: '.\\Enable-Port80.ps1 ← http://headoffice (:8080 والے ایڈریس بھی چلتے رہتے ہیں)۔' },
      do: async h => {
        await run(h, () => { window.sim.hide('#con'); window.sim.hide('#exp'); window.sim.show('#ps'); });
        await play(h, '#t-ps', 'ps-port80');
        await mark(h, 'p-80url', 1000);
      },
    },
    {
      say: {
        en: 'For a secure connection, run Enable-Https. It creates a local certificate authority and a server certificate, and switches to https colon slash slash headoffice. Old addresses redirect.',
        ur: 'محفوظ کنکشن کے لیے Enable-Https چلائیں۔ یہ سرور پر ایک لوکل سرٹیفکیٹ اتھارٹی بناتا ہے، سرور کے نام اور آئی پی کے لیے سرٹیفکیٹ جاری کرتا ہے، اور سسٹم کو https://headoffice پر منتقل کر دیتا ہے۔ پرانے ایڈریس خود اس پر چلے جاتے ہیں۔',
      },
      caption: { en: '.\\Enable-Https.ps1 → local CA + server certificate → https://headoffice (old addresses redirect).', ur: '.\\Enable-Https.ps1 ← لوکل CA اور سرور سرٹیفکیٹ ← https://headoffice (پرانے ایڈریس ری ڈائریکٹ)۔' },
      do: async h => {
        await play(h, '#t-ps', 'ps-https');
        await run(h, () => { document.getElementById('t-ps').scrollTop = 0; });
        await mark(h, 'h-ca', 700);
        await mark(h, 'h-url', 1000);
      },
    },
    {
      say: {
        en: 'If it warns that the network is Public, other PCs are blocked. On an office network that is not a domain, set it to Private with Set-NetConnectionProfile, as shown here.',
        ur: 'اگر یہ خبردار کرے کہ نیٹ ورک Public ہے تو دوسرے کمپیوٹر بلاک رہتے ہیں۔ ایسے دفتری نیٹ ورک پر جو ڈومین نہ ہو، Set-NetConnectionProfile سے اسے Private کر دیں، جیسا یہاں دکھایا گیا ہے۔',
      },
      caption: { en: 'Network "Public" blocks other PCs: Set-NetConnectionProfile -InterfaceAlias "Ethernet" -NetworkCategory Private', ur: 'نیٹ ورک "Public" ہو تو دوسرے PC بلاک: Set-NetConnectionProfile -InterfaceAlias "Ethernet" -NetworkCategory Private' },
      do: async h => {
        await mark(h, 'h-public', 1200);
        await play(h, '#t-ps', 'ps-private');
        await mark(h, 'h-private-ok', 900);
      },
    },
    {
      say: {
        en: 'Every PC and kiosk must then trust the certificate. Copy the folder C HRPayroll https-ca to the PC, then right-click Install-HRPayroll-CA dot cmd and choose Run as administrator. Each run of Enable-Https makes a new certificate authority, so do this again whenever you run it.',
        ur: 'پھر نیا سرٹیفکیٹ ہر کمپیوٹر اور کیوسک پر قابلِ اعتماد بنانا ضروری ہے۔ Enable-Https ہر بار نیا سرٹیفکیٹ اتھارٹی بناتا ہے، اس لیے جب بھی اسے چلائیں یہ دوبارہ کریں۔ C HRPayroll https-ca فولڈر کمپیوٹر پر کاپی کریں، مثلاً یو ایس بی کے ذریعے۔ پھر Install-HRPayroll-CA.cmd پر رائٹ کلک کر کے "Run as administrator" منتخب کریں۔',
      },
      caption: { en: 'On every PC and kiosk (again after each Enable-Https run): copy C:\\HRPayroll\\https-ca, right-click Install-HRPayroll-CA.cmd → Run as administrator.', ur: 'ہر PC اور کیوسک پر (ہر بار Enable-Https چلانے کے بعد): C:\\HRPayroll\\https-ca کاپی کریں، Install-HRPayroll-CA.cmd پر رائٹ کلک ← "Run as administrator"۔' },
      do: async h => {
        await run(h, () => { window.sim.hide('#ps'); window.sim.pcMode(); window.sim.view('ca'); });
        await h.point({ css: '#f-cer' }, { hold: 700 });
        await runAsAdmin(h, '#f-cacmd');
        await run(h, () => { window.sim.title('#con', 'Administrator: C:\\Windows\\System32\\cmd.exe'); window.sim.show('#con'); });
        await play(h, '#t-con', 'ca');
      },
    },
    {
      say: {
        en: 'Reopen the browser at https colon slash slash headoffice: the padlock shows it is secure. Kiosks need version 1.0.44 or later: remove the device key and register again with the https address.',
        ur: 'براؤزر دوبارہ کھولیں اور https://headoffice کھولیں۔ تالے کا نشان بتاتا ہے کہ کنکشن محفوظ ہے۔ کیوسک کا ورژن 1.0.44 یا اس سے نیا ہونا چاہیے: کیوسک سیٹنگز میں ڈیوائس کی ہٹائیں اور https ایڈریس کے ساتھ دوبارہ رجسٹر کریں۔',
      },
      caption: { en: 'https://headoffice with a padlock. Kiosks (1.0.44+): Settings → Remove device key → register again with https://headoffice.', ur: 'https://headoffice تالے کے ساتھ۔ کیوسک (1.0.44+): Settings ← "Remove device key" ← https://headoffice کے ساتھ دوبارہ رجسٹر کریں۔' },
      do: async h => {
        await run(h, () => { window.sim.hide('#con'); window.sim.hide('#exp'); window.sim.browser('headoffice', true); });
        await h.point({ css: '#br-url' }, { hold: 2400 });
      },
    },
  ],
};
