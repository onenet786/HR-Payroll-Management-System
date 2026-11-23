// Chapter 33: the OneNet Provider Console (provider/). The real console web app (provider/dist) is recorded with its
// API answered by tools/tutorials/sim/33-provider-mock.mjs, so nothing is provisioned on any server.
// Needs "npm run provider:build" once (provider/dist).
import { installProviderMock, ORIGIN } from '../sim/33-provider-mock.mjs';

const go = (h, hash) => h.page.evaluate(x => { window.location.hash = x; }, hash);
const tab = (h, label) => h.click(p => p.locator('main nav a').filter({ hasText: new RegExp(`^${label.replace(/[&]/g, '\$&')}$`) }), { after: 700 });

export default {
  id: '33',
  slug: 'Provider-Console',
  as: 'none',
  brand: { en: 'OneNet · Provider Console', ur: 'OneNet · Provider Console' },
  title: { en: 'Provider Console: hosting several clients', ur: 'پرووائیڈر کنسول: کئی کلائنٹس کی ہوسٹنگ' },
  subtitle: {
    en: 'Create a hosted client in one form, then manage its domains, licence, kiosks, releases and backups.',
    ur: 'ایک فارم سے ہوسٹڈ کلائنٹ بنائیں، پھر اس کے ڈومین، لائسنس، کیوسک، ریلیز اور بیک اپ سنبھالیں۔',
  },
  audience: { en: ['OneNet staff'], ur: ['ون نیٹ عملہ'] },
  intro: {
    en: 'This chapter is for OneNet staff. The Provider Console runs on our hosting server and manages every hosted client. Each client gets its own database and its own aaPanel Node project, uses one of the shared application releases, and has its domains and licence managed here.',
    ur: 'یہ باب ون نیٹ کے عملے کے لیے ہے۔ پرووائیڈر کنسول ہمارے ہوسٹنگ سرور پر چلتا ہے اور ہر ہوسٹڈ کلائنٹ کو سنبھالتا ہے۔ ہر کلائنٹ کا اپنا ڈیٹا بیس اور اپنا aaPanel Node project ہوتا ہے، وہ مشترکہ ایپلیکیشن ریلیزز میں سے ایک استعمال کرتا ہے، اور اس کے ڈومین اور لائسنس یہیں سے سنبھالے جاتے ہیں۔',
  },
  open: async page => {
    await installProviderMock(page);
    await page.goto(`${ORIGIN}/#/`);
    // Room below the content so buttons near the end of a page can be scrolled above the caption bar.
    await page.addStyleTag({ content: 'main > div { padding-bottom: 300px !important; }' });
  },
  steps: [
    {
      say: {
        en: 'The dashboard lists every hosted client with its status, licence, health, staff, kiosks, last backup and address. Needs attention collects what to act on, such as a licence that expires soon or a missing backup.',
        ur: 'ڈیش بورڈ پر ہر ہوسٹڈ کلائنٹ اس کے اسٹیٹس، لائسنس، ہیلتھ، عملے، کیوسک، آخری بیک اپ اور ایڈریس کے ساتھ نظر آتا ہے۔ "Needs attention" میں وہ باتیں جمع ہوتی ہیں جن پر کام کرنا ہے، جیسے جلد ختم ہونے والا لائسنس یا رہ جانے والا بیک اپ۔',
      },
      do: async h => {
        await h.point({ css: 'table tbody tr:nth-child(2)' }, { hold: 1500 });
        await h.point({ text: 'Needs attention', exact: true }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Server and releases shows the hosting setup. Each release is a complete copy of the application, shared by the clients that use it. New client databases are copied from the template database in seconds; refresh it after installing a new release.',
        ur: '"Server & releases" میں ہوسٹنگ کی ترتیب نظر آتی ہے۔ ہر ریلیز ایپلیکیشن کی مکمل کاپی ہے جو اسے استعمال کرنے والے کلائنٹس میں مشترک ہوتی ہے۔ نئے کلائنٹ کا ڈیٹا بیس چند سیکنڈ میں ٹیمپلیٹ ڈیٹا بیس سے کاپی ہوتا ہے؛ نئی ریلیز انسٹال کرنے کے بعد اسے ریفریش کریں۔',
      },
      caption: { en: 'Server & releases: releases (shared app copies), template database (refresh after a new release), aaPanel API status.', ur: '"Server & releases": ریلیزز (مشترکہ کاپیاں)، ٹیمپلیٹ ڈیٹا بیس (نئی ریلیز کے بعد ریفریش)، aaPanel API کی حالت۔' },
      do: async h => {
        await h.click({ css: 'aside a:has-text("Server & releases")' }, { after: 800 });
        await h.point({ text: 'Releases', exact: true }, { hold: 1300 });
        await h.point({ css: 'button:has-text("Refresh template")' }, { hold: 1300 });
      },
    },
    {
      say: {
        en: 'If the aaPanel API is not connected, the console still works: every aaPanel step becomes a checklist with the exact values, and you press Mark done.',
        ur: 'اگر aaPanel API منسلک نہ ہو تب بھی کنسول کام کرتا ہے: ہر aaPanel مرحلہ درست ویلیوز کے ساتھ ایک چیک لسٹ بن جاتا ہے، اور آپ "Mark done" دباتے ہیں۔',
      },
      do: async h => { await h.point({ text: 'Not connected', exact: false }, { hold: 2200 }); },
    },
    {
      say: {
        en: 'Click New client. Type the company name: the address name is filled in by itself, and the hint shows the client\'s system address under binishaqsoft dot com.',
        ur: '"New client" پر کلک کریں۔ کمپنی کا نام لکھیں: ایڈریس کا نام خود بھر جاتا ہے، اور نیچے کلائنٹ کے سسٹم کا ایڈریس binishaqsoft.com کے تحت نظر آتا ہے۔',
      },
      caption: { en: 'New client → Company name. The address name fills in: https://aljannat-mall.binishaqsoft.com', ur: '"New client" ← کمپنی کا نام۔ ایڈریس خود بھر جاتا ہے: https://aljannat-mall.binishaqsoft.com' },
      do: async h => {
        await h.click({ css: 'aside a:has-text("New client")' }, { after: 800 });
        await h.fill({ placeholder: 'e.g. Bin Ishaq Traders' }, 'AlJannat Mall');
        await h.fill({ css: 'label:has-text("Phone") input' }, '042-35714400');
        await h.point({ css: 'label:has-text("Address name") span.block' }, { hold: 1400 });
      },
    },
    {
      say: {
        en: 'Enter the first administrator\'s name and e-mail. A temporary password is created and shown once when the setup finishes.',
        ur: 'پہلے ایڈمنسٹریٹر کا نام اور ای میل لکھیں۔ سیٹ اپ مکمل ہونے پر ایک عارضی پاس ورڈ بنتا ہے اور ایک بار دکھایا جاتا ہے۔',
      },
      do: async h => {
        await h.fill({ css: 'section:has-text("First administrator") label:has-text("Name") input' }, 'Ayesha Khan');
        await h.fill({ css: 'input[type=email]' }, 'hradmin@aljannatmall.com');
      },
    },
    {
      say: {
        en: 'Choose the edition, Full compliance or Lite, then the plan, the licence end date and the active staff limit. Tick the CyberAP import switch if the client\'s IT will move their old data themselves.',
        ur: 'ایڈیشن منتخب کریں، "Full compliance" یا "Lite"، پھر پلان، لائسنس کی آخری تاریخ اور فعال عملے کی حد۔ اگر کلائنٹ کی آئی ٹی اپنا پرانا ڈیٹا خود منتقل کرے گی تو CyberAP امپورٹ والا خانہ منتخب کریں۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'Edition and licence', exact: true });
        await h.point({ text: 'Full compliance', exact: true }, { hold: 700 });
        await h.fill({ placeholder: 'e.g. Lite 15 staff' }, 'Full 250 staff');
        await h.point({ css: 'label:has-text("Licence valid until") input' }, { hold: 600 });
        await h.point({ css: 'label:has-text("Active staff limit") input' }, { hold: 300 });
        await h.page.locator('label:has-text("Active staff limit") input').pressSequentially('250', { delay: 60 });
        await h.check({ css: 'label:has-text("Allow the client") input' });
      },
    },
    {
      say: {
        en: 'Under Technical, the newest ready release is selected. Click Create client.',
        ur: '"Technical" میں سب سے نئی تیار ریلیز منتخب ہوتی ہے۔ "Create client" پر کلک کریں۔',
      },
      do: async h => {
        await h.scrollTo({ css: 'button:has-text("Create client")' });
        await h.point({ css: 'select' }, { hold: 800 });
        await h.click({ css: 'button:has-text("Create client")' }, { after: 600 });
      },
    },
    {
      say: {
        en: 'The setup runs step by step: the database is copied from the template, the client folder and settings are written, the database is brought up to the release, and the company, administrator, edition and licence are saved.',
        ur: 'سیٹ اپ مرحلہ وار چلتا ہے: ڈیٹا بیس ٹیمپلیٹ سے کاپی ہوتا ہے، کلائنٹ کا فولڈر اور سیٹنگز لکھی جاتی ہیں، ڈیٹا بیس ریلیز کے مطابق اپ ڈیٹ ہوتا ہے، اور کمپنی، ایڈمنسٹریٹر، ایڈیشن اور لائسنس محفوظ ہو جاتے ہیں۔',
      },
      do: async h => {
        await h.visible({ text: 'Create the database from the template' });
        await h.point({ text: 'Create the database from the template' }, { hold: 1200 });
        await h.visible({ text: 'Mark done' }, 15000);
      },
    },
    {
      say: {
        en: 'Here the aaPanel API is not connected, so the job waits for you. It lists the exact values for the Node project. Create it in aaPanel, then press Mark done. Do the same for the HTTPS certificate.',
        ur: 'یہاں aaPanel API منسلک نہیں، اس لیے کام آپ کا انتظار کرتا ہے۔ یہ Node project کی بالکل درست ویلیوز دکھاتا ہے۔ اسے aaPanel میں بنائیں، پھر "Mark done" دبائیں۔ HTTPS سرٹیفکیٹ کے لیے بھی یہی کریں۔',
      },
      do: async h => {
        await h.point({ css: 'li:has-text("aaPanel Node project") ul' }, { hold: 2200 });
        await h.scrollTo({ css: 'button:has-text("Mark done")' });
        await h.click('Mark done', { after: 2600 });
        await h.visible({ css: 'li:has-text("HTTPS with the") button:has-text("Mark done")' }, 8000);
        await h.scrollTo({ css: 'li:has-text("HTTPS with the") button:has-text("Mark done")' });
        await h.click({ css: 'li:has-text("HTTPS with the") button:has-text("Mark done")' }, { after: 2600 });
      },
    },
    {
      say: {
        en: 'The installation answers and is live. Click Show password: give the temporary password to the client by phone or in person, then click I have handed it over, so it is deleted.',
        ur: 'انسٹالیشن جواب دے رہی ہے اور لائیو ہے۔ "Show password" پر کلک کریں: عارضی پاس ورڈ کلائنٹ کو فون پر یا خود جا کر دیں، پھر "I have handed it over" پر کلک کریں تاکہ یہ مٹ جائے۔',
      },
      do: async h => {
        await h.visible({ css: 'button:has-text("Show password")' }, 12000);
        await h.scrollTo({ css: 'button:has-text("Show password")' });
        await h.click({ css: 'button:has-text("Show password")' }, { after: 600 });
        await h.point({ css: 'code' }, { hold: 1600 });
        await h.click({ css: 'button:has-text("I have handed it over")' }, { after: 700 });
      },
    },
    {
      say: {
        en: 'Open the client. The overview shows its health, its addresses and the technical details: the aaPanel project, the folder and the database.',
        ur: 'کلائنٹ کھولیں۔ اوور ویو میں اس کی ہیلتھ، ایڈریس اور تکنیکی تفصیل نظر آتی ہے: aaPanel project، فولڈر اور ڈیٹا بیس۔',
      },
      do: async h => {
        await h.click({ text: '← Back to client' }, { after: 1000 });
        await h.point({ text: 'Addresses', exact: true }, { hold: 1000 });
        await h.point({ text: 'aaPanel project', exact: true }, { hold: 1300 });
      },
    },
    {
      say: {
        en: 'In Domains, add the client\'s own domain, for example hr.aljannatmall.com. The console shows the DNS record the client\'s IT must create, and waits until it works. Kiosks and the mobile app always keep the platform address.',
        ur: '"Domains" میں کلائنٹ کا اپنا ڈومین شامل کریں، مثلاً hr.aljannatmall.com۔ کنسول وہ DNS ریکارڈ دکھاتا ہے جو کلائنٹ کی آئی ٹی کو بنانا ہے، اور اس کے کام کرنے تک انتظار کرتا ہے۔ کیوسک اور موبائل ایپ ہمیشہ پلیٹ فارم ایڈریس ہی استعمال کرتے ہیں۔',
      },
      caption: { en: 'Domains → Add domain hr.aljannatmall.com → the client adds CNAME hr.aljannatmall.com → aljannat-mall.binishaqsoft.com.', ur: '"Domains" ← hr.aljannatmall.com شامل کریں ← کلائنٹ CNAME بناتا ہے: hr.aljannatmall.com ← aljannat-mall.binishaqsoft.com۔' },
      do: async h => {
        await tab(h, 'Domains');
        await h.fill({ placeholder: 'hr.company.com' }, 'hr.aljannatmall.com');
        await h.click({ css: 'button:has-text("Add domain")' }, { after: 2600, force: true });
        await h.point({ css: 'li:has-text("DNS points at this server") ul' }, { hold: 1800 });
      },
    },
    {
      say: {
        en: 'Licence and edition holds the plan, the end date, the staff limit and the grace days. Suspend now blocks sign-in at once while kiosks keep recording. Edition features can be switched one by one; then click Save changes.',
        ur: '"Licence & edition" میں پلان، آخری تاریخ، عملے کی حد اور رعایتی دن ہوتے ہیں۔ "Suspend now" فوراً لاگ ان بند کر دیتا ہے جبکہ کیوسک حاضری لیتے رہتے ہیں۔ ایڈیشن کی خصوصیات ایک ایک کر کے آن یا آف کی جا سکتی ہیں؛ پھر "Save changes" پر کلک کریں۔',
      },
      do: async h => {
        await tab(h, 'Licence & edition');
        await h.point({ css: 'label:has-text("Grace days after expiry") input' }, { hold: 900 });
        await h.point({ css: 'button:has-text("Suspend now")' }, { hold: 1200 });
        await h.scrollTo({ text: 'Edition', exact: true });
        await h.point({ text: 'Edition', exact: true }, { hold: 1000 });
      },
    },
    {
      say: {
        en: 'Kiosks and app creates kiosk setup codes. Give a label, the number of kiosks and how long it is valid, and click Create setup code. Copy or print it now, because it is shown once. The mobile app code is shown next to it.',
        ur: '"Kiosks & app" میں کیوسک سیٹ اپ کوڈ بنتے ہیں۔ لیبل، کیوسکوں کی تعداد اور مدت لکھیں اور "Create setup code" پر کلک کریں۔ اسے ابھی کاپی یا پرنٹ کر لیں کیونکہ یہ ایک ہی بار دکھایا جاتا ہے۔ ساتھ ہی موبائل ایپ کا کوڈ بھی ہے۔',
      },
      do: async h => {
        await tab(h, 'Kiosks & app');
        await h.fill({ placeholder: 'e.g. Main gate' }, 'Head Office gate');
        await h.fill({ css: 'label:has-text("Kiosks") input' }, '2');
        await h.click({ css: 'button:has-text("Create setup code")' }, { after: 900 });
        await h.point({ css: 'img[alt="Kiosk setup code"]' }, { hold: 1600 });
      },
    },
    {
      say: {
        en: 'In Releases, switch one client to a new release first: the job takes a safety backup, switches, runs the migrations and restarts. Backups lists the nightly encrypted backups, and Back up now makes one at once.',
        ur: '"Releases" میں پہلے ایک کلائنٹ کو نئی ریلیز پر منتقل کریں: کام حفاظتی بیک اپ لیتا ہے، ریلیز بدلتا ہے، مائیگریشن چلاتا ہے اور ری اسٹارٹ کرتا ہے۔ "Backups" میں رات کے خفیہ بیک اپ نظر آتے ہیں، اور "Back up now" فوراً ایک بیک اپ بنا دیتا ہے۔',
      },
      do: async h => {
        await tab(h, 'Releases');
        await h.point({ css: 'button:has-text("Switch release")' }, { hold: 1400 });
        await tab(h, 'Backups');
        await h.click({ css: 'button:has-text("Back up now")' }, { after: 900 });
        await h.point({ css: 'table tbody tr:first-child' }, { hold: 1200 });
      },
    },
  ],
};
