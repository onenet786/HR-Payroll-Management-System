// Chapter 22: the Reports menu (8 groups), with real reports opened, filtered, shown and exported.
const captionTop = h => h.page.evaluate(() => { const c = document.getElementById('tut-cap'); if (c) { c.style.top = '64px'; c.style.bottom = 'auto'; } });
const captionBottom = h => h.page.evaluate(() => { const c = document.getElementById('tut-cap'); if (c) { c.style.top = ''; c.style.bottom = ''; } });
const setMonth = async (h, value) => {
  const { loc } = await h.point({ css: 'main input[type=month]' }, { hold: 500 });
  await loc.fill(value);
  await h.wait(400);
};
// Scroll the result table up under the filters, clear of the caption bar.
const resultsUp = async h => { await h.page.locator('main table').first().evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'start' })).catch(() => undefined); await h.wait(800); };
const openReport = async (h, group, title) => {
  await h.nav('Reports', group);
  await h.click({ text: title, exact: true }, { after: 1200 });
};

export default {
  id: '22',
  slug: 'Reports',
  as: 'admin',
  start: '/',
  title: { en: 'Reports', ur: 'رپورٹس' },
  subtitle: {
    en: 'Eight groups of reports for any period: filter them, show them, and take them out as Excel or PDF.',
    ur: 'کسی بھی مدت کے لیے رپورٹس کے آٹھ گروپ: فلٹر کریں، دیکھیں، اور ایکسل یا پی ڈی ایف میں نکالیں۔',
  },
  audience: { en: ['Managers', 'HR staff', 'Payroll staff'], ur: ['مینیجرز', 'ایچ آر عملہ', 'پے رول عملہ'] },
  intro: {
    en: 'Reports read straight from the server whenever you open them, for any period, including history imported from an old system. Let us see what is there and open a few useful ones.',
    ur: 'رپورٹس کھولتے ہی سیدھی سرور سے پڑھی جاتی ہیں، کسی بھی مدت کے لیے، پرانے سسٹم سے لائی گئی ہسٹری سمیت۔ آئیے دیکھتے ہیں کیا کچھ موجود ہے اور چند کارآمد رپورٹس کھولتے ہیں۔',
  },
  steps: [
    {
      say: {
        en: 'Click Reports in the menu on the left. The reports are in eight groups. People and Time has Employee, Attendance and Leave reports. Pay and Compliance has Payroll and Statutory reports for tax, EOBI and social security. Control has Device reports, Audit reports and the CyberAP archive.',
        ur: 'بائیں مینو میں "Reports" پر کلک کریں۔ رپورٹس آٹھ گروپس میں ہیں۔ "People & Time" میں ملازمین، حاضری اور چھٹیوں کی رپورٹس ہیں۔ "Pay & Compliance" میں پے رول اور ٹیکس، ای او بی آئی اور سوشل سیکیورٹی کی قانونی رپورٹس ہیں۔ "Control" میں آلات، آڈٹ اور سائبر اے پی آرکائیو کی رپورٹس ہیں۔',
      },
      do: async h => {
        await h.click('Reports', { after: 600 });
        await h.point({ text: 'People & Time' }, { hold: 1400 });
        await h.point({ text: 'Pay & Compliance' }, { hold: 1700 });
        await h.point({ text: 'Control', exact: true }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Open Employee Reports. Each card is one report, with a short line on what it shows. Click Headcount by group.',
        ur: '"Employee Reports" کھولیں۔ ہر کارڈ ایک رپورٹ ہے، ساتھ ایک لائن میں لکھا ہے کہ اس میں کیا ہے۔ "Headcount by group" پر کلک کریں۔',
      },
      do: async h => {
        await h.click('Employee Reports', { after: 1000 });
        await h.point({ text: 'Missing or invalid data', exact: true }, { hold: 900 });
        await h.click({ text: 'Headcount by group', exact: true }, { after: 1200 });
      },
    },
    {
      say: {
        en: 'Every report has filters across the top. Group the headcount by Department and click Show. You see how many people each department has, split into active, on leave, suspended and left, with totals at the bottom.',
        ur: 'ہر رپورٹ کے اوپر فلٹر ہوتے ہیں۔ ہیڈ کاؤنٹ کو "Department" کے حساب سے گروپ کریں اور "Show" پر کلک کریں۔ ہر شعبے میں کتنے لوگ ہیں، فعال، چھٹی پر، معطل اور چھوڑ جانے والے الگ الگ، اور نیچے کل تعداد۔',
      },
      do: async h => {
        await h.select({ label: 'Group by' }, 'Department');
        await h.click('Show', { after: 1300 });
        await resultsUp(h);
        await captionTop(h); // a short page cannot scroll the totals clear of the caption bar
        await h.point({ text: 'Total (all pages)' }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Next, the monthly attendance register, also called the muster roll. Open Attendance Reports, then Monthly register. Choose October twenty twenty-six and click Show.',
        ur: 'اب ماہانہ حاضری رجسٹر، جسے "muster roll" بھی کہتے ہیں۔ "Attendance Reports" کھولیں، پھر "Monthly register"۔ اکتوبر دو ہزار چھبیس منتخب کریں اور "Show" پر کلک کریں۔',
      },
      caption: {
        en: 'Next, the monthly attendance register (muster roll). Open Attendance Reports, then Monthly register. Choose October 2026 and click Show.',
        ur: 'اب ماہانہ حاضری رجسٹر (muster roll)۔ "Attendance Reports" کھولیں، پھر "Monthly register"۔ اکتوبر 2026 منتخب کریں اور "Show" پر کلک کریں۔',
      },
      do: async h => {
        await captionBottom(h);
        await openReport(h, 'Attendance Reports', 'Monthly register (muster roll)');
        await setMonth(h, '2026-10');
        await h.click('Show', { after: 1500 });
      },
    },
    {
      say: {
        en: 'One line per employee and one column per day: P is present, L late, A absent, LV leave and H a holiday. The totals for the month are on the right.',
        ur: 'ہر ملازم کی ایک لائن اور ہر دن کا ایک کالم: "P" حاضر، "L" تاخیر، "A" غیر حاضر، "LV" چھٹی اور "H" تعطیل۔ مہینے کا کل حساب دائیں طرف ہے۔',
      },
      do: async h => {
        await h.point(page => page.locator('main table thead th').filter({ hasText: /^1$/ }).first(), { hold: 1100 });
        await h.point(page => page.locator('main table thead th').filter({ hasText: /^Present$/i }).first(), { hold: 1300 });
      },
    },
    {
      say: {
        en: 'Click CSV to download it for Excel. Every CSV download is written to the audit log, because these files contain personal data.',
        ur: 'ایکسل کے لیے اسے ڈاؤن لوڈ کرنے کو "CSV" پر کلک کریں۔ ہر "CSV" ڈاؤن لوڈ آڈٹ لاگ میں درج ہوتا ہے، کیونکہ ان فائلوں میں ذاتی معلومات ہوتی ہیں۔',
      },
      do: async h => {
        await h.scrollTo('Show');
        await h.click('CSV', { after: 1200 });
      },
    },
    {
      say: {
        en: 'Now Payroll Reports and the Payroll register: every payslip of a month with days paid, earnings, each deduction and net pay. Choose October, narrow it to the Production department, and click Show.',
        ur: 'اب "Payroll Reports" اور "Payroll register": کسی مہینے کی ہر پے سلپ، ادا شدہ دن، آمدنی، ہر کٹوتی اور خالص تنخواہ کے ساتھ۔ اکتوبر منتخب کریں، اسے "Production" شعبے تک محدود کریں، اور "Show" پر کلک کریں۔',
      },
      do: async h => {
        await openReport(h, 'Payroll Reports', 'Payroll register');
        await setMonth(h, '2026-10');
        await h.select({ label: 'Department' }, 'Production');
        await h.click('Show', { after: 1500 });
      },
    },
    {
      say: {
        en: 'Only the Production staff are listed, with totals for the department. Print or PDF opens a printable page that you can print or save as a PDF file.',
        ur: 'اب صرف "Production" کا عملہ نظر آ رہا ہے، اور شعبے کا کل بھی۔ "Print / PDF" پرنٹ کے قابل صفحہ کھولتا ہے، جسے آپ پرنٹ کر سکتے ہیں یا پی ڈی ایف فائل کے طور پر محفوظ کر سکتے ہیں۔',
      },
      do: async h => {
        await resultsUp(h);
        await h.point(page => page.locator('main table tbody tr').first(), { hold: 1200 });
        await h.point({ text: 'Total (all pages)' }, { hold: 1100 });
        await h.scrollTo('Show');
        await h.point('Print / PDF', { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Statutory Reports give what the tax and social security offices ask for. Open EOBI contributions, choose last month as the period and click Show: the employee and employer share for every person.',
        ur: '"Statutory Reports" میں وہ سب ہے جو ٹیکس اور سوشل سیکیورٹی کے ادارے مانگتے ہیں۔ "EOBI contributions" کھولیں، مدت میں "Last month" منتخب کریں اور "Show" پر کلک کریں: ہر شخص کا ملازم اور آجر کا حصہ۔',
      },
      do: async h => {
        await openReport(h, 'Statutory Reports (Tax, EOBI, SS)', 'EOBI contributions');
        await h.select({ label: 'Period' }, 'Last month');
        await h.select({ label: 'Payroll runs' }, 'Approved and paid');
        await h.click('Show', { after: 1500 });
        await h.point(page => page.locator('main table').first(), { hold: 1200 });
      },
    },
    {
      say: {
        en: 'Audit Reports show who did what. Open the Audit log and click Show: sign-ins, changes, approvals and downloads, each with the user and the time. Leave reports and Device reports work the same way.',
        ur: '"Audit Reports" بتاتی ہیں کہ کس نے کیا کیا۔ "Audit log" کھولیں اور "Show" پر کلک کریں: لاگ ان، تبدیلیاں، منظوریاں اور ڈاؤن لوڈز، ہر ایک کے ساتھ صارف اور وقت۔ چھٹیوں اور آلات کی رپورٹس بھی اسی طرح کام کرتی ہیں۔',
      },
      do: async h => {
        await openReport(h, 'Audit Reports', 'Audit log');
        await h.click('Show', { after: 1500 });
        await h.point(page => page.locator('main table').first(), { hold: 1000 });
        const download = h.page.locator('main table tbody tr').filter({ hasText: 'report_export' }).first();
        if (await download.count()) await h.point(() => download, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Last, the CyberAP Archive keeps the records of your old CyberAP system after an import: old salary sheets, loans, holidays and settings. Choose a table and filter by employee, date or text. Importing is shown in the Data Import chapter.',
        ur: 'آخر میں "CyberAP Archive" امپورٹ کے بعد آپ کے پرانے سائبر اے پی سسٹم کا ریکارڈ رکھتا ہے: پرانی تنخواہ شیٹس، قرضے، تعطیلات اور سیٹنگز۔ ٹیبل منتخب کریں اور ملازم، تاریخ یا لفظ سے فلٹر کریں۔ امپورٹ کا طریقہ "Data Import" والے باب میں ہے۔',
      },
      do: async h => {
        await h.nav('Reports', 'CyberAP Archive');
        await h.point({ text: 'CyberAP archive', exact: true }, { hold: 2000 });
      },
      hold: 900,
    },
  ],
};
