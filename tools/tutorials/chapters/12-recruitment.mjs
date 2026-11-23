// Chapter 12: Recruitment. Posts "Customer Service Officer", adds applicant Hamza Farooq, moves him through the
// stages to Hired and opens "Onboard as employee" (the prefilled form is shown, then cancelled: chapter 10 covers it).
const JOB = 'Customer Service Officer';
const APPLICANT = 'Hamza Farooq';
const card = page => page.locator('div.cursor-pointer', { hasText: APPLICANT }).first();
const jobModal = page => page.locator('.fixed', { hasText: 'Job Title' });
const appModal = page => page.locator('.fixed', { hasText: 'Expected Salary (PKR)' });

export default {
  id: '12',
  slug: 'Recruitment',
  as: 'admin',
  title: { en: 'Recruitment', ur: 'بھرتی' },
  subtitle: {
    en: 'Post a vacancy, record candidates, move them through the hiring stages and turn the chosen one into an employee.',
    ur: 'آسامی کا اعلان کریں، امیدوار درج کریں، انہیں بھرتی کے مراحل سے گزاریں اور منتخب امیدوار کو ملازم بنائیں۔',
  },
  audience: { en: ['HR staff'], ur: ['ایچ آر عملہ'] },
  intro: {
    en: 'In this chapter you will post a new vacancy for the mall, add a candidate, take him through shortlisting and interview to hiring, and see how his details carry over into his employee record.',
    ur: 'اس باب میں آپ مال کے لیے ایک نئی آسامی کا اعلان کریں گے، ایک امیدوار شامل کریں گے، اسے شارٹ لسٹ اور انٹرویو سے بھرتی تک لے جائیں گے، اور دیکھیں گے کہ اس کی تفصیلات ملازمتی ریکارڈ میں کیسے منتقل ہوتی ہیں۔',
  },
  setup: async h => { h.page.on('dialog', d => { h.log(`dialog: ${d.message().split('\n')[0]}`); d.accept().catch(() => undefined); }); },
  steps: [
    {
      say: {
        en: 'Open People in the menu on the left, then click Recruitment. The cards at the top count the open positions, the applicants, the interviews pending and the people hired.',
        ur: 'بائیں طرف کے مینو میں "People" کھولیں، پھر "Recruitment" پر کلک کریں۔ اوپر کے کارڈز کھلی آسامیاں، امیدوار، باقی انٹرویو اور بھرتی ہونے والے افراد گنتے ہیں۔',
      },
      do: async h => {
        await h.nav('People', 'Recruitment');
        await h.point({ text: 'Open Positions', exact: true }, { hold: 1200 });
        await h.point({ text: 'Hired', exact: true }, { hold: 900 });
      },
    },
    {
      say: {
        en: 'Each job posting shows the department, vacancies, salary range and closing date. Hold pauses a posting, and Filled closes it once you have hired everyone you need.',
        ur: 'ہر آسامی میں شعبہ، آسامیوں کی تعداد، تنخواہ کی حد اور آخری تاریخ نظر آتی ہے۔ "Hold" آسامی کو روک دیتا ہے، اور جب تمام مطلوبہ افراد بھرتی ہو جائیں تو "Filled" اسے بند کر دیتا ہے۔',
      },
      do: async h => {
        await h.point(page => page.locator('div.rounded-2xl', { hasText: 'View Pipeline' }).first(), { hold: 2000 });
        await h.point(page => page.getByRole('button', { name: 'Hold', exact: true }).first(), { hold: 1100 });
        await h.point(page => page.getByRole('button', { name: 'Filled', exact: true }).first(), { hold: 1100 });
      },
    },
    {
      say: {
        en: 'To advertise a new vacancy, click Post Job. Type the title, Customer Service Officer, and choose the department, the branch, the job type and the status, Open.',
        ur: 'نئی آسامی کے اعلان کے لیے "Post Job" پر کلک کریں۔ عنوان "Customer Service Officer" لکھیں، اور شعبہ، برانچ، ملازمت کی قسم اور اسٹیٹس "Open" منتخب کریں۔',
      },
      do: async h => {
        await h.click('Post Job', { after: 700 });
        await h.fill({ label: 'Job Title', exact: true }, JOB);
        await h.select({ css: '#job-departmentId' }, 'Sales & Marketing');
        await h.select({ css: '#job-branchId' }, 'Head Office');
        await h.point({ css: '#job-jobType' }, { hold: 500 });
        await h.point({ css: '#job-status' }, { hold: 500 });
      },
    },
    {
      say: {
        en: 'Enter the number of vacancies, the salary range, the experience and qualification you need, and the closing date. A short description helps candidates and interviewers.',
        ur: 'آسامیوں کی تعداد، تنخواہ کی حد، مطلوبہ تجربہ اور تعلیم، اور آخری تاریخ درج کریں۔ مختصر تفصیل امیدواروں اور انٹرویو لینے والوں کے کام آتی ہے۔',
      },
      do: async h => {
        await h.fill({ label: 'Vacancies', exact: true }, '2');
        await h.fill({ label: 'Salary Range', exact: true }, 'PKR 55,000 - 65,000', { delay: 35 });
        await h.fill({ label: 'Experience Required', exact: true }, '1-2 years', { delay: 40 });
        await h.fill({ label: 'Qualification', exact: true }, 'Intermediate or Graduate', { delay: 35 });
        await h.fill(page => jobModal(page).locator('input[aria-label="Closing Date"]'), '31-Dec-2026', { delay: 60 });
        await h.press('Tab');
        await h.fill({ label: 'Job Description', exact: true }, 'Help desk on the ground floor: guide shoppers, handle complaints and gift cards.', { delay: 20 });
      },
    },
    {
      say: {
        en: 'Click Post Job. The new vacancy is added to the list as Open.',
        ur: '"Post Job" پر کلک کریں۔ نئی آسامی "Open" کے طور پر فہرست میں شامل ہو جاتی ہے۔',
      },
      do: async h => {
        await h.click(page => jobModal(page).getByRole('button', { name: 'Post Job' }), { after: 1200 });
        await h.scrollTo({ text: JOB, exact: true });
        await h.point(page => page.locator('div.rounded-2xl', { hasText: JOB }).first(), { hold: 1800 });
      },
    },
    {
      say: {
        en: 'When a CV arrives, click Add Applicant. Choose the job posting, then type the candidate\'s name, email, phone and CNIC, his current and expected salary, and the interview date.',
        ur: 'جب کوئی سی وی آئے تو "Add Applicant" پر کلک کریں۔ آسامی منتخب کریں، پھر امیدوار کا نام، ای میل، فون، شناختی کارڈ، موجودہ اور متوقع تنخواہ، اور انٹرویو کی تاریخ لکھیں۔',
      },
      do: async h => {
        await h.scroll(-2000);
        await h.click('Add Applicant', { after: 700 });
        await h.select({ css: '#app-job-posting' }, JOB);
        await h.fill({ css: '#app-applicantName' }, APPLICANT);
        await h.fill({ css: '#app-applicantEmail' }, 'hamza.farooq@example.com', { delay: 30 });
        await h.fill({ css: '#app-applicantPhone' }, '0301-2345678', { delay: 50 });
        await h.fill({ css: '#app-cnic' }, '35202-6612345-7', { delay: 50 });
        await h.fill({ css: '#app-currentSalary' }, '50000', { delay: 60 });
        await h.fill({ css: '#app-expectedSalary' }, '60000', { delay: 60 });
        await h.fill(page => appModal(page).locator('#app-interviewDate, input[aria-label="Interview Date"]').first(), '03-Dec-2026', { delay: 60 });
        await h.press('Tab');
      },
    },
    {
      say: {
        en: 'Click Add Applicant. Then open Applicant Pipeline and choose the posting, to see only its candidates.',
        ur: '"Add Applicant" پر کلک کریں۔ پھر "Applicant Pipeline" کھولیں اور آسامی منتخب کریں، تاکہ صرف اسی کے امیدوار نظر آئیں۔',
      },
      do: async h => {
        await h.click(page => appModal(page).getByRole('button', { name: 'Add Applicant' }), { after: 1000 });
        await h.click(page => page.getByRole('button', { name: /^Applicant Pipeline/ }), { after: 700 });
        await h.select({ label: 'Filter by job posting', exact: true }, JOB);
      },
    },
    {
      say: {
        en: 'Each column is a hiring stage: Applied, Shortlisted, Interview Scheduled, Interviewed, Offer Extended, Hired, or Rejected. Hamza starts in Applied. Click the green arrow to move him forward, here to Shortlisted and then Interview Scheduled.',
        ur: 'ہر کالم بھرتی کا ایک مرحلہ ہے: "Applied"، "Shortlisted"، "Interview Scheduled"، "Interviewed"، "Offer Extended"، "Hired" یا "Rejected"۔ حمزہ "Applied" سے شروع ہوتے ہیں۔ انہیں آگے بڑھانے کے لیے سبز تیر پر کلک کریں، یہاں پہلے "Shortlisted" اور پھر "Interview Scheduled"۔',
      },
      caption: {
        en: 'Each column is a hiring stage. Click the green arrow to move Hamza forward: Shortlisted, then Interview Scheduled.',
        ur: 'ہر کالم بھرتی کا ایک مرحلہ ہے۔ حمزہ کو آگے بڑھانے کے لیے سبز تیر پر کلک کریں: "Shortlisted"، پھر "Interview Scheduled"۔',
      },
      do: async h => {
        await h.point(card, { hold: 1500 });
        await h.click(page => card(page).getByRole('button', { name: '→' }), { after: 900 });
        await h.click(page => card(page).getByRole('button', { name: '→' }), { after: 900 });
        await h.point(card, { hold: 800 });
      },
    },
    {
      say: {
        en: 'Click a candidate to see all his details. After the interview, choose the stage directly, for example Offer Extended. The grey arrow moves a candidate back if needed.',
        ur: 'کسی امیدوار پر کلک کریں تو اس کی تمام تفصیلات نظر آتی ہیں۔ انٹرویو کے بعد براہِ راست مرحلہ منتخب کریں، مثلاً "Offer Extended"۔ ضرورت ہو تو سرمئی تیر امیدوار کو پیچھے لے جاتا ہے۔',
      },
      do: async h => {
        await h.click(card, { after: 900 });
        await h.point(page => page.locator('.fixed').getByText('Expected Salary:'), { hold: 1400 });
        await h.click(page => page.locator('.fixed').getByRole('button', { name: 'Offer Extended', exact: true }), { after: 900 });
        await h.point(page => card(page).getByRole('button', { name: '←' }), { hold: 1200 });
      },
    },
    {
      say: {
        en: 'When he accepts the offer, move him to Hired. The card now shows Onboard as employee.',
        ur: 'جب وہ پیشکش قبول کر لیں تو انہیں "Hired" میں لے جائیں۔ اب کارڈ پر "Onboard as employee" نظر آتا ہے۔',
      },
      do: async h => {
        await h.click(page => card(page).getByRole('button', { name: '→' }), { after: 900 });
        await h.point(page => card(page).getByRole('button', { name: 'Onboard as employee' }), { hold: 1600 });
      },
    },
    {
      say: {
        en: 'Click it. The onboarding form opens with his name, email, phone, CNIC, department and expected salary already filled in, so nothing is typed twice.',
        ur: 'اس پر کلک کریں۔ ملازم شامل کرنے کا فارم کھل جاتا ہے، جس میں ان کا نام، ای میل، فون، شناختی کارڈ، شعبہ اور متوقع تنخواہ پہلے سے لکھے ہوتے ہیں، تاکہ کچھ بھی دوبارہ نہ لکھنا پڑے۔',
      },
      do: async h => {
        await h.click(page => card(page).getByRole('button', { name: 'Onboard as employee' }), { after: 1400 });
        await h.point({ label: 'Full Name', exact: true }, { hold: 1200 });
        await h.point({ label: 'Pakistan CNIC', exact: true }, { hold: 1200 });
      },
    },
    {
      say: {
        en: 'You complete the rest, such as his date of birth, bank and designation, exactly as shown in the Employee Directory chapter. We cancel here, so his record is not created in this demo.',
        ur: 'باقی تفصیلات، جیسے تاریخ پیدائش، بینک اور عہدہ، بالکل ویسے ہی مکمل کریں جیسے "Employee Directory" والے باب میں دکھایا گیا ہے۔ ہم یہاں "Cancel" کرتے ہیں، اس لیے اس ڈیمو میں ان کا ریکارڈ نہیں بنتا۔',
      },
      do: async h => {
        await h.point({ label: 'Mobile Contact Number', exact: true }, { hold: 1200 });
        await h.point({ label: 'Date of Birth', exact: true }, { hold: 1800 });
        await h.point({ label: 'Disbursal Bank', exact: true }, { hold: 2200 });
        await h.click(page => page.locator('form', { hasText: 'Complete Onboarding' }).getByRole('button', { name: 'Cancel', exact: true }), { after: 800 });
      },
    },
  ],
};
