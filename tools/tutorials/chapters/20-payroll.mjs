// Chapter 20: the monthly payroll cycle, followed on the October 2026 run of the demo data
// (prepared by the payroll officer, approved by the finance manager, disbursed here by the admin as the third person).
// Works on the fresh snapshot (October = Approved) and on a re-run (October already Disbursed).

// The caption bar covers the bottom of the screen; for buttons in a dialog footer it moves to the top for one step.
const captionTop = h => h.page.evaluate(() => { const c = document.getElementById('tut-cap'); if (c) { c.style.top = '64px'; c.style.bottom = 'auto'; } });
const captionBottom = h => h.page.evaluate(() => { const c = document.getElementById('tut-cap'); if (c) { c.style.top = ''; c.style.bottom = ''; } });

// One card under "Historical Runs".
const runCard = (page, title) => page.locator('div[class*="p-3.5"]').filter({ hasText: title }).filter({ hasText: 'Net Total:' }).last();
const OCTOBER = 'Payroll - October 2026';
// Scroll a card to the top of the main panel, clear of the caption bar.
const toTop = async (h, locator) => { await locator.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'start' })); await h.wait(800); };

// A legacy-payroll export for the parallel-run check, built from the October payslips. The old system "forgot"
// Kashif Mehmood's approved PKR 10,000 bonus, so exactly one employee differs.
async function legacyCsv(page) {
  const docs = await page.evaluate(async () => {
    const token = localStorage.getItem('hr_auth_token');
    const response = await fetch('/api/documents/payrollPayslips', { headers: { authorization: `Bearer ${token}` } });
    const body = await response.json();
    const list = Array.isArray(body) ? body : (body.items || body.documents || []);
    return list.map(item => item.data || item);
  });
  const rows = docs.filter(p => p.periodMonth === 10 && p.periodYear === 2026 && (p.runType || 'Regular') === 'Regular')
    .sort((a, b) => String(a.employeeCode).localeCompare(String(b.employeeCode)));
  const lines = ['Employee Code,Employee Name,Gross,Income Tax,EOBI,Net'];
  for (const p of rows) {
    const missed = /Kashif/.test(p.employeeName || '') ? 10000 : 0;
    lines.push([p.employeeCode, `"${p.employeeName}"`, Math.round(p.grossSalary - missed), Math.round(p.incomeTaxDeduction || 0), Math.round(p.eobiEmployeeDeduction || 0), Math.round(p.netSalary - missed)].join(','));
  }
  return lines.join('\r\n');
}

export default {
  id: '20',
  slug: 'Payroll-Processing',
  as: 'admin',
  start: '/',
  title: { en: 'Payroll Processing', ur: 'پے رول پروسیسنگ' },
  subtitle: {
    en: 'The monthly cycle: lock attendance, prepare the run, check it, approve it, pay the bank and hand out payslips.',
    ur: 'ماہانہ سلسلہ: حاضری لاک کریں، پے رول تیار کریں، جانچیں، منظور کریں، بینک کو ادائیگی کریں اور پے سلپس دیں۔',
  },
  audience: { en: ['Payroll staff', 'Finance', 'HR managers'], ur: ['پے رول عملہ', 'فنانس', 'ایچ آر مینیجر'] },
  intro: {
    en: 'We follow one month of payroll from start to finish: preparing it, checking it, approval, paying through the bank, and payslips.',
    ur: 'ہم ایک مہینے کا پے رول شروع سے آخر تک دیکھیں گے: تیاری، جانچ، منظوری، بینک کے ذریعے ادائیگی، اور پے سلپس۔',
  },
  steps: [
    {
      say: {
        en: 'Open Payroll in the menu on the left, then click Payroll Processing. This is the monthly payroll screen.',
        ur: 'بائیں مینو میں "Payroll" کھولیں، پھر "Payroll Processing" پر کلک کریں۔ یہ ماہانہ پے رول کی اسکرین ہے۔',
      },
      do: async h => { await h.nav('Payroll', 'Payroll Processing'); await h.point({ text: 'FBR & Regional Statutory Payroll Engine' }, { hold: 900 }); },
    },
    {
      say: {
        en: 'Payroll starts after the month has ended. Choose the month and year, then click Lock Register. This freezes attendance, so the days being paid can no longer change. November can be locked from the first of December.',
        ur: 'پے رول مہینہ ختم ہونے کے بعد شروع ہوتا ہے۔ مہینہ اور سال منتخب کریں، پھر "Lock Register" پر کلک کریں۔ اس سے حاضری منجمد ہو جاتی ہے اور ادا ہونے والے دن تبدیل نہیں ہو سکتے۔ نومبر یکم دسمبر سے لاک ہو سکے گا۔',
      },
      do: async h => {
        await h.point({ css: 'select[aria-label="Payroll month"]' }, { hold: 900 });
        await h.point({ css: 'input[aria-label="Payroll year"]' }, { hold: 700 });
        await h.point('Lock Register', { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Then Run New Payroll Cycle prepares the run. It first checks the tax year, the locked register, open corrections and every CNIC and bank account, then creates a draft with one payslip per employee.',
        ur: 'پھر "Run New Payroll Cycle" پے رول تیار کرتا ہے۔ یہ پہلے ٹیکس سال، لاک شدہ رجسٹر، زیرِ التوا درستگیاں اور ہر شناختی کارڈ اور بینک اکاؤنٹ چیک کرتا ہے، پھر ہر ملازم کی ایک پے سلپ کے ساتھ ڈرافٹ بناتا ہے۔',
      },
      do: async h => { await h.point('Run New Payroll Cycle', { hold: 2500 }); },
    },
    {
      say: {
        en: 'Let us follow October, prepared by the payroll officer on the third of November. Choose October. Its register is locked, so the button reads Reopen Register.',
        ur: 'آئیے اکتوبر دیکھتے ہیں، جو پے رول آفیسر نے تین نومبر کو تیار کیا۔ "October" منتخب کریں۔ اس کا رجسٹر لاک ہے، اس لیے بٹن پر "Reopen Register" لکھا ہے۔',
      },
      do: async h => {
        await h.select({ css: 'select[aria-label="Payroll month"]' }, 'October');
        await h.wait(500);
        await h.point(page => page.getByRole('button', { name: /Reopen Register/ }), { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Every run is listed under Historical Runs: October has fourteen employees and a net total of one point three two million rupees. The yellow line is a preflight warning to look at, such as a missing NTN. Critical problems, like a wrong IBAN, stop the run.',
        ur: 'ہر پے رول "Historical Runs" میں ہے: اکتوبر میں چودہ ملازمین اور کل خالص رقم تیرہ لاکھ اکیس ہزار روپے ہے۔ پیلی لائن "preflight warning" ہے جسے دیکھنا ہے، جیسے این ٹی این نہ ہونا۔ سنگین مسائل، جیسے غلط آئی بین، پے رول روک دیتے ہیں۔',
      },
      caption: {
        en: 'Every run is listed under Historical Runs. October: 14 employees, net total PKR 1,321,882. The yellow line is a preflight warning to look at (e.g. missing NTN, big change from last month). Critical problems, like a wrong IBAN, stop the run.',
        ur: 'ہر پے رول "Historical Runs" میں نظر آتا ہے۔ اکتوبر: 14 ملازمین، کل خالص رقم PKR 1,321,882۔ پیلی لائن "preflight warning" ہے جسے دیکھنا ہے۔ سنگین مسائل، جیسے غلط آئی بین، پے رول کو روک دیتے ہیں۔',
      },
      do: async h => {
        const card = runCard(h.page, OCTOBER);
        await toTop(h, h.page.getByText('Historical Runs', { exact: true }));
        await h.point(() => card, { hold: 1600 });
        await h.point(() => card.getByText(/preflight warning/), { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Payroll uses maker and checker. Whoever prepares a run cannot approve it: for them the Approve button stays grey. October was approved by Imran Qureshi, the finance manager. A third person then pays, because the approver cannot disburse either.',
        ur: 'پے رول میں "maker-checker" کا اصول ہے۔ جو پے رول تیار کرے وہ اسے منظور نہیں کر سکتا: اس کے لیے "Approve" کا بٹن گرے رہتا ہے۔ اکتوبر فنانس مینیجر عمران قریشی نے منظور کیا۔ پھر ادائیگی تیسرا شخص کرتا ہے، کیونکہ منظوری دینے والا بھی جاری نہیں کر سکتا۔',
      },
      do: async h => {
        const card = runCard(h.page, OCTOBER);
        await h.point(() => card.getByText(/^(Approved|Disbursed)$/), { hold: 2000 });
        const pay = card.getByRole('button', { name: 'Mark Disbursed' });
        if (await pay.count()) await h.point(() => pay, { hold: 2200 });
        else await h.point(() => card.getByText('Disbursed', { exact: true }), { hold: 2200 });
      },
    },
    {
      say: {
        en: 'The Payroll Preview on the right shows each employee\'s gross pay, tax, EOBI, provident fund and net pay. Check it before approval. Once a month has a payroll run, the preview shows the payslips that run saved, the same amounts as the bank file. Click View Slip for Ayesha Siddiqui.',
        ur: 'دائیں طرف "Payroll Preview" میں ہر ملازم کی مجموعی تنخواہ، ٹیکس، ای او بی آئی، پراویڈنٹ فنڈ اور خالص تنخواہ ہے۔ منظوری سے پہلے اسے چیک کریں۔ جب کسی مہینے کا پے رول بن جائے تو پیش منظر وہی پے سلپس دکھاتا ہے جو اس رن میں محفوظ ہوئیں، یعنی بینک فائل والی رقمیں۔ عائشہ صدیقی کے لیے "View Slip" پر کلک کریں۔',
      },
      do: async h => {
        await h.point({ text: 'Net Wage (PKR)' }, { hold: 1200 });
        const row = h.page.locator('tr').filter({ has: h.page.getByRole('button', { name: 'View Slip' }) }).filter({ hasText: 'Ayesha Siddiqui' }).first();
        await h.click(() => row.getByRole('button', { name: 'View Slip' }), { after: 900 });
      },
    },
    {
      say: {
        en: 'The payslip shows the earnings on the left and the deductions on the right: income tax with the tax-year figures, EOBI and provident fund. At the bottom is the net take-home pay.',
        ur: 'پے سلپ میں بائیں طرف آمدنی اور دائیں طرف کٹوتیاں ہیں: ٹیکس سال کے حساب کے ساتھ انکم ٹیکس، ای او بی آئی اور پراویڈنٹ فنڈ۔ نیچے خالص تنخواہ لکھی ہے جو ملازم کو ملے گی۔',
      },
      do: async h => {
        await h.point({ text: 'Earnings Components' }, { hold: 1300 });
        await h.point({ text: 'Statutory Deductions' }, { hold: 1300 });
        await h.point({ text: 'Net Take-home pay:' }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'English plus Urdu prints the slip in both languages, PDF saves it as a file, and Print or Save as PDF prints it. Close the slip when you are done.',
        ur: '"English + اردو" سلپ کو دونوں زبانوں میں بناتا ہے، "PDF" اسے فائل کے طور پر محفوظ کرتا ہے، اور "Print / Save as PDF" اسے پرنٹ کرتا ہے۔ کام ختم ہو تو سلپ بند کر دیں۔',
      },
      do: async h => {
        await captionTop(h);
        await h.point(page => page.getByRole('button', { name: /English \+/ }), { hold: 1100 });
        await h.point(page => page.getByRole('button', { name: 'PDF', exact: true }), { hold: 1000 });
        await h.point('Print / Save as PDF', { hold: 1200 });
        await h.click('Close', { after: 600 });
      },
    },
    {
      say: {
        en: 'Now the payment. On the October run, click Bank Advice File. It lists every employee\'s IBAN, bank and net amount in your bank\'s file layout. Check the value date, the day the bank should pay.',
        ur: 'اب ادائیگی۔ اکتوبر کے پے رول پر "Bank Advice File" پر کلک کریں۔ اس میں ہر ملازم کا آئی بین، بینک اور خالص رقم بینک کی فائل کی شکل میں ہے۔ "Value date" چیک کریں، یعنی وہ دن جب بینک ادائیگی کرے۔',
      },
      do: async h => {
        await captionBottom(h);
        const card = runCard(h.page, OCTOBER);
        await toTop(h, h.page.getByText('Historical Runs', { exact: true }));
        await h.click(() => card.getByRole('button', { name: 'Bank Advice File' }), { after: 1500 }); // let the dialog finish opening
        await h.point({ text: 'Bank file template' }, { hold: 1000 });
        await h.point({ text: 'Beneficiary Name' }, { hold: 1200 });
        await h.point({ text: 'Value date' }, { hold: 1000 });
      },
    },
    {
      say: {
        en: 'Click Download bank file and upload that file in your bank\'s corporate portal. The system records a fingerprint of the file, so any change to the run afterwards is noticed.',
        ur: '"Download bank file" پر کلک کریں اور یہ فائل اپنے بینک کے کارپوریٹ پورٹل میں اپ لوڈ کریں۔ سسٹم فائل کا ایک فنگر پرنٹ محفوظ کرتا ہے، اس لیے بعد میں پے رول میں کوئی بھی تبدیلی پکڑی جاتی ہے۔',
      },
      do: async h => {
        await captionTop(h);
        await h.click('Download bank file', { after: 1400 });
      },
    },
    {
      say: {
        en: 'When the bank has paid, the third person clicks Mark Disbursed and types the bank\'s transaction reference. The run shows Disbursed, loan instalments are recovered, and every employee is told the salary was paid.',
        ur: 'جب بینک ادائیگی کر دے تو تیسرا شخص "Mark Disbursed" پر کلک کر کے بینک کا ٹرانزیکشن ریفرنس لکھتا ہے۔ اب پے رول پر "Disbursed" لکھا آتا ہے، قرض کی قسطیں وصول ہو جاتی ہیں اور ہر ملازم کو تنخواہ ادا ہونے کی اطلاع ملتی ہے۔',
      },
      caption: {
        en: 'When the bank has paid, the third person clicks Mark Disbursed and types the bank\'s transaction reference, here HBL-IBFT-202611-0457. The run shows Disbursed, loan instalments are recovered and every employee is notified.',
        ur: 'جب بینک ادائیگی کر دے تو تیسرا شخص "Mark Disbursed" پر کلک کر کے بینک کا ریفرنس لکھتا ہے، یہاں HBL-IBFT-202611-0457۔ اب پے رول "Disbursed" ہے، قرض کی قسطیں وصول ہو جاتی ہیں اور ہر ملازم کو اطلاع ملتی ہے۔',
      },
      do: async h => {
        await captionBottom(h);
        const card = runCard(h.page, OCTOBER);
        await toTop(h, card);
        const pay = card.getByRole('button', { name: 'Mark Disbursed' });
        if (await pay.count()) {
          h.page.once('dialog', dialog => dialog.accept('HBL-IBFT-202611-0457').catch(() => undefined));
          await h.click(() => pay, { after: 2200 });
        }
        await h.point(() => runCard(h.page, OCTOBER).getByText('Disbursed', { exact: true }), { hold: 1600 });
      },
    },
    {
      say: {
        en: 'Now Email payslips sends everyone a protected PDF payslip. SMS and WhatsApp alerts work once a provider is set up on the server. Employees also see their payslips in self-service and the phone app.',
        ur: 'اب "Email payslips" ہر ایک کو محفوظ پی ڈی ایف پے سلپ بھیجتا ہے۔ "SMS" اور "WhatsApp" الرٹ سرور پر سروس سیٹ ہونے کے بعد چلتے ہیں۔ ملازمین اپنی پے سلپس سیلف سروس اور فون ایپ میں بھی دیکھتے ہیں۔',
      },
      do: async h => {
        const card = runCard(h.page, OCTOBER);
        await toTop(h, card);
        await h.point(() => card.getByRole('button', { name: 'Email payslips' }), { hold: 1600 });
        await h.point(() => card.getByRole('button', { name: 'SMS alert' }), { hold: 900 });
        await h.point(() => card.getByRole('button', { name: 'WhatsApp alert' }), { hold: 900 });
      },
    },
    {
      say: {
        en: 'If the bank returns a payment, open Payment exceptions. Mark that employee as failed, correct the bank details in the employee record, then download a retry advice for only those people.',
        ur: 'اگر بینک کوئی ادائیگی واپس کر دے تو "Payment exceptions" کھولیں۔ اس ملازم کو "Mark failed" کریں، ملازم کے ریکارڈ میں بینک تفصیل درست کریں، پھر صرف انہی لوگوں کے لیے "Download retry advice" کریں۔',
      },
      do: async h => {
        const card = runCard(h.page, OCTOBER);
        await h.click(() => card.getByRole('button', { name: /Payment exceptions/ }), { after: 1400 });
        await h.point(page => page.getByRole('button', { name: 'Mark failed' }).first(), { hold: 2500 });
        await h.point('Download retry advice', { hold: 2500 });
      },
    },
    {
      say: {
        en: 'The same card gives the files for the government: the FBR withholding statement, the EOBI return and the provincial social security return, plus an accounting journal for your accounts team.',
        ur: 'اسی کارڈ سے سرکاری فائلیں بھی ملتی ہیں: ایف بی آر ودہولڈنگ اسٹیٹمنٹ، ای او بی آئی ریٹرن اور صوبائی سوشل سیکیورٹی ریٹرن، اور اکاؤنٹس ٹیم کے لیے اکاؤنٹنگ جرنل۔',
      },
      do: async h => {
        await h.click({ role: 'button', name: 'Close', exact: true }, { after: 500 }); // the payment exceptions dialog
        const card = runCard(h.page, OCTOBER);
        await h.point(() => card.getByRole('button', { name: 'FBR withholding CSV' }), { hold: 1100 });
        await h.point(() => card.getByRole('button', { name: 'EOBI return CSV' }), { hold: 900 });
        await h.point(() => card.getByRole('button', { name: 'Provincial social-security CSV' }), { hold: 900 });
        await h.point(() => card.getByRole('button', { name: 'Accounting journal CSV' }), { hold: 900 });
      },
    },
    {
      say: {
        en: 'Next, the parallel run check. Before switching off your old payroll, run the same month in both systems, then upload the old system\'s export with Legacy payroll CSV.',
        ur: 'اب "parallel run" کی جانچ۔ پرانا پے رول بند کرنے سے پہلے ایک ہی مہینہ دونوں سسٹمز میں چلائیں، پھر "Legacy payroll CSV" سے پرانے سسٹم کی فائل اپ لوڈ کریں۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'Parallel run against your current payroll' });
        await h.point({ css: '[aria-labelledby="parallel-run-title"]' }, { hold: 900 });
        await h.point({ text: 'Legacy payroll CSV' }, { hold: 900 });
        const csv = await legacyCsv(h.page);
        await h.page.locator('[aria-labelledby="parallel-run-title"] input[type=file]').setInputFiles({ name: 'old-payroll-october-2026.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
        await h.wait(800);
      },
    },
    {
      say: {
        en: 'Thirteen employees match to the rupee. One differs: the old system missed Kashif Mehmood\'s ten thousand rupee bonus. Write that explanation and click Record result on this run.',
        ur: 'تیرہ ملازمین ایک ایک روپے تک برابر ہیں۔ ایک میں فرق ہے: پرانے سسٹم نے کاشف محمود کا دس ہزار روپے کا بونس شامل نہیں کیا۔ یہ وضاحت لکھیں اور "Record result on this run" پر کلک کریں۔',
      },
      do: async h => {
        await h.scrollTo({ css: '[aria-labelledby="parallel-run-title"] table' });
        await h.point({ text: 'Matched', exact: true }, { hold: 900 });
        await h.point(page => page.locator('[aria-labelledby="parallel-run-title"] tbody tr').first(), { hold: 1200 });
        await h.fill({ label: 'Explanation of differences' }, 'Old payroll missed the PKR 10,000 production bonus of Kashif Mehmood.', { delay: 25 });
        await h.click('Record result on this run', { after: 1200 });
      },
    },
    {
      say: {
        en: 'That is the full cycle. One more thing: bonuses and other one-time amounts are entered under One-time payroll adjustments, before the run, and they too need a second person\'s approval.',
        ur: 'یہ تھا مکمل سلسلہ۔ ایک اور بات: بونس اور دوسری ایک بار کی رقوم پے رول سے پہلے "One-time payroll adjustments" میں درج کی جاتی ہیں، اور انہیں بھی دوسرے شخص کی منظوری چاہیے۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'One-time payroll adjustments' });
        await h.point({ text: 'One-time payroll adjustments' }, { hold: 1500 });
        await h.point('Submit for approval', { hold: 1500 });
      },
      hold: 900,
    },
  ],
};
