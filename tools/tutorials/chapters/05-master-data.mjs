// Chapter 05: Master Data Lists. Adds the demo department "Customer Care Desk" and the designation
// "Customer Care Officer" (grade G-3) under the Head Office.
const tab = name => ({ role: 'tab', name });
const drawer = '[role=dialog][aria-labelledby="master-form-title"]';

export default {
  id: '05',
  slug: 'Master-Data-Lists',
  as: 'admin',
  start: '/',
  title: { en: 'Master Data Lists', ur: 'ماسٹر ڈیٹا کی فہرستیں' },
  subtitle: {
    en: 'Branches, departments, designations with grades, zones, towns and wage types: the lists every employee record uses.',
    ur: 'برانچیں، شعبے، گریڈ کے ساتھ عہدے، زون، ٹاؤن اور اجرت کی اقسام: وہ فہرستیں جو ہر ملازم کے ریکارڈ میں استعمال ہوتی ہیں۔',
  },
  audience: { en: ['Administrators'], ur: ['ایڈمنسٹریٹر'] },
  intro: {
    en: 'Before you add employees, the lists they are chosen from must exist. In this chapter we add a new department and a designation with its grade.',
    ur: 'ملازمین شامل کرنے سے پہلے وہ فہرستیں موجود ہونی چاہئیں جن میں سے ان کی معلومات چنی جاتی ہیں۔ اس باب میں ہم ایک نیا شعبہ اور گریڈ کے ساتھ ایک عہدہ شامل کریں گے۔',
  },
  steps: [
    {
      say: {
        en: 'Open Setup and Administration, then Master Data Lists.',
        ur: '"Setup & Administration" کھولیں، پھر "Master Data Lists"۔',
      },
      do: async h => { await h.nav('Setup & Administration', 'Master Data Lists'); },
    },
    {
      say: {
        en: 'The tabs hold each list: branches, departments, designations, zones, union councils or towns, and wage types. Employee forms, attendance and payroll reports all pick from these lists, so the names stay the same everywhere.',
        ur: 'ہر فہرست کا اپنا ٹیب ہے: برانچیں، شعبے، عہدے، زون، یونین کونسل یا ٹاؤن، اور اجرت کی اقسام۔ ملازم کے فارم، حاضری اور پے رول رپورٹس سب انہی فہرستوں سے انتخاب کرتے ہیں، تاکہ نام ہر جگہ ایک جیسے رہیں۔',
      },
      do: async h => { await h.point({ css: '[role=tablist][aria-label="Master data categories"]' }, { hold: 3500 }); },
    },
    {
      say: {
        en: 'Open the Departments tab. Each department belongs to a branch, and the number of references shows how many records use it.',
        ur: '"Departments" والا ٹیب کھولیں۔ ہر شعبہ کسی برانچ سے منسلک ہوتا ہے، اور "references" کی تعداد بتاتی ہے کہ کتنے ریکارڈ اسے استعمال کر رہے ہیں۔',
      },
      do: async h => {
        await h.click(tab('Departments'), { after: 900 });
        await h.point({ css: 'article p:has-text("references")' }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'The mall is opening a customer care desk, so we add a department for it. Click Add Department.',
        ur: 'مال میں کسٹمر کیئر ڈیسک کھل رہا ہے، اس لیے ہم اس کا شعبہ بناتے ہیں۔ "Add Department" پر کلک کریں۔',
      },
      do: async h => { await h.click('Add Department', { after: 900 }); },
    },
    {
      say: {
        en: 'Choose the branch, Head Office, and type the department name: Customer Care Desk. Leave Auto-generate code ticked: the system builds a code from the company, branch and department.',
        ur: 'برانچ چنیں، "Head Office"، اور شعبے کا نام لکھیں: Customer Care Desk۔ "Auto-generate code" منتخب رہنے دیں: سسٹم کمپنی، برانچ اور شعبے سے خود کوڈ بنا دیتا ہے۔',
      },
      do: async h => {
        await h.select({ css: `${drawer} select` }, { index: 1 });
        await h.fill({ label: 'Department name' }, 'Customer Care Desk', { delay: 70 });
        await h.point({ text: 'Auto-generate code' }, { hold: 700 });
        await h.point({ css: `${drawer} output` }, { hold: 1300 });
      },
    },
    {
      say: {
        en: 'Click Save record. The new department is now in the list.',
        ur: '"Save record" پر کلک کریں۔ نیا شعبہ اب فہرست میں موجود ہے۔',
      },
      do: async h => {
        await h.click({ css: `${drawer} button:has-text("Save record")` }, { after: 1500 });
        await h.fill({ placeholder: 'Search departments' }, 'Customer', { delay: 90 });
        await h.point({ css: 'article:has-text("Customer Care Desk")' }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Next, the job title. Open Designations and click Add Designation.',
        ur: 'اب عہدہ۔ "Designations" کھولیں اور "Add Designation" پر کلک کریں۔',
      },
      do: async h => {
        await h.click(tab('Designations'), { after: 800 });
        await h.click('Add Designation', { after: 900 });
      },
    },
    {
      say: {
        en: 'Choose the department we just created, and type the title: Customer Care Officer.',
        ur: 'ابھی بنایا ہوا شعبہ چنیں، اور عہدے کا نام لکھیں: Customer Care Officer۔',
      },
      do: async h => {
        const select = h.page.locator(`${drawer} select`).first();
        const option = await select.locator('option', { hasText: 'Customer Care Desk' }).first().getAttribute('value');
        await h.select({ css: `${drawer} select` }, { value: option });
        await h.fill({ label: 'Designation title' }, 'Customer Care Officer', { delay: 60 });
      },
    },
    {
      say: {
        en: 'Grades are kept on the designation. Type G-3. Grades group similar jobs for pay scales and reports.',
        ur: 'گریڈ عہدے کے ساتھ ہی محفوظ ہوتا ہے۔ G-3 لکھیں۔ گریڈ ملتی جلتی ملازمتوں کو تنخواہ کے اسکیل اور رپورٹس کے لیے ایک گروپ میں رکھتے ہیں۔',
      },
      caption: {
        en: 'Grades are kept on the designation. Type "G-3". Grades group similar jobs for pay scales and reports.',
        ur: 'گریڈ عہدے کے ساتھ ہی محفوظ ہوتا ہے۔ "G-3" لکھیں۔ گریڈ ملتی جلتی ملازمتوں کو تنخواہ کے اسکیل اور رپورٹس کے لیے گروپ کرتے ہیں۔',
      },
      do: async h => {
        await h.scrollTo({ label: 'Grade', exact: true });
        await h.fill({ label: 'Grade', exact: true }, 'G-3', { delay: 120 });
      },
    },
    {
      say: {
        en: 'Click Save record. The designation can now be chosen when you add or transfer an employee.',
        ur: '"Save record" پر کلک کریں۔ اب یہ عہدہ کسی ملازم کو شامل یا منتقل کرتے وقت چنا جا سکتا ہے۔',
      },
      do: async h => {
        await h.click({ css: `${drawer} button:has-text("Save record")` }, { after: 1500 });
        await h.fill({ placeholder: 'Search designations' }, 'Customer', { delay: 90 });
        await h.point({ css: 'article:has-text("Customer Care Officer")' }, { hold: 1800 });
      },
    },
    {
      say: {
        en: 'Zones and UC or Towns group locations for field staff and area reports. Wage Types say whether pay is worked out monthly or daily, for example for daily-wage workers.',
        ur: 'زون اور یو سی یا ٹاؤن فیلڈ عملے اور علاقائی رپورٹس کے لیے مقامات کو گروپ کرتے ہیں۔ "Wage Types" بتاتی ہیں کہ تنخواہ ماہانہ حساب ہو گی یا روزانہ، مثلاً دیہاڑی دار مزدوروں کے لیے۔',
      },
      do: async h => {
        await h.point(tab('Zones'), { hold: 1000 });
        await h.point(tab('UC/Towns'), { hold: 1000 });
        await h.click(tab('Wage Types'), { after: 1200 });
      },
    },
    {
      say: {
        en: 'To correct a name or a grade, click Edit next to the record. Because employees are linked to the record, not to a copy of its name, the correction shows everywhere at once.',
        ur: 'کوئی نام یا گریڈ درست کرنا ہو تو ریکارڈ کے سامنے "Edit" پر کلک کریں۔ چونکہ ملازمین اسی ریکارڈ سے جڑے ہوتے ہیں، اس لیے درستگی ہر جگہ ایک ساتھ نظر آتی ہے۔',
      },
      do: async h => {
        await h.click(tab('Designations'), { after: 800 });
        await h.point({ css: 'article button:has-text("Edit")' }, { hold: 2000 });
      },
    },
  ],
};
