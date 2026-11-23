// Chapter 32: installing the attendance kiosk on a branch PC. Simulated PC (tools/tutorials/sim/32-kiosk-install.html):
// Explorer, the NSIS setup of windows-kiosk/electron-builder.json, then the REAL kiosk screen markup
// (windows-kiosk/renderer/index.html with its scripts removed, generated into .cache at record time) driven by
// sim/32-kiosk-frame.js with the kiosk's own messages.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { play, rightClick, run, simDir, simUrl } from '../sim/it-sim.mjs';

const root = path.resolve(simDir, '..', '..', '..');
const K = sel => p => p.frameLocator('#kiosk').locator(sel);
const CMD_MENU = ['*Open', 'Edit', 'Print', '-', 'Run as administrator', 'Troubleshoot compatibility', '-', 'Send to', '-', 'Cut', 'Copy', '-', 'Delete', 'Rename', '-', 'Properties'];
// What a setup code looks like (server/installation.cjs encodeSetupCode): HRK1.<base64url JSON>.
const SETUP_CODE = `HRK1.${Buffer.from(JSON.stringify({ v: 1, n: 'AlJannat Mall', u: ['https://aljannat-mall.binishaqsoft.com'], t: 'k7Qm2xV9pLr4Tz8aNc3WbY6e' })).toString('base64url')}`;

function buildKioskFrame() {
  const renderer = path.join(root, 'windows-kiosk', 'renderer');
  let html = fs.readFileSync(path.join(renderer, 'index.html'), 'utf8');
  html = html
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
    .replace(/<script\b[^>]*>\s*<\/script>/g, '')
    .replace('<head>', `<head><base href="${pathToFileURL(renderer).href}/">`)
    .replace('</body>', `<script src="${simUrl('32-kiosk-frame.js')}"></script></body>`);
  const out = path.join(root, 'tools', 'tutorials', '.cache', 'kiosk-32.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');
  return pathToFileURL(out).href;
}

export default {
  id: '32',
  slug: 'Installing-the-Kiosk',
  as: 'none',
  title: { en: 'Installing the kiosk on a PC', ur: 'کمپیوٹر پر کیوسک کی انسٹالیشن' },
  subtitle: {
    en: 'Install the attendance kiosk at a branch gate, register it with the HR server and check the reader and camera.',
    ur: 'برانچ کے گیٹ پر اٹینڈنس کیوسک انسٹال کریں، اسے ایچ آر سرور سے رجسٹر کریں اور ریڈر اور کیمرہ چیک کریں۔',
  },
  audience: { en: ['IT administrator'], ur: ['آئی ٹی ایڈمنسٹریٹر'] },
  intro: {
    en: 'This chapter is for IT. We install the attendance kiosk on the gate PC of a branch, register it with the HR server, choose its branch, and check the fingerprint reader and the camera.',
    ur: 'یہ باب آئی ٹی کے لیے ہے۔ ہم برانچ کے گیٹ والے کمپیوٹر پر اٹینڈنس کیوسک انسٹال کریں گے، اسے ایچ آر سرور سے رجسٹر کریں گے، اس کی برانچ منتخب کریں گے، اور فنگر پرنٹ ریڈر اور کیمرہ چیک کریں گے۔',
  },
  open: async page => {
    const frame = buildKioskFrame();
    await page.goto(simUrl('32-kiosk-install.html'));
    await page.evaluate(src => { document.getElementById('kiosk').src = src; }, frame);
  },
  steps: [
    {
      say: {
        en: 'If your server uses its own local HTTPS certificate, for example https colon slash slash headoffice, first trust it on this PC: right-click Install-HRPayroll-CA dot cmd from the https-ca folder and choose Run as administrator.',
        ur: 'اگر آپ کا سرور اپنا لوکل HTTPS سرٹیفکیٹ استعمال کرتا ہے، مثلاً https://headoffice، تو پہلے اسے اس کمپیوٹر پر قابلِ اعتماد بنائیں: https-ca فولڈر سے Install-HRPayroll-CA.cmd پر رائٹ کلک کر کے "Run as administrator" منتخب کریں۔',
      },
      caption: { en: 'Server with a local HTTPS certificate (https://headoffice)? First: https-ca → right-click Install-HRPayroll-CA.cmd → Run as administrator.', ur: 'سرور لوکل HTTPS سرٹیفکیٹ والا ہے (https://headoffice)؟ پہلے: https-ca ← Install-HRPayroll-CA.cmd پر رائٹ کلک ← "Run as administrator"۔' },
      do: async h => {
        await rightClick(h, '#f-cacmd', CMD_MENU);
        await h.click({ css: '#ctx-run-as-administrator' }, { after: 400 });
        await run(h, () => window.sim.uac('Windows Command Processor', 'Microsoft Windows'));
        await h.click({ css: '#uac-yes' }, { after: 300 });
        await run(h, () => window.sim.show('#con'));
        await play(h, '#t-con', 'ca');
      },
    },
    {
      say: {
        en: 'Plug in the fingerprint reader and install its driver from the manufacturer first, for example the DigitalPersona U are U driver. Then start the kiosk setup, AlJannatMall Attendance Kiosk Setup, version 1.0.44 or later.',
        ur: 'فنگر پرنٹ ریڈر لگائیں اور پہلے بنانے والی کمپنی کا ڈرائیور انسٹال کریں، مثلاً DigitalPersona U.are.U کا ڈرائیور۔ پھر کیوسک سیٹ اپ AlJannatMall Attendance Kiosk Setup چلائیں، ورژن 1.0.44 یا اس سے نیا۔',
      },
      caption: { en: 'Reader driver from the manufacturer first (e.g. DigitalPersona U.are.U), then run "AlJannatMall Attendance Kiosk Setup 1.0.44.exe" (1.0.44 or later).', ur: 'پہلے ریڈر کا ڈرائیور (مثلاً DigitalPersona U.are.U)، پھر "AlJannatMall Attendance Kiosk Setup 1.0.44.exe" چلائیں (1.0.44 یا نیا)۔' },
      do: async h => {
        await run(h, () => { window.sim.hide('#con'); window.ksim.view('downloads'); });
        await h.point({ css: '#exp .row:nth-child(2)' }, { hold: 1300 });
        await h.point({ css: '#f-setup' }, { hold: 500 });
        await run(h, () => window.sim.select('#f-setup'));
        await h.page.dblclick('#f-setup');
        await run(h, () => window.sim.uac('AlJannatMall Attendance Kiosk Setup 1.0.44', 'Unknown'));
        await h.click({ css: '#uac-yes' }, { after: 300 });
        await run(h, () => { window.sim.hide('#exp'); window.sim.show('#nsis'); });
      },
    },
    {
      say: {
        en: 'Keep the suggested folder and click Install. The kiosk is installed for all users, with shortcuts on the desktop and in the Start menu, and the fingerprint bridge is registered to start at every Windows login.',
        ur: 'تجویز کردہ فولڈر رہنے دیں اور "Install" پر کلک کریں۔ کیوسک تمام صارفین کے لیے انسٹال ہوتا ہے، ڈیسک ٹاپ اور اسٹارٹ مینو میں شارٹ کٹ بنتے ہیں، اور فنگر پرنٹ برج ہر ونڈوز لاگ ان پر خود چلنے کے لیے رجسٹر ہو جاتا ہے۔',
      },
      do: async h => {
        await h.point({ css: '#ns-path' }, { hold: 900 });
        await h.click({ css: '#ns-install' }, { after: 300 });
        await h.visible({ css: '#ns-bridge' }, 12000);
        await h.point({ css: '#ns-bridge' }, { hold: 600 });
        await h.visible({ css: '#ns-finish' }, 12000);
      },
    },
    {
      say: {
        en: 'Leave Run AlJannatMall Attendance Kiosk ticked and click Finish. Later updates are installed the same way, by running the newer setup: punches waiting to upload, the settings and the device key are kept.',
        ur: '"Run AlJannatMall Attendance Kiosk" پر نشان رہنے دیں اور "Finish" پر کلک کریں۔ بعد کی اپ ڈیٹس بھی اسی طرح نیا سیٹ اپ چلا کر ہوتی ہیں: اپ لوڈ کے منتظر حاضری ریکارڈ، سیٹنگز اور ڈیوائس کی محفوظ رہتی ہیں۔',
      },
      do: async h => {
        await h.point({ css: '#ns-run' }, { hold: 900 });
        await h.click({ css: '#ns-finish' }, { after: 400 });
        await run(h, () => window.ksim.kiosk());
        await h.wait(600);
      },
    },
    {
      say: {
        en: 'The kiosk opens full screen. The red bar says it is not registered yet: without registration it cannot download employees or upload punches. Click Register now.',
        ur: 'کیوسک پوری اسکرین پر کھلتا ہے۔ سرخ پٹی بتاتی ہے کہ یہ ابھی رجسٹرڈ نہیں: رجسٹریشن کے بغیر یہ ملازمین ڈاؤن لوڈ نہیں کر سکتا اور حاضری اپ لوڈ نہیں کر سکتا۔ "Register now" پر کلک کریں۔',
      },
      do: async h => {
        await h.point(K('#regBanner span'), { hold: 1600 });
        await h.click(K('#regBannerBtn'), { after: 600 });
      },
    },
    {
      say: {
        en: 'The first time Settings is opened, the kiosk asks you to choose an admin PIN of six to twelve digits. Type it twice and keep it safe: it is needed for Settings, to exit the kiosk, to clear its local data and to remove its device key.',
        ur: 'پہلی بار سیٹنگز کھولنے پر کیوسک چھ سے بارہ ہندسوں کا ایڈمن پن منتخب کرنے کو کہتا ہے۔ اسے دو بار لکھیں اور محفوظ رکھیں: یہ سیٹنگز، کیوسک بند کرنے، اس کا مقامی ڈیٹا صاف کرنے اور ڈیوائس کلید ہٹانے کے لیے چاہیے۔',
      },
      do: async h => {
        await h.point(K('#pinDialog'), { hold: 1000 });
        await h.fill(K('#pinInput'), '482915', { delay: 90 });
        await h.fill(K('#pinConfirmInput'), '482915', { delay: 90 });
        await h.click(K('#pinConfirm'), { after: 800 });
      },
    },
    {
      say: {
        en: 'In Kiosk Settings, first fill Terminal Configuration: a Terminal ID and the location, for example Head Office main gate. The server shows this name for the kiosk.',
        ur: '"Kiosk Settings" میں پہلے "Terminal Configuration" بھریں: ٹرمینل آئی ڈی اور جگہ، مثلاً ہیڈ آفس کا مین گیٹ۔ سرور پر کیوسک اسی نام سے نظر آتا ہے۔',
      },
      caption: { en: 'Terminal Configuration first: Terminal ID KIOSK-HO-01, Location "Head Office Main Gate" (the name the server shows).', ur: 'پہلے "Terminal Configuration": ٹرمینل آئی ڈی KIOSK-HO-01، جگہ "Head Office Main Gate" (سرور پر یہی نام دکھتا ہے)۔' },
      do: async h => {
        await h.fill(K('#stTerminalId'), 'KIOSK-HO-01');
        await h.fill(K('#stLocation'), 'Head Office Main Gate');
      },
    },
    {
      say: {
        en: 'Server Registration offers two ways. A setup code is the easiest: when OneNet hosts your system, support creates one in the Provider Console. Paste it, and the kiosk shows which company and server it belongs to.',
        ur: '"Server Registration" میں دو طریقے ہیں۔ سیٹ اپ کوڈ سب سے آسان ہے: جب آپ کا سسٹم ون نیٹ ہوسٹ کرتا ہے تو سپورٹ "Provider Console" میں یہ کوڈ بناتی ہے۔ اسے پیسٹ کریں تو کیوسک دکھاتا ہے کہ یہ کس کمپنی اور سرور کا ہے۔',
      },
      caption: { en: 'Setup code (recommended): created by OneNet in the Provider Console for hosted systems. Paste it; the kiosk shows the company and server.', ur: 'سیٹ اپ کوڈ (تجویز کردہ): ہوسٹڈ سسٹم کے لیے ون نیٹ "Provider Console" میں بناتا ہے۔ پیسٹ کریں؛ کیوسک کمپنی اور سرور دکھاتا ہے۔' },
      do: async h => {
        await h.point(K('#stRegMethodCode'), { hold: 600 });
        await h.fill(K('#stRegSetupCode'), SETUP_CODE, { delay: 6 });
        await h.point(K('#stRegCodePreview'), { hold: 1400 });
      },
    },
    {
      say: {
        en: 'On your own server, use a kiosk account instead. Choose Kiosk account email and password, type the server address, here https colon slash slash headoffice, and the account of a user with the Kiosk Terminal role. Then click Register this kiosk.',
        ur: 'اپنے سرور پر اس کی جگہ کیوسک اکاؤنٹ استعمال کریں۔ "Kiosk account email & password" منتخب کریں، سرور کا ایڈریس لکھیں، یہاں https://headoffice، اور "Kiosk Terminal" رول والے یوزر کا اکاؤنٹ۔ پھر "Register this kiosk" پر کلک کریں۔',
      },
      caption: { en: 'Own server: "Kiosk account email & password" — Server address https://headoffice (or 192.168.86.83:8080), a user with the Kiosk Terminal role → Register this kiosk.', ur: 'اپنا سرور: "Kiosk account email & password" — سرور ایڈریس https://headoffice (یا 192.168.86.83:8080)، "Kiosk Terminal" رول والا یوزر ← "Register this kiosk"۔' },
      do: async h => {
        await h.click(K('#stRegMethodAccount'), { after: 400 });
        await h.fill(K('#stRegServerUrl'), 'https://headoffice');
        await h.fill(K('#stRegEmail'), 'kiosk.gate1@aljannatmall.local');
        await h.fill(K('#stRegPassword'), 'Gate1-Kiosk-2026', { delay: 30 });
        await h.click(K('#stRegister'), { after: 1600 });
        await h.point(K('#stRegStatus'), { hold: 1200 });
      },
    },
    {
      say: {
        en: 'The kiosk now has its own device key, which an administrator can revoke at any time. Choose the Assigned Branch: the kiosk keeps the employees and fingerprints of this branch on the PC, so it also works when the network is down.',
        ur: 'اب کیوسک کے پاس اپنی ڈیوائس کی ہے، جسے ایڈمنسٹریٹر کسی بھی وقت منسوخ کر سکتا ہے۔ "Assigned Branch" منتخب کریں: کیوسک اس برانچ کے ملازمین اور فنگر پرنٹس کمپیوٹر پر رکھتا ہے، اس لیے نیٹ ورک بند ہونے پر بھی کام کرتا ہے۔',
      },
      do: async h => {
        await h.point(K('#stRegServer'), { hold: 900 });
        await h.select(K('#stBranchId'), 'Head Office');
      },
    },
    {
      say: {
        en: 'Under Camera, choose Webcam for a USB or built-in camera, or IP cameras for up to two network cameras, for example one at the entrance and one at the exit.',
        ur: '"Camera" میں یو ایس بی یا بلٹ اِن کیمرے کے لیے "Webcam" منتخب کریں، یا دو تک نیٹ ورک کیمروں کے لیے "IP camera(s)"، مثلاً ایک داخلے پر اور ایک باہر نکلنے کی جگہ پر۔',
      },
      do: async h => {
        await h.scrollTo(K('#stCameraSource'));
        await h.select(K('#stCameraSource'), 'Webcam (USB or built-in camera on this PC)');
        await h.point(K('#stCameraSource'), { hold: 900 });
      },
    },
    {
      say: {
        en: 'To check the fingerprint reader, click Check Biometric Driver Host: it should say Driver Host Ready. Test Scanner then reads a finger. The FP Bridge light at the top turns green when the reader service runs.',
        ur: 'فنگر پرنٹ ریڈر چیک کرنے کے لیے "Check Biometric Driver Host" پر کلک کریں: "Driver Host Ready" آنا چاہیے۔ پھر "Test Scanner" سے انگلی پڑھ کر دیکھیں۔ اوپر "FP Bridge" کی بتی سبز ہو جاتی ہے جب ریڈر سروس چل رہی ہو۔',
      },
      do: async h => {
        await h.click(K('#stStartBridge'), { after: 900 });
        await h.point(K('#stTestScanner'), { hold: 900 });
        await h.point(K('#pillBridge'), { hold: 900 });
      },
    },
    {
      say: {
        en: 'Click Save Settings. The red bar is gone, the kiosk is online and synced, and employees can punch. From now on the kiosk starts by itself at every Windows login, together with the fingerprint bridge.',
        ur: '"Save Settings" پر کلک کریں۔ سرخ پٹی ختم ہو گئی، کیوسک آن لائن اور سنک ہے، اور ملازمین حاضری لگا سکتے ہیں۔ اب سے کیوسک ہر ونڈوز لاگ ان پر فنگر پرنٹ برج کے ساتھ خود بخود شروع ہوتا ہے۔',
      },
      do: async h => {
        await h.click(K('#stSave'), { after: 700 });
        await h.point(K('#terminalLine'), { hold: 1000 });
        await h.point(K('.status-indicators'), { hold: 1200 });
      },
    },
  ],
};
