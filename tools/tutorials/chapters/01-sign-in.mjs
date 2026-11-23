// Chapter format (all chapters follow it):
//   id, slug (file name), title/subtitle/audience/intro as { en, ur }, as: 'admin' | 'employee' | 'none' (signed in or not),
//   start: page to open, steps: [{ say: { en, ur }, do: async h => {...}, hold?: ms }]
// `say` is spoken and shown as the caption; `do` runs while it is spoken (see lib/helpers.mjs for h.*).
export default {
  id: '01',
  slug: 'Signing-In',
  as: 'none',
  start: '/',
  title: { en: 'Signing in', ur: 'سسٹم میں لاگ ان' },
  subtitle: {
    en: 'Open the system in a browser, sign in safely and keep your account protected.',
    ur: 'براؤزر میں سسٹم کھولیں، محفوظ طریقے سے لاگ ان کریں اور اپنا اکاؤنٹ محفوظ رکھیں۔',
  },
  audience: { en: ['Everyone', 'HR staff', 'Administrators'], ur: ['سب کے لیے', 'ایچ آر عملہ', 'ایڈمنسٹریٹر'] },
  intro: {
    en: 'Welcome to the AlJannat Mall HR and Payroll system. In this first chapter you will learn how to open the system and sign in.',
    ur: 'الجنت مال کے ایچ آر اور پے رول سسٹم میں خوش آمدید۔ اس پہلے باب میں آپ سیکھیں گے کہ سسٹم کیسے کھولنا ہے اور لاگ ان کیسے کرنا ہے۔',
  },
  steps: [
    {
      say: {
        en: 'Open your web browser and type the address your administrator gave you, for example https colon slash slash headoffice. This is the sign-in page.',
        ur: 'اپنا ویب براؤزر کھولیں اور وہ ایڈریس لکھیں جو آپ کے ایڈمنسٹریٹر نے دیا ہے، مثلاً https://headoffice ۔ یہ لاگ ان کا صفحہ ہے۔',
      },
      caption: {
        en: 'Open your browser and type the address your administrator gave you, e.g. https://headoffice. This is the sign-in page.',
        ur: 'اپنا براؤزر کھولیں اور ایڈمنسٹریٹر کا دیا ہوا ایڈریس لکھیں، مثلاً https://headoffice ۔ یہ لاگ ان کا صفحہ ہے۔',
      },
      do: async h => { await h.point({ css: 'form' }, { hold: 1200 }); },
    },
    {
      say: {
        en: 'In Email or Username, type your work email address.',
        ur: 'ای میل یا یوزر نیم کے خانے میں اپنا دفتری ای میل ایڈریس لکھیں۔',
      },
      do: async h => { await h.fill({ placeholder: 'admin@binishaqsoft.com' }, 'hradmin@aljannatmall.local'); },
    },
    {
      say: {
        en: 'Then type your password. Click the eye button if you want to check what you typed.',
        ur: 'پھر اپنا پاس ورڈ لکھیں۔ اگر لکھا ہوا دیکھنا ہو تو آنکھ والے بٹن پر کلک کریں۔',
      },
      do: async h => {
        await h.fill({ css: 'input[type=password]' }, 'AlJannat-Demo-2026', { delay: 70 });
        const eye = h.page.locator('input[type=password] ~ button, input[type=password] + button').first();
        if (await eye.count()) { await h.click(() => eye); await h.wait(900); await h.click(() => h.page.locator('form button[type=button]').nth(1)); }
      },
    },
    {
      say: {
        en: 'Tick Remember me only on your own computer. It keeps you signed in for five days. Never tick it on a shared computer.',
        ur: '"مجھے یاد رکھیں" صرف اپنے ذاتی کمپیوٹر پر منتخب کریں۔ اس سے آپ پانچ دن تک لاگ ان رہتے ہیں۔ مشترکہ کمپیوٹر پر اسے کبھی منتخب نہ کریں۔',
      },
      do: async h => { await h.point({ text: 'Remember me for 5 days' }, { hold: 1500 }); },
    },
    {
      say: {
        en: 'If you forget your password, click Forgot Password, or ask your administrator to set a new one for you.',
        ur: 'اگر پاس ورڈ بھول جائیں تو "Forgot Password" پر کلک کریں، یا اپنے ایڈمنسٹریٹر سے نیا پاس ورڈ لگوائیں۔',
      },
      do: async h => { await h.point('Forgot Password?', { hold: 1500 }); },
    },
    {
      say: {
        en: 'Now click Sign In to System.',
        ur: 'اب "Sign In to System" پر کلک کریں۔',
      },
      do: async h => { await h.click('Sign In to System', { after: 2500 }); },
    },
    {
      say: {
        en: 'You are in. At the top right you can see who is signed in. Accounts with access to salaries are asked to switch on two-step verification, which we cover in the security chapter.',
        ur: 'آپ سسٹم میں داخل ہو گئے۔ اوپر دائیں طرف نظر آتا ہے کہ کون لاگ ان ہے۔ جن اکاؤنٹس کو تنخواہوں تک رسائی ہے انہیں دو مرحلوں والی تصدیق آن کرنے کا کہا جاتا ہے، جو ہم سیکیورٹی والے باب میں دیکھیں گے۔',
      },
      do: async h => { await h.point({ text: 'hradmin@aljannatmall.local' }, { hold: 2000 }); },
    },
    {
      say: {
        en: 'When you finish work, always click Logout. The system also signs you out by itself after thirty minutes without activity.',
        ur: 'کام ختم کرنے کے بعد ہمیشہ "Logout" پر کلک کریں۔ تیس منٹ تک کوئی کام نہ ہو تو سسٹم خود بھی آپ کو لاگ آؤٹ کر دیتا ہے۔',
      },
      do: async h => { await h.point('Logout', { hold: 2200 }); },
    },
  ],
};
