// Chapter 03: the "My Security" banner, MFA by authenticator app or email, trusted devices and passwords.
// The demo admin must keep its password and stay without MFA: every form is shown and then cancelled.
const side = name => ({ css: `button.side-item:has-text("${name}")` });

export default {
  id: '03',
  slug: 'My-Security',
  as: 'admin',
  start: '/',
  title: { en: 'My security', ur: 'میری سیکیورٹی' },
  subtitle: {
    en: 'Two-step verification by app or email, trusted devices, sessions and passwords.',
    ur: 'ایپ یا ای میل کے ذریعے دو مرحلوں والی تصدیق، قابلِ اعتماد ڈیوائسز، سیشن اور پاس ورڈ۔',
  },
  audience: { en: ['Everyone with an account'], ur: ['ہر اکاؤنٹ والا صارف'] },
  intro: {
    en: 'Your account opens salaries and personal records, so it needs more than a password. This chapter shows how to protect it.',
    ur: 'آپ کے اکاؤنٹ سے تنخواہیں اور ذاتی ریکارڈ کھلتے ہیں، اس لیے صرف پاس ورڈ کافی نہیں۔ یہ باب بتاتا ہے کہ اسے کیسے محفوظ رکھنا ہے۔',
  },
  steps: [
    {
      say: {
        en: 'At the top of every page is the My Security banner. Action needed means two-step verification, also called MFA, is not switched on yet for your account.',
        ur: 'ہر صفحے کے اوپر "My Security" کی پٹی ہوتی ہے۔ "Action needed" کا مطلب ہے کہ آپ کے اکاؤنٹ پر ابھی دو مرحلوں والی تصدیق، یعنی ایم ایف اے، آن نہیں ہوئی۔',
      },
      do: async h => {
        await h.point({ css: 'section[aria-labelledby="my-security-title"]' }, { hold: 1300 });
        await h.point({ text: 'Action needed' }, { hold: 1200 });
      },
    },
    {
      say: {
        en: 'Required for this role means your role can see sensitive data, so MFA is compulsory. With MFA, someone who learns your password still cannot sign in without the second code.',
        ur: '"Required for this role" کا مطلب ہے کہ آپ کا کردار حساس معلومات دیکھ سکتا ہے، اس لیے ایم ایف اے لازمی ہے۔ ایم ایف اے کے بعد اگر کسی کو آپ کا پاس ورڈ معلوم بھی ہو جائے تو وہ دوسرے کوڈ کے بغیر لاگ ان نہیں کر سکتا۔',
      },
      do: async h => { await h.point({ text: 'Required for this role' }, { hold: 2200 }); },
    },
    {
      say: {
        en: 'The banner also explains sessions: you are signed out after thirty minutes without activity, after twelve hours at most, or after five days if you ticked Remember me.',
        ur: 'یہ پٹی سیشن کے بارے میں بھی بتاتی ہے: تیس منٹ تک کوئی کام نہ ہو تو آپ لاگ آؤٹ ہو جاتے ہیں، زیادہ سے زیادہ بارہ گھنٹے بعد، یا اگر "Remember me" منتخب کیا تھا تو پانچ دن بعد۔',
      },
      caption: {
        en: 'Sessions end after 30 minutes without activity, after 12 hours at most, or after 5 days with "Remember me".',
        ur: 'سیشن تیس منٹ بے کار رہنے پر، زیادہ سے زیادہ بارہ گھنٹے بعد، یا "Remember me" کے ساتھ پانچ دن بعد ختم ہو جاتا ہے۔',
      },
      do: async h => { await h.point({ text: 'Sessions end after 30 minutes idle' }, { hold: 2500 }); },
    },
    {
      say: {
        en: 'To switch it on, click Set up MFA. You can choose one of two methods.',
        ur: 'اسے آن کرنے کے لیے "Set up MFA" پر کلک کریں۔ آپ دو میں سے ایک طریقہ چن سکتے ہیں۔',
      },
      do: async h => { await h.click('Set up MFA', { after: 900 }); },
    },
    {
      say: {
        en: 'Email verification sends a one-time code to your registered email address each time you sign in. It is simple, but you need your mailbox at hand.',
        ur: '"Email verification" میں ہر لاگ ان پر آپ کے رجسٹرڈ ای میل پر ایک وقتی کوڈ آتا ہے۔ یہ آسان ہے، لیکن ای میل تک رسائی ضروری ہے۔',
      },
      do: async h => { await h.point({ text: 'Email verification', exact: true }, { hold: 2500 }); },
    },
    {
      say: {
        en: 'Authenticator app is the stronger choice. It works with Google or Microsoft Authenticator, or Authy, on your phone. Click it.',
        ur: '"Authenticator app" زیادہ مضبوط طریقہ ہے۔ یہ آپ کے فون پر گوگل یا مائیکروسافٹ آتھنٹیکیٹر، یا آتھی کے ساتھ چلتا ہے۔ اس پر کلک کریں۔',
      },
      do: async h => {
        await h.point({ text: 'Authenticator app', exact: true }, { hold: 1200 });
        await h.click({ text: 'Authenticator app', exact: true }, { after: 1500 });
      },
    },
    {
      say: {
        en: 'Open the app on your phone, add an account, and scan this QR code. Never share the code or the secret below it with anyone, not even with IT.',
        ur: 'فون پر ایپ کھولیں، نیا اکاؤنٹ شامل کریں اور یہ کیو آر کوڈ اسکین کریں۔ یہ کوڈ یا اس کے نیچے لکھا خفیہ کوڈ کبھی کسی کو نہ بتائیں، آئی ٹی والوں کو بھی نہیں۔',
      },
      do: async h => {
        await h.point({ css: 'img[alt^="Scan this QR code"]' }, { hold: 2000 });
        await h.point({ css: 'output[aria-label="Authenticator setup secret"]' }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'The app now shows a six-digit code that changes every thirty seconds. Type it here and click Confirm MFA. From then on, you enter a fresh code at every sign-in.',
        ur: 'اب ایپ ایک چھ ہندسوں کا کوڈ دکھاتی ہے جو ہر تیس سیکنڈ بعد بدلتا ہے۔ اسے یہاں لکھیں اور "Confirm MFA" پر کلک کریں۔ اس کے بعد ہر لاگ ان پر نیا کوڈ لکھنا ہوگا۔',
      },
      do: async h => {
        await h.point({ css: '#my-security-mfa-code' }, { hold: 1500 });
        await h.point('Confirm MFA', { hold: 1500 });
      },
    },
    {
      say: {
        en: 'In this demonstration we click Cancel, so nothing is changed.',
        ur: 'اس مظاہرے میں ہم "Cancel" پر کلک کرتے ہیں، تاکہ کچھ تبدیل نہ ہو۔',
      },
      do: async h => { await h.click({ css: 'section[aria-labelledby="my-security-title"] button:text-is("Cancel")' }, { after: 800 }); },
    },
    {
      say: {
        en: 'If you tick Remember me on the sign-in page and then enter your code, that computer becomes a trusted device: it does not ask for a code again for five days. Only do this on your own computer.',
        ur: 'اگر آپ لاگ ان کے صفحے پر "Remember me" منتخب کریں اور پھر کوڈ لکھیں تو وہ کمپیوٹر قابلِ اعتماد ڈیوائس بن جاتا ہے: پانچ دن تک دوبارہ کوڈ نہیں مانگتا۔ یہ صرف اپنے ذاتی کمپیوٹر پر کریں۔',
      },
      do: async h => { await h.point({ text: '5 days with “Remember me”' }, { hold: 2500 }); },
    },
    {
      say: {
        en: 'Once MFA is on, this banner turns green and shows two links. Stop trusting my devices asks every remembered device for a code again, for example if you lose your phone or laptop. Request MFA reset asks an administrator to reset your MFA after checking who you are.',
        ur: 'ایم ایف اے آن ہونے کے بعد یہ پٹی سبز ہو جاتی ہے اور دو لنک دکھاتی ہے۔ "Stop trusting my devices" ہر یاد رکھی گئی ڈیوائس سے دوبارہ کوڈ مانگتا ہے، مثلاً اگر فون یا لیپ ٹاپ گم ہو جائے۔ "Request MFA reset" ایڈمنسٹریٹر سے درخواست کرتا ہے کہ آپ کی شناخت کی تصدیق کے بعد ایم ایف اے دوبارہ ترتیب دے۔',
      },
      do: async h => { await h.point({ css: 'section[aria-labelledby="my-security-title"]' }, { hold: 3000 }); },
    },
    {
      say: {
        en: 'Passwords are managed by your administrator, never by an email link. If you forget yours, or think someone knows it, ask the administrator. They open Users, Roles and Permissions.',
        ur: 'پاس ورڈ ایڈمنسٹریٹر سنبھالتا ہے، ای میل لنک کے ذریعے کبھی نہیں۔ اگر آپ پاس ورڈ بھول جائیں یا شک ہو کہ کسی کو معلوم ہے تو ایڈمنسٹریٹر سے کہیں۔ وہ "Users, Roles & Permissions" کھولتا ہے۔',
      },
      do: async h => { await h.nav('Setup & Administration', 'Users, Roles & Permissions'); },
    },
    {
      say: {
        en: 'In System Users, they click Edit next to your account.',
        ur: '"System Users" میں وہ آپ کے اکاؤنٹ کے سامنے "Edit" پر کلک کرتا ہے۔',
      },
      do: async h => {
        const row = h.page.locator('tr', { hasText: 'hradmin@aljannatmall.local' }).filter({ has: h.page.getByRole('button', { name: 'Edit' }) });
        await h.scrollTo(() => row);
        await h.click(() => row.getByRole('button', { name: 'Edit' }), { after: 1000 });
      },
    },
    {
      say: {
        en: 'Here they type a new password of at least twelve characters. You are then signed out everywhere and sign in with the new password. We click Cancel and keep the current one.',
        ur: 'یہاں وہ کم از کم بارہ حروف کا نیا پاس ورڈ لکھتا ہے۔ اس کے بعد آپ ہر جگہ سے لاگ آؤٹ ہو جاتے ہیں اور نئے پاس ورڈ سے لاگ ان کرتے ہیں۔ ہم "Cancel" پر کلک کر کے موجودہ پاس ورڈ ہی رکھتے ہیں۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'Reset password (optional)' });
        await h.point({ text: 'Reset password (optional)' }, { hold: 1200 });
        await h.point({ placeholder: 'Leave blank to keep the current password' }, { hold: 1800 });
        await h.click({ role: 'button', name: 'Cancel', exact: true }, { after: 700 });
      },
    },
    {
      say: {
        en: 'Remember: use a long password that you use nowhere else, never share it, and always click Logout when you leave a shared computer.',
        ur: 'یاد رکھیں: لمبا پاس ورڈ رکھیں جو کہیں اور استعمال نہ ہوتا ہو، اسے کبھی کسی کو نہ بتائیں، اور مشترکہ کمپیوٹر چھوڑتے وقت ہمیشہ "Logout" پر کلک کریں۔',
      },
      do: async h => {
        await h.click(side('Operations Dashboard'), { after: 800 });
        await h.point('Logout', { hold: 2000 });
      },
    },
  ],
};
