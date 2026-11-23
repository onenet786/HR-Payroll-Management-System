// Chapter 02: the screen layout every user meets after signing in.
const side = name => ({ css: `button.side-item:has-text("${name}")` });
const flowStep = label => ({ css: `.flow button.flow-step:has-text("${label}")` });

export default {
  id: '02',
  slug: 'Finding-Your-Way-Around',
  as: 'admin',
  start: '/',
  title: { en: 'Finding your way around', ur: 'سسٹم میں راستہ تلاش کرنا' },
  subtitle: {
    en: 'The dashboard, the 12-step bar, the menus, search, notifications, Urdu or English, and help on every page.',
    ur: 'ڈیش بورڈ، بارہ مراحل والی پٹی، مینو، تلاش، اطلاعات، اردو یا انگریزی، اور ہر صفحے پر رہنمائی۔',
  },
  audience: { en: ['Everyone'], ur: ['سب کے لیے'] },
  intro: {
    en: 'In this chapter you will learn how the screen is laid out, so you can always find the page you need and get back home.',
    ur: 'اس باب میں آپ دیکھیں گے کہ اسکرین کیسے ترتیب دی گئی ہے، تاکہ آپ ہمیشہ مطلوبہ صفحہ ڈھونڈ سکیں اور واپس ڈیش بورڈ پر آ سکیں۔',
  },
  steps: [
    {
      say: {
        en: 'After you sign in, the Operations Dashboard opens. The Live payroll readiness card lists the checks that must pass before you pay salaries from this system.',
        ur: 'لاگ ان کے بعد "Operations Dashboard" کھلتا ہے۔ "Live payroll readiness" والا حصہ وہ چیزیں دکھاتا ہے جو اس سسٹم سے تنخواہ دینے سے پہلے مکمل ہونی چاہئیں۔',
      },
      do: async h => {
        await h.point(side('Operations Dashboard'), { hold: 1200 });
        await h.point({ text: 'Live payroll readiness' }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Across the top is the twelve-step bar. It follows the monthly order of work, from statutory settings to the final settlement. Green means ready, red means something needs your attention, and the dark step is where you are now.',
        ur: 'سب سے اوپر بارہ مراحل والی پٹی ہے۔ یہ مہینے کے کام کی ترتیب دکھاتی ہے، قانونی ترتیبات سے لے کر حتمی تصفیے تک۔ سبز کا مطلب تیار ہے، سرخ کا مطلب ہے کہ کسی چیز پر توجہ چاہیے، اور گہرا مرحلہ وہ ہے جہاں آپ اس وقت موجود ہیں۔',
      },
      do: async h => {
        await h.point({ css: '.flow' }, { hold: 1600 });
        await h.point(flowStep('1. Statutory'), { hold: 900 });
        await h.point(flowStep('5. Leave'), { hold: 900 });
        await h.point(flowStep('12. Dashboard'), { hold: 900 });
      },
    },
    {
      say: {
        en: 'Click any step to jump straight to its page. Here we open the Holiday Calendar, then click Dashboard to come back.',
        ur: 'کسی بھی مرحلے پر کلک کریں تو سیدھا اس کا صفحہ کھل جاتا ہے۔ یہاں ہم "Holidays" کھولتے ہیں، پھر "Dashboard" پر کلک کر کے واپس آتے ہیں۔',
      },
      do: async h => {
        await h.click(flowStep('4. Holidays'), { after: 1800 });
        await h.click(flowStep('12. Dashboard'), { after: 900 });
      },
    },
    {
      say: {
        en: 'On the left is the sidebar with the main modules. Click People: a menu card opens with every page of that module, grouped by topic.',
        ur: 'بائیں طرف سائیڈ بار میں اہم ماڈیول ہیں۔ "People" پر کلک کریں: ایک مینو کارڈ کھلتا ہے جس میں اس ماڈیول کے تمام صفحات موضوع کے لحاظ سے ترتیب دیے گئے ہیں۔',
      },
      do: async h => {
        await h.click(side('People'), { after: 700 });
        await h.point({ css: '[role=dialog] section' }, { hold: 1200 });
        await h.point('Employee Directory', { hold: 900 });
      },
    },
    {
      say: {
        en: 'The small badges help you: an amber number shows items waiting for you, a blue badge shows the step number, and a red Fix badge points to a setting that is missing.',
        ur: 'چھوٹے نشان آپ کی مدد کرتے ہیں: پیلا نمبر بتاتا ہے کہ کتنی چیزیں آپ کا انتظار کر رہی ہیں، نیلا نشان مرحلے کا نمبر دکھاتا ہے، اور سرخ "fix" کا نشان کسی نامکمل ترتیب کی طرف اشارہ کرتا ہے۔',
      },
      do: async h => {
        await h.point({ css: '[role=dialog] button:has-text("Employee Lifecycle")' }, { hold: 1000 });
        await h.press('Escape');
        await h.click(side('Setup & Administration'), { after: 700 });
        await h.point({ css: '[role=dialog] button:has-text("Statutory Config")' }, { hold: 1100 });
        await h.point({ css: '[role=dialog] button:has-text("Company & Master Data")' }, { hold: 1100 });
      },
    },
    {
      say: {
        en: 'Press Escape, or click outside the card, to close the menu.',
        ur: 'مینو بند کرنے کے لیے "Esc" دبائیں، یا کارڈ سے باہر کلک کریں۔',
      },
      do: async h => {
        await h.point({ text: 'to close the menu' }, { hold: 900 });
        await h.press('Escape');
      },
    },
    {
      say: {
        en: 'To find anything quickly, click the search bar at the top, or press Control and K. Type part of a name, an employee code or a page name.',
        ur: 'کوئی بھی چیز جلدی ڈھونڈنے کے لیے اوپر سرچ بار پر کلک کریں، یا "Ctrl" اور "K" دبائیں۔ نام کا کچھ حصہ، ملازم کا کوڈ یا صفحے کا نام لکھیں۔',
      },
      caption: {
        en: 'To find anything quickly, click the search bar at the top, or press Ctrl + K. Type part of a name, an employee code or a page name.',
        ur: 'کوئی بھی چیز جلدی ڈھونڈنے کے لیے اوپر سرچ بار پر کلک کریں، یا Ctrl + K دبائیں۔ نام کا حصہ، ملازم کا کوڈ یا صفحے کا نام لکھیں۔',
      },
      do: async h => {
        await h.click({ css: '[title="Click or press Ctrl+K to find anything"]' }, { after: 600 });
        await h.fill({ placeholder: 'Type to search' }, 'Usman', { delay: 110 });
      },
    },
    {
      say: {
        en: 'Matching employees appear under Employees. Click the name: the person’s record opens straight away, and the Employee Directory behind it lists that person. Close the record with Cancel.',
        ur: 'ملتے جلتے ملازمین "Employees" کے نیچے نظر آتے ہیں۔ نام پر کلک کریں تو اس شخص کا ریکارڈ فوراً کھل جاتا ہے، اور پیچھے "Employee Directory" میں وہی شخص نظر آتا ہے۔ ریکارڈ "Cancel" سے بند کریں۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'Usman Tariq' });
        await h.point({ text: 'Usman Tariq' }, { hold: 900 });
        await h.click({ text: 'Usman Tariq' }, { after: 1500 });
        await h.point({ text: 'Edit Employee Record' }, { hold: 1500 });
        await h.click(page => page.locator('form', { hasText: 'Save Changes' }).getByRole('button', { name: 'Cancel', exact: true }), { after: 900 });
        await h.point({ css: 'table tbody tr:has-text("Usman Tariq")' }, { hold: 1300 });
      },
    },
    {
      say: {
        en: 'The bell at the top shows how many notices are waiting for you. Click it to open the Notification Center.',
        ur: 'اوپر گھنٹی کا نشان بتاتا ہے کہ آپ کے لیے کتنی اطلاعات باقی ہیں۔ اس پر کلک کریں تو "Notification Center" کھل جاتا ہے۔',
      },
      do: async h => {
        await h.click({ css: '.bell-btn' }, { after: 1500 });
        await h.point({ text: 'Notification Center', exact: true }, { hold: 1200 });
      },
    },
    {
      say: {
        en: 'Wherever you are, Operations Dashboard at the top of the sidebar brings you back home.',
        ur: 'آپ جہاں بھی ہوں، سائیڈ بار میں سب سے اوپر "Operations Dashboard" آپ کو واپس ڈیش بورڈ پر لے آتا ہے۔',
      },
      do: async h => { await h.click(side('Operations Dashboard'), { after: 1200 }); },
    },
    {
      say: {
        en: 'The button at the top of the sidebar switches the menus and page help to Urdu. Click it again, now labelled English, to switch back.',
        ur: 'سائیڈ بار کے اوپر والا بٹن مینو اور صفحے کی رہنمائی کو اردو میں بدل دیتا ہے۔ واپس انگریزی کے لیے دوبارہ اسی بٹن پر کلک کریں، جس پر اب "English" لکھا ہوتا ہے۔',
      },
      do: async h => {
        await h.click('اردو', { after: 2200 });
        await h.point({ css: 'button.side-item:has-text("افراد")' }, { hold: 1200 });
        await h.click('English', { after: 1200 });
      },
    },
    {
      say: {
        en: 'Not sure what a page is for? Click Guide for this page. It explains the screen in plain words and what happens next. Click Got it to close it.',
        ur: 'اگر سمجھ نہ آئے کہ کوئی صفحہ کس کام کا ہے تو "Guide for this page" پر کلک کریں۔ یہ آسان الفاظ میں صفحے کا مقصد اور اگلا قدم بتاتا ہے۔ بند کرنے کے لیے "Got it" پر کلک کریں۔',
      },
      do: async h => {
        await h.click({ text: 'Guide for this page' }, { after: 1000 });
        await h.point({ text: 'Guide for Operations Dashboard' }, { hold: 2200 });
        await h.click('Got it', { after: 500 });
      },
    },
    {
      say: {
        en: 'Finally, the green Compliance tab on the right edge opens a summary of the Pakistan payroll rules the system applies, with the current minimum wage and EOBI rates. Click Hide to close it.',
        ur: 'آخر میں، دائیں کنارے پر سبز "Compliance" والا ٹیب پاکستان کے پے رول قوانین کا خلاصہ کھولتا ہے جو سسٹم لاگو کرتا ہے، ساتھ ہی موجودہ کم از کم اجرت اور ای او بی آئی کی شرحیں۔ بند کرنے کے لیے "Hide" پر کلک کریں۔',
      },
      do: async h => {
        await h.click({ role: 'button', name: 'Compliance' }, { after: 1200 });
        await h.point({ text: 'Pakistan Payroll Compliance' }, { hold: 1200 });
        await h.point({ text: 'EOBI Social Security' }, { hold: 1600 });
        await h.click('Hide', { after: 600 });
      },
    },
  ],
};
