// Chapter 29: the Windows attendance kiosk (windows-kiosk/renderer), recorded in the browser.
//
// How it is simulated (the real Electron kiosk is never started, no reader or camera is used):
// - The renderer files are served from http://kiosk.local/ by a Playwright route (a real origin, so the page's own
//   CSP and scripts work as in Electron). The two face-recognition modules are replaced by empty ones.
// - sim/kiosk-mock.js (initScript) stands in for window.kioskApi from windows-kiosk/preload.cjs: AlJannat Mall
//   employees, today's punches, events, registration to https://headoffice, settings, and a drawn webcam picture.
// - The kiosk is scaled to the top 83% of the screen so the caption bar never covers it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sim = path.join(here, '..', 'sim');
const renderer = path.resolve(here, '..', '..', '..', 'windows-kiosk', 'renderer');
const KIOSK = 'http://kiosk.local/';
const SETUP_CODE = 'HRK1.eyJ2IjoxLCJuIjoiQWxKYW5uYXQgTWFsbCIsInUiOlsiaHR0cHM6Ly9oZWFkb2ZmaWNlIl0sInQiOiJrc3RfOWYyYzQxZDdlOGEwNWIzNmMxZDQifQ';
const FIT = '.shell{transform:scale(.83);transform-origin:50% 0}.overlay{bottom:150px}.overlay>*{transform:scale(.83)}';
const inDialog = sel => ({ css: `#settingsDialog ${sel}` });

export default {
  id: '29',
  slug: 'Attendance-Kiosk',
  as: 'none',
  title: { en: 'The attendance kiosk', ur: 'حاضری کیوسک' },
  subtitle: {
    en: 'Punching in and out at the kiosk, and the kiosk settings: server registration, terminal and camera.',
    ur: 'کیوسک پر حاضری لگانا، اور کیوسک کی سیٹنگز: سرور رجسٹریشن، ٹرمینل اور کیمرہ۔',
  },
  audience: { en: ['Employees', 'IT staff'], ur: ['ملازمین', 'آئی ٹی عملہ'] },
  intro: {
    en: 'The attendance kiosk is a Windows PC at the entrance, with a fingerprint reader and a camera. Employees punch in and out here, and the kiosk sends every punch to the HR server.',
    ur: 'حاضری کیوسک داخلی دروازے پر لگا ایک ونڈوز کمپیوٹر ہے، جس کے ساتھ فنگر پرنٹ ریڈر اور کیمرہ ہوتا ہے۔ ملازمین یہاں آتے جاتے حاضری لگاتے ہیں، اور کیوسک ہر حاضری ایچ آر سرور کو بھیج دیتا ہے۔',
  },
  initScript: { content: fs.readFileSync(path.join(sim, 'kiosk-mock.js'), 'utf8') },
  open: async page => {
    await page.route(`${KIOSK}**`, route => {
      const file = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '') || 'index.html';
      if (/^(mediapipe-loader|face-embedding)\.mjs$/.test(file)) return route.fulfill({ body: 'export {};', contentType: 'text/javascript' });
      const full = path.join(renderer, file);
      if (!full.startsWith(renderer) || !fs.existsSync(full)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ path: full });
    });
    await page.goto(`${KIOSK}index.html`);
    await page.addStyleTag({ content: FIT });
    await page.locator('#dirList .dir-row').first().waitFor({ timeout: 15000 });
  },
  steps: [
    {
      say: {
        en: "This is the kiosk screen. At the top are the kiosk's location, the clock, and green lights that show the reader and the server are connected. Below are today's figures: who is in, who has left, and punches waiting to be sent.",
        ur: 'یہ کیوسک کی اسکرین ہے۔ اوپر کیوسک کی جگہ، گھڑی، اور سبز بتیاں ہیں جو بتاتی ہیں کہ ریڈر اور سرور جڑے ہوئے ہیں۔ نیچے آج کے اعداد ہیں: کون اندر ہے، کون جا چکا ہے، اور کتنی حاضریاں ابھی بھیجی جانی ہیں۔',
      },
      do: async h => {
        await h.point({ css: '.brand' }, { hold: 900 });
        await h.point({ css: '.status-indicators' }, { hold: 1000 });
        await h.point({ css: '.stats-bar' }, { hold: 1400 });
      },
    },
    {
      say: {
        en: 'There are three ways to punch. Fingerprint is the usual one: the employee simply places a finger on the reader, and the kiosk finds who it is.',
        ur: 'حاضری لگانے کے تین طریقے ہیں۔ عام طریقہ فنگر پرنٹ ہے: ملازم بس ریڈر پر انگلی رکھتا ہے، اور کیوسک خود پہچان لیتا ہے کہ یہ کون ہے۔',
      },
      do: async h => {
        await h.point({ css: '.mode-btn[data-mode="fingerprint"]' }, { hold: 900 });
        await h.point({ css: '#fpOrb' }, { hold: 1400 });
      },
    },
    {
      say: {
        en: 'Camera recognises faces. The employee looks at the camera, a short live check stops anyone from using a photo, and the punch is saved with a snapshot as evidence.',
        ur: 'کیمرہ چہرہ پہچانتا ہے۔ ملازم کیمرے کی طرف دیکھتا ہے، ایک مختصر لائیو جانچ تصویر کے ذریعے دھوکے کو روکتی ہے، اور حاضری ثبوت کی تصویر کے ساتھ محفوظ ہوتی ہے۔',
      },
      do: async h => {
        await h.click({ css: '.mode-btn[data-mode="camera"]' }, { after: 1600 });
        await h.point({ css: '#cameraView' }, { hold: 1500 });
        await h.point({ css: '#kioskCamModeBar' }, { hold: 900 });
      },
    },
    {
      say: {
        en: 'Employee Code is a backup for a card or a typed code, without fingerprint or face. HR turns it on only when needed, because it is less secure.',
        ur: '"Employee Code" کارڈ یا لکھے گئے کوڈ کے لیے متبادل طریقہ ہے، بغیر فنگر پرنٹ یا چہرے کے۔ ایچ آر اسے صرف ضرورت کے وقت آن کرتا ہے، کیونکہ یہ کم محفوظ ہے۔',
      },
      do: async h => { await h.click({ css: '#codeModeBtn' }, { after: 900 }); },
    },
    {
      say: {
        en: 'Fatima Noor holds her card to the reader, or types her code. The kiosk shows her name and whether this will be a punch in or out.',
        ur: 'فاطمہ نور اپنا کارڈ ریڈر کے سامنے کرتی ہیں، یا اپنا کوڈ لکھتی ہیں۔ کیوسک ان کا نام دکھاتا ہے اور یہ کہ یہ آمد کی حاضری ہوگی یا روانگی کی۔',
      },
      do: async h => {
        await h.fill({ css: '#codeInput' }, 'AJM-FA-00002', { delay: 70 });
        await h.wait(700);
        await h.point({ css: '#empPreview' }, { hold: 1400 });
      },
    },
    {
      say: {
        en: 'She taps Punch In. The green panel confirms it: Punch In Recorded, with her name, the time, her department and this gate.',
        ur: 'وہ "Punch In" پر ٹیپ کرتی ہیں۔ سبز پینل تصدیق کرتا ہے: "Punch In Recorded"، ان کے نام، وقت، شعبے اور اس گیٹ کے ساتھ۔',
      },
      do: async h => {
        await h.click({ css: '#punchBtn' }, { after: 1300 });
        await h.point({ css: '#resultCard' }, { hold: 1800 });
      },
    },
    {
      say: {
        en: 'Recent Transactions lists the last punches here, and on the right you see who is in and since when, and every punch and sync. If Fatima punches again later, it becomes a punch out, and the kiosk asks for the reason.',
        ur: '"Recent Transactions" میں یہاں کی آخری حاضریاں ہیں، اور دائیں طرف نظر آتا ہے کہ کون اندر ہے اور کب سے، اور ہر حاضری اور ہم آہنگی۔ اگر فاطمہ بعد میں دوبارہ حاضری لگائیں تو یہ روانگی بن جاتی ہے، اور کیوسک وجہ پوچھتا ہے۔',
      },
      do: async h => {
        await h.point({ css: '#todayFeed .feed-row' }, { hold: 1200 });
        await h.point({ css: '#dirList' }, { hold: 1200 });
        await h.point({ css: '#eventLog' }, { hold: 1200 });
      },
    },
    {
      say: {
        en: 'Now the settings, for IT staff. Click the gear button. Server Registration shows that this kiosk is registered for AlJannat Mall, and the server it uses: https colon slash slash headoffice.',
        ur: 'اب سیٹنگز، آئی ٹی عملے کے لیے۔ گیئر والے بٹن پر کلک کریں۔ "Server Registration" بتاتا ہے کہ یہ کیوسک الجنت مال کے لیے رجسٹرڈ ہے، اور یہ کون سا سرور استعمال کرتا ہے: https://headoffice ۔',
      },
      caption: {
        en: 'Now the settings, for IT staff. Click the gear button. Server Registration shows this kiosk is registered for AlJannat Mall, and the server it uses: https://headoffice.',
        ur: 'اب سیٹنگز، آئی ٹی عملے کے لیے۔ گیئر والے بٹن پر کلک کریں۔ "Server Registration" بتاتا ہے کہ یہ کیوسک الجنت مال کے لیے رجسٹرڈ ہے، اور اس کا سرور: https://headoffice ۔',
      },
      do: async h => {
        await h.click({ css: '#settingsBtn' }, { after: 1200 });
        await h.point({ css: '#stRegStatus' }, { hold: 1200 });
        await h.point({ css: '#stRegServer' }, { hold: 1200 });
      },
    },
    {
      say: {
        en: 'A new kiosk is not registered yet. It shows a red banner, and it cannot download employees or send punches until it is registered.',
        ur: 'نیا کیوسک ابھی رجسٹرڈ نہیں ہوتا۔ اس پر سرخ بینر نظر آتا ہے، اور رجسٹر ہونے تک یہ نہ ملازمین ڈاؤن لوڈ کر سکتا ہے نہ حاضریاں بھیج سکتا ہے۔',
      },
      do: async h => {
        await h.click({ css: '#settingsClose' }, { after: 500 });
        await h.page.evaluate(() => window.__kioskMock.setRegistered(false));
        await h.click({ css: '#syncBtn' }, { after: 1500 });
        await h.point({ css: '#regBanner' }, { hold: 1600 });
      },
    },
    {
      say: {
        en: 'Click Register now. The easiest way is a setup code: an administrator creates it in the web portal under Kiosk Terminals. Paste it, and the kiosk shows which company and server it belongs to.',
        ur: '"Register now" پر کلک کریں۔ سب سے آسان طریقہ سیٹ اپ کوڈ ہے: ایڈمنسٹریٹر اسے ویب پورٹل میں "Kiosk Terminals" سے بناتا ہے۔ اسے پیسٹ کریں، تو کیوسک دکھاتا ہے کہ یہ کس کمپنی اور سرور کا ہے۔',
      },
      do: async h => {
        await h.click({ css: '#regBannerBtn' }, { after: 1200 });
        await h.point({ css: '#stRegSetupCode' }, { hold: 400 });
        await h.page.locator('#stRegSetupCode').fill(SETUP_CODE); // pasted, as from an e-mail
        await h.page.locator('#stRegSetupCode').dispatchEvent('input');
        await h.wait(500);
        await h.point({ css: '#stRegCodePreview' }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'The other way is a kiosk account. Choose Kiosk account email and password, and type the server address. On the office network that can be an address like 192.168.86.83:8080; otherwise use the full name, such as https colon slash slash headoffice.',
        ur: 'دوسرا طریقہ کیوسک اکاؤنٹ ہے۔ "Kiosk account email & password" منتخب کریں، اور سرور کا ایڈریس لکھیں۔ دفتر کے نیٹ ورک پر یہ 192.168.86.83:8080 جیسا ایڈریس ہو سکتا ہے؛ ورنہ پورا نام لکھیں، مثلاً https://headoffice ۔',
      },
      caption: {
        en: 'The other way is a kiosk account: choose "Kiosk account email & password" and type the server address, e.g. 192.168.86.83:8080 on the office network, or https://headoffice.',
        ur: 'دوسرا طریقہ کیوسک اکاؤنٹ ہے: "Kiosk account email & password" منتخب کریں اور سرور کا ایڈریس لکھیں، مثلاً دفتر کے نیٹ ورک پر 192.168.86.83:8080، یا https://headoffice ۔',
      },
      do: async h => {
        await h.click({ css: 'label.reg-method:has(#stRegMethodAccount)' }, { after: 700 });
        await h.fill({ css: '#stRegServerUrl' }, '192.168.86.83:8080', { delay: 60 });
        await h.point(inDialog('#stRegAccountFields .form-help'), { hold: 1200 });
      },
    },
    {
      say: {
        en: 'Then the email and password of a user with the Kiosk Terminal role. The password is used once and not kept. Click Register this kiosk.',
        ur: 'پھر ایسے یوزر کا ای میل اور پاس ورڈ جس کا رول "Kiosk Terminal" ہو۔ پاس ورڈ صرف ایک بار استعمال ہوتا ہے اور محفوظ نہیں رکھا جاتا۔ "Register this kiosk" پر کلک کریں۔',
      },
      do: async h => {
        await h.fill({ css: '#stRegEmail' }, 'kiosk.gate1@aljannatmall.local', { delay: 35 });
        await h.fill({ css: '#stRegPassword' }, 'Gate1-Kiosk-2026', { delay: 40 });
        await h.click({ css: '#stRegister' }, { after: 1800 });
        await h.point({ css: '#stRegServer' }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Under Terminal Configuration, give the kiosk a Terminal ID and a location, and choose its branch. The branch decides which employees and fingerprints are kept on this PC.',
        ur: '"Terminal Configuration" میں کیوسک کو "Terminal ID" اور جگہ کا نام دیں، اور اس کی برانچ منتخب کریں۔ برانچ طے کرتی ہے کہ کون سے ملازمین اور فنگر پرنٹس اس کمپیوٹر پر رکھے جائیں۔',
      },
      do: async h => {
        await h.scrollTo({ css: '#stTerminalId' });
        await h.point({ css: '#stTerminalId' }, { hold: 900 });
        await h.fill({ css: '#stLocation' }, 'Main Entrance Gate-1 (Ground Floor)', { delay: 35 });
        await h.point({ css: '#stBranchId' }, { hold: 1100 });
      },
    },
    {
      say: {
        en: 'Under Camera, choose the camera source: the webcam on this PC, or up to two network cameras, for example one at the entrance and one at the exit.',
        ur: '"Camera" میں کیمرے کا ذریعہ منتخب کریں: اس کمپیوٹر کا ویب کیم، یا زیادہ سے زیادہ دو نیٹ ورک کیمرے، مثلاً ایک داخلی اور ایک خارجی دروازے پر۔',
      },
      do: async h => {
        await h.scrollTo({ css: '#stCameraSource' });
        await h.select({ css: '#stCameraSource' }, 'IP camera(s) (network camera, up to two)');
        await h.wait(900);
        await h.point({ css: '#stIpCameraFields .cam-fieldset' }, { hold: 1400 });
        await h.select({ css: '#stCameraSource' }, 'Webcam (USB or built-in camera on this PC)');
      },
    },
    {
      say: {
        en: 'Finally click Save Settings. The kiosk syncs with the server and confirms that the settings were saved.',
        ur: 'آخر میں "Save Settings" پر کلک کریں۔ کیوسک سرور سے ہم آہنگ ہوتا ہے اور تصدیق کرتا ہے کہ سیٹنگز محفوظ ہو گئیں۔',
      },
      do: async h => {
        await h.click({ css: '#stSave' }, { after: 1600 });
        await h.point({ css: '#resultCard' }, { hold: 1500 });
      },
    },
  ],
};
