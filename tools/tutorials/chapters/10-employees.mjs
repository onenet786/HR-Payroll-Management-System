// Chapter 10: Employee Directory. Adds "Ayesha Khan" (Sales Executive, Sales & Marketing) end to end, with a photo
// and a CNIC copy in the document vault. Later chapters (lifecycle, performance, assets) use her record.
// Photo and document are generated on the fly (no files needed): a drawn portrait PNG and a one-page PDF.
const EMP = {
  name: 'Ayesha Khan', email: 'ayesha.khan@aljannatmall.local', cnic: '35202-5550123-4', cnicExpiry: '14-Aug-2032',
  probation: '23-Feb-2027', mobile: '214567890', dob: '14-Aug-1998', salary: '85000',
  bank: 'Meezan Bank Limited', account: '02010103456789', iban: 'PK36MEZN0002010103456789',
};

// Searchable list: open it, type part of the name, click the option.
async function pick(h, trigger, optionText, search) {
  await h.click(trigger, { after: 350 });
  if (search) await h.fill({ placeholder: 'Type to search…' }, search, { delay: 70 });
  await h.click({ role: 'option', name: optionText, exact: typeof optionText === 'string' }, { after: 450 });
}

// Number fields that already hold a 0: select the old value and type over it.
async function typeOver(h, target, value) {
  await h.click(target, { after: 150 });
  await h.press('Control+A');
  await h.page.keyboard.type(String(value), { delay: 90 });
  await h.highlightOff();
}

// A simple drawn portrait (PNG) for the photo upload.
async function portraitPng(page) {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 360; c.height = 360;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 360); bg.addColorStop(0, '#d1fae5'); bg.addColorStop(1, '#6ee7b7');
    g.fillStyle = bg; g.fillRect(0, 0, 360, 360);
    g.fillStyle = '#1e3a5f'; g.beginPath(); g.ellipse(180, 380, 150, 120, 0, Math.PI, 0); g.fill();          // shoulders
    g.fillStyle = '#7c2d4a'; g.beginPath(); g.ellipse(180, 170, 92, 108, 0, 0, Math.PI * 2); g.fill();       // scarf
    g.beginPath(); g.moveTo(95, 200); g.quadraticCurveTo(180, 330, 265, 200); g.lineTo(250, 290); g.quadraticCurveTo(180, 320, 110, 290); g.fill();
    g.fillStyle = '#e8b896'; g.beginPath(); g.ellipse(180, 178, 62, 74, 0, 0, Math.PI * 2); g.fill();        // face
    g.fillStyle = '#3b2418'; g.beginPath(); g.arc(156, 170, 6, 0, Math.PI * 2); g.arc(204, 170, 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#a0522d'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.arc(180, 200, 22, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    return c.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

// A minimal one-page PDF ("scanned CNIC copy" placeholder).
function cnicPdf() {
  const text = 'BT /F1 22 Tf 72 720 Td (Ayesha Khan - CNIC copy) Tj 0 -32 Td /F1 14 Tf (35202-5550123-4  -  demo document) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = pdf.length; pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const modal = page => page.locator('form', { hasText: 'Complete Onboarding' });

export default {
  id: '10',
  slug: 'Employee-Directory',
  as: 'admin',
  title: { en: 'Employee Directory', ur: 'ملازمین کی فہرست' },
  subtitle: {
    en: 'Find employees, open a record, and add a new employee with photo, bank details and documents.',
    ur: 'ملازمین تلاش کریں، ریکارڈ کھولیں، اور تصویر، بینک کی تفصیل اور دستاویزات کے ساتھ نیا ملازم شامل کریں۔',
  },
  audience: { en: ['HR staff'], ur: ['ایچ آر عملہ'] },
  intro: {
    en: 'The employee directory is the heart of the system: payroll, attendance and leave all read from it. In this chapter you will search the directory and add a new employee from start to finish.',
    ur: 'ملازمین کی فہرست سسٹم کا دل ہے: پے رول، حاضری اور چھٹیاں سب یہیں سے معلومات لیتے ہیں۔ اس باب میں آپ فہرست میں تلاش کریں گے اور ایک نیا ملازم شروع سے آخر تک شامل کریں گے۔',
  },
  // Show any message box in the log (they are not visible in a headless recording) and accept it.
  setup: async h => { h.page.on('dialog', d => { h.log(`dialog: ${d.message().split('\n')[0]}`); d.accept().catch(() => undefined); }); },
  steps: [
    {
      say: {
        en: 'Open People in the menu on the left, then click Employee Directory.',
        ur: 'بائیں طرف کے مینو میں "People" کھولیں، پھر "Employee Directory" پر کلک کریں۔',
      },
      do: async h => { await h.nav('People', 'Employee Directory'); },
    },
    {
      say: {
        en: 'At first the list is empty. To keep the page fast with thousands of staff, employees appear only after you search or choose a filter, fifty per page.',
        ur: 'شروع میں فہرست خالی ہوتی ہے۔ ہزاروں ملازمین کے ساتھ بھی صفحہ تیز رہے، اس لیے ملازمین صرف تلاش یا فلٹر کے بعد نظر آتے ہیں، ایک صفحے پر پچاس۔',
      },
      do: async h => { await h.point({ text: 'Search by name, code or CNIC, or choose a status or department to list employees.' }, { hold: 2800 }); },
    },
    {
      say: {
        en: 'Type part of a name, an employee code, a CNIC or a phone number in the search box. Here we look for Usman.',
        ur: 'تلاش کے خانے میں نام کا کچھ حصہ، ملازم کوڈ، شناختی کارڈ نمبر یا فون نمبر لکھیں۔ یہاں ہم عثمان کو تلاش کرتے ہیں۔',
      },
      do: async h => { await h.fill({ placeholder: 'Search name, code, CNIC, phone, IBAN…' }, 'Usman', { delay: 90 }); await h.wait(700); },
    },
    {
      say: {
        en: 'Each row shows the employee code, CNIC, department and job, bank account and basic wage. Click Edit Record to open the full profile.',
        ur: 'ہر قطار میں ملازم کوڈ، شناختی کارڈ، شعبہ اور عہدہ، بینک اکاؤنٹ اور بنیادی تنخواہ نظر آتی ہے۔ پوری پروفائل کھولنے کے لیے "Edit Record" پر کلک کریں۔',
      },
      do: async h => {
        await h.point(page => page.locator('tbody tr', { hasText: 'Usman Tariq' }), { hold: 2200 });
        await h.click(page => page.locator('tbody tr', { hasText: 'Usman Tariq' }).getByRole('button', { name: 'Edit Record' }), { after: 1200 });
      },
    },
    {
      say: {
        en: 'Here you can correct any detail, such as a new phone number or bank account. We only look, so we close it without saving.',
        ur: 'یہاں آپ کوئی بھی تفصیل درست کر سکتے ہیں، جیسے نیا فون نمبر یا بینک اکاؤنٹ۔ ہم صرف دیکھ رہے ہیں، اس لیے بغیر محفوظ کیے بند کر دیتے ہیں۔',
      },
      do: async h => {
        await h.point({ text: 'Edit Employee Record' }, { hold: 2200 });
        await h.click(page => page.locator('form', { hasText: 'Save Changes' }).getByRole('button', { name: 'Cancel', exact: true }), { after: 700 });
      },
    },
    {
      say: {
        en: 'Now let us add a new employee, Ayesha Khan, who joins today as a sales executive. Click Onboard Employee.',
        ur: 'اب ایک نیا ملازم شامل کرتے ہیں: عائشہ خان، جو آج سیلز ایگزیکٹو کے طور پر شامل ہو رہی ہیں۔ "Onboard Employee" پر کلک کریں۔',
      },
      do: async h => { await h.click('Onboard Employee', { after: 1000 }); },
    },
    {
      say: {
        en: 'Type her full name and work email. Tick Auto next to Employee Code, and the system gives her the next code by itself. Then type her CNIC with the dashes.',
        ur: 'ان کا پورا نام اور دفتری ای میل لکھیں۔ "Employee Code" کے ساتھ "Auto" پر ٹِک لگائیں، سسٹم خود اگلا کوڈ دے دے گا۔ پھر شناختی کارڈ نمبر ڈیشز کے ساتھ لکھیں۔',
      },
      do: async h => {
        await h.fill({ label: 'Full Name', exact: true }, EMP.name);
        await h.fill({ label: 'Official Email ID', exact: true }, EMP.email, { delay: 30 });
        await h.check({ label: 'Auto-generate Employee Code', exact: true });
        await h.fill({ label: 'Pakistan CNIC', exact: true }, EMP.cnic, { delay: 60 });
      },
    },
    {
      say: {
        en: 'Add the CNIC expiry date and the date her probation should be reviewed, here three months from today. The system reminds you before these dates.',
        ur: 'شناختی کارڈ کی میعاد ختم ہونے کی تاریخ اور پروبیشن کے جائزے کی تاریخ لکھیں، یہاں آج سے تین ماہ بعد۔ سسٹم ان تاریخوں سے پہلے یاد دہانی کراتا ہے۔',
      },
      do: async h => {
        await h.fill({ label: 'CNIC Expiry Date', exact: true }, EMP.cnicExpiry, { delay: 60 });
        await h.fill({ label: 'Probation Review Due Date', exact: true }, EMP.probation, { delay: 60 });
        await h.press('Tab');
      },
    },
    {
      say: {
        en: 'Her shift is nine to five with fifteen minutes of grace for late arrival. Change these if her timing is different.',
        ur: 'ان کی شفٹ نو سے پانچ بجے تک ہے، اور دیر سے آنے پر پندرہ منٹ کی رعایت ہے۔ اگر ان کا وقت مختلف ہو تو یہ بدل دیں۔',
      },
      do: async h => {
        await h.point({ label: 'Shift Start', exact: true }, { hold: 1000 });
        await h.point({ label: 'Shift End', exact: true }, { hold: 900 });
        await h.point({ label: 'Shift Grace Minutes', exact: true }, { hold: 900 });
      },
    },
    {
      say: {
        en: 'Further down, type her mobile number: plus nine two three is filled in for you, so type only the last nine digits. Then choose Female and enter her date of birth.',
        ur: 'نیچے ان کا موبائل نمبر لکھیں: +923 خود لکھا جاتا ہے، اس لیے صرف آخری نو ہندسے لکھیں۔ پھر "Female" منتخب کریں اور تاریخ پیدائش درج کریں۔',
      },
      caption: {
        en: 'Further down, type the mobile number: +923 is filled in for you, type only the last 9 digits. Choose Female and enter the date of birth.',
        ur: 'نیچے موبائل نمبر لکھیں: +923 خود لکھا جاتا ہے، صرف آخری 9 ہندسے لکھیں۔ "Female" منتخب کریں اور تاریخ پیدائش درج کریں۔',
      },
      do: async h => {
        await h.scrollTo({ label: 'Mobile Contact Number', exact: true });
        await h.fill({ label: 'Mobile Contact Number', exact: true }, EMP.mobile, { delay: 60 });
        await h.select({ label: 'Gender', exact: true }, 'Female');
        await h.fill({ label: 'Date of Birth', exact: true }, EMP.dob, { delay: 60 });
        await h.press('Tab');
      },
    },
    {
      say: {
        en: 'Click Browse to add her photo: JPEG, PNG or WebP, up to five hundred and twelve kilobytes. The photo helps staff recognise her and appears in the directory.',
        ur: 'ان کی تصویر لگانے کے لیے "Browse" پر کلک کریں: JPEG، PNG یا WebP، زیادہ سے زیادہ 512 کلو بائٹ۔ تصویر سے عملہ انہیں پہچانتا ہے اور یہ فہرست میں نظر آتی ہے۔',
      },
      caption: {
        en: 'Click Browse to add her photo (JPEG, PNG or WebP, up to 512 KB). It appears in the directory.',
        ur: 'تصویر لگانے کے لیے "Browse" پر کلک کریں (JPEG، PNG یا WebP، زیادہ سے زیادہ 512 KB)۔ یہ فہرست میں نظر آتی ہے۔',
      },
      do: async h => {
        await h.point({ text: 'Browse...', exact: true }, { hold: 900 });
        await h.page.setInputFiles('#add-emp-pic-file', { name: 'ayesha-khan.png', mimeType: 'image/png', buffer: await portraitPng(h.page) });
        await h.wait(700);
        await h.point(page => modal(page).locator('img[alt="Preview"]'), { hold: 1400 });
      },
    },
    {
      say: {
        en: 'Under Organization, choose her branch, Head Office, her department, Sales and Marketing, and her designation, Sales Executive.',
        ur: '"Organization" کے حصے میں ان کی برانچ "Head Office"، شعبہ "Sales & Marketing" اور عہدہ "Sales Executive" منتخب کریں۔',
      },
      caption: {
        en: 'Under Organization, choose the branch (Head Office), department (Sales & Marketing) and designation (Sales Executive).',
        ur: '"Organization" میں برانچ "Head Office"، شعبہ "Sales & Marketing" اور عہدہ "Sales Executive" منتخب کریں۔',
      },
      do: async h => {
        await h.scrollTo({ label: 'Assigned Branch', exact: true });
        await h.select({ label: 'Assigned Branch', exact: true }, 'Head Office');
        await pick(h, { label: 'Department', exact: true }, 'Sales & Marketing', 'Sales');
        await pick(h, { label: 'Designation', exact: true }, /^Sales Executive/, 'Executive');
      },
    },
    {
      say: {
        en: 'Choose the wage type, Monthly Salaried, and type her monthly salary, eighty-five thousand rupees. The green box shows how the package is split into basic pay and allowances, with an estimate of tax and take-home pay.',
        ur: 'تنخواہ کی قسم "Monthly Salaried" منتخب کریں اور ماہانہ تنخواہ پچاسی ہزار روپے لکھیں۔ سبز خانہ دکھاتا ہے کہ یہ پیکج بنیادی تنخواہ اور الاؤنسز میں کیسے تقسیم ہوتا ہے، اور ٹیکس اور خالص تنخواہ کا اندازہ بھی۔',
      },
      caption: {
        en: 'Choose Monthly Salaried and type the salary, PKR 85,000. The green box shows the split into basic pay and allowances, with estimated tax and take-home.',
        ur: '"Monthly Salaried" منتخب کریں اور تنخواہ 85,000 روپے لکھیں۔ سبز خانہ بنیادی تنخواہ، الاؤنسز، متوقع ٹیکس اور خالص تنخواہ دکھاتا ہے۔',
      },
      do: async h => {
        await h.scrollTo({ label: 'Wage Type', exact: true });
        await h.select({ label: 'Wage Type', exact: true }, 'Monthly Salaried (Monthly)');
        await typeOver(h, { label: 'Basic Monthly Wage / Daily Rate (PKR)', exact: true }, EMP.salary);
        await h.point({ text: 'Standard FBR Package Segregation', exact: false }, { hold: 2000 });
      },
    },
    {
      say: {
        en: 'Choose the bank the salary is paid into, then type the account number and the twenty-four character IBAN. The bank file for salary transfer is made from these details, so check them carefully.',
        ur: 'وہ بینک منتخب کریں جس میں تنخواہ جائے گی، پھر اکاؤنٹ نمبر اور چوبیس حروف والا IBAN لکھیں۔ تنخواہ کی منتقلی کی بینک فائل انہی تفصیلات سے بنتی ہے، اس لیے انہیں غور سے چیک کریں۔',
      },
      do: async h => {
        await h.select({ label: 'Disbursal Bank', exact: true }, EMP.bank);
        await h.fill({ label: 'Bank Account Number', exact: true }, EMP.account, { delay: 50 });
        await h.fill({ label: 'PKR IBAN Number', exact: true }, EMP.iban, { delay: 50 });
      },
    },
    {
      say: {
        en: 'At the bottom, EOBI and income tax are switched on as the law requires. Provident fund and gratuity are ticked by default; untick them if her contract does not include them.',
        ur: 'سب سے نیچے "EOBI" اور انکم ٹیکس قانون کے مطابق آن ہیں۔ "Provident Fund" اور "Gratuity" پر پہلے سے ٹِک لگا ہوتا ہے؛ اگر یہ ان کے معاہدے میں شامل نہ ہوں تو ٹِک ہٹا دیں۔',
      },
      do: async h => {
        await h.scrollTo({ label: 'Enable EOBI', exact: true });
        await h.point({ label: 'Enable EOBI', exact: true }, { hold: 1200 });
        await h.point({ label: 'Enable FBR Tax', exact: true }, { hold: 1000 });
        await h.point({ label: 'Opt In Provident Fund', exact: true }, { hold: 1000 });
        await h.point({ label: 'Opt In Gratuity', exact: true }, { hold: 900 });
      },
    },
    {
      say: {
        en: 'Click Complete Onboarding. Her joining date is recorded as today.',
        ur: '"Complete Onboarding" پر کلک کریں۔ ان کی شمولیت کی تاریخ آج کی تاریخ درج ہو جاتی ہے۔',
      },
      do: async h => { await h.click('Complete Onboarding', { after: 1800 }); },
    },
    {
      say: {
        en: 'To find her again, search for Ayesha Khan. Her row shows the photo, the new employee code, and her salary and bank.',
        ur: 'انہیں دوبارہ ڈھونڈنے کے لیے "Ayesha Khan" تلاش کریں۔ ان کی قطار میں تصویر، نیا ملازم کوڈ، تنخواہ اور بینک نظر آتے ہیں۔',
      },
      do: async h => {
        await h.scroll(-3000);
        await h.fill({ placeholder: 'Search name, code, CNIC, phone, IBAN…' }, EMP.name, { delay: 80 });
        await h.wait(700);
        await h.point(page => page.locator('tbody tr', { hasText: EMP.name }).first(), { hold: 2200 });
      },
    },
    {
      say: {
        en: 'Click Documents to open her private document vault. Choose the document type, CNIC, and click Upload document to add the scanned copy, as a PDF or a picture.',
        ur: 'ان کی نجی دستاویزات کا خانہ کھولنے کے لیے "Documents" پر کلک کریں۔ دستاویز کی قسم "CNIC" منتخب کریں اور اسکین شدہ کاپی شامل کرنے کے لیے "Upload document" پر کلک کریں، PDF یا تصویر کی صورت میں۔',
      },
      do: async h => {
        await h.click(page => page.locator('tbody tr', { hasText: EMP.name }).first().getByRole('button', { name: 'Documents' }), { after: 1000 });
        await h.select({ css: '.fixed select' }, 'CNIC');
        const chooser = h.page.waitForEvent('filechooser', { timeout: 6000 });
        await h.click('Upload document', { after: 200 });
        await (await chooser).setFiles({ name: 'Ayesha-Khan-CNIC.pdf', mimeType: 'application/pdf', buffer: cnicPdf() });
        await h.wait(1500);
      },
    },
    {
      say: {
        en: 'The file is stored privately on the server. Only HR can open it, and every download is recorded. Appointment letters, contracts and certificates go here too.',
        ur: 'فائل سرور پر نجی طور پر محفوظ ہو جاتی ہے۔ اسے صرف ایچ آر کھول سکتا ہے، اور ہر ڈاؤن لوڈ کا ریکارڈ رکھا جاتا ہے۔ تقرری نامے، معاہدے اور سرٹیفکیٹ بھی یہیں رکھے جاتے ہیں۔',
      },
      do: async h => {
        await h.point({ text: 'Ayesha-Khan-CNIC.pdf' }, { hold: 2600 });
        await h.point(page => page.locator('.fixed', { hasText: 'Employee Document Vault' }).getByTitle('Download').first(), { hold: 1500 });
      },
    },
  ],
};
