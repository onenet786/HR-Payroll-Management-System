// Chapter 27: what an employee sees in the web portal (signed in as Usman Tariq, role Employee).
// The Employee role only has "view_dashboard", so the web portal shows the employee's own dashboard, notifications
// and security settings. Attendance punching, payslips and leave requests live in the phone app (chapter 28).
const bell = page => page.locator('svg.lucide-bell').first().locator('xpath=..');
const sidebar = page => page.locator('div.flex-1.overflow-y-auto').filter({ hasText: 'MODULES' }).first();

export default {
  id: '27',
  slug: 'Employee-Self-Service-Web',
  as: 'employee',
  start: '/',
  title: { en: 'Employee self-service on the web', ur: 'ویب پر ملازم کی سیلف سروس' },
  subtitle: {
    en: 'What an employee sees after signing in: your own dashboard, notifications, security and language.',
    ur: 'لاگ ان کے بعد ملازم کو کیا نظر آتا ہے: اپنا ڈیش بورڈ، نوٹیفکیشنز، سیکیورٹی اور زبان۔',
  },
  audience: { en: ['Employees'], ur: ['ملازمین'] },
  intro: {
    en: 'In this chapter we sign in as an ordinary employee, Usman Tariq from Sales, and see what the web portal shows him.',
    ur: 'اس باب میں ہم ایک عام ملازم، سیلز کے عثمان طارق، کے طور پر لاگ ان ہیں اور دیکھیں گے کہ ویب پورٹل انہیں کیا دکھاتا ہے۔',
  },
  steps: [
    {
      say: {
        en: 'At the top right you can see who is signed in, and the role, Employee. An employee only ever sees his or her own records.',
        ur: 'اوپر دائیں طرف نظر آتا ہے کہ کون لاگ ان ہے، اور رول "Employee" ہے۔ ملازم کو صرف اپنا ہی ریکارڈ نظر آتا ہے۔',
      },
      do: async h => { await h.point({ text: 'demo.usman' }, { hold: 1800 }); },
    },
    {
      say: {
        en: 'That is why the menu on the left is short. Screens for HR and payroll staff are hidden from employees.',
        ur: 'اسی لیے بائیں طرف کا مینو مختصر ہے۔ ایچ آر اور پے رول عملے والی اسکرینیں ملازمین سے چھپی رہتی ہیں۔',
      },
      do: async h => { await h.point(sidebar, { hold: 1800 }); },
    },
    {
      say: {
        en: 'This yellow card asks you to switch on two-step verification. It is recommended for everyone, and the security chapter shows how.',
        ur: 'یہ پیلا کارڈ آپ سے دو مرحلوں والی تصدیق آن کرنے کو کہتا ہے۔ یہ سب کے لیے بہتر ہے، اور اس کا طریقہ سیکیورٹی والے باب میں ہے۔',
      },
      do: async h => { await h.point('Set up MFA', { hold: 1800 }); },
    },
    {
      say: {
        en: 'Scroll down to the dashboard. Every figure here is about you only: one employee, your attendance rate this month, and your own monthly salary.',
        ur: 'نیچے ڈیش بورڈ تک جائیں۔ یہاں ہر عدد صرف آپ کے بارے میں ہے: ایک ملازم، اس مہینے آپ کی حاضری کی شرح، اور آپ کی اپنی ماہانہ تنخواہ۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'HR KPI Dashboard' });
        await h.point(page => page.getByText(/^attendance rate$/i), { hold: 1400 });
        await h.point(page => page.getByText(/^monthly wage bill$/i), { hold: 1200 });
      },
    },
    {
      say: {
        en: 'Further down, the attendance panel counts your days this month: on time, late, half days, absent and on leave.',
        ur: 'مزید نیچے حاضری والا حصہ اس مہینے کے آپ کے دن گنتا ہے: وقت پر، دیر سے، آدھا دن، غیر حاضر اور چھٹی پر۔',
      },
      do: async h => {
        await h.scrollTo({ css: 'section[aria-label="Attendance rate"]' });
        await h.point({ css: 'section[aria-label="Attendance rate"]' }, { hold: 2200 });
      },
    },
    {
      say: {
        en: 'Now click the bell at the top. The number on it shows how many messages you have not read yet.',
        ur: 'اب اوپر گھنٹی کے نشان پر کلک کریں۔ اس پر لکھا عدد بتاتا ہے کہ کتنے پیغامات ابھی آپ نے نہیں پڑھے۔',
      },
      do: async h => { await h.click(bell, { after: 1500 }); },
    },
    {
      say: {
        en: 'This is your Notification Center. HR sends you messages here: approved leave, salary paid, review reminders and public holidays.',
        ur: 'یہ آپ کا "Notification Center" ہے۔ ایچ آر یہاں آپ کو پیغامات بھیجتا ہے: منظور شدہ چھٹی، تنخواہ کی ادائیگی، ریویو کی یاد دہانی اور سرکاری چھٹیاں۔',
      },
      do: async h => { await h.point({ text: 'Notification Center', exact: true }, { hold: 1500 }); await h.point(page => page.getByText(/^unread$/i), { hold: 1000 }); },
    },
    {
      say: {
        en: 'Use the buttons to show one kind of message. Click Payroll to see only the salary messages.',
        ur: 'ایک ہی قسم کے پیغامات دیکھنے کے لیے یہ بٹن استعمال کریں۔ صرف تنخواہ والے پیغامات دیکھنے کے لیے "Payroll" پر کلک کریں۔',
      },
      do: async h => { await h.click(page => page.getByRole('button', { name: /Payroll$/ }).filter({ hasNotText: '10.' }), { after: 1200 }); },
    },
    {
      say: {
        en: 'Each salary message tells you that the month was paid, in English and in Urdu. When you have read one, click Mark read.',
        ur: 'تنخواہ کا ہر پیغام بتاتا ہے کہ اس مہینے کی ادائیگی ہو گئی، انگریزی اور اردو دونوں میں۔ پڑھ لینے کے بعد "Mark read" پر کلک کریں۔',
      },
      do: async h => {
        await h.point({ text: 'Salary has been disbursed' }, { hold: 1400 });
        const markRead = h.page.getByText('Mark read', { exact: true });
        if (await markRead.count()) await h.click(() => markRead.first(), { after: 1000 });
      },
    },
    {
      say: {
        en: 'The portal also speaks Urdu. Click the Urdu button at the top of the menu. The labels change at once, and English brings them back.',
        ur: 'پورٹل اردو میں بھی دستیاب ہے۔ مینو کے اوپر اردو والے بٹن پر کلک کریں۔ لیبل فوراً بدل جاتے ہیں، اور "English" سے واپس انگریزی ہو جاتی ہے۔',
      },
      do: async h => {
        await h.click({ text: 'اردو', exact: true }, { after: 2200 });
        await h.click({ text: 'English', exact: true }, { after: 900 });
      },
    },
    {
      say: {
        en: 'If you are unsure what a screen is for, click Guide for this page at the bottom of the menu.',
        ur: 'اگر سمجھ نہ آئے کہ کوئی اسکرین کس کام کی ہے تو مینو کے نیچے "Guide for this page" پر کلک کریں۔',
      },
      do: async h => {
        await h.click('Guide for this page', { after: 1800 });
        await h.click('Got it', { after: 500 });
      },
    },
    {
      say: {
        en: 'Marking attendance, your payslips and your leave requests are in the phone app, which the next chapter shows. If you do not have a smartphone, ask HR for a printed payslip.',
        ur: 'حاضری لگانا، آپ کی پے سلپس اور چھٹی کی درخواستیں فون ایپ میں ہیں، جو اگلے باب میں دکھائی گئی ہے۔ اگر آپ کے پاس اسمارٹ فون نہیں تو پرنٹ شدہ پے سلپ کے لیے ایچ آر سے کہیں۔',
      },
      do: async h => { await h.point({ text: 'Employee', exact: true }, { hold: 1500 }); },
    },
    {
      say: {
        en: 'When you finish, click Logout, especially on a shared computer.',
        ur: 'کام ختم ہونے پر "Logout" پر کلک کریں، خاص طور پر مشترکہ کمپیوٹر پر۔',
      },
      do: async h => { await h.point('Logout', { hold: 1800 }); },
    },
  ],
};
