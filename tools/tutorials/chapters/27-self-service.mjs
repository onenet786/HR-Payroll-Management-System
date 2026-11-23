// Chapter 27: what an employee sees after signing in on the web (signed in as Usman Tariq, role Employee).
// Since 2026-11-23 an Employee account opens the self-service screens (the same screens as the phone app) in the
// browser, with a "Change password" button, instead of the HR portal. Nothing is submitted here: the leave form and
// the password dialog are only shown, so later chapters keep the same data and the demo password.
export default {
  id: '27',
  slug: 'Employee-Self-Service-Web',
  as: 'employee',
  start: '/',
  title: { en: 'Employee self-service on the web', ur: 'ویب پر ملازم کی سیلف سروس' },
  subtitle: {
    en: 'Your status, leave, payslips and notices in any browser, and how to change your own password.',
    ur: 'کسی بھی براؤزر میں اپنی حاضری، چھٹی، پے سلپ اور نوٹس، اور اپنا پاس ورڈ خود بدلنے کا طریقہ۔',
  },
  audience: { en: ['Employees'], ur: ['ملازمین'] },
  intro: {
    en: 'In this chapter an ordinary employee, Usman Tariq from Sales, signs in from a computer and uses his self-service screens.',
    ur: 'اس باب میں ایک عام ملازم، سیلز کے عثمان طارق، کمپیوٹر سے لاگ ان ہو کر اپنی سیلف سروس اسکرینیں استعمال کرتے ہیں۔',
  },
  steps: [
    {
      say: {
        en: 'An employee who signs in from a web browser gets the employee self-service screens. They are the same screens as the phone app, so you only learn them once.',
        ur: 'جو ملازم ویب براؤزر سے لاگ ان کرتا ہے اسے ملازم کی سیلف سروس اسکرینیں ملتی ہیں۔ یہ وہی اسکرینیں ہیں جو فون ایپ میں ہیں، اس لیے انہیں ایک ہی بار سیکھنا پڑتا ہے۔',
      },
      do: async h => { await h.point({ text: 'Employee self-service' }, { hold: 1800 }); },
    },
    {
      say: {
        en: 'The home screen greets you by name and shows today\'s status, how much leave you have used, and the latest notices from HR.',
        ur: 'ہوم اسکرین آپ کو نام سے خوش آمدید کہتی ہے اور آج کی حاضری، استعمال شدہ چھٹی، اور ایچ آر کے تازہ نوٹس دکھاتی ہے۔',
      },
      do: async h => {
        await h.point(page => page.getByText(/^today'?s status$/i), { hold: 1300 });
        await h.point(page => page.getByText(/^leave used$/i), { hold: 1000 });
        await h.point(page => page.getByText(/^notifications$/i), { hold: 1000 });
      },
    },
    {
      say: {
        en: 'Notices arrive in English and Urdu: salary paid, leave approved, public holidays and company announcements.',
        ur: 'نوٹس انگریزی اور اردو دونوں میں آتے ہیں: تنخواہ کی ادائیگی، چھٹی کی منظوری، سرکاری چھٹیاں اور کمپنی کے اعلانات۔',
      },
      do: async h => { await h.point({ text: 'Salary has been disbursed' }, { hold: 2000 }); },
    },
    {
      say: {
        en: 'Click Payslip at the bottom. Choose the month to see your earnings, deductions and net take-home pay. A payslip appears here once that month\'s salary has been paid.',
        ur: 'نیچے "Payslip" پر کلک کریں۔ مہینہ منتخب کر کے اپنی آمدنی، کٹوتیاں اور خالص تنخواہ دیکھیں۔ کسی مہینے کی پے سلپ یہاں اس وقت آتی ہے جب اس مہینے کی تنخواہ ادا ہو جائے۔',
      },
      do: async h => {
        await h.click(page => page.getByText('Payslip', { exact: true }), { after: 1300 });
        await h.point(page => page.locator('select').first(), { hold: 900 });
        await h.point(page => page.getByText('Net Take-Home'), { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Download PDF saves the payslip, for example for a bank or a visa application.',
        ur: '"Download PDF" پے سلپ محفوظ کر لیتا ہے، مثلاً بینک یا ویزا کی درخواست کے لیے۔',
      },
      do: async h => { await h.point(page => page.getByRole('button', { name: 'Download PDF' }), { hold: 1800 }); },
    },
    {
      say: {
        en: 'Click Leave to see your balance for each type of leave, and to apply. Choose the type and the dates, write the reason, and send it. Your line manager decides it.',
        ur: 'ہر قسم کی چھٹی کا بیلنس دیکھنے اور درخواست دینے کے لیے "Leave" پر کلک کریں۔ قسم اور تاریخیں منتخب کریں، وجہ لکھیں اور بھیج دیں۔ فیصلہ آپ کا لائن مینیجر کرتا ہے۔',
      },
      do: async h => {
        await h.click(page => page.getByText('Leave', { exact: true }), { after: 1300 });
        await h.point(page => page.getByText(/^my leave summary$/i), { hold: 1400 });
        await h.point(page => page.getByRole('button', { name: 'Submit Leave Request' }), { hold: 1200 });
      },
    },
    {
      say: {
        en: 'The end date cannot be before the start date, and the system checks your balance before the request is sent.',
        ur: 'آخری تاریخ شروع کی تاریخ سے پہلے نہیں ہو سکتی، اور درخواست بھیجنے سے پہلے سسٹم آپ کا بیلنس چیک کرتا ہے۔',
      },
      do: async h => { await h.point(page => page.getByPlaceholder(/Describe your reason/), { hold: 1600 }); },
    },
    {
      say: {
        en: 'Attend is for staff on approved mobile duty, such as field sales. It records your location and needs the phone\'s camera or fingerprint, so most staff punch at the office kiosk.',
        ur: '"Attend" منظور شدہ موبائل ڈیوٹی والے عملے کے لیے ہے، جیسے فیلڈ سیلز۔ یہ آپ کا مقام ریکارڈ کرتا ہے اور فون کا کیمرہ یا فنگر پرنٹ مانگتا ہے، اس لیے زیادہ تر عملہ دفتر کے کیوسک پر حاضری لگاتا ہے۔',
      },
      do: async h => {
        await h.click(page => page.getByText('Attend', { exact: true }), { after: 1300 });
        await h.point(page => page.getByRole('button', { name: 'Start Day' }), { hold: 1500 });
      },
    },
    {
      say: {
        en: 'You can change your own password at any time. Click Change password at the top.',
        ur: 'آپ کسی بھی وقت اپنا پاس ورڈ خود بدل سکتے ہیں۔ اوپر "Change password" پر کلک کریں۔',
      },
      do: async h => {
        await h.click(page => page.getByText('Home', { exact: true }), { after: 700 });
        await h.click(page => page.getByRole('button', { name: 'Change password' }), { after: 1000 });
      },
    },
    {
      say: {
        en: 'Type your current password, then the new one twice. Use at least twelve characters; a short sentence you can remember works well. Other devices where you are signed in are signed out.',
        ur: 'اپنا موجودہ پاس ورڈ لکھیں، پھر نیا پاس ورڈ دو بار۔ کم از کم بارہ حروف رکھیں؛ کوئی چھوٹا سا جملہ جو یاد رہے اچھا رہتا ہے۔ جن دوسرے آلات پر آپ لاگ ان ہیں وہاں سے آپ لاگ آؤٹ ہو جاتے ہیں۔',
      },
      caption: {
        en: 'Current password, then the new one twice: at least 12 characters. Your other signed-in devices are signed out.',
        ur: 'موجودہ پاس ورڈ، پھر نیا پاس ورڈ دو بار: کم از کم 12 حروف۔ دوسرے آلات سے آپ لاگ آؤٹ ہو جاتے ہیں۔',
      },
      do: async h => {
        await h.point({ label: 'Current password' }, { hold: 900 });
        await h.point({ label: 'New password', exact: true }, { hold: 900 });
        await h.point({ label: 'Repeat new password' }, { hold: 900 });
        await h.point(page => page.getByRole('button', { name: 'Save new password' }), { hold: 900 });
        await h.click(page => page.getByRole('dialog').getByRole('button', { name: 'Cancel' }), { after: 600 });
      },
    },
    {
      say: {
        en: 'When you finish, click Logout, especially on a shared computer. The page reloads, so the next person sees nothing of yours.',
        ur: 'کام ختم ہونے پر "Logout" پر کلک کریں، خاص طور پر مشترکہ کمپیوٹر پر۔ صفحہ دوبارہ لوڈ ہوتا ہے، اس لیے اگلے شخص کو آپ کا کچھ بھی نظر نہیں آتا۔',
      },
      do: async h => { await h.point(page => page.getByText('Logout', { exact: true }), { hold: 1800 }); },
    },
  ],
};
