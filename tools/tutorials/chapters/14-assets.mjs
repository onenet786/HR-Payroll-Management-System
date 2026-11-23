// Chapter 14: Asset Management. Adds a uniform set (ASSET-UNI-014), issues it and the spare laptop (ASSET-LPT-003)
// to Ayesha Khan (added in chapter 10), then returns the laptop. Ends with the uniform still with Ayesha.
const UNIFORM = 'Staff uniform set';
const row = text => page => page.locator('tbody tr', { hasText: text }).first();

async function assignTo(h, assetText, search, employee) {
  await h.click(page => row(assetText)(page).getByRole('button', { name: 'Assign' }), { after: 700 });
  await h.click({ label: 'Assign To Employee' }, { after: 300 });
  await h.fill({ placeholder: 'Type to search…' }, search, { delay: 70 });
  await h.click({ role: 'option', name: employee, exact: true }, { after: 400 });
}

export default {
  id: '14',
  slug: 'Asset-Management',
  as: 'admin',
  title: { en: 'Asset Management', ur: 'اثاثہ جات کا انتظام' },
  subtitle: {
    en: 'Record what the company owns, issue it to staff, and take it back when they no longer need it.',
    ur: 'کمپنی کی ملکیتی اشیاء درج کریں، ملازمین کو جاری کریں، اور ضرورت ختم ہونے پر واپس لیں۔',
  },
  audience: { en: ['HR staff', 'Administration'], ur: ['ایچ آر عملہ', 'انتظامیہ'] },
  intro: {
    en: 'Laptops, phones, SIM cards, tools and uniforms all cost money, so you should always know who has them. In this chapter you will add an asset, issue items to a new employee, and record a return.',
    ur: 'لیپ ٹاپ، فون، سم کارڈ، اوزار اور یونیفارم سب پر پیسہ لگتا ہے، اس لیے ہمیشہ معلوم ہونا چاہیے کہ کون سی چیز کس کے پاس ہے۔ اس باب میں آپ ایک اثاثہ شامل کریں گے، نئی ملازمہ کو اشیاء جاری کریں گے، اور واپسی درج کریں گے۔',
  },
  setup: async h => { h.page.on('dialog', d => { h.log(`dialog: ${d.message().split('\n')[0]}`); d.accept().catch(() => undefined); }); },
  steps: [
    {
      say: {
        en: 'Open People in the menu on the left, then click Asset Management. The cards show the number and total cost of all assets, and how many are assigned, available, or under repair.',
        ur: 'بائیں طرف کے مینو میں "People" کھولیں، پھر "Asset Management" پر کلک کریں۔ کارڈز میں تمام اثاثوں کی تعداد اور کل قیمت، اور یہ کہ کتنے جاری ہیں، دستیاب ہیں یا مرمت میں ہیں، نظر آتا ہے۔',
      },
      do: async h => {
        await h.nav('People', 'Asset Management');
        await h.point({ text: 'Total Assets', exact: true }, { hold: 1200 });
        await h.point({ text: 'Available', exact: true }, { hold: 900 });
      },
    },
    {
      say: {
        en: 'The list shows each asset with its tag number, category, condition, status, who holds it and since when. Use the buttons above it to filter by category or status.',
        ur: 'فہرست میں ہر اثاثہ اپنے ٹیگ نمبر، قسم، حالت، اسٹیٹس، کس کے پاس ہے اور کب سے، کے ساتھ نظر آتا ہے۔ اوپر کے بٹنوں سے قسم یا اسٹیٹس کے لحاظ سے فلٹر کریں۔',
      },
      do: async h => {
        await h.point(page => page.locator('table thead'), { hold: 1800 });
        await h.point(page => page.getByRole('button', { name: 'Laptop', exact: true }), { hold: 1000 });
      },
    },
    {
      say: {
        en: 'New staff on the sales floor receive a uniform, so let us record a uniform set. Click Add Asset, type a tag number and a name, and choose the category Other.',
        ur: 'سیلز فلور کے نئے عملے کو یونیفارم ملتا ہے، اس لیے ایک یونیفارم سیٹ درج کرتے ہیں۔ "Add Asset" پر کلک کریں، ٹیگ نمبر اور نام لکھیں، اور قسم "Other" منتخب کریں۔',
      },
      do: async h => {
        await h.click('Add Asset', { after: 700 });
        await h.fill({ label: 'Asset Tag', exact: true }, 'ASSET-UNI-014', { delay: 50 });
        await h.fill({ label: 'Name', exact: true }, 'Staff uniform set (2 shirts, 1 trouser)', { delay: 30 });
        await h.select({ label: 'Category', exact: true }, 'Other');
      },
    },
    {
      say: {
        en: 'Enter the purchase cost, six thousand five hundred rupees, set the condition to New, and add a note such as the size. Then click Add Asset.',
        ur: 'خریداری کی قیمت ساڑھے چھ ہزار روپے لکھیں، حالت "New" منتخب کریں، اور سائز جیسا کوئی نوٹ لکھیں۔ پھر "Add Asset" پر کلک کریں۔',
      },
      caption: {
        en: 'Enter the purchase cost (PKR 6,500), set the condition to New, and add a note such as the size. Then click Add Asset.',
        ur: 'قیمت 6,500 روپے لکھیں، حالت "New" منتخب کریں، اور سائز کا نوٹ لکھیں۔ پھر "Add Asset" پر کلک کریں۔',
      },
      do: async h => {
        await h.fill({ label: 'Purchase Cost (PKR)', exact: true }, '6500', { delay: 80 });
        await h.select({ label: 'Condition', exact: true }, 'New');
        await h.fill({ label: 'Notes', exact: true }, 'Sales floor uniform, size M', { delay: 30 });
        await h.click(page => page.locator('.fixed').getByRole('button', { name: 'Add Asset' }), { after: 1200 });
        await h.scrollTo(row('ASSET-UNI-014'));
        await h.point(row('ASSET-UNI-014'), { hold: 1200 });
      },
    },
    {
      say: {
        en: 'The uniform is now Available. Click Assign, choose Ayesha Khan, and click Assign. Status changes to Assigned, with her name and today\'s date.',
        ur: 'یونیفارم اب "Available" ہے۔ "Assign" پر کلک کریں، عائشہ خان کو منتخب کریں، اور "Assign" پر کلک کریں۔ اسٹیٹس "Assigned" ہو جاتا ہے، ان کے نام اور آج کی تاریخ کے ساتھ۔',
      },
      do: async h => {
        await assignTo(h, 'ASSET-UNI-014', 'Ayesha Kh', 'Ayesha Khan');
        await h.click(page => page.locator('.fixed').getByRole('button', { name: 'Assign', exact: true }), { after: 1000 });
        await h.point(row('ASSET-UNI-014'), { hold: 1500 });
      },
    },
    {
      say: {
        en: 'For her first week of training she also borrows the spare Lenovo laptop. Issue it to her in the same way.',
        ur: 'تربیت کے پہلے ہفتے کے لیے وہ فالتو لینووو لیپ ٹاپ بھی لیتی ہیں۔ اسے بھی اسی طرح ان کے نام جاری کریں۔',
      },
      do: async h => {
        await h.scrollTo(row('ASSET-LPT-003'));
        await assignTo(h, 'ASSET-LPT-003', 'Ayesha Kh', 'Ayesha Khan');
        await h.click(page => page.locator('.fixed').getByRole('button', { name: 'Assign', exact: true }), { after: 1000 });
      },
    },
    {
      say: {
        en: 'To see everything one person holds, type their name in the search box. Ayesha now has the uniform and the laptop.',
        ur: 'کسی ایک شخص کے پاس موجود تمام اشیاء دیکھنے کے لیے تلاش کے خانے میں اس کا نام لکھیں۔ عائشہ کے پاس اب یونیفارم اور لیپ ٹاپ ہیں۔',
      },
      do: async h => {
        await h.fill({ placeholder: 'Search tag, name, serial, holder…' }, 'Ayesha Khan', { delay: 80 });
        await h.wait(500);
        await h.point(page => page.locator('table tbody'), { hold: 2200 });
      },
    },
    {
      say: {
        en: 'After the training week she hands the laptop back. Click Return on its row. The box asks you to confirm the return from Ayesha Khan.',
        ur: 'تربیت کا ہفتہ ختم ہونے پر وہ لیپ ٹاپ واپس کر دیتی ہیں۔ اس کی قطار میں "Return" پر کلک کریں۔ ایک خانہ عائشہ خان سے واپسی کی تصدیق مانگتا ہے۔',
      },
      do: async h => {
        await h.click(page => row('ASSET-LPT-003')(page).getByRole('button', { name: 'Return' }), { after: 800 });
        await h.point(page => page.locator('.fixed', { hasText: 'Return Asset' }).locator('p').first(), { hold: 1600 });
      },
    },
    {
      say: {
        en: 'Click Confirm Return. The laptop is Available again, and the return date is recorded.',
        ur: '"Confirm Return" پر کلک کریں۔ لیپ ٹاپ دوبارہ "Available" ہو گیا ہے، اور واپسی کی تاریخ درج ہو گئی ہے۔',
      },
      do: async h => {
        await h.click('Confirm Return', { after: 1000 });
        await h.fill({ placeholder: 'Search tag, name, serial, holder…' }, 'ASSET-LPT-003', { delay: 60 });
        await h.wait(500);
        await h.point(row('ASSET-LPT-003'), { hold: 1800 });
      },
    },
    {
      say: {
        en: 'If an item breaks, click Repair: it is marked Under Repair until you click again. And before anyone\'s last working day, search their name here so that everything comes back before the final settlement.',
        ur: 'اگر کوئی چیز خراب ہو جائے تو "Repair" پر کلک کریں: یہ دوبارہ کلک کرنے تک "Under Repair" رہتی ہے۔ اور کسی بھی ملازم کے آخری دن سے پہلے یہاں اس کا نام تلاش کریں، تاکہ حتمی تصفیے سے پہلے سب کچھ واپس آ جائے۔',
      },
      do: async h => {
        await h.point(page => row('ASSET-LPT-003')(page).getByRole('button', { name: 'Repair' }), { hold: 1800 });
        await h.fill({ placeholder: 'Search tag, name, serial, holder…' }, '', { delay: 0 });
        await h.point(page => page.locator('input[placeholder="Search tag, name, serial, holder…"]'), { hold: 1500 });
      },
    },
  ],
};
