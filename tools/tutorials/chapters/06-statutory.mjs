// Chapter 06: Statutory configuration (step "1. Statutory"). Every edit on this page becomes a maker-checker proposal;
// the chapter records the notification reference to show that, then withdraws its own proposal so the live rates stay as they are.
const governance = 'section[aria-labelledby="statutory-governance-title"]';

export default {
  id: '06',
  slug: 'Statutory-Configuration',
  as: 'admin',
  start: '/',
  title: { en: 'Statutory configuration', ur: 'قانونی ترتیبات' },
  subtitle: {
    en: 'Income tax slabs, minimum wage, EOBI, social security and bank files, changed only with a second person\'s approval.',
    ur: 'انکم ٹیکس سلیب، کم از کم اجرت، ای او بی آئی، سوشل سیکیورٹی اور بینک فائلیں، جو صرف دوسرے شخص کی منظوری سے بدلتی ہیں۔',
  },
  audience: { en: ['Administrators', 'Payroll staff'], ur: ['ایڈمنسٹریٹر', 'پے رول عملہ'] },
  intro: {
    en: 'Every salary deduction the law requires is worked out from the rates on this page. In this chapter you will see what each section means and how a rate change is approved.',
    ur: 'قانون کے مطابق تنخواہ سے ہر کٹوتی اسی صفحے کی شرحوں سے حساب ہوتی ہے۔ اس باب میں آپ دیکھیں گے کہ ہر حصے کا کیا مطلب ہے اور شرح کی تبدیلی کیسے منظور ہوتی ہے۔',
  },
  steps: [
    {
      say: {
        en: 'Click step one, Statutory, on the bar at the top. You can also open it from Setup and Administration, under Rules and Policy.',
        ur: 'اوپر کی پٹی پر پہلے مرحلے، "Statutory"، پر کلک کریں۔ اسے "Setup & Administration" میں "Rules & Policy" کے نیچے سے بھی کھولا جا سکتا ہے۔',
      },
      do: async h => { await h.click({ css: '.flow button.flow-step:has-text("1. Statutory")' }, { after: 1800 }); },
    },
    {
      say: {
        en: 'First, the most important rule. Payroll never uses a changed rate straight away. Any edit on this page is saved as a proposal, and a different authorized user must approve it. This is called maker-checker: one person cannot change everyone\'s deductions alone, by mistake or on purpose.',
        ur: 'سب سے پہلے سب سے اہم اصول۔ پے رول بدلی ہوئی شرح فوراً استعمال نہیں کرتا۔ اس صفحے پر ہر تبدیلی ایک تجویز کے طور پر محفوظ ہوتی ہے، اور کسی دوسرے مجاز صارف کو اسے منظور کرنا ہوتا ہے۔ اسے میکر چیکر کہتے ہیں: کوئی ایک شخص اکیلے، غلطی سے یا جان بوجھ کر، سب کی کٹوتیاں نہیں بدل سکتا۔',
      },
      do: async h => {
        await h.point({ css: governance }, { hold: 2500 });
        await h.point({ text: 'No pending changes. Live configuration' }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Salary tax rules hold the medical allowance exemption and the surcharge for very high incomes. Set them from the Finance Act for the tax year.',
        ur: '"Salary tax rules" میں میڈیکل الاؤنس کی چھوٹ اور بہت زیادہ آمدنی پر سرچارج درج ہوتا ہے۔ انہیں اس ٹیکس سال کے فنانس ایکٹ کے مطابق رکھیں۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'Salary tax rules' });
        await h.point({ text: 'Medical allowance exempt (% of basic)' }, { hold: 1200 });
        await h.point({ text: 'Surcharge rate (% of tax)' }, { hold: 1200 });
      },
    },
    {
      say: {
        en: 'Provincial social security is paid by the employer for workers up to a wage ceiling. Each province sets its own ceiling, so there is one box per province.',
        ur: 'صوبائی سوشل سیکیورٹی آجر ادا کرتا ہے، ان کارکنوں کے لیے جن کی اجرت ایک حد تک ہو۔ ہر صوبہ اپنی حد خود مقرر کرتا ہے، اس لیے ہر صوبے کا الگ خانہ ہے۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'Provincial social security coverage' });
        await h.point({ text: 'Provincial social security coverage' }, { hold: 1000 });
        await h.point({ text: 'Punjab wage ceiling (PKR)' }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Leave entitlements set the yearly days for annual, casual, sick and other leave. The leave module uses them to block requests beyond the remaining balance.',
        ur: '"Leave entitlements" میں سالانہ، اتفاقی، بیماری اور دوسری چھٹیوں کے سالانہ دن درج ہیں۔ چھٹیوں کا ماڈیول انہی سے بقایا سے زیادہ درخواستیں روکتا ہے۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'Leave entitlements (days per calendar year)' });
        await h.point({ text: 'Leave entitlements (days per calendar year)' }, { hold: 2200 });
      },
    },
    {
      say: {
        en: 'Further down are the income tax slabs from the Finance Act. Each row is an income band with its fixed tax and its rate. The system uses this table to work out the monthly tax on every salary.',
        ur: 'نیچے فنانس ایکٹ کے انکم ٹیکس سلیب ہیں۔ ہر قطار آمدنی کی ایک حد ہے، اس کے مقررہ ٹیکس اور شرح کے ساتھ۔ سسٹم اسی جدول سے ہر تنخواہ کا ماہانہ ٹیکس نکالتا ہے۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'Current FBR Income Tax Slabs Table' });
        await h.scroll(250);
        await h.point({ text: 'Current FBR Income Tax Slabs Table' }, { hold: 1200 });
        await h.point({ text: 'Slab #3' }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'When a new budget is announced, update the slabs here, or use Download CSV to keep a copy for your records.',
        ur: 'نیا بجٹ آنے پر سلیب یہاں اپ ڈیٹ کریں، یا ریکارڈ کے لیے "Download CSV" سے ان کی نقل محفوظ کر لیں۔',
      },
      do: async h => {
        await h.point('Download CSV', { hold: 1300 });
        await h.point('Update from FBR', { hold: 1300 });
      },
    },
    {
      say: {
        en: 'On the right is the tax year, and the government minimum wage. EOBI is one percent from the employee and five percent from the employer, worked out on this minimum wage. No salary may be set below it.',
        ur: 'دائیں طرف ٹیکس سال اور حکومت کی مقرر کردہ کم از کم اجرت ہے۔ ای او بی آئی ملازم سے ایک فیصد اور آجر سے پانچ فیصد ہے، جو اسی کم از کم اجرت پر حساب ہوتا ہے۔ کوئی تنخواہ اس سے کم مقرر نہیں ہو سکتی۔',
      },
      do: async h => {
        await h.point({ text: 'Tax year / effective date:' }, { hold: 1000 });
        await h.point({ label: 'Government Minimum Wage (PKR)' }, { hold: 2200 });
      },
    },
    {
      say: {
        en: 'Here are the employer social security rates for each province, and the gratuity rate used when someone leaves.',
        ur: 'یہاں ہر صوبے کے لیے آجر کی سوشل سیکیورٹی کی شرحیں ہیں، اور گریجویٹی کی شرح جو کسی کے ملازمت چھوڑنے پر استعمال ہوتی ہے۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'Provincial social security employer %:' });
        await h.point({ text: 'Provincial social security employer %:' }, { hold: 1300 });
        await h.scrollTo({ text: 'Gratuity entitlement rate (annual):' });
        await h.point({ text: 'Gratuity entitlement rate (annual):' }, { hold: 1300 });
      },
    },
    {
      say: {
        en: 'Bank and statutory upload file templates decide the layout of the salary file for your bank, and of the EOBI and social security returns. Copy each layout from the bank\'s specification. Tick Verified only after the bank has accepted a test file.',
        ur: '"Bank & statutory upload file templates" طے کرتے ہیں کہ بینک کی تنخواہ والی فائل، اور ای او بی آئی اور سوشل سیکیورٹی کے گوشوارے کس ترتیب میں بنیں۔ ہر ترتیب بینک کی دی ہوئی تفصیل سے نقل کریں۔ "Verified" پر نشان صرف تب لگائیں جب بینک ٹیسٹ فائل قبول کر لے۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'Bank & statutory upload file templates' });
        await h.scroll(200);
        await h.point({ text: 'Bank & statutory upload file templates' }, { hold: 1000 });
        await h.point({ css: 'select:has(option:text-is("EOBI Return"))' }, { hold: 1300 });
        await h.point({ text: 'Verified with a bank-accepted test batch' }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'The preview shows exactly how the file will look for one sample employee, so you can check it before sending anything to the bank.',
        ur: 'پیش منظر بالکل دکھاتا ہے کہ ایک نمونہ ملازم کے لیے فائل کیسی ہوگی، تاکہ بینک کو کچھ بھیجنے سے پہلے آپ اسے چیک کر سکیں۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'Preview (one sample employee)' });
        await h.point({ text: 'Preview (one sample employee)' }, { hold: 2200 });
      },
    },
    {
      say: {
        en: 'Now let us see a change in action. Back at the top, under Source of these rates, record the official notification the rates come from. It is required before any approval, so auditors can always trace a rate to its law.',
        ur: 'اب ایک تبدیلی ہوتے ہوئے دیکھتے ہیں۔ اوپر "Source of these rates" میں وہ سرکاری نوٹیفکیشن درج کریں جس سے یہ شرحیں لی گئی ہیں۔ یہ منظوری سے پہلے لازمی ہے، تاکہ آڈیٹر ہمیشہ ہر شرح کو اس کے قانون تک دیکھ سکیں۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'Source of these rates' });
        await h.fill({ placeholder: 'e.g. Finance Act 2026' }, 'Finance Act 2026, FBR withholding rate card TY2027', { delay: 45 });
        await h.point('Attach notification (PDF/image)', { hold: 900 });
      },
    },
    {
      say: {
        en: 'The box at the top has turned amber: this is now a pending proposal in your name. Approve and apply is greyed out for you, because the person who proposes a change can never approve it.',
        ur: 'اوپر والا خانہ پیلا ہو گیا ہے: اب یہ آپ کے نام سے ایک زیرِ التوا تجویز ہے۔ "Approve & apply" آپ کے لیے بند ہے، کیونکہ تبدیلی تجویز کرنے والا اسے کبھی منظور نہیں کر سکتا۔',
      },
      do: async h => {
        await h.scrollTo({ css: governance });
        await h.point({ text: 'Pending proposal' }, { hold: 1500 });
        await h.point({ css: `${governance} button:has-text("Approve")` }, { hold: 1800 });
      },
    },
    {
      say: {
        en: 'A second user, for example the finance manager, opens this page, checks the notification and clicks Approve and apply. From that moment payroll uses the new rates, and the approval is logged with their name.',
        ur: 'دوسرا صارف، مثلاً فنانس مینیجر، یہ صفحہ کھولتا ہے، نوٹیفکیشن چیک کرتا ہے اور "Approve & apply" پر کلک کرتا ہے۔ اسی لمحے سے پے رول نئی شرحیں استعمال کرتا ہے، اور منظوری اس کے نام کے ساتھ ریکارڈ ہو جاتی ہے۔',
      },
      do: async h => { await h.point({ css: governance }, { hold: 3000 }); },
    },
    {
      say: {
        en: 'This was only a demonstration, so we click Withdraw. The live rates stay exactly as they were.',
        ur: 'یہ صرف مظاہرہ تھا، اس لیے ہم "Withdraw" پر کلک کرتے ہیں۔ اصل شرحیں بالکل ویسی ہی رہتی ہیں۔',
      },
      do: async h => {
        h.page.once('dialog', dialog => dialog.accept().catch(() => undefined));
        await h.click({ css: `${governance} button:has-text("Withdraw")` }, { after: 1800 });
        await h.point({ css: governance }, { hold: 1500 });
      },
    },
  ],
};
