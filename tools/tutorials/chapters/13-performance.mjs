// Chapter 13: Performance appraisals. Writes a KPI review for Hassan Raza (H2-2026, 8% increment recommended) and
// approves the demo data's pending review of Usman Tariq (written by his manager Sana Javed; no increment, so no
// salary revision is drafted).
const form = page => page.locator('.fixed', { hasText: 'New Performance Review' });
const kpiRow = i => page => form(page).locator('div.grid.grid-cols-12').nth(i);
const reviewCard = (name, period) => page => page.locator('div.rounded-2xl', { hasText: name }).filter({ hasText: period }).first();

async function stars(h, row, column, score) { // column 0 = Self, 1 = Manager
  await h.click(page => kpiRow(row)(page).locator('div.col-span-3').nth(column).getByRole('button').nth(score - 1), { after: 150 });
}

export default {
  id: '13',
  slug: 'Performance',
  as: 'admin',
  title: { en: 'Performance', ur: 'کارکردگی' },
  subtitle: {
    en: 'KPI-based appraisals with weighted scores, recommendations, and a second person approving the outcome.',
    ur: 'کے پی آئی پر مبنی جائزے، وزنی اسکور، سفارشات، اور نتیجے کی منظوری دوسرا شخص دیتا ہے۔',
  },
  audience: { en: ['HR staff', 'Managers'], ur: ['ایچ آر عملہ', 'مینیجرز'] },
  intro: {
    en: 'Appraisals tell you who is doing well and who needs support, and they can lead to an increment. In this chapter you will write a review with KPI scores and approve a review written by a manager.',
    ur: 'جائزوں سے پتا چلتا ہے کہ کون اچھا کام کر رہا ہے اور کسے مدد کی ضرورت ہے، اور ان سے تنخواہ میں اضافہ بھی ہو سکتا ہے۔ اس باب میں آپ کے پی آئی اسکور کے ساتھ ایک جائزہ لکھیں گے اور ایک مینیجر کا لکھا ہوا جائزہ منظور کریں گے۔',
  },
  setup: async h => { h.page.on('dialog', d => { h.log(`dialog: ${d.message().split('\n')[0]}`); d.accept().catch(() => undefined); }); },
  steps: [
    {
      say: {
        en: 'Open People in the menu on the left, then click Performance. The cards show the number of reviews, the average manager rating, the excellent performers, and the reviews waiting for HR.',
        ur: 'بائیں طرف کے مینو میں "People" کھولیں، پھر "Performance" پر کلک کریں۔ کارڈز میں جائزوں کی تعداد، مینیجر کی اوسط ریٹنگ، بہترین کارکردگی والے افراد، اور ایچ آر کے منتظر جائزے نظر آتے ہیں۔',
      },
      do: async h => {
        await h.nav('People', 'Performance');
        await h.point({ text: 'Avg Manager Rating', exact: true }, { hold: 1200 });
        await h.point({ text: 'Pending Review', exact: true }, { hold: 1000 });
      },
    },
    {
      say: {
        en: 'To appraise someone, click New Review. Choose the employee, here Hassan Raza from IT, and the review period, the second half of twenty twenty-six.',
        ur: 'کسی کا جائزہ لینے کے لیے "New Review" پر کلک کریں۔ ملازم منتخب کریں، یہاں آئی ٹی کے حسن رضا، اور جائزے کی مدت، 2026 کی دوسری ششماہی۔',
      },
      caption: {
        en: 'To appraise someone, click New Review. Choose the employee (Hassan Raza, IT) and the period, H2-2026.',
        ur: 'جائزے کے لیے "New Review" پر کلک کریں۔ ملازم (حسن رضا، آئی ٹی) اور مدت H2-2026 منتخب کریں۔',
      },
      do: async h => {
        await h.click('New Review', { after: 800 });
        await h.click({ css: '#perf-employee' }, { after: 300 });
        await h.fill({ placeholder: 'Type to search…' }, 'Hassan', { delay: 70 });
        await h.click({ role: 'option', name: 'Hassan Raza', exact: true }, { after: 400 });
        await h.select({ css: '#perf-period' }, 'H2-2026');
      },
    },
    {
      say: {
        en: 'Each row is a KPI, a key result you measure, with its weight in percent. The weights should add up to one hundred. You can rename a KPI, add one, or remove one with the cross.',
        ur: 'ہر قطار ایک "KPI" ہے، یعنی ایک اہم نتیجہ جسے آپ ناپتے ہیں، اور ساتھ اس کا وزن فیصد میں۔ تمام وزن مل کر سو ہونے چاہییں۔ آپ کسی KPI کا نام بدل سکتے ہیں، نیا شامل کر سکتے ہیں، یا کراس سے ہٹا سکتے ہیں۔',
      },
      do: async h => {
        await h.point(kpiRow(0), { hold: 1600 });
        await h.point(page => kpiRow(0)(page).locator('input[type=number]'), { hold: 1200 });
        await h.point(page => form(page).getByRole('button', { name: 'Add KPI' }), { hold: 1000 });
      },
    },
    {
      say: {
        en: 'Give stars from one to five. Self is the employee\'s own score from the appraisal discussion; Manager is the manager\'s score. The weighted score below is worked out as you click.',
        ur: 'ایک سے پانچ تک ستارے دیں۔ "Self" ملازم کا اپنا اسکور ہے جو جائزے کی گفتگو میں طے ہوا؛ "Manager" مینیجر کا اسکور ہے۔ نیچے وزنی اسکور ساتھ ساتھ حساب ہوتا جاتا ہے۔',
      },
      do: async h => {
        await stars(h, 0, 1, 4); await stars(h, 1, 1, 5); await stars(h, 2, 1, 4); await stars(h, 3, 1, 3); await stars(h, 4, 1, 5);
        await stars(h, 0, 0, 4); await stars(h, 1, 0, 4);
        await h.point(page => form(page).getByText('Weighted Score Preview'), { hold: 1800 });
      },
    },
    {
      say: {
        en: 'Write down the strengths, the areas to improve, and the manager\'s comments. Short, specific sentences are the most useful later.',
        ur: 'خوبیاں، بہتری کے شعبے اور مینیجر کے تبصرے لکھیں۔ مختصر اور واضح جملے بعد میں سب سے زیادہ کام آتے ہیں۔',
      },
      do: async h => {
        await h.fill({ label: 'Strengths', exact: true }, 'Fixed every kiosk and network fault within the day.', { delay: 20 });
        await h.fill({ label: 'Areas of Improvement', exact: true }, 'Document changes before closing a ticket.', { delay: 20 });
        await h.fill({ label: 'Manager Comments', exact: true }, 'Strong half year; ready for more responsibility.', { delay: 20 });
      },
    },
    {
      say: {
        en: 'Tick Recommend Salary Increment and enter eight percent. You can also recommend a promotion, training, or an improvement plan.',
        ur: '"Recommend Salary Increment" پر ٹِک لگائیں اور آٹھ فیصد درج کریں۔ آپ ترقی، تربیت یا بہتری کے منصوبے کی سفارش بھی کر سکتے ہیں۔',
      },
      do: async h => {
        await h.scrollTo(page => form(page).getByLabel('Training required'));
        await h.check({ text: 'Recommend Salary Increment' });
        await h.click({ css: '#perf-increment' }, { after: 150 });
        await h.press('Control+A');
        await h.page.keyboard.type('8', { delay: 90 });
        await h.check(page => form(page).getByLabel('Training required'));
      },
    },
    {
      say: {
        en: 'Click Submit Review. It appears in the list as Pending HR Approval. Because you wrote it, you cannot approve it yourself; another HR user decides.',
        ur: '"Submit Review" پر کلک کریں۔ یہ فہرست میں "Pending HR Approval" کے طور پر نظر آتا ہے۔ چونکہ یہ آپ نے لکھا ہے، آپ خود اسے منظور نہیں کر سکتے؛ فیصلہ کوئی دوسرا ایچ آر صارف کرے گا۔',
      },
      do: async h => {
        await h.click('Submit Review', { after: 1200 });
        await h.scrollTo(reviewCard('Hassan Raza', 'H2-2026'));
        await h.point(reviewCard('Hassan Raza', 'H2-2026'), { hold: 2400 });
      },
    },
    {
      say: {
        en: 'Here is a review written by Sana Javed, the sales manager, for Usman Tariq. Click it to see the KPI scores and comments behind the rating.',
        ur: 'یہ سیلز مینیجر ثنا جاوید کا عثمان طارق کے لیے لکھا ہوا جائزہ ہے۔ ریٹنگ کے پیچھے کے پی آئی اسکور اور تبصرے دیکھنے کے لیے اس پر کلک کریں۔',
      },
      do: async h => {
        await h.scrollTo(reviewCard('Usman Tariq', 'H1-2026'));
        await h.click(page => reviewCard('Usman Tariq', 'H1-2026')(page).locator('div.cursor-pointer').first(), { after: 900 });
        await h.scroll(250);
        await h.point(page => reviewCard('Usman Tariq', 'H1-2026')(page).getByText('Strengths', { exact: true }), { hold: 1800 });
      },
    },
    {
      say: {
        en: 'If you agree with the rating and the recommendations, click Approve Outcomes. If not, click Reject Outcomes and talk to the manager.',
        ur: 'اگر آپ ریٹنگ اور سفارشات سے متفق ہیں تو "Approve Outcomes" پر کلک کریں۔ اگر نہیں، تو "Reject Outcomes" پر کلک کریں اور مینیجر سے بات کریں۔',
      },
      do: async h => {
        await h.scrollTo(page => reviewCard('Usman Tariq', 'H1-2026')(page).getByRole('button', { name: 'Approve Outcomes' }));
        await h.point(page => reviewCard('Usman Tariq', 'H1-2026')(page).getByRole('button', { name: 'Reject Outcomes' }), { hold: 900 });
        await h.click(page => reviewCard('Usman Tariq', 'H1-2026')(page).getByRole('button', { name: 'Approve Outcomes' }), { after: 1200 });
        await h.point(page => reviewCard('Usman Tariq', 'H1-2026')(page).getByText('Approved Outcome', { exact: true }), { hold: 1500 });
      },
    },
    {
      say: {
        en: 'When an approved review recommends an increment, like Fatima Noor\'s here, the system drafts a salary revision automatically. Payroll then approves it in Salary Revisions before the new salary is paid.',
        ur: 'جب کسی منظور شدہ جائزے میں اضافے کی سفارش ہو، جیسے یہاں فاطمہ نور کا، تو سسٹم خود تنخواہ میں ترمیم کا مسودہ بنا دیتا ہے۔ پھر پے رول اسے "Salary Revisions" میں منظور کرتا ہے، اس کے بعد ہی نئی تنخواہ ادا ہوتی ہے۔',
      },
      do: async h => {
        await h.scroll(-2000);
        await h.fill({ placeholder: 'Search employee, code, period, status…' }, 'Fatima', { delay: 80 });
        await h.wait(500);
        await h.point(page => reviewCard('Fatima Noor', 'Annual-2025')(page).getByText('Salary impact', { exact: false }), { hold: 3000 });
      },
    },
  ],
};
