// Chapter 07: Company Options & Attendance Policy. Changes here go through the same maker-checker control as the
// statutory rates; the chapter makes a small proposal (late grace, one fine band, an option) and withdraws it at the end.
const governance = 'section[aria-labelledby="statutory-governance-title"]';

export default {
  id: '07',
  slug: 'Company-Options-and-Attendance-Policy',
  as: 'admin',
  start: '/',
  title: { en: 'Company Options & Attendance Policy', ur: 'کمپنی آپشنز اور حاضری پالیسی' },
  subtitle: {
    en: 'Switch on optional features and set your own rules for late arrival, half days, absences, fines and rewards.',
    ur: 'اختیاری فیچرز آن کریں اور دیر سے آنے، آدھے دن، غیر حاضری، جرمانے اور انعام کے اپنے قواعد مقرر کریں۔',
  },
  audience: { en: ['Administrators'], ur: ['ایڈمنسٹریٹر'] },
  intro: {
    en: 'Every company has its own house rules for attendance. This page lets you set them, while everything stays on the standard behaviour until you switch it on.',
    ur: 'ہر کمپنی کے حاضری کے اپنے اندرونی قواعد ہوتے ہیں۔ یہ صفحہ آپ کو انہیں مقرر کرنے دیتا ہے، جبکہ جب تک آپ کچھ آن نہ کریں، سب کچھ معیاری طریقے پر چلتا رہتا ہے۔',
  },
  steps: [
    {
      say: {
        en: 'Open Setup and Administration, then Company Options and Attendance Policy.',
        ur: '"Setup & Administration" کھولیں، پھر "Company Options & Attendance Policy"۔',
      },
      do: async h => { await h.nav('Setup & Administration', 'Company Options & Attendance Policy'); },
    },
    {
      say: {
        en: 'Everything on this page is off by default. If you change nothing, the system follows the standard rules and the shift times you set for each employee.',
        ur: 'اس صفحے پر سب کچھ شروع میں بند ہوتا ہے۔ اگر آپ کچھ نہ بدلیں تو سسٹم معیاری قواعد اور ہر ملازم کے لیے مقرر شفٹ کے اوقات پر چلتا ہے۔',
      },
      do: async h => { await h.point({ text: 'Optional company features and attendance policy' }, { hold: 2500 }); },
    },
    {
      say: {
        en: 'The top part holds optional features. For example, the kiosk can show just three exit buttons: Duty Off, Personal Out and Office Work. Salaries can be tracked as Unpaid until cash is handed over and marked Paid.',
        ur: 'اوپر والے حصے میں اختیاری فیچرز ہیں۔ مثلاً کیوسک پر صرف تین باہر جانے والے بٹن دکھائے جا سکتے ہیں: "Duty Off"، "Personal Out" اور "Office Work"۔ تنخواہوں کو "Unpaid" رکھا جا سکتا ہے جب تک نقد رقم دے کر انہیں "Paid" نہ کیا جائے۔',
      },
      do: async h => {
        await h.point({ text: 'Kiosk: three exit buttons only' }, { hold: 1600 });
        await h.point({ text: 'Salary Unpaid / Paid register' }, { hold: 1600 });
      },
    },
    {
      say: {
        en: 'We switch on Position and branch on registers, so the attendance and leave registers show each employee\'s job and branch.',
        ur: 'ہم "Position and branch on registers" آن کرتے ہیں، تاکہ حاضری اور چھٹیوں کے رجسٹر میں ہر ملازم کا عہدہ اور برانچ نظر آئے۔',
      },
      do: async h => { await h.check({ text: 'Position and branch on registers' }); await h.wait(900); },
    },
    {
      say: {
        en: 'Below is the attendance policy. Minutes are counted from the opening time of each branch, which is set in Master Data. Here, anyone who arrives more than fifteen minutes after opening is late.',
        ur: 'نیچے حاضری کی پالیسی ہے۔ منٹ ہر برانچ کے کھلنے کے وقت سے گنے جاتے ہیں، جو ماسٹر ڈیٹا میں مقرر ہوتا ہے۔ یہاں جو بھی کھلنے کے وقت سے پندرہ منٹ بعد آئے وہ لیٹ شمار ہوگا۔',
      },
      do: async h => {
        await h.scrollTo({ label: 'Late grace minutes' });
        await h.fill({ label: 'Late grace minutes' }, '15', { delay: 150 });
      },
    },
    {
      say: {
        en: 'Half day from sets after how many minutes a late arrival counts as a half day. Absent deduction says how many days of pay an absence costs. Day without punch says what happens when someone does not punch at all.',
        ur: '"Half day from" بتاتا ہے کہ کتنے منٹ دیر سے آنے پر آدھا دن شمار ہوگا۔ "Absent deduction" بتاتا ہے کہ ایک غیر حاضری پر کتنے دن کی تنخواہ کٹے گی۔ "Day without punch" بتاتا ہے کہ اگر کوئی بالکل حاضری نہ لگائے تو کیا ہوگا۔',
      },
      do: async h => {
        await h.point({ label: 'Half day minutes' }, { hold: 1300 });
        await h.point({ label: 'Absent deduction days' }, { hold: 1300 });
        await h.point({ label: 'No punch day status' }, { hold: 1300 });
      },
    },
    {
      say: {
        en: 'You can also give a small reward for coming early, and set a personal out allowance: the minutes an employee may step out each day without a deduction.',
        ur: 'آپ جلدی آنے پر چھوٹا سا انعام بھی دے سکتے ہیں، اور "Personal out allowance" مقرر کر سکتے ہیں: روزانہ وہ منٹ جن میں ملازم بغیر کٹوتی کے باہر جا سکتا ہے۔',
      },
      do: async h => {
        await h.point({ label: 'Early coming reward per day' }, { hold: 1300 });
        await h.point({ label: 'Personal out allowance minutes' }, { hold: 1300 });
      },
    },
    {
      say: {
        en: 'Late fines work in bands. Click Add band: up to five late days in a month, the fine is one hundred rupees per late day. Add more bands for stricter fines after that.',
        ur: 'دیر سے آنے کا جرمانہ درجوں میں ہوتا ہے۔ "Add band" پر کلک کریں: مہینے میں پانچ دن تک دیر سے آنے پر ہر دن کا جرمانہ سو روپے ہے۔ اس کے بعد سخت جرمانوں کے لیے مزید درجے بنائیں۔',
      },
      do: async h => {
        // The editor ends near the bottom of the screen; extra room lets the new band scroll above the caption bar.
        await h.page.evaluate(() => {
          const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === '+ Add band');
          let box = button && button.parentElement;
          while (box && !['auto', 'scroll'].includes(getComputedStyle(box).overflowY)) box = box.parentElement;
          if (box) box.style.paddingBottom = '320px';
        });
        await h.scrollTo('+ Add band');
        await h.click('+ Add band', { after: 900 });
        await h.scrollTo({ label: 'Band 1 fine' });
        await h.point({ label: 'Band 1 late days' }, { hold: 1000 });
        await h.point({ label: 'Band 1 fine' }, { hold: 1300 });
      },
    },
    {
      say: {
        en: 'Notice the message at the top: these rules affect pay, so like the statutory rates they are saved as a proposal, and a second user must approve them on the Statutory page before they apply.',
        ur: 'اوپر والا پیغام دیکھیں: یہ قواعد تنخواہ پر اثر ڈالتے ہیں، اس لیے قانونی شرحوں کی طرح یہ بھی تجویز کے طور پر محفوظ ہوتے ہیں، اور لاگو ہونے سے پہلے دوسرے صارف کو "Statutory" والے صفحے پر انہیں منظور کرنا ہوتا ہے۔',
      },
      do: async h => {
        await h.scroll(-3000);
        await h.point({ text: 'A settings change is waiting for approval' }, { hold: 2500 });
      },
    },
    {
      say: {
        en: 'Reset to standard switches everything back off in one click. Apply company preset fills in a rule set prepared for a specific customer; only use it if your provider has told you to.',
        ur: '"Reset to standard" ایک کلک میں سب کچھ دوبارہ بند کر دیتا ہے۔ "Apply company preset" کسی خاص کسٹمر کے لیے تیار شدہ قواعد بھر دیتا ہے؛ اسے صرف تب استعمال کریں جب آپ کا فراہم کنندہ کہے۔',
      },
      do: async h => {
        await h.point('Reset to standard', { hold: 1300 });
        await h.point('Apply company preset', { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Let us open the Statutory page. The pending proposal lists what changed. A second user approves it here; as this was a demonstration, we click Withdraw.',
        ur: 'اب "Statutory" والا صفحہ کھولتے ہیں۔ زیرِ التوا تجویز بتاتی ہے کہ کیا بدلا ہے۔ دوسرا صارف اسے یہیں منظور کرتا ہے؛ چونکہ یہ مظاہرہ تھا، ہم "Withdraw" پر کلک کرتے ہیں۔',
      },
      do: async h => {
        await h.click({ css: '.flow button.flow-step:has-text("1. Statutory")' }, { after: 1500 });
        await h.point({ text: 'Pending proposal' }, { hold: 2000 });
        h.page.once('dialog', dialog => dialog.accept().catch(() => undefined));
        await h.click({ css: `${governance} button:has-text("Withdraw")` }, { after: 1500 });
      },
    },
    {
      say: {
        en: 'The live rules are unchanged. Agree your attendance rules with management in writing first, then enter them here and have them approved.',
        ur: 'اصل قواعد میں کوئی تبدیلی نہیں ہوئی۔ پہلے انتظامیہ کے ساتھ حاضری کے قواعد تحریری طور پر طے کریں، پھر انہیں یہاں درج کر کے منظور کروائیں۔',
      },
      do: async h => { await h.point({ css: governance }, { hold: 2500 }); },
    },
  ],
};
