// Chapter 24: Data Backup screen: database health and optimisation, downloading a backup, the restore and cleanup
// concepts (shown, never run), and the nightly server backups.
const toTop = async (h, target) => { const loc = await h.resolve(target); await loc.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'start' })); await h.wait(800); };

export default {
  id: '24',
  slug: 'Data-Backup',
  as: 'admin',
  start: '/',
  title: { en: 'Data Backup & Database Maintenance', ur: 'ڈیٹا بیک اپ اور ڈیٹا بیس کی دیکھ بھال' },
  subtitle: {
    en: 'Keep a copy of your data, know how a restore works, and keep the database fast.',
    ur: 'اپنے ڈیٹا کی کاپی رکھیں، ری اسٹور کا طریقہ سمجھیں، اور ڈیٹا بیس کو تیز رکھیں۔',
  },
  audience: { en: ['Administrators', 'IT staff'], ur: ['ایڈمنسٹریٹر', 'آئی ٹی عملہ'] },
  intro: {
    en: 'Your payroll and attendance records are valuable. This chapter shows how the system protects them with backups, and how to keep the database in good health.',
    ur: 'آپ کا پے رول اور حاضری کا ریکارڈ قیمتی ہے۔ یہ باب دکھاتا ہے کہ سسٹم بیک اپ کے ذریعے اس کی حفاظت کیسے کرتا ہے، اور ڈیٹا بیس کو اچھی حالت میں کیسے رکھا جاتا ہے۔',
  },
  // The health panel reads database statistics from the server; open the screen behind the title card so the
  // figures are there when the first step starts.
  setup: async h => { await h.nav('Setup & Administration', 'Data Backup'); await h.visible({ text: 'Database size' }, 60000).catch(() => undefined); },
  steps: [
    {
      say: {
        en: 'Open Setup and Administration and click Data Backup. At the top is Database health and optimisation: the size of the database, the number of records, unused space left by old row versions, and the memory the database uses.',
        ur: '"Setup & Administration" کھولیں اور "Data Backup" پر کلک کریں۔ سب سے اوپر "Database health & optimisation" ہے: ڈیٹا بیس کا سائز، ریکارڈز کی تعداد، پرانی قطاروں کی چھوڑی ہوئی خالی جگہ، اور ڈیٹا بیس کے استعمال کی میموری۔',
      },
      do: async h => {
        await h.nav('Setup & Administration', 'Data Backup');
        await h.visible({ text: 'Database size' }, 60000);
        await h.point({ text: 'Database size' }, { hold: 900 });
        await h.point({ text: 'Unused space (old row versions)' }, { hold: 1100 });
        await h.point({ text: 'Memory for the database' }, { hold: 900 });
      },
    },
    {
      say: {
        en: 'You rarely need to do anything here. A quick optimisation runs every night after the backup, and a deep one on the first Sunday of each month.',
        ur: 'یہاں عام طور پر کچھ کرنے کی ضرورت نہیں ہوتی۔ ہر رات بیک اپ کے بعد "quick" آپٹیمائزیشن خود چلتی ہے، اور ہر مہینے کے پہلے اتوار کو "deep" آپٹیمائزیشن۔',
      },
      do: async h => { await h.point({ text: /^Quick optimisation runs every night/ }, { hold: 2200 }); },
    },
    {
      say: {
        en: 'You can also run them by hand. Quick optimise is safe while people are working. Click it, and the result appears below with the size before and after.',
        ur: 'آپ انہیں خود بھی چلا سکتے ہیں۔ "Quick optimise" لوگوں کے کام کے دوران بھی محفوظ ہے۔ اس پر کلک کریں، نتیجہ نیچے پہلے اور بعد کے سائز کے ساتھ آ جاتا ہے۔',
      },
      do: async h => {
        await h.click('Quick optimise', { after: 1200 });
        await h.visible({ text: /optimisation:/ }, 10000).catch(() => undefined);
        await h.point({ text: /optimisation:/ }, { hold: 800 }).catch(() => undefined);
        await h.visible({ text: /optimisation finished/ }, 40000).catch(() => undefined);
        await h.point({ text: /optimisation finished/ }, { hold: 1300 }).catch(() => undefined);
      },
    },
    {
      say: {
        en: 'Deep optimise shrinks the database. It takes a backup first and locks each table briefly, so it asks you to confirm. Run it outside working hours. Here we click Cancel.',
        ur: '"Deep optimise" ڈیٹا بیس کو چھوٹا کرتا ہے۔ یہ پہلے بیک اپ لیتا ہے اور ہر ٹیبل کو تھوڑی دیر کے لیے لاک کرتا ہے، اس لیے تصدیق مانگتا ہے۔ اسے کام کے اوقات کے بعد چلائیں۔ یہاں ہم "Cancel" پر کلک کرتے ہیں۔',
      },
      do: async h => {
        const deep = h.page.getByRole('button', { name: /Deep optimise/ });
        await deep.and(h.page.locator(':enabled')).waitFor({ timeout: 45000 }).catch(() => undefined); // a quick run still going disables it
        if (await deep.isEnabled()) {
          await h.click(() => deep, { after: 700 });
          await h.point('Back up and deep optimise', { hold: 1500 });
          await h.click(page => page.getByRole('button', { name: 'Cancel', exact: true }).first(), { after: 600 });
        } else await h.point(() => deep, { hold: 1500 });
        await h.point({ text: 'Recent optimisations' }, { hold: 1000 });
      },
    },
    {
      say: {
        en: 'Below is Database Backup and Restore. A safety backup is taken automatically before any cleanup, delete or restore, so nothing is lost by mistake.',
        ur: 'نیچے "Database Backup & Restore" ہے۔ کسی بھی صفائی، حذف یا ری اسٹور سے پہلے خود بخود ایک حفاظتی بیک اپ لیا جاتا ہے، تاکہ غلطی سے کچھ ضائع نہ ہو۔',
      },
      do: async h => {
        await toTop(h, { text: 'Database Backup & Restore' });
        await h.point({ text: 'Safety backup is automatic before cleanup, delete, or restore.' }, { hold: 1800 });
      },
    },
    {
      say: {
        en: 'To keep your own copy, click Backup All Data. A backup file downloads to this computer. Keep it somewhere safe, away from the server, for example on a company USB drive.',
        ur: 'اپنی کاپی رکھنے کے لیے "Backup All Data" پر کلک کریں۔ بیک اپ فائل اس کمپیوٹر پر ڈاؤن لوڈ ہو جاتی ہے۔ اسے سرور سے الگ کسی محفوظ جگہ رکھیں، مثلاً کمپنی کی یو ایس بی ڈرائیو پر۔',
      },
      do: async h => { await h.click('Backup All Data', { after: 2500 }); },
    },
    {
      say: {
        en: 'For a smaller copy, tick only the collections you need in the Collections list, or use the Operational, All and None buttons, then click Backup Selected Collections.',
        ur: 'چھوٹی کاپی کے لیے "Collections" کی فہرست میں صرف ضروری حصے منتخب کریں، یا "Operational"، "All" اور "None" کے بٹن استعمال کریں، پھر "Backup Selected Collections" پر کلک کریں۔',
      },
      do: async h => {
        await h.point('Backup Selected Collections', { hold: 900 });
        await toTop(h, { text: 'Select collections for backup or selected delete.' });
        await h.point('Operational', { hold: 800 });
        await h.point({ role: 'button', name: 'All', exact: true }, { hold: 600 });
        await h.point({ role: 'button', name: 'None', exact: true }, { hold: 600 });
      },
    },
    {
      say: {
        en: 'Restoring puts an old copy back. You choose the backup file, then tick which collections to bring back on the right, type the word RESTORE, and click Restore Backup. Restore only on the advice of your support team, because it replaces today\'s records.',
        ur: 'ری اسٹور پرانی کاپی واپس لگاتا ہے۔ آپ بیک اپ فائل منتخب کرتے ہیں، پھر دائیں طرف چنتے ہیں کہ کون سے حصے واپس لانے ہیں، لفظ "RESTORE" لکھتے ہیں اور "Restore Backup" پر کلک کرتے ہیں۔ ری اسٹور صرف سپورٹ ٹیم کے مشورے سے کریں، کیونکہ یہ آج کا ریکارڈ بدل دیتا ہے۔',
      },
      do: async h => {
        await toTop(h, { text: 'Database Backup & Restore' });
        await h.point({ text: 'Choose Backup File' }, { hold: 1200 });
        await h.point({ text: 'Merge backup without deleting current documents first' }, { hold: 900 });
        await h.point('Restore Backup', { hold: 1200 });
      },
    },
    {
      say: {
        en: 'Clear Operational Data deletes attendance, leave, payroll runs and similar records. It exists only for clearing test data before going live. Never use it on a live system.',
        ur: '"Clear Operational Data" حاضری، چھٹیاں، پے رول اور ایسے ہی ریکارڈ حذف کر دیتا ہے۔ یہ صرف لائیو ہونے سے پہلے آزمائشی ڈیٹا صاف کرنے کے لیے ہے۔ لائیو سسٹم پر اسے کبھی استعمال نہ کریں۔',
      },
      do: async h => { await h.point('Clear Operational Data', { hold: 2200 }); },
    },
    {
      say: {
        en: 'Besides these downloads, the server makes its own encrypted backup of the whole database every night and keeps the last few copies. It is set up during installation, as shown in the installation chapters. Ask your IT team to copy those files off the server regularly.',
        ur: 'ان ڈاؤن لوڈز کے علاوہ سرور ہر رات پورے ڈیٹا بیس کا اپنا خفیہ کردہ بیک اپ بناتا ہے اور آخری چند کاپیاں محفوظ رکھتا ہے۔ یہ انسٹالیشن کے وقت سیٹ ہوتا ہے، جیسا کہ انسٹالیشن کے ابواب میں دکھایا گیا ہے۔ اپنی آئی ٹی ٹیم سے کہیں کہ یہ فائلیں باقاعدگی سے سرور سے باہر کاپی کرے۔',
      },
      do: async h => {
        await toTop(h, { text: 'Database health & optimisation' });
        await h.point({ text: 'Database health & optimisation' }, { hold: 2000 });
      },
      hold: 900,
    },
  ],
};
