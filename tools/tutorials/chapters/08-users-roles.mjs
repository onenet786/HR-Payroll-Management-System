// Chapter 08: Users, Roles & Permissions.
// Creates three demo logins (kept for later chapters):
//   payroll.officer@aljannatmall.local  / Payroll-Officer-2026   Payroll Specialist, linked to Fatima Noor
//   finance.manager@aljannatmall.local  / Finance-Manager-2026   Payroll Specialist, linked to Imran Qureshi
//   kiosk.groundfloor@aljannatmall.local / Kiosk-Ground-2026     Kiosk Terminal (suspended and reactivated on screen)
// The admin account (hradmin) is never touched.

// Searchable list (role, linked employee): open it, optionally type to narrow it, click the option.
async function pick(h, trigger, optionText, search) {
  await h.click(trigger, { after: 350 });
  if (search) await h.fill({ placeholder: 'Type to search…' }, search, { delay: 70 });
  await h.click({ role: 'option', name: optionText, exact: true }, { after: 450 });
}

// Fills the "Onboard System User" form (the role and the link are separate steps so they can be explained).
async function typeAccount(h, username, email, password) {
  await h.scrollTo({ text: 'Onboard System User' });
  await h.fill({ css: '#username' }, username);
  await h.fill({ css: '#email' }, email, { delay: 30 });
  await h.fill({ css: '#password' }, password, { delay: 40 });
}

const userRow = name => page => page.locator('tbody tr', { hasText: name });
const usersTable = page => page.locator('table', { hasText: 'Username / Email' });
const rolesTable = page => page.locator('table', { hasText: 'Use kiosk' });

// Scrolls a section to the top of the screen, clear of the caption bar.
async function toTop(h, target) {
  const loc = await h.resolve(target);
  await loc.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await h.wait(700);
  await h.scroll(-90, { steps: 4 });
}

export default {
  id: '08',
  slug: 'Users-Roles-Permissions',
  as: 'admin',
  title: { en: 'Users, Roles & Permissions', ur: 'صارفین، کردار اور اجازتیں' },
  subtitle: {
    en: 'Give each member of staff their own login with the right role, set up a kiosk account, and suspend access when needed.',
    ur: 'ہر ملازم کو درست کردار کے ساتھ اپنا لاگ ان دیں، کیوسک کا اکاؤنٹ بنائیں، اور ضرورت پڑنے پر رسائی معطل کریں۔',
  },
  audience: { en: ['Administrators'], ur: ['ایڈمنسٹریٹر'] },
  intro: {
    en: 'Everyone who uses the system should have their own login. In this chapter you will see what roles and permissions mean, create logins for two payroll staff and a kiosk, and suspend an account.',
    ur: 'سسٹم استعمال کرنے والے ہر شخص کا اپنا لاگ ان ہونا چاہیے۔ اس باب میں آپ دیکھیں گے کہ کردار اور اجازتوں کا کیا مطلب ہے، دو پے رول ملازمین اور ایک کیوسک کے لاگ ان بنائیں گے، اور ایک اکاؤنٹ معطل کریں گے۔',
  },
  steps: [
    {
      say: {
        en: 'Open Setup and Administration in the menu on the left, then click Users, Roles and Permissions.',
        ur: 'بائیں طرف کے مینو میں "Setup & Administration" کھولیں، پھر "Users, Roles & Permissions" پر کلک کریں۔',
      },
      caption: {
        en: 'Open Setup & Administration in the menu on the left, then click Users, Roles & Permissions.',
        ur: 'بائیں مینو میں "Setup & Administration" کھولیں، پھر "Users, Roles & Permissions" پر کلک کریں۔',
      },
      do: async h => { await h.nav('Setup & Administration', 'Users, Roles & Permissions'); },
    },
    {
      say: {
        en: 'A role is a job profile, such as HR Manager or Payroll Specialist. In this table each row is a role and each column is something the system can do. A tick means everyone with that role may do it.',
        ur: 'کردار یعنی "Role" ایک عہدے کا خاکہ ہے، جیسے "HR Manager" یا "Payroll Specialist"۔ اس جدول میں ہر قطار ایک کردار ہے اور ہر کالم ایک کام۔ ٹِک کا مطلب ہے کہ اس کردار والا ہر شخص یہ کام کر سکتا ہے۔',
      },
      do: async h => {
        await toTop(h, { text: 'Roles & permissions' });
        await h.point(page => rolesTable(page).locator('thead'), { hold: 2600 });
      },
    },
    {
      say: {
        en: 'Super Admin always has full access. Employee is for staff who only see their own attendance, leave and payslips on the phone. These rows are marked fixed and cannot be changed.',
        ur: '"Super Admin" کے پاس ہمیشہ مکمل رسائی ہوتی ہے۔ "Employee" ان ملازمین کے لیے ہے جو فون پر صرف اپنی حاضری، چھٹیاں اور تنخواہ کی پرچی دیکھتے ہیں۔ ان قطاروں پر "fixed" لکھا ہے، یعنی انہیں بدلا نہیں جا سکتا۔',
      },
      do: async h => {
        await h.point(page => rolesTable(page).locator('tbody tr', { hasText: 'Super Admin' }), { hold: 2200 });
        await h.point(page => rolesTable(page).locator('tbody tr', { hasText: /^\s*Employee/ }), { hold: 1800 });
      },
    },
    {
      say: {
        en: 'Kiosk Terminal is only for the attendance kiosk PCs: it can record punches and nothing else. Payroll Specialist can open payroll but not employee records or settings.',
        ur: '"Kiosk Terminal" صرف حاضری والے کیوسک کمپیوٹرز کے لیے ہے: یہ صرف حاضری درج کر سکتا ہے، اور کچھ نہیں۔ "Payroll Specialist" پے رول کھول سکتا ہے، لیکن ملازمین کا ریکارڈ یا سیٹنگز نہیں۔',
      },
      do: async h => {
        await h.point(page => rolesTable(page).locator('tbody tr', { hasText: 'Kiosk Terminal' }), { hold: 2400 });
        await h.point(page => rolesTable(page).locator('tbody tr', { hasText: 'Payroll Specialist' }), { hold: 2400 });
      },
    },
    {
      say: {
        en: 'Give each person the smallest role that lets them do their job. If you change a tick here, it applies to everyone with that role the next time they open a page.',
        ur: 'ہر شخص کو وہ سب سے محدود کردار دیں جس سے اس کا کام ہو جائے۔ اگر آپ یہاں کوئی ٹِک بدلیں تو یہ اس کردار والے ہر شخص پر اگلی بار صفحہ کھولنے پر لاگو ہو جاتا ہے۔',
      },
      do: async h => { await h.point({ text: 'Tick what each role can do.' }, { hold: 2500 }); },
    },
    {
      say: {
        en: 'Now let us give Fatima Noor, our accountant, her own login. In Onboard System User, type a username, her work email, and a starting password of at least twelve characters.',
        ur: 'اب ہماری اکاؤنٹنٹ فاطمہ نور کا اپنا لاگ ان بناتے ہیں۔ "Onboard System User" میں یوزر نیم، ان کا دفتری ای میل، اور کم از کم بارہ حروف کا ابتدائی پاس ورڈ لکھیں۔',
      },
      do: async h => { await typeAccount(h, 'payroll.officer', 'payroll.officer@aljannatmall.local', 'Payroll-Officer-2026'); },
    },
    {
      say: {
        en: 'In Assign Initial Role choose Payroll Specialist. In Link Employee choose Fatima Noor, so that she can also use the phone app with this same login.',
        ur: '"Assign Initial Role" میں "Payroll Specialist" منتخب کریں۔ "Link Employee" میں فاطمہ نور کو منتخب کریں، تاکہ وہ اسی لاگ ان سے فون ایپ بھی استعمال کر سکیں۔',
      },
      do: async h => {
        await pick(h, { css: '#roleId' }, 'Payroll Specialist');
        await pick(h, { css: '#employeeId' }, 'Fatima Noor (AJM-FA-00002)', 'Fatima');
      },
    },
    {
      say: {
        en: 'Click Create Account. The new login appears in the user list with its role and the linked employee. Give the password to Fatima in person; she should change it after her first sign-in.',
        ur: '"Create Account" پر کلک کریں۔ نیا لاگ ان اپنے کردار اور منسلک ملازم کے ساتھ صارفین کی فہرست میں آ جاتا ہے۔ پاس ورڈ فاطمہ کو خود جا کر دیں؛ وہ پہلی بار لاگ ان کے بعد اسے بدل لیں۔',
      },
      do: async h => {
        await h.click('Create Account', { after: 1500 });
        await h.scrollTo(userRow('payroll.officer'));
        await h.point(userRow('payroll.officer'), { hold: 2200 });
      },
    },
    {
      say: {
        en: 'Why more than one payroll user? Salaries are protected by three separate people: one prepares the payroll, a second approves it, and a third marks it paid. The system will not let one person do all three, so a single mistake or fraud cannot go through alone.',
        ur: 'ایک سے زیادہ پے رول صارف کیوں؟ تنخواہوں کی حفاظت تین الگ افراد کرتے ہیں: ایک پے رول تیار کرتا ہے، دوسرا منظور کرتا ہے، اور تیسرا ادائیگی درج کرتا ہے۔ سسٹم ایک ہی شخص کو تینوں کام نہیں کرنے دیتا، تاکہ کوئی ایک غلطی یا دھوکہ اکیلے آگے نہ جا سکے۔',
      },
      do: async h => {
        await h.point(page => usersTable(page).locator('tbody tr', { hasText: 'hradmin@' }), { hold: 1800 });
        await h.point(userRow('payroll.officer'), { hold: 1800 });
      },
    },
    {
      say: {
        en: 'So we add a second payroll user for Imran Qureshi, the finance manager, in the same way: username, email, password, the Payroll Specialist role, and his employee record.',
        ur: 'اس لیے ہم اسی طرح فنانس مینیجر عمران قریشی کے لیے دوسرا پے رول صارف بناتے ہیں: یوزر نیم، ای میل، پاس ورڈ، "Payroll Specialist" کا کردار، اور ان کا ملازمتی ریکارڈ۔',
      },
      do: async h => {
        await typeAccount(h, 'finance.manager', 'finance.manager@aljannatmall.local', 'Finance-Manager-2026');
        await pick(h, { css: '#roleId' }, 'Payroll Specialist');
        await pick(h, { css: '#employeeId' }, 'Imran Qureshi (AJM-FA-00001)', 'Imran');
        await h.click('Create Account', { after: 1300 });
      },
    },
    {
      say: {
        en: 'Each attendance kiosk needs its own account too. Name it after its place, for example kiosk dot ground floor, choose the Kiosk Terminal role, and leave Link Employee empty. A kiosk is a machine, not a person.',
        ur: 'ہر حاضری کیوسک کا بھی اپنا اکاؤنٹ ہونا چاہیے۔ اس کا نام اس کی جگہ کے مطابق رکھیں، مثلاً kiosk.groundfloor، کردار "Kiosk Terminal" منتخب کریں، اور "Link Employee" خالی چھوڑ دیں۔ کیوسک ایک مشین ہے، کوئی شخص نہیں۔',
      },
      caption: {
        en: 'Each kiosk needs its own account: name it after its place (e.g. kiosk.groundfloor), choose Kiosk Terminal, leave Link Employee empty.',
        ur: 'ہر کیوسک کا اپنا اکاؤنٹ: نام جگہ کے مطابق (مثلاً kiosk.groundfloor)، کردار "Kiosk Terminal"، اور "Link Employee" خالی۔',
      },
      do: async h => {
        await typeAccount(h, 'kiosk.groundfloor', 'kiosk.groundfloor@aljannatmall.local', 'Kiosk-Ground-2026');
        await pick(h, { css: '#roleId' }, 'Kiosk Terminal');
      },
    },
    {
      say: {
        en: 'Click Create Account. On the kiosk PC you then sign in once with this account under Server Registration; the kiosk chapter shows how.',
        ur: '"Create Account" پر کلک کریں۔ پھر کیوسک والے کمپیوٹر پر "Server Registration" میں ایک بار اسی اکاؤنٹ سے لاگ ان کریں؛ یہ طریقہ کیوسک والے باب میں دکھایا گیا ہے۔',
      },
      do: async h => {
        await h.click('Create Account', { after: 1500 });
        await h.scrollTo(userRow('kiosk.groundfloor'));
        await h.point(userRow('kiosk.groundfloor'), { hold: 1800 });
      },
    },
    {
      say: {
        en: 'To stop someone from signing in, for example when a staff member leaves or a kiosk PC is replaced, click Edit on their row and set Account Status to Inactive.',
        ur: 'کسی کو لاگ ان سے روکنے کے لیے، مثلاً جب کوئی ملازم نوکری چھوڑ دے یا کیوسک کمپیوٹر بدلا جائے، اس کی قطار میں "Edit" پر کلک کریں اور "Account Status" کو "Inactive" کر دیں۔',
      },
      do: async h => {
        await h.click(page => userRow('kiosk.groundfloor')(page).getByRole('button', { name: 'Edit' }), { after: 700 });
        await h.select({ css: '[aria-labelledby="edit-user-title"] select' }, 'Inactive');
      },
    },
    {
      say: {
        en: 'Click Save User. The account now shows Inactive: it cannot sign in, but all its history stays. To give access back, edit it again and choose Active.',
        ur: '"Save User" پر کلک کریں۔ اب اکاؤنٹ "Inactive" دکھاتا ہے: یہ لاگ ان نہیں کر سکتا، لیکن اس کا سارا ریکارڈ محفوظ رہتا ہے۔ رسائی واپس دینے کے لیے دوبارہ "Edit" کریں اور "Active" منتخب کریں۔',
      },
      do: async h => {
        await h.click('Save User', { after: 1200 });
        await h.point(page => userRow('kiosk.groundfloor')(page).locator('td').nth(3), { hold: 1800 });
        await h.click(page => userRow('kiosk.groundfloor')(page).getByRole('button', { name: 'Edit' }), { after: 600 });
        await h.select({ css: '[aria-labelledby="edit-user-title"] select' }, 'Active');
        await h.click('Save User', { after: 1000 });
      },
    },
    {
      say: {
        en: 'Delete data removes the account and its personal data for good, so use it only when the law or the person asks for that. For everyday cases, Inactive is the safe choice.',
        ur: '"Delete data" اکاؤنٹ اور اس کا ذاتی ڈیٹا ہمیشہ کے لیے ختم کر دیتا ہے، اس لیے اسے صرف تب استعمال کریں جب قانون یا وہ شخص خود یہ مانگے۔ روزمرہ کے لیے "Inactive" ہی محفوظ طریقہ ہے۔',
      },
      do: async h => { await h.point(page => userRow('kiosk.groundfloor')(page).getByRole('button', { name: 'Delete data' }), { hold: 2600 }); },
    },
    {
      say: {
        en: 'If none of the standard roles fits, for example an auditor or a branch supervisor, create your own in Create Custom Role: give it a name, tick only what it needs, and click Create Custom Role.',
        ur: 'اگر کوئی معیاری کردار مناسب نہ ہو، مثلاً آڈیٹر یا برانچ سپروائزر کے لیے، تو "Create Custom Role" میں اپنا کردار بنائیں: اس کا نام لکھیں، صرف ضروری کاموں پر ٹِک لگائیں، اور "Create Custom Role" پر کلک کریں۔',
      },
      do: async h => {
        await toTop(h, { text: 'Create Custom Role', exact: true });
        await h.point(page => page.locator('div.bg-white:has(> h3:text-is("Create Custom Role"))'), { hold: 3000 });
      },
    },
  ],
};
