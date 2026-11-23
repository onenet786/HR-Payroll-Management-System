// Chapter 19: Salary Revisions (salary register, preparing an increment with an effective date, maker-checker approval,
// history). The increment prepared in the chapter cannot be approved by the same user; the demo's own draft for
// Bilal Ahmed, prepared by the HR Manager, is the one approved.

async function pickEmployee(h, trigger, search, optionText) {
  await h.click(trigger, { after: 400 });
  await h.fill({ placeholder: 'Type to search…' }, search, { delay: 70 });
  await h.click({ role: 'option', name: optionText }, { after: 500 });
}
const card = (page, text, button) => page.locator('div', { hasText: text }).filter({ has: page.getByRole('button', { name: button }) }).last();
const USMAN_REASON = 'Annual increment after strong sales in the North Zone';
const HISTORY = { text: 'Revision History', exact: true };
// Scrolls an element to just under the sticky top bar, clear of the caption at the bottom.
async function toTop(h, target, offset = 70) {
  await h.page.evaluate(() => { const m = document.querySelector('main'); if (m) m.style.paddingBottom = '520px'; });
  const loc = await h.resolve(target);
  await loc.evaluate((el, off) => { const y = el.getBoundingClientRect().top; let p = el.parentElement; while (p && !(p.scrollHeight > p.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement; (p || document.scrollingElement).scrollBy({ top: y - off, behavior: 'smooth' }); }, offset);
  await h.wait(900);
}

export default {
  id: '19',
  slug: 'Salary-Revisions',
  as: 'admin',
  title: { en: 'Salary Revisions', ur: 'تنخواہ میں ترمیم' },
  subtitle: {
    en: 'Raise a salary with an effective date, have it approved by a second person, and keep the full history.',
    ur: 'مؤثر تاریخ کے ساتھ تنخواہ بڑھائیں، کسی دوسرے فرد سے منظور کروائیں، اور پوری تاریخ محفوظ رکھیں۔',
  },
  audience: { en: ['HR staff', 'Payroll staff'], ur: ['ایچ آر عملہ', 'پے رول عملہ'] },
  intro: {
    en: 'Increments and promotions change what payroll pays, so the system never lets one person do it alone. In this chapter you will prepare an increment, approve one prepared by a colleague, and read the history.',
    ur: 'سالانہ اضافہ اور ترقی سے پے رول کی ادائیگی بدل جاتی ہے، اس لیے سسٹم کسی ایک شخص کو اکیلے یہ کام نہیں کرنے دیتا۔ اس باب میں آپ ایک اضافہ تیار کریں گے، ایک ساتھی کا تیار کیا ہوا اضافہ منظور کریں گے، اور تاریخ دیکھیں گے۔',
  },
  steps: [
    {
      say: {
        en: 'Open Payroll in the menu on the left, then click Salary Revisions.',
        ur: 'بائیں طرف کے مینو میں "Payroll" کھولیں، پھر "Salary Revisions" پر کلک کریں۔',
      },
      do: async h => { await h.nav('Payroll', 'Salary Revisions'); },
    },
    {
      say: {
        en: 'The Current Salary Register lists every employee with the salary payroll uses today, the date of the last revision and the percentage change.',
        ur: '"Current Salary Register" میں ہر ملازم کی وہ تنخواہ نظر آتی ہے جو آج پے رول استعمال کرتا ہے، ساتھ آخری ترمیم کی تاریخ اور فیصد تبدیلی۔',
      },
      do: async h => {
        await h.point({ text: 'Current Salary Register' }, { hold: 900 });
        await h.point(page => page.locator('tr', { hasText: 'Fatima Noor' }), { hold: 1800 });
      },
    },
    {
      say: {
        en: 'Usman Tariq earns seventy thousand rupees. After a strong year in sales he gets a ten percent increment from the first of December. Click Process Increment.',
        ur: 'عثمان طارق کی تنخواہ ستر ہزار روپے ہے۔ سیلز میں اچھے سال کے بعد انہیں یکم دسمبر سے دس فیصد اضافہ مل رہا ہے۔ "Process Increment" پر کلک کریں۔',
      },
      caption: { en: 'Usman Tariq earns PKR 70,000. He gets a 10% increment from 1-Dec-2026. Click Process Increment.', ur: 'عثمان طارق کی تنخواہ 70,000 روپے ہے۔ انہیں 1-Dec-2026 سے 10% اضافہ مل رہا ہے۔ "Process Increment" پر کلک کریں۔' },
      do: async h => {
        await h.point(page => page.locator('tr', { hasText: 'Usman Tariq' }), { hold: 1500 });
        await h.click('Process Increment', { after: 700 });
      },
    },
    {
      say: {
        en: 'Choose the employee and the revision type: Annual Increment, Promotion, Adjustment or Market Correction. The current salary is shown for reference.',
        ur: 'ملازم اور ترمیم کی قسم منتخب کریں: "Annual Increment"، "Promotion"، "Adjustment" یا "Market Correction"۔ موجودہ تنخواہ حوالے کے لیے سامنے نظر آتی ہے۔',
      },
      do: async h => {
        await pickEmployee(h, { css: 'button[aria-label="Employee"]' }, 'Usman', 'Usman Tariq');
        await h.select({ css: 'select[aria-label="Revision Type"]' }, 'Annual Increment');
        await h.point({ text: /Current salary:/ }, { hold: 1400 });
      },
    },
    {
      say: {
        en: 'Enter the new salary, seventy-seven thousand, and the effective date, the first of December. The preview shows the increase in rupees and in percent.',
        ur: 'نئی تنخواہ لکھیں، ستتر ہزار، اور مؤثر تاریخ، یکم دسمبر۔ پیش منظر میں اضافہ روپوں اور فیصد دونوں میں نظر آتا ہے۔',
      },
      caption: { en: 'Enter the new salary (PKR 77,000) and the effective date (01-Dec-2026). The preview shows the increase in PKR and %.', ur: 'نئی تنخواہ (77,000 روپے) اور مؤثر تاریخ (01-Dec-2026) لکھیں۔ پیش منظر میں اضافہ روپوں اور فیصد میں نظر آتا ہے۔' },
      do: async h => {
        await h.fill({ css: 'input[aria-label="New Salary (PKR)"]' }, '77000', { delay: 90 });
        await h.fill({ css: 'input[aria-label="Effective Date"]' }, '01-Dec-2026'); await h.press('Enter');
        await h.point({ text: /Preview:/ }, { hold: 1600 });
      },
    },
    {
      say: {
        en: 'Write the reason, then click Submit Revision for Approval.',
        ur: 'وجہ لکھیں، پھر "Submit Revision for Approval" پر کلک کریں۔',
      },
      do: async h => {
        await h.fill({ css: 'textarea[aria-label="Reason / Notes"]' }, USMAN_REASON, { delay: 35 });
        await h.click('Submit Revision for Approval', { after: 1200 });
      },
    },
    {
      say: {
        en: 'The revision is saved as a draft: Draft, not applied. Usman\'s salary does not change yet, and the Approve and Apply button is grey, because the person who prepared a revision can never approve it.',
        ur: 'ترمیم ڈرافٹ کے طور پر محفوظ ہو گئی: "DRAFT — NOT APPLIED"۔ عثمان کی تنخواہ ابھی نہیں بدلی، اور "Approve & Apply" کا بٹن مدھم ہے، کیونکہ ترمیم تیار کرنے والا خود اسے کبھی منظور نہیں کر سکتا۔',
      },
      caption: {
        en: 'Saved as DRAFT — NOT APPLIED. The salary does not change yet, and Approve & Apply is grey: whoever prepared a revision can never approve it.',
        ur: '"DRAFT — NOT APPLIED" کے طور پر محفوظ۔ تنخواہ ابھی نہیں بدلی، اور "Approve & Apply" مدھم ہے: تیار کرنے والا خود منظور نہیں کر سکتا۔',
      },
      do: async h => {
        const mine = page => card(page, USMAN_REASON, 'Approve & Apply');
        await toTop(h, HISTORY);
        await h.point(page => mine(page).getByText('DRAFT — NOT APPLIED'), { hold: 1400 });
        await h.point(page => mine(page).getByRole('button', { name: 'Approve & Apply' }), { hold: 1800 });
      },
    },
    {
      say: {
        en: 'A finance manager or another authorised user signs in and approves it. As an example, here is Bilal Ahmed\'s increment, prepared by the HR Manager, Ayesha Siddiqui. We did not prepare it, so we may approve it.',
        ur: 'فنانس مینیجر یا کوئی دوسرا مجاز یوزر لاگ ان کر کے اسے منظور کرتا ہے۔ مثال کے طور پر یہ بلال احمد کا اضافہ ہے، جو ایچ آر مینیجر عائشہ صدیقی نے تیار کیا ہے۔ یہ ہم نے تیار نہیں کیا، اس لیے ہم اسے منظور کر سکتے ہیں۔',
      },
      do: async h => {
        const bilal = page => card(page, 'awaiting finance approval', 'Approve & Apply');
        if (!(await bilal(h.page).count())) { await h.wait(2000); return; }
        await toTop(h, HISTORY);
        await h.point(page => bilal(page).getByText('Ayesha Siddiqui (HR Manager)').first(), { hold: 1500 });
        await h.point(page => bilal(page).getByText(/from PKR/), { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Click Approve and Apply. The new salary is written to the employee record at once. If the effective date is in a month that was already paid, the difference is added as arrears in the next payroll.',
        ur: '"Approve & Apply" پر کلک کریں۔ نئی تنخواہ فوراً ملازم کے ریکارڈ میں درج ہو جاتی ہے۔ اگر مؤثر تاریخ کسی ایسے مہینے کی ہو جس کی تنخواہ ادا ہو چکی ہے، تو فرق بقایا جات کے طور پر اگلے پے رول میں شامل ہو جاتا ہے۔',
      },
      caption: {
        en: 'Click Approve & Apply. The new salary is written to the employee record at once. If the effective date is in a month already paid, the difference is added as arrears in the next payroll.',
        ur: '"Approve & Apply" پر کلک کریں۔ نئی تنخواہ فوراً ریکارڈ میں درج ہو جاتی ہے۔ اگر مؤثر تاریخ کسی ادا شدہ مہینے کی ہو تو فرق اگلے پے رول میں بقایا جات کے طور پر آتا ہے۔',
      },
      do: async h => {
        const bilal = page => card(page, 'awaiting finance approval', 'Approve & Apply');
        if (!(await bilal(h.page).count())) { await h.wait(2000); return; }
        const button = page => bilal(page).getByRole('button', { name: 'Approve & Apply' });
        await toTop(h, HISTORY);
        if (await button(h.page).isEnabled()) await h.click(button, { after: 1500 });
        else await h.point(button, { hold: 1500 });
        await h.point(page => page.locator('div', { hasText: 'awaiting finance approval' }).filter({ hasText: 'Approved by:' }).last(), { hold: 1600 });
      },
    },
    {
      say: {
        en: 'Back in the salary register, Bilal now shows ninety-three thousand five hundred rupees, with the revision date and plus ten percent. The next payroll run uses this amount.',
        ur: 'تنخواہ کے رجسٹر میں اب بلال کی تنخواہ ترانوے ہزار پانچ سو روپے ہے، ساتھ ترمیم کی تاریخ اور جمع دس فیصد۔ اگلا پے رول یہی رقم استعمال کرے گا۔',
      },
      caption: { en: 'In the salary register Bilal now shows PKR 93,500, with the revision date and +10%. The next payroll run uses this amount.', ur: 'رجسٹر میں اب بلال کی تنخواہ 93,500 روپے ہے، ترمیم کی تاریخ اور +10% کے ساتھ۔ اگلا پے رول یہی رقم استعمال کرے گا۔' },
      do: async h => {
        const row = page => page.locator('tr', { hasText: 'Bilal Ahmed' });
        await h.scrollTo(row);
        await h.point(row, { hold: 2600 });
      },
    },
    {
      say: {
        en: 'Every revision stays in the Revision History, approved or not, with who prepared it, who approved it and when. Approved revisions can never be deleted. Choose an employee in the filter to see one person\'s history.',
        ur: 'ہر ترمیم "Revision History" میں محفوظ رہتی ہے، منظور شدہ ہو یا نہیں، ساتھ یہ کہ کس نے تیار کی، کس نے منظور کی اور کب۔ منظور شدہ ترمیم کبھی حذف نہیں ہو سکتی۔ کسی ایک ملازم کی تاریخ دیکھنے کے لیے فلٹر میں اسے منتخب کریں۔',
      },
      do: async h => {
        await toTop(h, HISTORY);
        await pickEmployee(h, { css: 'button[aria-label="Filter salary revisions by employee"]' }, 'Fatima', 'Fatima Noor');
        await toTop(h, HISTORY);
        await h.point(page => page.locator('div', { hasText: 'performance review' }).filter({ hasText: 'Approved by:' }).last(), { hold: 1800 });
      },
    },
    {
      say: {
        en: 'For many employees at once, for example a yearly increment for everyone, use Upload salary sheet: it creates one draft for each row, and the approver can approve them together.',
        ur: 'ایک ساتھ کئی ملازمین کے لیے، مثلاً سب کا سالانہ اضافہ، "Upload salary sheet" استعمال کریں: یہ ہر قطار کے لیے ایک ڈرافٹ بناتا ہے، اور منظوری دینے والا سب کو ایک ساتھ منظور کر سکتا ہے۔',
      },
      do: async h => {
        await pickEmployee(h, { css: 'button[aria-label="Filter salary revisions by employee"]' }, 'All', 'All Employees');
        await h.point('Upload salary sheet', { hold: 2400 });
      },
    },
  ],
};
