// Chapter 15: Leave Management (types and balances, approving a request, recording a leave, effect on attendance and pay).
// A pending request is (re)created before recording through the API (fixed id), so the approve step works on any database.
const PENDING_ID = 'lv-tutorial-15';

// Searchable employee list: open it, type part of the name, click the match.
async function pickEmployee(h, trigger, search, optionText) {
  await h.click(trigger, { after: 400 });
  await h.fill({ placeholder: 'Type to search…' }, search, { delay: 70 });
  await h.click({ role: 'option', name: optionText }, { after: 500 });
}

export default {
  id: '15',
  slug: 'Leave-Management',
  as: 'admin',
  title: { en: 'Leave Management', ur: 'چھٹیوں کا انتظام' },
  subtitle: {
    en: 'Leave types and balances, approving requests, recording a leave, and what leave does to attendance and salary.',
    ur: 'چھٹیوں کی اقسام اور بیلنس، درخواستوں کی منظوری، چھٹی درج کرنا، اور حاضری و تنخواہ پر اس کا اثر۔',
  },
  audience: { en: ['HR staff', 'Managers'], ur: ['ایچ آر عملہ', 'مینیجرز'] },
  intro: {
    en: 'In this chapter you will approve an employee\'s leave request, record a leave yourself, and see how leave flows into attendance and payroll.',
    ur: 'اس باب میں آپ ایک ملازم کی چھٹی کی درخواست منظور کریں گے، خود ایک چھٹی درج کریں گے، اور دیکھیں گے کہ چھٹی حاضری اور پے رول تک کیسے پہنچتی ہے۔',
  },
  // Usman Tariq's request, as if sent from the phone app: always Pending when the chapter starts.
  open: async (page, { baseUrl }) => {
    await page.goto(baseUrl);
    const token = await page.evaluate(() => localStorage.getItem('hr_auth_token'));
    const today = new Date().toISOString().slice(0, 10);
    await page.request.put(new URL(`api/documents/leaves/${PENDING_ID}`, baseUrl).toString(), {
      headers: { authorization: `Bearer ${token}`, origin: new URL(baseUrl).origin },
      data: { id: PENDING_ID, employeeId: 'emp-e07', leaveType: 'Casual', startDate: '2026-12-03', endDate: '2026-12-04', totalDays: 2, reason: 'Brother\'s nikah in Faisalabad', status: 'Pending', appliedOn: today },
    });
    await page.goto(baseUrl);
  },
  steps: [
    {
      say: {
        en: 'Open Time and Attendance in the menu on the left, then click Leave Management.',
        ur: 'بائیں طرف کے مینو میں "Time & Attendance" کھولیں، پھر "Leave Management" پر کلک کریں۔',
      },
      caption: {
        en: 'Open Time & Attendance in the menu on the left, then click Leave Management.',
        ur: 'بائیں مینو میں "Time & Attendance" کھولیں، پھر "Leave Management" پر کلک کریں۔',
      },
      do: async h => { await h.nav('Time & Attendance', 'Leave Management'); },
    },
    {
      say: {
        en: 'This list shows every leave request: who, which type of leave, the dates, the number of days, the reason, and the decision.',
        ur: 'اس فہرست میں ہر چھٹی کی درخواست نظر آتی ہے: کس کی ہے، کون سی قسم کی چھٹی، تاریخیں، دنوں کی تعداد، وجہ، اور فیصلہ۔',
      },
      do: async h => { await h.point({ css: 'table thead' }, { hold: 2500 }); },
    },
    {
      say: {
        en: 'The leave types are Annual, Casual, Sick, Maternity, Paternity, Hajj and Unpaid. The yearly days for each type, for example fourteen annual and ten casual, are set by the administrator in Statutory Config.',
        ur: 'چھٹیوں کی اقسام یہ ہیں: "Annual"، "Casual"، "Sick"، "Maternity"، "Paternity"، "Hajj" اور "Unpaid"۔ ہر قسم کے سالانہ دن، مثلاً چودہ سالانہ اور دس اتفاقی، ایڈمنسٹریٹر "Statutory Config" میں طے کرتا ہے۔',
      },
      caption: {
        en: 'Leave types: Annual, Casual, Sick, Maternity, Paternity, Hajj, Unpaid. Yearly days per type (e.g. 14 annual, 10 casual) are set in Statutory Config.',
        ur: 'اقسام: Annual، Casual، Sick، Maternity، Paternity، Hajj، Unpaid۔ ہر قسم کے سالانہ دن (مثلاً 14 سالانہ، 10 اتفاقی) "Statutory Config" میں طے ہوتے ہیں۔',
      },
      do: async h => { await h.point(page => page.locator('tbody tr td:nth-child(2)'), { hold: 2500 }); },
    },
    {
      say: {
        en: 'Requests that employees send from the phone app or the self-service portal arrive here as Pending. To see only those, choose Pending in the status filter.',
        ur: 'ملازمین فون ایپ یا سیلف سروس پورٹل سے جو درخواستیں بھیجتے ہیں وہ یہاں "Pending" کے طور پر آتی ہیں۔ صرف وہی دیکھنے کے لیے اسٹیٹس فلٹر میں "Pending" منتخب کریں۔',
      },
      do: async h => { await h.select({ label: 'Filter leave by status' }, 'Pending'); await h.wait(600); },
    },
    {
      say: {
        en: 'Usman Tariq asks for two days of casual leave for his brother\'s nikah. Under the leave type the system shows his balance: how many days of this type he still has this year.',
        ur: 'عثمان طارق نے اپنے بھائی کے نکاح کے لیے دو دن کی اتفاقی چھٹی مانگی ہے۔ چھٹی کی قسم کے نیچے سسٹم اس کا بیلنس دکھاتا ہے: یعنی اس سال اس قسم کے کتنے دن باقی ہیں۔',
      },
      do: async h => {
        const row = page => page.locator('tbody tr', { hasText: 'Brother' });
        await h.point(page => row(page).locator('td').first(), { hold: 900 });
        await h.point(page => row(page).getByText(/day\(s\) left/), { hold: 2200 });
      },
    },
    {
      say: {
        en: 'The balance is enough, so click Approve. If a request asks for more days than are left, the system blocks the approval and asks you to record the extra days as unpaid leave.',
        ur: 'بیلنس کافی ہے، اس لیے "Approve" پر کلک کریں۔ اگر کوئی درخواست باقی دنوں سے زیادہ ہو تو سسٹم منظوری روک دیتا ہے اور کہتا ہے کہ اضافی دن "Unpaid" چھٹی کے طور پر درج کریں۔',
      },
      do: async h => {
        await h.click(page => page.locator('tbody tr', { hasText: 'Brother' }).getByRole('button', { name: 'Approve' }), { after: 1500 });
      },
    },
    {
      say: {
        en: 'If a request cannot be allowed, for example during month-end closing, click Reject instead. The employee sees the decision in the app.',
        ur: 'اگر کوئی درخواست منظور نہیں کی جا سکتی، مثلاً مہینے کے آخر کی کلوزنگ کے دنوں میں، تو اس کی جگہ "Reject" پر کلک کریں۔ ملازم کو فیصلہ ایپ میں نظر آ جاتا ہے۔',
      },
      do: async h => {
        const reject = h.page.getByRole('button', { name: 'Reject' });
        if (await reject.count()) await h.point(() => reject.first(), { hold: 2200 });
        await h.select({ label: 'Filter leave by status' }, 'All statuses');
        await h.point({ text: 'Brother\'s nikah', exact: false }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Sometimes an employee phones in sick and never applies. HR can record such a leave directly with Add Leave Record.',
        ur: 'کبھی کوئی ملازم بیماری کی وجہ سے فون کر دیتا ہے اور درخواست نہیں دیتا۔ ایسی چھٹی ایچ آر خود "Add Leave Record" سے درج کر سکتا ہے۔',
      },
      do: async h => { await h.click('Add Leave Record', { after: 700 }); },
    },
    {
      say: {
        en: 'Choose the employee, Mariam Khan, and set the leave type to Sick Leave.',
        ur: 'ملازم منتخب کریں، مریم خان، اور چھٹی کی قسم "Sick Leave" رکھیں۔',
      },
      do: async h => {
        await pickEmployee(h, { css: 'button[aria-label="Select Employee for Leave"]' }, 'Mariam', 'Mariam Khan');
        await h.select({ css: 'select[aria-label="Leave Type"]' }, 'Sick Leave');
      },
    },
    {
      say: {
        en: 'Enter the start and end date, here the twentieth of November, and write the reason. Then click Approve and Log Leave.',
        ur: 'شروع اور آخری تاریخ لکھیں، یہاں بیس نومبر، اور وجہ لکھیں۔ پھر "Approve & Log Leave" پر کلک کریں۔',
      },
      caption: {
        en: 'Enter the start and end date (here 20-Nov-2026) and the reason, then click Approve & Log Leave.',
        ur: 'شروع اور آخری تاریخ (یہاں 20-Nov-2026) اور وجہ لکھیں، پھر "Approve & Log Leave" پر کلک کریں۔',
      },
      do: async h => {
        await h.fill({ css: 'input[aria-label="Leave Start Date"]' }, '20-Nov-2026'); await h.press('Enter');
        await h.fill({ css: 'input[aria-label="Leave End Date"]' }, '20-Nov-2026'); await h.press('Enter');
        await h.fill({ css: 'textarea[aria-label="Reason / Description"]' }, 'Fever, informed the supervisor by phone in the morning', { delay: 30 });
        await h.click('Approve & Log Leave', { after: 1200 });
      },
    },
    {
      say: {
        en: 'A leave recorded by HR is approved at once and appears in the list.',
        ur: 'ایچ آر کی درج کی ہوئی چھٹی فوراً منظور ہو جاتی ہے اور فہرست میں آ جاتی ہے۔',
      },
      do: async h => {
        await h.fill({ placeholder: 'Search employee, code, leave type, date' }, 'Mariam', { delay: 70 });
        await h.point(page => page.locator('tbody tr', { hasText: 'Mariam Khan' }), { hold: 1800 });
      },
    },
    {
      say: {
        en: 'What does leave change? Every approved day shows as On Leave in the Attendance Register, so it is not counted as absent. Paid leave keeps the full salary. Unpaid leave days are deducted from the salary in the payroll run.',
        ur: 'چھٹی سے کیا فرق پڑتا ہے؟ ہر منظور شدہ دن حاضری رجسٹر میں "On Leave" دکھائی دیتا ہے، اس لیے اسے غیر حاضری نہیں گنا جاتا۔ تنخواہ والی چھٹی میں پوری تنخواہ ملتی ہے۔ "Unpaid" چھٹی کے دن پے رول میں تنخواہ سے کاٹے جاتے ہیں۔',
      },
      do: async h => {
        await h.fill({ placeholder: 'Search employee, code, leave type, date' }, '', { delay: 0 });
        await h.point(page => page.locator('tbody tr', { hasText: 'Unpaid' }).first(), { hold: 2600 });
      },
    },
    {
      say: {
        en: 'To see who is on leave on a day, a week, a month or a year, open Daily, Weekly, Monthly, Yearly Reports and choose the register you need.',
        ur: 'کسی دن، ہفتے، مہینے یا سال میں کون چھٹی پر ہے، یہ دیکھنے کے لیے "Daily / Weekly / Monthly / Yearly Reports" کھولیں اور اپنی ضرورت کا رجسٹر منتخب کریں۔',
      },
      caption: {
        en: 'To see who is on leave on a day, week, month or year, open Daily / Weekly / Monthly / Yearly Reports.',
        ur: 'دن، ہفتے، مہینے یا سال کی چھٹیاں دیکھنے کے لیے "Daily / Weekly / Monthly / Yearly Reports" کھولیں۔',
      },
      do: async h => {
        await h.click({ role: 'button', name: 'Daily / Weekly / Monthly / Yearly Reports' }, { after: 700 });
        await h.click({ role: 'button', name: 'monthly register' }, { after: 1200 });
        await h.point({ role: 'button', name: 'monthly register' }, { hold: 1200 });
      },
    },
    {
      say: {
        en: 'That is leave management: approve or reject what employees send, record leave yourself when needed, and payroll picks it up automatically.',
        ur: 'یہ تھا چھٹیوں کا انتظام: ملازمین کی بھیجی ہوئی درخواستیں منظور یا مسترد کریں، ضرورت ہو تو خود چھٹی درج کریں، اور پے رول اسے خود بخود شامل کر لیتا ہے۔',
      },
      do: async h => { await h.click({ role: 'button', name: 'Leave Applications List' }, { after: 600 }); },
    },
  ],
};
