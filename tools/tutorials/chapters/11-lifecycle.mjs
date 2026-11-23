// Chapter 11: Employee Lifecycle (onboarding checklist, probation, promotion/transfer, resignation and exit).
// Uses Ayesha Khan (added in chapter 10) for the onboarding checklist, raises a promotion for Bilal Ahmed, and
// approves the demo data's pending probation confirmation of Mariam Khan (raised by another HR user).
// Tariq Javed's pending resignation is only explained, not approved: chapter 21 (final settlement) may use it.
const requestForm = page => page.locator('form', { hasText: 'Raise a request' });
const pendingItem = text => page => page.locator('li', { hasText: text }).first();
// Narrows the request lists quietly (the lists are long; this keeps the item talked about above the caption bar).
async function only(h, text) {
  await h.page.getByPlaceholder('Search employee, request type, reason…').fill(text);
  await h.wait(400);
}

export default {
  id: '11',
  slug: 'Employee-Lifecycle',
  as: 'admin',
  title: { en: 'Employee Lifecycle', ur: 'ملازمت کا دورانیہ' },
  subtitle: {
    en: 'Joining checklist, probation, promotion and transfer, resignation and exit: every change approved by a second person.',
    ur: 'شمولیت کی چیک لسٹ، پروبیشن، ترقی اور تبادلہ، استعفیٰ اور علیحدگی: ہر تبدیلی کی منظوری دوسرا شخص دیتا ہے۔',
  },
  audience: { en: ['HR staff'], ur: ['ایچ آر عملہ'] },
  intro: {
    en: 'From the first day to the last, an employee\'s record changes many times. In this chapter you will complete a joining checklist, raise a promotion, approve a probation confirmation, and see how a resignation is handled.',
    ur: 'پہلے دن سے آخری دن تک ملازم کا ریکارڈ کئی بار بدلتا ہے۔ اس باب میں آپ شمولیت کی چیک لسٹ مکمل کریں گے، ترقی کی درخواست دیں گے، پروبیشن کی تصدیق منظور کریں گے، اور دیکھیں گے کہ استعفیٰ کیسے نمٹایا جاتا ہے۔',
  },
  // Approvals ask for a comment in a browser prompt (not visible in a headless recording): answer it, log the rest.
  setup: async h => {
    h.page.on('dialog', d => {
      h.log(`dialog: ${d.message().split('\n')[0]}`);
      d.accept(d.type() === 'prompt' ? 'Probation completed with good feedback; confirmed.' : undefined).catch(() => undefined);
    });
  },
  steps: [
    {
      say: {
        en: 'Open People in the menu on the left, then click Employee Lifecycle. Every change made here waits for a second authorised person to approve it before the employee record changes.',
        ur: 'بائیں طرف کے مینو میں "People" کھولیں، پھر "Employee Lifecycle" پر کلک کریں۔ یہاں کی ہر تبدیلی ملازم کے ریکارڈ پر لاگو ہونے سے پہلے دوسرے مجاز شخص کی منظوری کا انتظار کرتی ہے۔',
      },
      do: async h => { await h.nav('People', 'Employee Lifecycle'); },
    },
    {
      say: {
        en: 'Start with the joining checklist. Click Onboarding and search for Ayesha Khan, who joined today.',
        ur: 'شمولیت کی چیک لسٹ سے شروع کریں۔ "Onboarding" پر کلک کریں اور عائشہ خان کو تلاش کریں، جو آج شامل ہوئی ہیں۔',
      },
      do: async h => {
        await h.click(page => page.getByRole('button', { name: /^Onboarding/ }), { after: 600 });
        await h.fill({ placeholder: 'Search employee, code, department…' }, 'Ayesha Khan', { delay: 80 });
        await h.wait(600);
      },
    },
    {
      say: {
        en: 'Tick each item as it is done: her CNIC copy is on file and she has signed her appointment letter. Items marked auto are ticked by the system itself, for example when her fingerprint is enrolled.',
        ur: 'ہر کام مکمل ہونے پر اس پر ٹِک لگائیں: ان کے شناختی کارڈ کی کاپی فائل میں ہے اور انہوں نے تقرری نامے پر دستخط کر دیے ہیں۔ جن پر "auto" لکھا ہے ان پر سسٹم خود ٹِک لگاتا ہے، مثلاً جب ان کا فنگر پرنٹ درج ہو جائے۔',
      },
      do: async h => {
        const card = page => page.locator('div.rounded-lg.border', { hasText: 'Ayesha Khan' }).first();
        await h.check(page => card(page).getByLabel('CNIC copy on file'));
        await h.wait(500);
        await h.check(page => card(page).getByLabel('Signed appointment letter'));
        await h.wait(500);
        await h.point(page => card(page).getByText('Fingerprint or face enrolled (auto)'), { hold: 1800 });
      },
    },
    {
      say: {
        en: 'Now open Requests. On the left you raise a request: choose the employee, the type of change, the date it takes effect, and the reason.',
        ur: 'اب "Requests" کھولیں۔ بائیں طرف آپ درخواست دیتے ہیں: ملازم، تبدیلی کی قسم، لاگو ہونے کی تاریخ اور وجہ منتخب کریں۔',
      },
      do: async h => {
        await h.click(page => page.getByRole('button', { name: 'Requests', exact: true }), { after: 400 });
        await h.page.getByPlaceholder('Search employee, request type, reason…').fill(''); // the search box keeps the onboarding search
        await h.wait(300);
        await h.point(requestForm, { hold: 1800 });
      },
    },
    {
      say: {
        en: 'The types are probation confirmation or extension, transfer, promotion, resignation and termination. Here we propose a promotion for Bilal Ahmed, from HR Officer to HR Manager, from the first of January.',
        ur: 'اقسام یہ ہیں: پروبیشن کی تصدیق یا توسیع، تبادلہ، ترقی، استعفیٰ اور برطرفی۔ یہاں ہم بلال احمد کی ترقی تجویز کرتے ہیں، "HR Officer" سے "HR Manager"، یکم جنوری سے۔',
      },
      do: async h => {
        await h.select(page => requestForm(page).locator('select').first(), 'Bilal Ahmed (AJM-HR-00002)');
        await h.select(page => requestForm(page).locator('select').nth(1), 'Promotion');
        await h.fill(page => requestForm(page).locator('input[placeholder="DD-MMM-YYYY"]').first(), '01-Jan-2027', { delay: 60 });
        await h.press('Tab');
        await h.select(page => requestForm(page).locator('label', { hasText: 'New designation' }).locator('select'), 'HR Manager');
      },
    },
    {
      say: {
        en: 'Optionally type the proposed salary. The salary itself still goes through its own approval in Salary Revisions. Then write the reason and click Submit for approval.',
        ur: 'چاہیں تو مجوزہ تنخواہ لکھ دیں۔ تنخواہ کی تبدیلی پھر بھی "Salary Revisions" میں الگ منظوری سے گزرتی ہے۔ پھر وجہ لکھیں اور "Submit for approval" پر کلک کریں۔',
      },
      do: async h => {
        await h.fill(page => requestForm(page).locator('input[type=number]'), '140000', { delay: 80 });
        await h.fill(page => requestForm(page).locator('textarea'), 'Leads payroll and recruitment since July; manager post vacant after restructuring.', { delay: 25 });
        await h.click('Submit for approval', { after: 1200 });
      },
    },
    {
      say: {
        en: 'The request now waits under Awaiting approval. Its Approve button is greyed out for you, because the person who raised a request can never approve it. Another HR user must decide.',
        ur: 'درخواست اب "Awaiting approval" میں انتظار کر رہی ہے۔ آپ کے لیے اس کا "Approve" بٹن غیر فعال ہے، کیونکہ درخواست دینے والا اسے کبھی منظور نہیں کر سکتا۔ فیصلہ کوئی دوسرا ایچ آر صارف کرے گا۔',
      },
      do: async h => {
        await only(h, 'Promotion');
        await h.point(pendingItem('Promotion — Bilal Ahmed'), { hold: 1600 });
        await h.point(page => pendingItem('Promotion — Bilal Ahmed')(page).getByRole('button', { name: 'Approve' }), { hold: 1800 });
      },
    },
    {
      say: {
        en: 'This request was raised by another HR officer: Mariam Khan has completed her probation. Read the reason, then click Approve. The system asks for a short comment, which is saved with the decision.',
        ur: 'یہ درخواست ایک اور ایچ آر افسر نے دی ہے: مریم خان نے اپنا پروبیشن مکمل کر لیا ہے۔ وجہ پڑھیں، پھر "Approve" پر کلک کریں۔ سسٹم ایک مختصر تبصرہ مانگتا ہے، جو فیصلے کے ساتھ محفوظ ہو جاتا ہے۔',
      },
      do: async h => {
        await only(h, 'Mariam Khan');
        await h.point(pendingItem('Probation Confirmation — Mariam Khan'), { hold: 1800 });
        await h.click(page => pendingItem('Probation Confirmation — Mariam Khan')(page).getByRole('button', { name: 'Approve' }), { after: 1500 });
      },
    },
    {
      say: {
        en: 'The decision moves to Recent decisions, and Mariam\'s record is updated: she is now a confirmed employee.',
        ur: 'فیصلہ "Recent decisions" میں چلا گیا ہے، اور مریم کا ریکارڈ اپ ڈیٹ ہو گیا ہے: اب وہ مستقل ملازم ہیں۔',
      },
      do: async h => {
        await h.point(page => page.locator('section', { hasText: 'Recent decisions' }).locator('li', { hasText: 'Mariam Khan' }).first(), { hold: 2600 });
      },
    },
    {
      say: {
        en: 'A transfer works the same way: choose Transfer, then the destination branch, department and designation. A probation extension asks for the new review date.',
        ur: 'تبادلہ بھی اسی طرح ہوتا ہے: "Transfer" منتخب کریں، پھر نئی برانچ، شعبہ اور عہدہ۔ پروبیشن میں توسیع کے لیے نئی جائزے کی تاریخ پوچھی جاتی ہے۔',
      },
      do: async h => {
        await only(h, '');
        await h.select(page => requestForm(page).locator('select').nth(1), 'Transfer');
        await h.scroll(330);
        await h.point(page => requestForm(page).getByText('Destination branch'), { hold: 1500 });
        await h.point(page => requestForm(page).getByText('Destination department'), { hold: 1300 });
      },
    },
    {
      say: {
        en: 'For a resignation, like Tariq Javed\'s here, you enter the notice pay days and the leave days to be encashed. When it is approved, the system creates his final settlement automatically, which is covered in the Gratuity and Final Settlement chapter.',
        ur: 'استعفیٰ کے لیے، جیسے یہاں طارق جاوید کا، نوٹس پے کے دن اور نقد کی جانے والی چھٹیوں کے دن درج کیے جاتے ہیں۔ منظوری پر سسٹم ان کا حتمی تصفیہ خود بنا دیتا ہے، جو "Gratuity & Final Settlement" والے باب میں دکھایا گیا ہے۔',
      },
      do: async h => {
        await h.select(page => requestForm(page).locator('select').nth(1), 'Probation Confirmation');
        await h.scroll(-2000);
        await only(h, 'Resignation');
        await h.point(pendingItem('Resignation — Tariq Javed'), { hold: 3000 });
        await only(h, '');
      },
    },
    {
      say: {
        en: 'Finally, Letters prints an employment letter for current staff, and an experience certificate for staff who have left.',
        ur: 'آخر میں، "Letters" سے موجودہ ملازمین کے لیے ملازمت کا خط، اور جا چکے ملازمین کے لیے تجربے کا سرٹیفکیٹ پرنٹ کیا جاتا ہے۔',
      },
      do: async h => {
        await h.click(page => page.getByRole('button', { name: 'Letters', exact: true }), { after: 700 });
        await h.point(page => page.getByRole('button', { name: 'Employment letter' }).first(), { hold: 2200 });
      },
    },
  ],
};
