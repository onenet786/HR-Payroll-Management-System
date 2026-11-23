// Chapter 09: Holiday Calendar (step 4 of the 12-step bar).
// Adds "Eid ul Fitr (Day 1)" on 10-Mar-2027 (a future month, so no payroll month already being worked on changes).
export default {
  id: '09',
  slug: 'Holiday-Calendar',
  as: 'admin',
  title: { en: 'Holiday Calendar', ur: 'تعطیلات کا کیلنڈر' },
  subtitle: {
    en: 'Keep the public and company holidays up to date, so attendance and payroll treat those days correctly.',
    ur: 'سرکاری اور کمپنی کی تعطیلات اپ ڈیٹ رکھیں، تاکہ حاضری اور پے رول ان دنوں کو درست طریقے سے شمار کریں۔',
  },
  audience: { en: ['HR staff'], ur: ['ایچ آر عملہ'] },
  intro: {
    en: 'The holiday calendar is step four of the monthly flow. In this chapter you will add a public holiday and see why it matters for attendance and salaries.',
    ur: 'تعطیلات کا کیلنڈر ماہانہ کام کا چوتھا مرحلہ ہے۔ اس باب میں آپ ایک سرکاری تعطیل شامل کریں گے اور دیکھیں گے کہ یہ حاضری اور تنخواہوں کے لیے کیوں اہم ہے۔',
  },
  steps: [
    {
      say: {
        en: 'Open Time and Attendance in the menu on the left, then click Holiday Calendar. You can also click step four, Holidays, in the bar at the top.',
        ur: 'بائیں طرف کے مینو میں "Time & Attendance" کھولیں، پھر "Holiday Calendar" پر کلک کریں۔ آپ اوپر والی پٹی میں چوتھے مرحلے "Holidays" پر بھی کلک کر سکتے ہیں۔',
      },
      caption: {
        en: 'Open Time & Attendance in the menu on the left, then click Holiday Calendar (or step 4, Holidays, in the top bar).',
        ur: 'بائیں مینو میں "Time & Attendance" کھولیں، پھر "Holiday Calendar" پر کلک کریں (یا اوپر کی پٹی میں مرحلہ 4، "Holidays")۔',
      },
      do: async h => {
        await h.nav('Time & Attendance', 'Holiday Calendar');
        await h.point(page => page.getByRole('button', { name: /^4\. Holidays/ }), { hold: 1200 });
      },
    },
    {
      say: {
        en: 'There are three kinds of holiday. Public holidays are announced by the government, such as Pakistan Day. Company holidays are your own, such as an annual staff day. Optional holidays, such as Easter or Diwali, are not days off for everyone: staff who take one apply for leave, and everyone else works and is paid as normal.',
        ur: 'تعطیلات تین قسم کی ہیں۔ "Public" یعنی سرکاری تعطیلات حکومت اعلان کرتی ہے، جیسے یومِ پاکستان۔ "Company" تعطیلات آپ کی اپنی ہیں، جیسے سالانہ اسٹاف ڈے۔ "Optional" تعطیلات، جیسے ایسٹر یا دیوالی، سب کے لیے چھٹی نہیں ہوتیں: جو ملازم یہ چھٹی لے وہ چھٹی کی درخواست دیتا ہے، باقی سب معمول کے مطابق کام کرتے اور تنخواہ پاتے ہیں۔',
      },
      do: async h => {
        await h.point({ text: 'Public Holidays', exact: true }, { hold: 1600 });
        await h.point({ text: 'Company Holidays', exact: true }, { hold: 1600 });
        await h.point({ text: 'Optional Holidays', exact: true }, { hold: 1400 });
      },
    },
    {
      say: {
        en: 'Below, the holidays of the chosen year are listed month by month. The small circular arrow next to a name, as for Independence Day, means the holiday repeats every year on the same date, from the year it was entered.',
        ur: 'نیچے منتخب سال کی تعطیلات مہینہ وار درج ہیں۔ کسی نام کے ساتھ چھوٹا گول تیر کا نشان ہو، جیسے یومِ آزادی کے ساتھ، تو مطلب ہے کہ یہ تعطیل درج ہونے والے سال سے ہر سال اسی تاریخ کو آتی ہے۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'Independence Day', exact: true });
        await h.point(page => page.locator('div', { hasText: /^Independence Day$/ }).first(), { hold: 2600 });
      },
    },
    {
      say: {
        en: 'We will now add Eid ul Fitr for next year. Choose twenty twenty-seven in the year list, then click Add Holiday.',
        ur: 'اب ہم اگلے سال کی عید الفطر شامل کرتے ہیں۔ سال کی فہرست میں 2027 منتخب کریں، پھر "Add Holiday" پر کلک کریں۔',
      },
      caption: {
        en: 'Now add Eid ul Fitr for next year: choose 2027 in the year list, then click Add Holiday.',
        ur: 'اب اگلے سال کی عید الفطر شامل کریں: سال کی فہرست میں 2027 منتخب کریں، پھر "Add Holiday" پر کلک کریں۔',
      },
      do: async h => {
        await h.scroll(-2000);
        await h.select({ label: 'Filter holidays by year' }, '2027');
        await h.click('Add Holiday', { after: 700 });
      },
    },
    {
      say: {
        en: 'Type the holiday name, Eid ul Fitr, day one, and its date. Islamic holidays depend on the moon, so enter the expected date now and correct it when the government announces the final date.',
        ur: 'تعطیل کا نام "Eid ul Fitr (Day 1)" اور اس کی تاریخ لکھیں۔ اسلامی تعطیلات چاند پر منحصر ہیں، اس لیے ابھی متوقع تاریخ درج کریں اور حکومت کے حتمی اعلان پر اسے درست کر لیں۔',
      },
      caption: {
        en: 'Type the name, Eid ul Fitr (Day 1), and the date. Islamic holidays depend on the moon: enter the expected date and correct it when the government announces it.',
        ur: 'نام "Eid ul Fitr (Day 1)" اور تاریخ لکھیں۔ اسلامی تعطیلات چاند پر منحصر ہیں: متوقع تاریخ درج کریں اور حکومتی اعلان پر درست کر لیں۔',
      },
      do: async h => {
        await h.fill({ label: 'Holiday Name', exact: true }, 'Eid ul Fitr (Day 1)');
        await h.fill({ css: '#holiday-date' }, '10-Mar-2027', { delay: 70 });
        await h.press('Tab');
      },
    },
    {
      say: {
        en: 'Keep the type Public and add a short description. Each day of a long Eid break is a separate entry, so add day two and day three the same way.',
        ur: 'قسم "Public" رہنے دیں اور ایک مختصر تفصیل لکھیں۔ عید کی لمبی چھٹیوں کا ہر دن الگ اندراج ہوتا ہے، اس لیے دوسرا اور تیسرا دن بھی اسی طرح شامل کریں۔',
      },
      do: async h => {
        await h.point({ label: 'Holiday type', exact: true }, { hold: 900 });
        await h.fill({ label: 'Description', exact: true }, 'Gazetted public holiday, date subject to moon sighting', { delay: 30 });
      },
    },
    {
      say: {
        en: 'Leave Recurring annually unticked here, because Eid moves about eleven days earlier every year. Tick it only for fixed dates, such as the fourteenth of August.',
        ur: 'یہاں "Recurring annually" پر ٹِک نہ لگائیں، کیونکہ عید ہر سال تقریباً گیارہ دن پہلے آتی ہے۔ اس پر ٹِک صرف مقررہ تاریخوں کے لیے لگائیں، جیسے چودہ اگست۔',
      },
      do: async h => { await h.point({ text: 'Recurring annually' }, { hold: 2600 }); },
    },
    {
      say: {
        en: 'Click Add Holiday. Eid ul Fitr now appears under March twenty twenty-seven.',
        ur: '"Add Holiday" پر کلک کریں۔ عید الفطر اب مارچ 2027 کے تحت نظر آ رہی ہے۔',
      },
      caption: { en: 'Click Add Holiday. Eid ul Fitr now appears under March 2027.', ur: '"Add Holiday" پر کلک کریں۔ عید الفطر اب مارچ 2027 کے تحت نظر آ رہی ہے۔' },
      do: async h => {
        await h.click(page => page.locator('.fixed').getByRole('button', { name: 'Add Holiday' }), { after: 1200 });
        await h.scrollTo({ text: 'Eid ul Fitr (Day 1)', exact: true });
        await h.point(page => page.locator('div.group', { hasText: 'Eid ul Fitr (Day 1)' }).first(), { hold: 2000 });
      },
    },
    {
      say: {
        en: 'What does a holiday change? In the attendance register that day shows as Holiday instead of Absent, so nobody loses pay for it, and it is not counted as a missed working day in payroll.',
        ur: 'تعطیل سے کیا فرق پڑتا ہے؟ حاضری رجسٹر میں وہ دن "Absent" کے بجائے "Holiday" دکھاتا ہے، اس لیے اس دن کی کسی کی تنخواہ نہیں کٹتی، اور پے رول میں اسے غیر حاضری کا دن نہیں گنا جاتا۔',
      },
      do: async h => { await h.point(page => page.locator('div.group', { hasText: 'Eid ul Fitr (Day 1)' }).first(), { hold: 3200 }); },
    },
    {
      say: {
        en: 'Add holidays before you lock the attendance of that month. If you add or change a holiday after locking, the system asks you to reopen and lock the register again before payroll.',
        ur: 'تعطیلات اس مہینے کی حاضری لاک کرنے سے پہلے شامل کریں۔ اگر لاک کے بعد کوئی تعطیل شامل یا تبدیل کریں تو سسٹم پے رول سے پہلے رجسٹر دوبارہ کھولنے اور پھر لاک کرنے کو کہتا ہے۔',
      },
      do: async h => { await h.point(page => page.getByRole('button', { name: /^7\. Attendance/ }), { hold: 2600 }); },
    },
    {
      say: {
        en: 'To correct a date or delete a holiday, move the mouse over it: the edit and delete buttons appear on the right.',
        ur: 'کسی تاریخ کو درست کرنے یا تعطیل حذف کرنے کے لیے ماؤس اس پر لے جائیں: دائیں طرف ترمیم اور حذف کے بٹن ظاہر ہو جاتے ہیں۔',
      },
      do: async h => {
        const row = page => page.locator('div.group', { hasText: 'Eid ul Fitr (Day 1)' }).first();
        await h.scrollTo(row);
        await (await h.resolve(row)).hover();
        await h.wait(400);
        await h.point(page => row(page).getByRole('button', { name: 'Edit holiday' }), { hold: 1600 });
        await h.point(page => row(page).getByRole('button', { name: 'Delete holiday' }), { hold: 1400 });
      },
    },
  ],
};
