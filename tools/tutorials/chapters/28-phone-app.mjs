// Chapter 28: the Android phone app, shown inside a phone frame (tools/tutorials/sim/phone.html).
//
// How it is simulated (nothing is installed, no real phone):
// - The phone page is served at <demo server>/__tutorial/phone.html (Playwright route), the same origin as the app,
//   because the server's CSP only lets the app be framed by itself. Its iframe loads the normal web build.
// - sim/phone-native.js (initScript) makes the framed app behave like the Capacitor build: window.Capacitor, a GPS
//   fix in Lahore, the fingerprint prompt and a drawn front-camera picture.
// - The connection code points at https://hr.aljannatmall.pk; requests to that address are answered by the demo
//   server (with CORS headers, like a real company server). Saves (attendance, leave) are acknowledged but NOT
//   written, so the chapter can be recorded again and again without changing the demo data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sim = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sim');
const COMPANY = 'https://hr.aljannatmall.pk';
const CODE = 'HRM1.eyJ2IjoxLCJuIjoiQWxKYW5uYXQgTWFsbCIsInUiOlsiaHR0cHM6Ly9oci5hbGphbm5hdG1hbGwucGsiXX0';
const app = page => page.frameLocator('#app');
const inApp = fn => page => fn(app(page));
// Scrolls the app's own scrolling panel inside the phone.
const scrollApp = async (h, top) => {
  await app(h.page).locator('#mob-screen-scroll').evaluate((el, y) => el.scrollTo({ top: y, behavior: 'smooth' }), top).catch(() => undefined);
  await h.wait(700);
};

export default {
  id: '28',
  slug: 'Phone-App',
  as: 'none',
  title: { en: 'The phone app', ur: 'فون ایپ' },
  subtitle: {
    en: 'Connect the Android app to your company, sign in, mark attendance on duty, and see your leave and payslips.',
    ur: 'اینڈرائیڈ ایپ کو اپنی کمپنی سے جوڑیں، لاگ ان کریں، ڈیوٹی پر حاضری لگائیں، اور اپنی چھٹیاں اور پے سلپس دیکھیں۔',
  },
  audience: { en: ['Employees', 'Field staff'], ur: ['ملازمین', 'فیلڈ عملہ'] },
  intro: {
    en: 'The phone app is for employees, especially staff on field duty. One app serves every company: on first use you connect it to your own company with a code from HR.',
    ur: 'فون ایپ ملازمین کے لیے ہے، خاص طور پر فیلڈ ڈیوٹی والے عملے کے لیے۔ ایک ہی ایپ ہر کمپنی کے لیے ہے: پہلی بار استعمال پر آپ اسے ایچ آر کے دیے ہوئے کوڈ سے اپنی کمپنی سے جوڑتے ہیں۔',
  },
  initScript: { content: fs.readFileSync(path.join(sim, 'phone-native.js'), 'utf8') },
  open: async (page, { baseUrl }) => {
    const origin = new URL(baseUrl).origin;
    await page.route('**/__tutorial/phone.html', route => route.fulfill({ path: path.join(sim, 'phone.html'), contentType: 'text/html; charset=utf-8' }));
    await page.route(`${COMPANY}/**`, async route => {
      const req = route.request();
      const cors = {
        'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true',
        'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': '*',
      };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (req.method() !== 'GET' && req.url().includes('/api/documents/')) return route.fulfill({ status: 204, headers: cors });
      // A dropped connection must not crash the recorder: retry once, then fail just this request.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await route.fetch({ url: req.url().replace(COMPANY, origin), headers: { ...req.headers(), origin } });
          return await route.fulfill({ response, headers: { ...response.headers(), ...cors } });
        } catch { await new Promise(resolve => setTimeout(resolve, 400)); }
      }
      return route.abort('connectionreset').catch(() => undefined);
    });
    await page.goto(new URL('__tutorial/phone.html', baseUrl).toString());
    await app(page).locator('#connection-code').waitFor({ timeout: 20000 });
  },
  steps: [
    {
      say: {
        en: 'Install the AlJannat Mall HR app from the link HR sends you. HR also sends a connection code, which starts with H R M 1.',
        ur: 'ایچ آر کے بھیجے ہوئے لنک سے "AlJannat Mall HR" ایپ انسٹال کریں۔ ایچ آر ایک کنکشن کوڈ بھی بھیجتا ہے، جو HRM1 سے شروع ہوتا ہے۔',
      },
      caption: {
        en: 'Install the AlJannat Mall HR app from the link HR sends you. HR also sends a connection code that starts with HRM1.',
        ur: 'ایچ آر کے بھیجے ہوئے لنک سے "AlJannat Mall HR" ایپ انسٹال کریں۔ ایچ آر ایک کنکشن کوڈ بھی بھیجتا ہے جو HRM1 سے شروع ہوتا ہے۔',
      },
      do: async h => { await h.point({ css: '#connection-code-text' }, { hold: 2200 }); },
    },
    {
      say: {
        en: 'The first time you open the app, it asks you to connect to your company. Copy the code and paste it into the box.',
        ur: 'پہلی بار ایپ کھولنے پر یہ آپ سے کمپنی سے جڑنے کو کہتی ہے۔ کوڈ کاپی کر کے اس خانے میں پیسٹ کریں۔',
      },
      do: async h => {
        await h.point(inApp(f => f.getByText('Connect to your company')), { hold: 900 });
        await h.fill(inApp(f => f.locator('#connection-code')), CODE, { delay: 8 });
      },
    },
    {
      say: {
        en: 'The app reads the code and shows the company name and its server, so you can check it is the right company. Then tap Connect.',
        ur: 'ایپ کوڈ پڑھ کر کمپنی کا نام اور اس کا سرور دکھاتی ہے، تاکہ آپ تسلی کر لیں کہ کمپنی درست ہے۔ پھر "Connect" پر ٹیپ کریں۔',
      },
      do: async h => {
        await h.point(inApp(f => f.getByText('hr.aljannatmall.pk')), { hold: 1500 });
        await h.click(inApp(f => f.getByRole('button', { name: 'Connect' })), { after: 1500 });
        // The app reloads after connecting; wait until the sign-in form has settled before typing into it.
        await app(h.page).locator('input[type=password]').waitFor({ timeout: 20000 });
        await h.page.waitForLoadState('networkidle').catch(() => undefined);
        await h.wait(1500);
      },
    },
    {
      say: {
        en: 'The phone remembers the company, so this happens only once. Now sign in with the email and password HR gave you.',
        ur: 'فون کمپنی کو یاد رکھتا ہے، اس لیے یہ کام صرف ایک بار ہوتا ہے۔ اب ایچ آر کے دیے ہوئے ای میل اور پاس ورڈ سے لاگ ان کریں۔',
      },
      do: async h => {
        await h.fill(inApp(f => f.locator('input').first()), 'usman.tariq@example.com', { delay: 35 });
        await h.fill(inApp(f => f.locator('input[type=password]')), 'AlJannat-Demo-2026', { delay: 45 });
      },
    },
    {
      say: {
        en: 'Tap Sign In to System.',
        ur: '"Sign In to System" پر ٹیپ کریں۔',
      },
      do: async h => {
        await h.click(inApp(f => f.getByRole('button', { name: /Sign In to System/ })), { after: 1500 });
        await h.visible(inApp(f => f.getByText(/Assalam-o-Alaikum/)), 20000);
        await h.wait(800);
      },
    },
    {
      say: {
        en: 'This is the home screen. It shows today\'s attendance status, your leave, and the latest messages from HR.',
        ur: 'یہ ہوم اسکرین ہے۔ اس پر آج کی حاضری کی صورتحال، آپ کی چھٹیاں، اور ایچ آر کے تازہ پیغامات نظر آتے ہیں۔',
      },
      do: async h => {
        await h.point(inApp(f => f.getByText(/^today'?s status$/i)), { hold: 1400 });
        await h.point(inApp(f => f.getByText(/^leave used$/i)), { hold: 1000 });
        await scrollApp(h, 260);
        await h.point(inApp(f => f.getByText(/^notifications$/i)), { hold: 800 });
      },
    },
    {
      say: {
        en: 'Attendance on the phone is only for staff whom HR has put on mobile duty. Usman does market duty, and his assignment is shown here.',
        ur: 'فون سے حاضری صرف اس عملے کے لیے ہے جسے ایچ آر نے موبائل ڈیوٹی پر لگایا ہو۔ عثمان مارکیٹ ڈیوٹی کرتے ہیں، اور ان کی ڈیوٹی یہاں دکھائی گئی ہے۔',
      },
      do: async h => {
        await scrollApp(h, 4000);
        await h.point(inApp(f => f.getByText(/Assigned Mobile Duty/)), { hold: 2000 });
      },
    },
    {
      say: {
        en: 'Tap Attend at the bottom. Choose what you are recording: Start Day and Finish Day once a day, and Check In and Check Out at every client you visit.',
        ur: 'نیچے "Attend" پر ٹیپ کریں۔ منتخب کریں کہ آپ کیا درج کر رہے ہیں: دن میں ایک بار "Start Day" اور "Finish Day"، اور ہر کلائنٹ کے پاس جاتے ہوئے "Check In" اور "Check Out"۔',
      },
      do: async h => {
        await h.click(inApp(f => f.getByText('Attend', { exact: true })), { after: 1500 });
        await h.point(inApp(f => f.getByRole('button', { name: 'Start Day' })), { hold: 900 });
        await h.point(inApp(f => f.getByRole('button', { name: 'Check In' })), { hold: 900 });
      },
    },
    {
      say: {
        en: 'Write the business reason, for example the shops you are visiting today. A punch is not accepted without it.',
        ur: 'کام کی وجہ لکھیں، مثلاً آج آپ کن دکانوں پر جا رہے ہیں۔ اس کے بغیر حاضری قبول نہیں ہوتی۔',
      },
      do: async h => { await h.fill(inApp(f => f.getByPlaceholder(/Instructions, client purpose/)), 'Visiting retailers in Liberty Market and Gulberg', { delay: 30 }); },
    },
    {
      say: {
        en: 'Then prove it is you: verify your face with the front camera, or use the phone\'s fingerprint. Your GPS location is captured and sent with the punch.',
        ur: 'پھر ثابت کریں کہ یہ آپ ہی ہیں: سامنے والے کیمرے سے چہرے کی تصدیق کریں، یا فون کا فنگر پرنٹ استعمال کریں۔ آپ کی جی پی ایس لوکیشن بھی حاضری کے ساتھ بھیجی جاتی ہے۔',
      },
      caption: {
        en: 'Then prove it is you: verify your face with the front camera, or use the phone\'s fingerprint. Your GPS location (within 100 m) is sent with the punch.',
        ur: 'پھر ثابت کریں کہ یہ آپ ہی ہیں: سامنے والے کیمرے سے چہرے کی تصدیق کریں، یا فون کا فنگر پرنٹ استعمال کریں۔ آپ کی جی پی ایس لوکیشن (100 میٹر کے اندر) بھی ساتھ بھیجی جاتی ہے۔',
      },
      do: async h => {
        await h.point(inApp(f => f.getByRole('button', { name: /Verify Face/ })), { hold: 1200 });
        await h.point(inApp(f => f.getByRole('button', { name: /Biometric/ })), { hold: 1000 });
      },
    },
    {
      say: {
        en: 'Here we use the fingerprint. The phone asks for your finger, and a moment later the attendance is recorded, with the time, the method and the place.',
        ur: 'یہاں ہم فنگر پرنٹ استعمال کر رہے ہیں۔ فون انگلی مانگتا ہے، اور چند لمحوں میں حاضری درج ہو جاتی ہے، وقت، طریقے اور جگہ کے ساتھ۔',
      },
      do: async h => {
        await h.click(inApp(f => f.getByRole('button', { name: /Biometric/ })), { after: 500 });
        await h.visible(inApp(f => f.getByText('Attendance Recorded!')), 15000);
        await scrollApp(h, 400);
        await h.point(inApp(f => f.getByText('Liberty Market, Gulberg III, Lahore')), { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Forgot to punch? Under Missed punch, regularize, give the date and what happened, attach a gate pass or client sign-off if you have one, and send it to your manager.',
        ur: 'حاضری لگانا بھول گئے؟ "Missed punch? Regularize" میں تاریخ اور وجہ لکھیں، اگر گیٹ پاس یا کلائنٹ کی تصدیق ہو تو لگا دیں، اور اپنے مینیجر کو بھیج دیں۔',
      },
      do: async h => {
        await h.click(inApp(f => f.getByRole('button', { name: 'Record Next Action' })), { after: 1200 });
        await scrollApp(h, 4000);
        await h.point(inApp(f => f.getByText(/MISSED PUNCH\? REGULARIZE/i)), { hold: 1200 });
        await h.point(inApp(f => f.getByRole('button', { name: 'File Regularization' })), { hold: 1200 });
      },
    },
    {
      say: {
        en: 'Tap Leave. At the top you see how many days of each leave type are left this year, and your earlier requests with their status.',
        ur: '"Leave" پر ٹیپ کریں۔ اوپر نظر آتا ہے کہ اس سال ہر قسم کی کتنی چھٹیاں باقی ہیں، اور آپ کی پچھلی درخواستیں ان کی صورتحال کے ساتھ۔',
      },
      do: async h => {
        await h.click(inApp(f => f.getByText('Leave', { exact: true })), { after: 1200 });
        await h.point(inApp(f => f.getByText(/^my leave summary$/i)), { hold: 1600 });
      },
    },
    {
      say: {
        en: 'To apply, choose the leave type, the first and last day, and write the reason. Then tap Submit Leave Request, and HR is notified.',
        ur: 'درخواست دینے کے لیے چھٹی کی قسم، پہلا اور آخری دن منتخب کریں اور وجہ لکھیں۔ پھر "Submit Leave Request" پر ٹیپ کریں، ایچ آر کو اطلاع ہو جاتی ہے۔',
      },
      do: async h => {
        await scrollApp(h, 330);
        await h.select(inApp(f => f.locator('select').first()), 'Casual Leave (Paid)');
        await h.fill(inApp(f => f.getByPlaceholder(/Describe your reason/)), 'Family wedding in Faisalabad', { delay: 30 });
        await h.point(inApp(f => f.getByRole('button', { name: 'Submit Leave Request' })), { hold: 1200 });
      },
    },
    {
      say: {
        en: 'Tap Payslip. Choose the month, and the full salary slip opens: earnings, tax, E O B I, provident fund and your net take-home pay.',
        ur: '"Payslip" پر ٹیپ کریں۔ مہینہ منتخب کریں تو پوری تنخواہ کی پرچی کھل جاتی ہے: آمدنی، ٹیکس، ای او بی آئی، پراویڈنٹ فنڈ اور آپ کی خالص تنخواہ۔',
      },
      caption: {
        en: 'Tap Payslip. Choose the month and the full salary slip opens: earnings, tax, EOBI, provident fund and your net take-home pay.',
        ur: '"Payslip" پر ٹیپ کریں۔ مہینہ منتخب کریں تو پوری تنخواہ کی پرچی کھل جاتی ہے: آمدنی، ٹیکس، EOBI، پراویڈنٹ فنڈ اور آپ کی خالص تنخواہ۔',
      },
      do: async h => {
        await h.click(inApp(f => f.getByText('Payslip', { exact: true })), { after: 1200 });
        await h.point(inApp(f => f.locator('select').first()), { hold: 900 });
        await h.point(inApp(f => f.getByText('Net Take-Home')), { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Download PDF saves the payslip so you can keep or share it, and the Urdu button shows the same payslip in Urdu. Only you can see your own payslips.',
        ur: '"Download PDF" سے پے سلپ محفوظ ہو جاتی ہے تاکہ آپ اسے رکھ یا بھیج سکیں، اور اردو والا بٹن یہی پے سلپ اردو میں دکھاتا ہے۔ آپ کی پے سلپ صرف آپ ہی دیکھ سکتے ہیں۔',
      },
      do: async h => {
        await h.point(inApp(f => f.getByRole('button', { name: 'Download PDF' })), { hold: 1200 });
        await h.click(inApp(f => f.getByRole('button', { name: 'اردو' })), { after: 2200 });
        await h.click(inApp(f => f.getByRole('button', { name: 'English' })), { after: 600 });
      },
    },
  ],
};
