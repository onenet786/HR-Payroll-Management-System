// Chapter 25: importing an old CyberAP system. The screen and the steps are shown; nothing is uploaded,
// connected or imported, and the "remove current data" option stays untouched.
const captionTop = h => h.page.evaluate(() => { const c = document.getElementById('tut-cap'); if (c) { c.style.top = '64px'; c.style.bottom = 'auto'; } });
const captionBottom = h => h.page.evaluate(() => { const c = document.getElementById('tut-cap'); if (c) { c.style.top = ''; c.style.bottom = ''; } });

export default {
  id: '25',
  slug: 'Data-Import-CyberAP',
  as: 'admin',
  start: '/',
  title: { en: 'Data Import (CyberAP)', ur: 'ڈیٹا امپورٹ (سائبر اے پی)' },
  subtitle: {
    en: 'Bring employees, attendance and payroll history over from the old CyberAP system, safely and step by step.',
    ur: 'پرانے سائبر اے پی سسٹم سے ملازمین، حاضری اور پے رول کی ہسٹری محفوظ طریقے سے مرحلہ وار منتقل کریں۔',
  },
  audience: { en: ['Administrators', 'OneNet support'], ur: ['ایڈمنسٹریٹر', 'ون نیٹ سپورٹ'] },
  intro: {
    en: 'Many companies move to this system from CyberAP. Instead of typing everything again, you import a data package from the old system. Let us walk through the screen.',
    ur: 'بہت سی کمپنیاں سائبر اے پی سے اس سسٹم پر آتی ہیں۔ سب کچھ دوبارہ لکھنے کے بجائے آپ پرانے سسٹم سے ایک ڈیٹا پیکج امپورٹ کرتے ہیں۔ آئیے اسکرین دیکھتے ہیں۔',
  },
  steps: [
    {
      say: {
        en: 'Open Setup and Administration and click Data Import, CyberAP. It moves employees, attendance history and payroll history from your old CyberAP system. Every step is recorded in the audit log.',
        ur: '"Setup & Administration" کھولیں اور "Data Import (CyberAP)" پر کلک کریں۔ یہ ملازمین، حاضری کی ہسٹری اور پے رول کی ہسٹری آپ کے پرانے سائبر اے پی سسٹم سے منتقل کرتا ہے۔ ہر قدم آڈٹ لاگ میں درج ہوتا ہے۔',
      },
      caption: {
        en: 'Open Setup & Administration and click Data Import (CyberAP). It moves employees, attendance history and payroll history from your old CyberAP system. Every step is recorded in the audit log.',
        ur: '"Setup & Administration" کھولیں اور "Data Import (CyberAP)" پر کلک کریں۔ یہ ملازمین، حاضری اور پے رول کی ہسٹری پرانے سائبر اے پی سسٹم سے منتقل کرتا ہے۔ ہر قدم آڈٹ لاگ میں درج ہوتا ہے۔',
      },
      do: async h => {
        await h.nav('Setup & Administration', 'Data Import (CyberAP)');
        await h.point({ text: 'Data import from CyberAP' }, { hold: 1000 });
        await h.point({ text: 'Every step is recorded in the audit log' }, { hold: 1200 });
      },
    },
    {
      say: {
        en: 'Step one is the package, the old data in one file. The usual way: on the PC that runs CyberAP\'s SQL Server, run the script Export CyberAP dot P S 1. It makes a file ending in dot cyberap dot G Z. Upload it here with Choose package.',
        ur: 'پہلا مرحلہ پیکج ہے، یعنی پرانا ڈیٹا ایک فائل میں۔ عام طریقہ: جس کمپیوٹر پر سائبر اے پی کا ایس کیو ایل سرور چلتا ہے وہاں اسکرپٹ "ایکسپورٹ سائبر اے پی" چلائیں۔ یہ ڈاٹ سائبر اے پی ڈاٹ جی زیڈ والی ایک فائل بناتا ہے۔ اسے یہاں "Choose package" سے اپ لوڈ کریں۔',
      },
      caption: {
        en: 'Step 1 is the package: the old data in one file. Usually you run Export-CyberAP.ps1 on the PC with CyberAP\'s SQL Server; it makes a .cyberap.gz file. Upload it here with Choose package.',
        ur: 'پہلا مرحلہ پیکج ہے۔ عام طور پر سائبر اے پی کے ایس کیو ایل سرور والے کمپیوٹر پر Export-CyberAP.ps1 چلائیں؛ یہ ‎.cyberap.gz‎ فائل بناتا ہے۔ اسے یہاں "Choose package" سے اپ لوڈ کریں۔',
      },
      do: async h => {
        await h.point({ text: '1 · Package' }, { hold: 900 });
        await h.point({ text: 'Choose package (.cyberap.gz)' }, { hold: 1800 });
      },
    },
    {
      say: {
        en: 'If the server can reach that SQL Server, there is a shorter way: Create package from SQL Server. It only reads CyberAP and never changes it.',
        ur: 'اگر سرور اُس ایس کیو ایل سرور تک پہنچ سکتا ہو تو ایک مختصر راستہ ہے: "Create package from SQL Server"۔ یہ سائبر اے پی کو صرف پڑھتا ہے، کبھی تبدیل نہیں کرتا۔',
      },
      do: async h => {
        await h.point({ text: 'Reads CyberAP directly from SQL Server. Read-only: CyberAP is not changed.' }, { hold: 1000 });
        await h.click('Create package from SQL Server', { after: 900 });
      },
    },
    {
      say: {
        en: 'Enter the SQL Server instance, for example dot backslash SQL EXPRESS, choose how to sign in, and give the login. Connect and list databases then shows the databases. You pick the CyberAP one, optionally a start date for attendance, and create the package.',
        ur: 'ایس کیو ایل سرور کا نام لکھیں، مثلاً ڈاٹ بیک سلیش ایس کیو ایل ایکسپریس، لاگ ان کا طریقہ چنیں اور لاگ ان دیں۔ "Connect and list databases" ڈیٹا بیسز کی فہرست دکھاتا ہے۔ آپ سائبر اے پی والا ڈیٹا بیس چنتے ہیں، چاہیں تو حاضری کی شروع کی تاریخ دیتے ہیں، اور پیکج بنا لیتے ہیں۔',
      },
      caption: {
        en: 'Enter the SQL Server instance (e.g. .\\SQLEXPRESS), choose how to sign in and give the login. Connect and list databases shows the databases: pick the CyberAP one, optionally an attendance start date, and create the package.',
        ur: 'ایس کیو ایل سرور کا نام لکھیں (مثلاً ‎.\\SQLEXPRESS‎)، لاگ ان کا طریقہ چنیں اور لاگ ان دیں۔ "Connect and list databases" سے سائبر اے پی والا ڈیٹا بیس چنیں، چاہیں تو حاضری کی تاریخ دیں، اور پیکج بنائیں۔',
      },
      do: async h => {
        await h.fill({ placeholder: '.\\SQLEXPRESS' }, '.\\SQLEXPRESS', { delay: 70 });
        await h.point('SQL login', { hold: 700 });
        await h.point('Windows (service account)', { hold: 700 });
        const login = h.page.getByPlaceholder('sa');
        if (await login.count()) await h.fill({ placeholder: 'sa' }, 'cyberap_reader', { delay: 50 });
        await h.point('Connect and list databases', { hold: 1500 });
      },
    },
    {
      say: {
        en: 'We will not connect in this demonstration. Click Close.',
        ur: 'اس مظاہرے میں ہم کنکشن نہیں کریں گے۔ "Close" پر کلک کریں۔',
      },
      do: async h => { await h.click({ role: 'button', name: 'Close', exact: true }, { after: 700 }); },
    },
    {
      say: {
        en: 'Step two: always click Analyse, no changes, first. It reads the package and reports how many employees, attendance days and payslips it found, and any problems, without changing anything.',
        ur: 'دوسرا مرحلہ: ہمیشہ پہلے "Analyse (no changes)" پر کلک کریں۔ یہ پیکج پڑھ کر بتاتا ہے کہ کتنے ملازمین، حاضری کے دن اور پے سلپس ملیں اور کوئی مسئلہ ہے تو کیا، بغیر کچھ تبدیل کیے۔',
      },
      caption: {
        en: 'Step 2: always click Analyse (no changes) first. It reads the package and reports how many employees, attendance days and payslips it found, and any problems, without changing anything.',
        ur: 'دوسرا مرحلہ: ہمیشہ پہلے "Analyse (no changes)" پر کلک کریں۔ یہ بتاتا ہے کہ کتنے ملازمین، حاضری کے دن اور پے سلپس ملیں اور کیا مسائل ہیں، بغیر کچھ تبدیل کیے۔',
      },
      do: async h => {
        await captionTop(h); // the step 2 buttons sit where the caption bar normally is
        await h.point({ text: '2 · Analyse and import' }, { hold: 800 });
        await h.point('Analyse (no changes)', { hold: 2000 });
      },
    },
    {
      say: {
        en: 'When the analysis looks right, Import, keep current data, adds the old records next to what is already here. A full backup is taken before the import starts.',
        ur: 'جب تجزیہ درست لگے تو "Import (keep current data)" پرانا ریکارڈ موجودہ ڈیٹا کے ساتھ شامل کر دیتا ہے۔ امپورٹ شروع ہونے سے پہلے پورا بیک اپ لیا جاتا ہے۔',
      },
      do: async h => { await h.point('Import (keep current data)', { hold: 2200 }); },
    },
    {
      say: {
        en: 'Remove all current data first is only for a brand-new setup that has nothing but test data. Once salaries have been paid or a month locked, as here, it is locked, so real records can never be wiped by mistake.',
        ur: '"Remove all current data first" صرف بالکل نئے سیٹ اپ کے لیے ہے جس میں صرف آزمائشی ڈیٹا ہو۔ تنخواہیں ادا ہونے یا کوئی مہینہ لاک ہونے کے بعد، جیسے یہاں، یہ لاک ہو جاتا ہے، تاکہ اصل ریکارڈ کبھی غلطی سے مٹ نہ سکے۔',
      },
      do: async h => {
        await h.point({ text: 'Remove all current data first' }, { hold: 1300 });
        await h.point({ text: /^Live since/ }, { hold: 1600 });
      },
    },
    {
      say: {
        en: 'After the import, the old system\'s own tables stay readable in Reports, under CyberAP Archive, and each import run is listed in the Audit reports. OneNet support switches this screen on for the import and off again after go-live, from the vendor console.',
        ur: 'امپورٹ کے بعد پرانے سسٹم کے اپنے ٹیبل "Reports" میں "CyberAP Archive" کے تحت پڑھے جا سکتے ہیں، اور ہر امپورٹ "Audit Reports" میں درج ہوتا ہے۔ ون نیٹ سپورٹ یہ اسکرین امپورٹ کے لیے وینڈر کنسول سے آن کرتی ہے اور لائیو ہونے کے بعد بند کر دیتی ہے۔',
      },
      do: async h => {
        await captionBottom(h);
        await h.nav('Reports', 'CyberAP Archive');
        await h.point({ text: 'CyberAP archive', exact: true }, { hold: 1800 });
      },
      hold: 900,
    },
  ],
};
