// Chapter 21: final settlement for a leaving employee (Shahid Iqbal resigns, last day 30 Nov 2026).
// A --dry check does not save a second settlement when one from an earlier check already exists.
const DRY = process.argv.includes('--dry');
const EMPLOYEE = 'Shahid Iqbal';

const captionTop = h => h.page.evaluate(() => { const c = document.getElementById('tut-cap'); if (c) { c.style.top = '64px'; c.style.bottom = 'auto'; } });
const captionBottom = h => h.page.evaluate(() => { const c = document.getElementById('tut-cap'); if (c) { c.style.top = ''; c.style.bottom = ''; } });
const settlementRow = page => page.locator('tbody tr').filter({ hasText: EMPLOYEE }).filter({ hasText: 'Resignation' }).last();

export default {
  id: '21',
  slug: 'Gratuity-and-Final-Settlement',
  as: 'admin',
  start: '/',
  title: { en: 'Gratuity & Final Settlement', ur: 'گریجویٹی اور حتمی تصفیہ' },
  subtitle: {
    en: 'Work out what a leaving employee is owed: gratuity, leave encashment, notice pay and unpaid salary.',
    ur: 'نوکری چھوڑنے والے ملازم کے واجبات کا حساب: گریجویٹی، چھٹیوں کی رقم، نوٹس پے اور باقی تنخواہ۔',
  },
  audience: { en: ['Payroll staff', 'HR managers'], ur: ['پے رول عملہ', 'ایچ آر مینیجر'] },
  intro: {
    en: 'When an employee leaves, the company pays a final settlement. In this chapter we calculate one for Shahid Iqbal, who has resigned, and see how it is approved and paid.',
    ur: 'جب کوئی ملازم نوکری چھوڑتا ہے تو کمپنی اسے حتمی تصفیہ ادا کرتی ہے۔ اس باب میں ہم شاہد اقبال کا تصفیہ بنائیں گے، جنہوں نے استعفیٰ دیا ہے، اور دیکھیں گے کہ یہ کیسے منظور اور ادا ہوتا ہے۔',
  },
  steps: [
    {
      say: {
        en: 'Open Payroll and click Gratuity and Settlement. The cards at the top count all settlements, the pending ones, the paid ones and the total paid out.',
        ur: '"Payroll" کھولیں اور "Gratuity & Settlement" پر کلک کریں۔ اوپر کے کارڈز میں کل تصفیے، زیرِ التوا، ادا شدہ اور کل ادا کی گئی رقم نظر آتی ہے۔',
      },
      caption: {
        en: 'Open Payroll and click Gratuity & Settlement. The cards at the top count all settlements, the pending ones, the paid ones and the total paid out.',
        ur: '"Payroll" کھولیں اور "Gratuity & Settlement" پر کلک کریں۔ اوپر کے کارڈز میں کل تصفیے، زیرِ التوا، ادا شدہ اور کل ادا کی گئی رقم نظر آتی ہے۔',
      },
      do: async h => {
        await h.nav('Payroll', 'Gratuity & Settlement');
        await h.point({ text: 'Total Settlements' }, { hold: 900 });
        await h.point({ text: 'Total Paid Out' }, { hold: 900 });
      },
    },
    {
      say: {
        en: 'Usually the exit starts in Employee Lifecycle and the settlement follows from it. You can also calculate one directly here: click New Settlement.',
        ur: 'عام طور پر نوکری چھوڑنے کا عمل "Employee Lifecycle" سے شروع ہوتا ہے اور تصفیہ اسی سے بنتا ہے۔ آپ یہاں براہِ راست بھی حساب کر سکتے ہیں: "New Settlement" پر کلک کریں۔',
      },
      do: async h => { await h.click('New Settlement', { after: 900 }); },
    },
    {
      say: {
        en: 'Choose the employee. Type a few letters of the name and pick Shahid Iqbal. The box on the right shows his joining date, basic salary and years of service.',
        ur: 'ملازم منتخب کریں۔ نام کے چند حروف لکھیں اور "Shahid Iqbal" چنیں۔ دائیں طرف کے خانے میں ان کی شمولیت کی تاریخ، بنیادی تنخواہ اور ملازمت کے سال نظر آتے ہیں۔',
      },
      do: async h => {
        await h.click({ css: '#gratuity-employee' }, { after: 400 });
        await h.fill({ label: 'Search the list' }, 'Shahid', { delay: 70 });
        await h.click(page => page.getByRole('option', { name: EMPLOYEE }), { after: 600 });
        await h.point({ text: 'Joining Date:' }, { hold: 1300 });
      },
    },
    {
      say: {
        en: 'Set the separation type to Resignation and the last working date to thirtieth November twenty twenty-six. The years of service update at once.',
        ur: '"Separation Type" میں "Resignation" اور آخری کام کے دن میں تیس نومبر دو ہزار چھبیس درج کریں۔ ملازمت کے سال فوراً اپ ڈیٹ ہو جاتے ہیں۔',
      },
      caption: {
        en: 'Set the separation type to Resignation and the last working date to 30-Nov-2026. The years of service update at once.',
        ur: '"Separation Type" میں "Resignation" اور آخری کام کا دن 30-Nov-2026 درج کریں۔ ملازمت کے سال فوراً اپ ڈیٹ ہو جاتے ہیں۔',
      },
      do: async h => {
        await h.select({ css: '#gratuity-separation-type' }, 'Resignation');
        await h.fill({ css: '#gratuity-last-working-date' }, '30-Nov-2026', { delay: 60 });
        await h.press('Enter');
        await h.point({ text: /^Service:/ }, { hold: 1200 });
      },
    },
    {
      say: {
        en: 'Now the other amounts. He has eight days of earned leave to cash, and no notice pay is owed because he served his full notice. Pending salary days are for days that the monthly payroll will not pay.',
        ur: 'اب باقی رقوم۔ ان کی آٹھ دن کی چھٹیاں باقی ہیں جن کی رقم دی جائے گی، اور نوٹس پے نہیں بنتی کیونکہ انہوں نے پورا نوٹس پیریڈ کام کیا۔ "Pending Salary Days" ان دنوں کے لیے ہیں جن کی تنخواہ ماہانہ پے رول میں ادا نہیں ہوگی۔',
      },
      do: async h => {
        // A number field holding 0: select it first so typing replaces the 0 (fill('') would leave "08").
        await h.click({ css: '#gratuity-encashableLeaveDays' }, { after: 200 });
        await h.press('Control+A');
        await h.page.keyboard.type('8', { delay: 90 });
        await h.point({ css: '#gratuity-noticePayDays' }, { hold: 900 });
        await h.point({ css: '#gratuity-pendingSalaryDays' }, { hold: 900 });
        await h.fill({ css: '#gratuity-notes' }, 'Resigned with full notice. Clearance from Admin pending.', { delay: 30 });
      },
    },
    {
      say: {
        en: 'The Settlement Breakdown does the arithmetic. Gratuity is thirty days of basic salary for each completed year of service, from the rule in Statutory Config. Leave encashment and notice pay use the daily rate. The total is at the bottom.',
        ur: '"Settlement Breakdown" سارا حساب خود کرتا ہے۔ گریجویٹی ہر مکمل سال کے بدلے تیس دن کی بنیادی تنخواہ ہے، جو "Statutory Config" کے اصول سے آتی ہے۔ چھٹیوں کی رقم اور نوٹس پے یومیہ ریٹ سے بنتی ہیں۔ کل رقم سب سے نیچے ہے۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'Settlement Breakdown' });
        await h.point({ text: 'Settlement Breakdown' }, { hold: 800 });
        await h.point({ text: /^Gratuity \(/ }, { hold: 1500 });
        await h.point({ text: /^Leave Encashment \(/ }, { hold: 1100 });
        await captionTop(h);
        await h.point({ text: 'Total Settlement Amount' }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Click Save Settlement. It is saved as Pending.',
        ur: '"Save Settlement" پر کلک کریں۔ یہ "Pending" کے طور پر محفوظ ہو جاتا ہے۔',
      },
      do: async h => {
        const exists = await settlementRow(h.page).count().catch(() => 0);
        if (DRY && exists) { await h.point('Save Settlement', { hold: 900 }); await h.click('Cancel', { after: 700 }); }
        else await h.click('Save Settlement', { after: 1200 });
        await captionBottom(h);
      },
    },
    {
      say: {
        en: 'The list now shows the settlement with gratuity, leave encashment, notice pay and the total. The same maker and checker rule applies: the person who created it cannot process it. Another payroll user clicks Process after checking it.',
        ur: 'فہرست میں اب یہ تصفیہ گریجویٹی، چھٹیوں کی رقم، نوٹس پے اور کل رقم کے ساتھ نظر آتا ہے۔ یہاں بھی "maker-checker" کا اصول ہے: جس نے یہ بنایا وہ اسے "Process" نہیں کر سکتا۔ کوئی دوسرا پے رول صارف جانچ کر "Process" پر کلک کرتا ہے۔',
      },
      do: async h => {
        const row = settlementRow(h.page);
        await h.point(() => row, { hold: 1500 });
        await h.point(() => row.getByText('Pending', { exact: true }), { hold: 900 });
        await h.point(() => row.getByRole('button', { name: 'Process' }), { hold: 1600 });
      },
    },
    {
      say: {
        en: 'Before a settlement can be processed or paid, every company asset with the employee must be returned under Asset Management. A processed settlement then appears on the Payroll Processing screen, under Approved settlements awaiting payroll, where it is paid through a final settlement run.',
        ur: 'تصفیہ "Process" یا ادا ہونے سے پہلے ملازم کے پاس موجود کمپنی کا ہر اثاثہ "Asset Management" میں واپس درج ہونا ضروری ہے۔ پروسیس شدہ تصفیہ پھر "Payroll Processing" کی اسکرین پر "Approved settlements awaiting payroll" میں آتا ہے، جہاں اسے فائنل سیٹلمنٹ پے رول کے ذریعے ادا کیا جاتا ہے۔',
      },
      do: async h => {
        await h.nav('Payroll', 'Payroll Processing');
        await h.scrollTo({ text: /^Approved settlements awaiting payroll/ });
        await h.point({ text: /^Approved settlements awaiting payroll/ }, { hold: 2200 });
      },
    },
    {
      say: {
        en: 'When the money has gone out, a third person clicks Mark Paid on the Gratuity screen. Every settlement, paid or not, is also listed in Reports, under Payroll Reports, Gratuity and final settlements.',
        ur: 'رقم ادا ہونے کے بعد ایک تیسرا شخص "Gratuity" کی اسکرین پر "Mark Paid" پر کلک کرتا ہے۔ ہر تصفیہ، ادا شدہ ہو یا نہیں، "Reports" میں "Payroll Reports" کے اندر "Gratuity and final settlements" میں بھی نظر آتا ہے۔',
      },
      do: async h => {
        await h.nav('Payroll', 'Gratuity & Settlement');
        await h.point(() => settlementRow(h.page).locator('td').nth(7), { hold: 2000 });
      },
      hold: 900,
    },
  ],
};
