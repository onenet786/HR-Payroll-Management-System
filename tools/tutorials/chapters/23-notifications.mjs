// Chapter 23: the bell and the Notification Center; sends one broadcast (a medical camp notice in English and Urdu).
// A --dry check does not send a second copy when one from an earlier check already exists.
const DRY = process.argv.includes('--dry');
const TITLE = 'Free medical camp on 27 November';

const captionTop = h => h.page.evaluate(() => { const c = document.getElementById('tut-cap'); if (c) { c.style.top = '64px'; c.style.bottom = 'auto'; } });
const captionBottom = h => h.page.evaluate(() => { const c = document.getElementById('tut-cap'); if (c) { c.style.top = ''; c.style.bottom = ''; } });
const notice = page => page.locator('main div.group').filter({ has: page.getByText(TITLE, { exact: true }) }).filter({ hasText: 'Broadcast' }).last();

export default {
  id: '23',
  slug: 'Notifications-Center',
  as: 'admin',
  start: '/',
  title: { en: 'Notifications Center', ur: 'اطلاعات کا مرکز' },
  subtitle: {
    en: 'The bell, the Notification Center, and sending an announcement to every employee in English and Urdu.',
    ur: 'گھنٹی، اطلاعات کا مرکز، اور ہر ملازم کو انگریزی اور اردو میں اعلان بھیجنا۔',
  },
  audience: { en: ['HR staff', 'Managers'], ur: ['ایچ آر عملہ', 'مینیجرز'] },
  intro: {
    en: 'The system tells people about approvals, salaries and holidays through notifications. In this chapter you will read them, filter them and send an announcement of your own.',
    ur: 'سسٹم منظوریوں، تنخواہوں اور تعطیلات کی خبر اطلاعات کے ذریعے دیتا ہے۔ اس باب میں آپ انہیں پڑھنا، فلٹر کرنا اور اپنا اعلان بھیجنا سیکھیں گے۔',
  },
  steps: [
    {
      say: {
        en: 'The bell at the top right shows how many notifications are waiting for you. Click it to open the Notification Center. You can also open it from Setup and Administration.',
        ur: 'اوپر دائیں طرف گھنٹی بتاتی ہے کہ کتنی اطلاعات آپ کی منتظر ہیں۔ اطلاعات کا مرکز کھولنے کے لیے اس پر کلک کریں۔ آپ اسے "Setup & Administration" سے بھی کھول سکتے ہیں۔',
      },
      do: async h => {
        await h.point({ css: '.bell-btn' }, { hold: 1500 });
        await h.click({ css: '.bell-btn' }, { after: 1000 });
      },
    },
    {
      say: {
        en: 'The cards count all notifications, the unread ones, the high-priority ones and the broadcasts, which go to everyone. Unread notices have a green edge and a green dot.',
        ur: 'کارڈز میں کل اطلاعات، نہ پڑھی گئی، اہم ترجیح والی اور "Broadcast" یعنی سب کو بھیجی گئی اطلاعات کی تعداد ہے۔ نہ پڑھی گئی اطلاع کے کنارے پر سبز لکیر اور سبز نقطہ ہوتا ہے۔',
      },
      do: async h => {
        await h.point({ text: 'Total', exact: true }, { hold: 900 });
        await h.point({ text: 'Unread', exact: true }, { hold: 900 });
        await h.point({ text: 'High Priority', exact: true }, { hold: 900 });
        await h.point({ text: 'Broadcasts', exact: true }, { hold: 900 });
      },
    },
    {
      say: {
        en: 'Use the filters to find something quickly: by type, such as Holiday, by priority, or only the unread ones. Click All Types to see everything again.',
        ur: 'کوئی چیز جلدی ڈھونڈنے کے لیے فلٹر استعمال کریں: قسم کے لحاظ سے، جیسے "Holiday"، ترجیح کے لحاظ سے، یا صرف نہ پڑھی گئی۔ سب کچھ دوبارہ دیکھنے کے لیے "All Types" پر کلک کریں۔',
      },
      do: async h => {
        await h.click(page => page.getByRole('button', { name: /Holiday$/ }), { after: 900 });
        await h.point(page => page.getByRole('button', { name: /^high$/i }), { hold: 800 });
        await h.point({ text: 'Unread only' }, { hold: 800 });
        await h.click('All Types', { after: 700 });
      },
    },
    {
      say: {
        en: 'Now let us tell all staff about a medical camp. Click Send Notification. Keep the type System and the priority Medium. Leave Target on All Employees for a broadcast, or pick one employee to send a personal notice.',
        ur: 'اب تمام عملے کو ایک میڈیکل کیمپ کی خبر دیتے ہیں۔ "Send Notification" پر کلک کریں۔ قسم "System" اور ترجیح "Medium" رہنے دیں۔ سب کو بھیجنے کے لیے "Target" میں "All Employees" رہنے دیں، یا ذاتی اطلاع کے لیے کوئی ایک ملازم چنیں۔',
      },
      do: async h => {
        await h.click('Send Notification', { after: 800 });
        await h.select({ css: '#notif-type' }, { value: 'system' });
        await h.click(page => page.locator('div.fixed').filter({ hasText: 'Send Notification' }).getByRole('button', { name: /^medium$/i }), { after: 400 });
        await h.click({ css: '#notif-target' }, { after: 900 });
        await h.press('Escape');
      },
    },
    {
      say: {
        en: 'Type a short title and the message: when, where and for whom.',
        ur: 'ایک مختصر عنوان اور پیغام لکھیں: کب، کہاں اور کس کے لیے۔',
      },
      do: async h => {
        await h.fill({ placeholder: 'Notification title...' }, TITLE, { delay: 35 });
        await h.fill({ placeholder: 'Notification message...' }, 'Free blood pressure, sugar and eye tests in the staff canteen from 10 am to 2 pm. All staff and their families are welcome.', { delay: 18 });
      },
    },
    {
      say: {
        en: 'Add an Urdu copy too, so staff who prefer Urdu can read it in their own language. Then click Send.',
        ur: 'اردو ترجمہ بھی شامل کریں، تاکہ جو عملہ اردو پسند کرتا ہے وہ اپنی زبان میں پڑھ سکے۔ پھر "Send" پر کلک کریں۔',
      },
      do: async h => {
        await captionTop(h);
        await h.fill({ placeholder: 'اطلاع کا عنوان' }, '27 نومبر کو مفت میڈیکل کیمپ', { delay: 40 });
        await h.fill({ placeholder: 'اطلاع کا پیغام' }, 'اسٹاف کینٹین میں صبح 10 سے دوپہر 2 بجے تک بلڈ پریشر، شوگر اور آنکھوں کا مفت معائنہ۔ تمام عملہ اور ان کے اہلِ خانہ مدعو ہیں۔', { delay: 14 });
        const exists = await notice(h.page).count().catch(() => 0);
        if (DRY && exists) { await h.point('Send', { hold: 700 }); await h.click('Cancel', { after: 800 }); }
        else await h.click(page => page.getByRole('button', { name: 'Send', exact: true }), { after: 1200 });
      },
    },
    {
      say: {
        en: 'The announcement is at the top of the list, marked Broadcast, with the Urdu copy below it. Every employee now sees it under their bell, in web self-service and in the phone app.',
        ur: 'اعلان فہرست میں سب سے اوپر ہے، اس پر "Broadcast" لکھا ہے اور نیچے اردو ترجمہ ہے۔ اب ہر ملازم اسے اپنی گھنٹی میں، ویب سیلف سروس میں اور فون ایپ میں دیکھتا ہے۔',
      },
      do: async h => {
        await captionBottom(h);
        const card = notice(h.page);
        await card.scrollIntoViewIfNeeded().catch(() => undefined);
        await h.point(() => card, { hold: 1500 });
        await h.point(() => card.getByText('Broadcast', { exact: true }), { hold: 1000 });
        await h.point({ css: '.bell-btn' }, { hold: 1000 });
      },
    },
    {
      say: {
        en: 'Click a notice, or Mark read, once you have dealt with it, and the bell count goes down. Mark All Read clears everything at once. The bin icon that appears on the right deletes a notice.',
        ur: 'جس اطلاع پر کام ہو جائے اس پر کلک کریں یا "Mark read" دبائیں، گھنٹی کی گنتی کم ہو جائے گی۔ "Mark All Read" سب کو ایک ساتھ پڑھا ہوا کر دیتا ہے۔ دائیں طرف آنے والا کوڑے دان کا نشان اطلاع کو حذف کرتا ہے۔',
      },
      do: async h => {
        const card = notice(h.page);
        const markRead = card.getByRole('button', { name: 'Mark read' });
        if (await markRead.count()) await h.click(() => markRead, { after: 900 });
        await h.point({ css: '.bell-btn' }, { hold: 900 });
        if (await h.page.getByRole('button', { name: 'Mark All Read' }).count()) await h.point('Mark All Read', { hold: 900 });
        await card.hover().catch(() => undefined);
        await h.point(() => card.getByRole('button', { name: 'Delete notification' }), { hold: 1100 });
      },
    },
    {
      say: {
        en: 'Most notifications are created by the system itself: when leave or a loan is approved or rejected, when salaries are paid, when an asset is handed over, when a review is due, and before public holidays.',
        ur: 'زیادہ تر اطلاعات سسٹم خود بناتا ہے: جب چھٹی یا قرض منظور یا مسترد ہو، جب تنخواہیں ادا ہوں، جب کوئی اثاثہ حوالے کیا جائے، جب کارکردگی کا جائزہ ہونا ہو، اور سرکاری تعطیلات سے پہلے۔',
      },
      do: async h => {
        await h.point(page => page.getByRole('button', { name: /Leave Approved$/ }), { hold: 900 });
        await h.point(page => page.getByRole('button', { name: /Loan Approved$/ }), { hold: 800 });
        await h.point(page => page.getByRole('button', { name: /💰/ }), { hold: 800 });
        await h.point(page => page.getByRole('button', { name: /Review Due$/ }), { hold: 800 });
      },
      hold: 900,
    },
  ],
};
