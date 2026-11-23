// Chapter 04: Setup & Administration -> Company & Master Data (the five-step company wizard) and the branch record.
const field = id => ({ css: `#${id}` });
const wizardButton = name => ({ css: `footer button:has-text("${name}")` });

export default {
  id: '04',
  slug: 'Company-and-Master-Data',
  as: 'admin',
  start: '/',
  title: { en: 'Company & Master Data', ur: 'کمپنی اور ماسٹر ڈیٹا' },
  subtitle: {
    en: 'Record the legal company details, NTN, registered office and the main branch.',
    ur: 'کمپنی کی قانونی تفصیلات، این ٹی این، رجسٹرڈ دفتر اور مرکزی برانچ درج کریں۔',
  },
  audience: { en: ['Administrators'], ur: ['ایڈمنسٹریٹر'] },
  intro: {
    en: 'Payslips, tax returns and bank files print your company\'s legal details, so they must be correct. In this chapter we complete the company profile.',
    ur: 'تنخواہ کی سلپ، ٹیکس گوشوارے اور بینک فائلوں پر کمپنی کی قانونی تفصیلات چھپتی ہیں، اس لیے ان کا درست ہونا ضروری ہے۔ اس باب میں ہم کمپنی کا پروفائل مکمل کریں گے۔',
  },
  steps: [
    {
      say: {
        en: 'Open Setup and Administration, then Company and Master Data. The red Fix badge, and NTN missing on step two of the bar, tell us something is still incomplete.',
        ur: '"Setup & Administration" کھولیں، پھر "Company & Master Data"۔ سرخ "fix" کا نشان اور پٹی کے دوسرے مرحلے پر "NTN missing" بتاتے ہیں کہ ابھی کچھ نامکمل ہے۔',
      },
      do: async h => {
        await h.click({ css: 'button.side-item:has-text("Setup & Administration")' }, { after: 700 });
        await h.point({ css: '[role=dialog] button:has-text("Company & Master Data")' }, { hold: 1300 });
        await h.click({ css: '[role=dialog] button:has-text("Company & Master Data")' }, { after: 1500 });
      },
    },
    {
      say: {
        en: 'The setup is a short wizard in five steps: company identity, office and branch, organization, payroll compliance, and a final review. Nothing is saved until the last step.',
        ur: 'یہ پانچ مراحل کا ایک مختصر وزرڈ ہے: کمپنی کی شناخت، دفتر اور برانچ، ادارہ، پے رول کے قوانین، اور آخری جائزہ۔ آخری مرحلے سے پہلے کچھ محفوظ نہیں ہوتا۔',
      },
      do: async h => { await h.point({ css: 'nav[aria-label="Setup progress"]' }, { hold: 3000 }); },
    },
    {
      say: {
        en: 'Step one, Company identity. The legal name is already filled in. Enter a short company code and the industry. The code becomes the start of every employee code.',
        ur: 'پہلا مرحلہ، "Company identity"۔ قانونی نام پہلے سے لکھا ہوا ہے۔ کمپنی کا مختصر کوڈ اور صنعت لکھیں۔ یہی کوڈ ہر ملازم کے کوڈ کے شروع میں آتا ہے۔',
      },
      do: async h => {
        await h.scrollTo(field('legal-name'));
        await h.point(field('legal-name'), { hold: 900 });
        await h.fill(field('company-code'), 'AJM', { delay: 120 });
        await h.fill(field('industry'), 'Retail and shopping mall');
      },
    },
    {
      say: {
        en: 'NTN is the company\'s National Tax Number from FBR. It is printed on tax certificates and withholding statements, so copy it exactly from your registration certificate.',
        ur: 'این ٹی این ایف بی آر کا دیا ہوا کمپنی کا نیشنل ٹیکس نمبر ہے۔ یہ ٹیکس سرٹیفکیٹ اور ودہولڈنگ گوشواروں پر چھپتا ہے، اس لیے اسے رجسٹریشن سرٹیفکیٹ سے بالکل درست نقل کریں۔',
      },
      do: async h => { await h.fill(field('ntn'), '4512397-6', { delay: 90 }); },
    },
    {
      say: {
        en: 'Add the contact email and phone number. Fiscal year, payroll frequency, currency and time zone are already set for Pakistan: July, monthly, PKR and Asia Karachi.',
        ur: 'رابطے کا ای میل اور فون نمبر لکھیں۔ مالی سال، پے رول کا دورانیہ، کرنسی اور ٹائم زون پاکستان کے لیے پہلے سے مقرر ہیں: جولائی، ماہانہ، روپے اور ایشیا کراچی۔',
      },
      caption: {
        en: 'Add the contact email and phone. Fiscal year, payroll frequency, currency and time zone are already set for Pakistan: July, Monthly, PKR, Asia/Karachi.',
        ur: 'رابطے کا ای میل اور فون نمبر لکھیں۔ مالی سال، پے رول، کرنسی اور ٹائم زون پاکستان کے مطابق ہیں: جولائی، ماہانہ، PKR، Asia/Karachi۔',
      },
      do: async h => {
        await h.fill(field('contact-email'), 'hr@aljannatmall.local', { delay: 35 });
        await h.fill(field('phone'), '042-35761234', { delay: 60 });
        await h.scrollTo(field('timezone'));
        await h.point({ css: 'select:has(option:text-is("July"))' }, { hold: 700 });
        await h.point(field('timezone'), { hold: 700 });
      },
    },
    {
      say: {
        en: 'Click Continue. Step two, Office and branch. Enter the registered office address, city and province. The province matters: it decides the minimum wage, social security and leave rules that apply.',
        ur: '"Continue" پر کلک کریں۔ دوسرا مرحلہ، "Office & branch"۔ رجسٹرڈ دفتر کا پتہ، شہر اور صوبہ لکھیں۔ صوبہ اہم ہے: اسی سے کم از کم اجرت، سوشل سیکیورٹی اور چھٹیوں کے قواعد طے ہوتے ہیں۔',
      },
      do: async h => {
        await h.click(wizardButton('Continue'), { after: 900 });
        await h.scrollTo(field('street-address'));
        await h.fill(field('street-address'), '12 Main Boulevard, Gulberg III', { delay: 35 });
        await h.fill(field('city'), 'Lahore', { delay: 70 });
        await h.select({ css: 'fieldset select:has(option:text-is("Punjab"))' }, 'Punjab');
        await h.fill(field('postal-code'), '54660', { delay: 70 });
      },
    },
    {
      say: {
        en: 'Below is the main branch, Head Office, with its own address. If the branch works at the registered office, simply tick Same as registered office.',
        ur: 'نیچے مرکزی برانچ، ہیڈ آفس، اپنے پتے کے ساتھ ہے۔ اگر برانچ رجسٹرڈ دفتر ہی میں ہو تو بس "Same as registered office" پر نشان لگا دیں۔',
      },
      do: async h => {
        await h.scrollTo(field('branch-name'));
        await h.point({ text: 'Same as registered office' }, { hold: 1000 });
        await h.point(field('branch-name'), { hold: 1000 });
      },
    },
    {
      say: {
        en: 'Click Continue. Step three, Organization, lists the departments and designations already saved. We keep them as they are; the next chapter shows how to add more.',
        ur: '"Continue" پر کلک کریں۔ تیسرا مرحلہ، "Organization"، پہلے سے محفوظ شعبے اور عہدے دکھاتا ہے۔ ہم انہیں ایسے ہی رہنے دیتے ہیں؛ مزید شامل کرنے کا طریقہ اگلے باب میں ہے۔',
      },
      do: async h => {
        await h.click(wizardButton('Continue'), { after: 900 });
        await h.scrollTo({ text: 'Starter departments' });
        await h.point({ text: 'Starter departments' }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Click Continue. Step four shows the payroll compliance baseline. Under Registration status, enter the company\'s EOBI and social security registration numbers, because they appear on the monthly returns.',
        ur: '"Continue" پر کلک کریں۔ چوتھا مرحلہ پے رول کے قوانین کی بنیادی ترتیب دکھاتا ہے۔ "Registration status" میں کمپنی کے ای او بی آئی اور سوشل سیکیورٹی رجسٹریشن نمبر لکھیں، کیونکہ یہ ماہانہ گوشواروں پر آتے ہیں۔',
      },
      do: async h => {
        await h.click(wizardButton('Continue'), { after: 900 });
        await h.point({ text: 'Minimum wage', exact: true }, { hold: 900 });
        await h.scrollTo({ text: 'Registration status' });
        await h.select({ label: 'EOBI status' }, 'Registered');
        await h.fill(field('eobi-registration-number'), 'LHR-04-118273', { delay: 50 });
        await h.select({ label: 'Social security status' }, 'Registered');
        await h.fill(field('social-security-registration-number'), 'PESSI-LHR-55120', { delay: 50 });
      },
    },
    {
      say: {
        en: 'The rates here are only a starting point. Changing them later is done on the Statutory configuration page, with a second person\'s approval.',
        ur: 'یہاں کی شرحیں صرف ابتدائی ہیں۔ بعد میں انہیں "Statutory" والے صفحے پر کسی دوسرے شخص کی منظوری سے بدلا جاتا ہے۔',
      },
      do: async h => { await h.point({ text: 'Current FBR tax slabs' }, { hold: 1500 }); },
    },
    {
      say: {
        en: 'Click Continue. Step five is the review. Check the company name, code and NTN, the main branch and the payroll baseline.',
        ur: '"Continue" پر کلک کریں۔ پانچواں مرحلہ جائزہ ہے۔ کمپنی کا نام، کوڈ اور این ٹی این، مرکزی برانچ اور پے رول کی بنیادی ترتیب چیک کریں۔',
      },
      do: async h => {
        await h.click(wizardButton('Continue'), { after: 1000 });
        await h.scrollTo({ text: 'Payroll baseline' });
        await h.point({ css: 'h3:has-text("AlJannat Mall")' }, { hold: 1400 });
        await h.point({ text: 'Payroll baseline' }, { hold: 1200 });
      },
    },
    {
      say: {
        en: 'Tick the confirmation that you reviewed the details, then click Update primary company.',
        ur: 'تصدیق والے خانے پر نشان لگائیں کہ آپ نے تفصیلات دیکھ لی ہیں، پھر "Update primary company" پر کلک کریں۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'I reviewed these details and statutory settings.' });
        await h.check({ text: 'I reviewed these details and statutory settings.' });
        await h.click(wizardButton('Update primary company'), { after: 2500 });
      },
    },
    {
      say: {
        en: 'The company is saved. Step two of the bar at the top is no longer red, because the NTN is now recorded.',
        ur: 'کمپنی محفوظ ہو گئی۔ اوپر پٹی کا دوسرا مرحلہ اب سرخ نہیں رہا، کیونکہ این ٹی این درج ہو چکا ہے۔',
      },
      do: async h => {
        await h.scroll(-4000);
        await h.point({ css: '.flow button.flow-step:has-text("2. Company")' }, { hold: 2200 });
      },
    },
    {
      say: {
        en: 'Branches have more settings of their own. Open Master Data Lists: the Branches tab shows the Head Office. Click Edit.',
        ur: 'برانچوں کی اپنی مزید ترتیبات ہیں۔ "Master Data Lists" کھولیں: "Branches" والے ٹیب میں ہیڈ آفس نظر آتا ہے۔ "Edit" پر کلک کریں۔',
      },
      do: async h => {
        await h.nav('Setup & Administration', 'Master Data Lists');
        await h.point({ css: 'article:has-text("Head Office")' }, { hold: 1000 });
        await h.click({ css: 'article:has-text("Head Office") button:has-text("Edit")' }, { after: 1000 });
      },
    },
    {
      say: {
        en: 'Here you set the branch\'s address and province, the location used to check phone attendance, the labour-law category, and the opening time that late arrival is counted from.',
        ur: 'یہاں برانچ کا پتہ اور صوبہ، موبائل حاضری کی جانچ کے لیے مقام، لیبر قانون کی قسم، اور کھلنے کا وقت مقرر کیا جاتا ہے جس سے دیر سے آنے کا حساب ہوتا ہے۔',
      },
      do: async h => {
        await h.point({ label: 'Province / jurisdiction' }, { hold: 1000 });
        await h.scrollTo({ label: 'Geofence latitude' });
        await h.point({ label: 'Geofence latitude' }, { hold: 900 });
        await h.scrollTo({ label: 'Opening time' });
        await h.point({ label: 'Establishment type (labour-law category)' }, { hold: 900 });
        await h.point({ label: 'Opening time' }, { hold: 1100 });
      },
    },
    {
      say: {
        en: 'We close it with Cancel. To open another branch, use Add Branch on this page. Every branch needs its own code, city and province.',
        ur: 'ہم اسے "Cancel" سے بند کرتے ہیں۔ نئی برانچ کے لیے اسی صفحے پر "Add Branch" استعمال کریں۔ ہر برانچ کا اپنا کوڈ، شہر اور صوبہ ہونا ضروری ہے۔',
      },
      do: async h => {
        await h.click({ css: '[role=dialog] footer button:has-text("Cancel")' }, { after: 800 });
        await h.point('Add Branch', { hold: 1800 });
      },
    },
  ],
};
