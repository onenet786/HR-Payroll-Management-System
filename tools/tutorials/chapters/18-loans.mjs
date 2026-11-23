// Chapter 18: Loans & Advances (overview, giving an advance, monthly instalments deducted by payroll, approving a request).
// The request created in the chapter is the one approved, so the chapter works on any database; the demo's own pending
// advance (Naveed Akhtar) is shown as waiting and left for payroll.

async function pickEmployee(h, trigger, search, optionText) {
  await h.click(trigger, { after: 400 });
  await h.fill({ placeholder: 'Type to search…' }, search, { delay: 70 });
  await h.click({ role: 'option', name: optionText }, { after: 500 });
}
// The innermost card that holds both the text and the button.
// Scrolls an element to just under the sticky top bar, clear of the caption at the bottom; extra room below the page
// lets short pages scroll that far.
async function toTop(h, target, offset = 70) {
  await h.page.evaluate(() => { const m = document.querySelector('main'); if (m) m.style.paddingBottom = '520px'; });
  const loc = await h.resolve(target);
  await loc.evaluate((el, off) => { const y = el.getBoundingClientRect().top; let p = el.parentElement; while (p && !(p.scrollHeight > p.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement; (p || document.scrollingElement).scrollBy({ top: y - off, behavior: 'smooth' }); }, offset);
  await h.wait(900);
}
const card = (page, text, button) => page.locator('div', { hasText: text }).filter({ has: page.getByRole('button', { name: button }) }).last();

export default {
  id: '18',
  slug: 'Loans-and-Advances',
  as: 'admin',
  title: { en: 'Loans & Advances', ur: 'قرضے اور ایڈوانس' },
  subtitle: {
    en: 'Give an employee a loan or salary advance, approve it, and let payroll recover it in monthly instalments.',
    ur: 'ملازم کو قرض یا تنخواہ کا ایڈوانس دیں، اسے منظور کریں، اور پے رول کو ماہانہ قسطوں میں وصولی کرنے دیں۔',
  },
  audience: { en: ['HR staff', 'Payroll staff'], ur: ['ایچ آر عملہ', 'پے رول عملہ'] },
  intro: {
    en: 'Employees sometimes need money before payday. In this chapter you will record a salary advance, approve it, and see how the instalments are taken from the monthly salary.',
    ur: 'کبھی کبھی ملازمین کو تنخواہ سے پہلے پیسوں کی ضرورت ہوتی ہے۔ اس باب میں آپ تنخواہ کا ایڈوانس درج کریں گے، اسے منظور کریں گے، اور دیکھیں گے کہ قسطیں ماہانہ تنخواہ سے کیسے کٹتی ہیں۔',
  },
  steps: [
    {
      say: {
        en: 'Open Payroll in the menu on the left, then click Loans and Advances.',
        ur: 'بائیں طرف کے مینو میں "Payroll" کھولیں، پھر "Loans & Advances" پر کلک کریں۔',
      },
      caption: { en: 'Open Payroll in the menu on the left, then click Loans & Advances.', ur: 'بائیں مینو میں "Payroll" کھولیں، پھر "Loans & Advances" پر کلک کریں۔' },
      do: async h => { await h.nav('Payroll', 'Loans & Advances'); },
    },
    {
      say: {
        en: 'At the top you see how many requests are waiting for approval, how many loans are running, and the total amount still to be recovered.',
        ur: 'اوپر نظر آتا ہے کہ کتنی درخواستیں منظوری کی منتظر ہیں، کتنے قرضے چل رہے ہیں، اور کل کتنی رقم ابھی وصول ہونا باقی ہے۔',
      },
      do: async h => {
        await h.point({ text: 'Pending Approval' }, { hold: 1000 });
        await h.point({ text: 'Active Loans' }, { hold: 1000 });
        await h.point({ text: 'Total Outstanding' }, { hold: 1200 });
      },
    },
    {
      say: {
        en: 'Kashif Mehmood has a motorcycle loan of one hundred and twenty thousand rupees. Ten thousand is deducted from his payslip every month, and the card shows how much is repaid and how many instalments are left.',
        ur: 'کاشف محمود نے موٹر سائیکل کے لیے ایک لاکھ بیس ہزار روپے کا قرض لیا ہے۔ ہر مہینے اس کی تنخواہ سے دس ہزار روپے کٹتے ہیں، اور کارڈ پر نظر آتا ہے کہ کتنا ادا ہو چکا ہے اور کتنی قسطیں باقی ہیں۔',
      },
      caption: {
        en: 'Kashif Mehmood: motorcycle loan of PKR 120,000. PKR 10,000 is deducted from his payslip every month; the card shows what is repaid and what is left.',
        ur: 'کاشف محمود: موٹر سائیکل کا قرض 120,000 روپے۔ ہر ماہ 10,000 روپے تنخواہ سے کٹتے ہیں؛ کارڈ پر ادا شدہ اور باقی رقم نظر آتی ہے۔',
      },
      do: async h => {
        await toTop(h, { text: 'Kashif Mehmood' }, 330);
        await h.point({ text: 'Motorcycle purchase' }, { hold: 900 });
        await h.point({ text: /Remaining: .* installments/ }, { hold: 1300 });
        await h.point({ text: /Monthly deduction/ }, { hold: 1300 });
      },
    },
    {
      say: {
        en: 'Now Zainab Bibi needs an advance for her mother\'s treatment. Click Apply for Loan or Advance.',
        ur: 'اب زینب بی بی کو اپنی والدہ کے علاج کے لیے ایڈوانس چاہیے۔ "Apply for Loan/Advance" پر کلک کریں۔',
      },
      do: async h => { await h.scroll(-600); await h.click('Apply for Loan/Advance', { after: 700 }); },
    },
    {
      say: {
        en: 'Choose the employee, keep the type Salary Advance, and enter the amount: twenty thousand rupees.',
        ur: 'ملازم منتخب کریں، قسم "Salary Advance" ہی رہنے دیں، اور رقم لکھیں: بیس ہزار روپے۔',
      },
      caption: { en: 'Choose the employee, keep the type Salary Advance, and enter the amount: PKR 20,000.', ur: 'ملازم منتخب کریں، قسم "Salary Advance" رہنے دیں، اور رقم لکھیں: 20,000 روپے۔' },
      do: async h => {
        await pickEmployee(h, { css: '#loan-employee' }, 'Zainab', 'Zainab Bibi');
        await h.select({ css: '#loan-type' }, 'Salary Advance');
        const { loc } = await h.point({ css: '#loan-amount' }, { hold: 350 });
        await loc.click(); await h.press('Control+A');
        await loc.pressSequentially('20000', { delay: 90 });
        await h.highlightOff();
      },
    },
    {
      say: {
        en: 'Move the slider to choose how many months it is repaid in. Four months gives five thousand rupees a month, shown under the slider.',
        ur: 'سلائیڈر سے طے کریں کہ رقم کتنے مہینوں میں واپس ہوگی۔ چار مہینے رکھنے سے ہر مہینے پانچ ہزار روپے بنتے ہیں، جو سلائیڈر کے نیچے نظر آتے ہیں۔',
      },
      caption: { en: 'Move the slider to choose the number of months. 4 months = PKR 5,000 a month, shown under the slider.', ur: 'سلائیڈر سے مہینے منتخب کریں۔ 4 مہینے = 5,000 روپے ماہانہ، جو سلائیڈر کے نیچے نظر آتا ہے۔' },
      do: async h => {
        const { loc } = await h.point({ css: '#loan-installments' }, { hold: 500 });
        await loc.focus();
        for (let i = 0; i < 2; i++) { await h.press('ArrowRight'); await h.wait(350); }
        await h.point({ text: /PKR [\d,]+\/month/ }, { hold: 1300 });
      },
    },
    {
      say: {
        en: 'Write the reason. The blue note confirms what will happen after approval: the instalment is deducted from her payslip automatically every month.',
        ur: 'وجہ لکھیں۔ نیلا نوٹ بتاتا ہے کہ منظوری کے بعد کیا ہوگا: قسط ہر مہینے خود بخود اس کی تنخواہ سے کٹ جائے گی۔',
      },
      do: async h => {
        await h.fill({ css: '#loan-reason' }, 'Medical treatment of mother at Services Hospital', { delay: 35 });
        await h.point({ text: /will be automatically deducted/ }, { hold: 2000 });
      },
    },
    {
      say: {
        en: 'Click Submit Application. The request is saved as Pending, exactly like a request an employee sends from the phone app.',
        ur: '"Submit Application" پر کلک کریں۔ درخواست "Pending" کے طور پر محفوظ ہو جاتی ہے، بالکل اسی طرح جیسے ملازم فون ایپ سے درخواست بھیجتا ہے۔',
      },
      do: async h => {
        await h.click('Submit Application', { after: 1000 });
        await h.click({ role: 'button', name: 'Pending', exact: true }, { after: 800 });
      },
    },
    {
      say: {
        en: 'Here are the requests waiting for a decision. Check the amount, the number of months and the reason.',
        ur: 'یہ وہ درخواستیں ہیں جن پر فیصلہ ہونا ہے۔ رقم، مہینوں کی تعداد اور وجہ دیکھ لیں۔',
      },
      do: async h => {
        await h.point(page => card(page, 'Medical treatment of mother', 'Approve & Disburse').getByText(/Monthly installment/), { hold: 2400 });
      },
    },
    {
      say: {
        en: 'To approve, click Approve and Disburse. The money is marked as paid today, the employee gets a notification, and the request becomes an active advance.',
        ur: 'منظوری کے لیے "Approve & Disburse" پر کلک کریں۔ رقم آج کی تاریخ میں ادا شدہ درج ہو جاتی ہے، ملازم کو اطلاع مل جاتی ہے، اور درخواست ایک فعال ایڈوانس بن جاتی ہے۔',
      },
      caption: { en: 'To approve, click Approve & Disburse: paid today, the employee is notified, and it becomes an active advance.', ur: 'منظوری کے لیے "Approve & Disburse" پر کلک کریں: آج ادا شدہ، ملازم کو اطلاع، اور ایڈوانس فعال۔' },
      do: async h => {
        await h.click(page => card(page, 'Medical treatment of mother', 'Approve & Disburse').getByRole('button', { name: 'Approve & Disburse' }), { after: 1500 });
      },
    },
    {
      say: {
        en: 'Other pending requests, such as Naveed Akhtar\'s advance for a school admission fee, are decided the same way. Click Reject if the request cannot be allowed.',
        ur: 'باقی زیرِ التوا درخواستیں، مثلاً نوید اختر کا اسکول داخلہ فیس کے لیے ایڈوانس، اسی طرح طے کی جاتی ہیں۔ اگر درخواست منظور نہیں ہو سکتی تو "Reject" پر کلک کریں۔',
      },
      do: async h => {
        const reject = h.page.getByRole('button', { name: 'Reject', exact: true });
        if (await reject.count()) await h.point(() => reject.first(), { hold: 2200 });
        else await h.wait(2000);
      },
    },
    {
      say: {
        en: 'Choose Active to see running loans. Zainab\'s advance is there with five thousand rupees a month. Each time payroll is processed, one instalment is deducted and the remaining balance goes down, until the advance closes by itself.',
        ur: 'چلتے ہوئے قرضے دیکھنے کے لیے "Active" منتخب کریں۔ زینب کا ایڈوانس یہاں پانچ ہزار روپے ماہانہ کے ساتھ موجود ہے۔ ہر بار پے رول بننے پر ایک قسط کٹتی ہے اور باقی رقم کم ہوتی جاتی ہے، یہاں تک کہ ایڈوانس خود بند ہو جاتا ہے۔',
      },
      caption: {
        en: 'Choose Active: Zainab\'s advance is there at PKR 5,000 a month. Each payroll run deducts one instalment until the advance closes by itself.',
        ur: '"Active" منتخب کریں: زینب کا ایڈوانس 5,000 روپے ماہانہ کے ساتھ موجود ہے۔ ہر پے رول میں ایک قسط کٹتی ہے، یہاں تک کہ ایڈوانس خود بند ہو جائے۔',
      },
      do: async h => {
        await h.click({ role: 'button', name: 'Active', exact: true }, { after: 800 });
        await h.point(page => page.locator('div', { hasText: 'Medical treatment of mother' }).filter({ hasText: 'Monthly deduction' }).last(), { hold: 2600 });
      },
    },
  ],
};
