// Chapter 26: the OneNet vendor console (edition and licence). Signs in on the normal sign-in page with login
// "onenet" and the daily password OneNet + DDMonYYYY (Pakistan date). The edition is only previewed, never applied,
// and the installation settings are not saved: the other chapters need the full edition.
const today = (() => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric' }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type).value;
  return { day: get('day'), month: get('month').slice(0, 3), year: get('year') };
})();
const PASSWORD = `OneNet${today.day}${today.month}${today.year}`;
const SPOKEN = `${Number(today.day)} ${today.month} ${today.year}`;

const captionTop = h => h.page.evaluate(() => { const c = document.getElementById('tut-cap'); if (c) { c.style.top = '64px'; c.style.bottom = 'auto'; } });
const captionBottom = h => h.page.evaluate(() => { const c = document.getElementById('tut-cap'); if (c) { c.style.top = ''; c.style.bottom = ''; } });

export default {
  id: '26',
  slug: 'Vendor-Console',
  as: 'none',
  start: '/',
  title: { en: 'Vendor console: edition and licence', ur: 'وینڈر کنسول: ایڈیشن اور لائسنس' },
  subtitle: {
    en: 'For OneNet support staff: choose the full or lite edition, manage the licence and allow a data import.',
    ur: 'ون نیٹ سپورٹ عملے کے لیے: فل یا لائٹ ایڈیشن چننا، لائسنس سنبھالنا اور ڈیٹا امپورٹ کی اجازت دینا۔',
  },
  audience: { en: ['OneNet support staff'], ur: ['ون نیٹ سپورٹ عملہ'] },
  intro: {
    en: 'This chapter is for OneNet support staff only. The vendor console sets which edition an installation runs and its licence. It does not open any customer data.',
    ur: 'یہ باب صرف ون نیٹ سپورٹ عملے کے لیے ہے۔ وینڈر کنسول طے کرتا ہے کہ کسی انسٹالیشن میں کون سا ایڈیشن چلے اور اس کا لائسنس کیا ہو۔ اس سے کسٹمر کا کوئی ڈیٹا نہیں کھلتا۔',
  },
  steps: [
    {
      say: {
        en: 'The console opens from the normal sign-in page. In Email or Username, type the vendor login, onenet.',
        ur: 'کنسول عام لاگ ان صفحے سے ہی کھلتا ہے۔ ای میل یا یوزر نیم کے خانے میں وینڈر لاگ ان "onenet" لکھیں۔',
      },
      do: async h => { await h.fill({ placeholder: 'admin@binishaqsoft.com' }, 'onenet', { delay: 90 }); },
    },
    {
      say: {
        en: `The password changes every day. It is OneNet, then today's date in Pakistan: two digits for the day, the first three letters of the month, and the year. Today that is OneNet ${SPOKEN}. Yesterday's and tomorrow's passwords also work, in case a clock is slightly off.`,
        ur: `پاس ورڈ روزانہ بدلتا ہے۔ یہ "OneNet" کے بعد پاکستان کی آج کی تاریخ ہے: دن کے دو ہندسے، مہینے کے پہلے تین انگریزی حروف، اور سال۔ آج یہ "OneNet" ${SPOKEN} ہے۔ گھڑی میں معمولی فرق کی صورت میں کل اور آنے والے کل کا پاس ورڈ بھی چل جاتا ہے۔`,
      },
      caption: {
        en: `The password changes daily: OneNet + today's Pakistan date as DDMonYYYY. Today: ${PASSWORD}. Yesterday's and tomorrow's passwords also work, in case a clock is slightly off.`,
        ur: `پاس ورڈ روزانہ بدلتا ہے: "OneNet" + پاکستان کی آج کی تاریخ DDMonYYYY کی شکل میں۔ آج: ${PASSWORD}۔ گھڑی کے معمولی فرق کے لیے کل اور آنے والے کل کا پاس ورڈ بھی چلتا ہے۔`,
      },
      do: async h => { await h.fill({ css: 'input[type=password]' }, PASSWORD, { delay: 80 }); },
    },
    {
      say: {
        en: 'Click Sign In to System. Instead of the company\'s screens, the OneNet vendor console opens. No user session is created, and the console signs itself out after thirty minutes.',
        ur: '"Sign In to System" پر کلک کریں۔ کمپنی کی اسکرینوں کے بجائے ون نیٹ وینڈر کنسول کھلتا ہے۔ کوئی یوزر سیشن نہیں بنتا، اور کنسول تیس منٹ بعد خود بند ہو جاتا ہے۔',
      },
      do: async h => {
        await h.click('Sign In to System', { after: 2200 });
        await h.visible({ text: 'OneNet vendor console' }, 15000);
        await h.point({ text: /^Session until/ }, { hold: 1300 });
      },
    },
    {
      say: {
        en: 'The first tab chooses the edition. The full compliance edition has FBR tax, EOBI, social security, provident fund, gratuity, bank payroll and maker and checker approvals. The lite edition is for a small business: attendance, leave, salaries and payslips, cash payroll, and one owner who runs it all.',
        ur: 'پہلا ٹیب ایڈیشن چنتا ہے۔ "Full compliance edition" میں ایف بی آر ٹیکس، ای او بی آئی، سوشل سیکیورٹی، پراویڈنٹ فنڈ، گریجویٹی، بینک پے رول اور "maker-checker" منظوریاں ہیں۔ "Lite edition" چھوٹے کاروبار کے لیے ہے: حاضری، چھٹیاں، تنخواہیں اور پے سلپس، نقد پے رول، اور ایک مالک جو سب خود چلاتا ہے۔',
      },
      do: async h => {
        await h.point(page => page.getByRole('button', { name: /Full compliance edition/ }), { hold: 2200 });
        await h.point(page => page.getByRole('button', { name: /Lite edition/ }), { hold: 2200 });
      },
    },
    {
      say: {
        en: 'Clicking a card only previews it. Click Lite, and you see which features would switch off. Below, single features can also be switched on or off, for example keep provident fund in a lite installation.',
        ur: 'کارڈ پر کلک کرنے سے صرف پیش منظر نظر آتا ہے۔ "Lite" پر کلک کریں، اور آپ دیکھتے ہیں کہ کون سی سہولیات بند ہوں گی۔ نیچے ایک ایک سہولت بھی آن یا آف کی جا سکتی ہے، مثلاً لائٹ انسٹالیشن میں پراویڈنٹ فنڈ رکھنا۔',
      },
      do: async h => {
        await h.click(page => page.getByRole('button', { name: /Lite edition/ }), { after: 900 });
        await h.point({ text: /of 15 on$/ }, { hold: 1200 });
        await h.point({ text: 'Statutory deductions', exact: true }, { hold: 1000 });
        await h.point({ text: 'Modules', exact: true }, { hold: 900 });
      },
    },
    {
      say: {
        en: 'Nothing changes until you press Apply at the bottom. Apply an edition only when the customer has asked for it in writing. We switch back to the full edition, so the Apply button stays grey.',
        ur: 'جب تک نیچے "Apply" نہ دبائیں کچھ تبدیل نہیں ہوتا۔ ایڈیشن صرف تب "Apply" کریں جب کسٹمر نے تحریری طور پر کہا ہو۔ ہم واپس "Full" ایڈیشن چنتے ہیں، اس لیے "Apply" کا بٹن گرے رہتا ہے۔',
      },
      do: async h => {
        await captionTop(h);
        await h.point(page => page.getByRole('button', { name: /^Apply / }), { hold: 1300 });
        await captionBottom(h);
        await h.click(page => page.getByRole('button', { name: /Full compliance edition/ }), { after: 900 });
        await captionTop(h);
        await h.point(page => page.getByRole('button', { name: /^Apply / }), { hold: 1300 });
      },
    },
    {
      say: {
        en: 'The second tab is Installation and licence. Client data import lets the customer\'s administrator import an old CyberAP system. Switch it off after go-live.',
        ur: 'دوسرا ٹیب "Installation & licence" ہے۔ "Client data import" کسٹمر کے ایڈمنسٹریٹر کو پرانا سائبر اے پی سسٹم امپورٹ کرنے دیتا ہے۔ لائیو ہونے کے بعد اسے بند کر دیں۔',
      },
      do: async h => {
        await captionBottom(h);
        await h.click(page => page.getByRole('button', { name: /Installation & licence/ }), { after: 1200 });
        await h.point({ text: 'Allow the client\'s administrator to import legacy CyberAP data' }, { hold: 1800 });
      },
    },
    {
      say: {
        en: 'Under Licence you set the plan, the expiry date, the staff limit and the grace days after expiry. When the grace period ends, the installation can suspend itself and show your message. Suspend now does it at once: nobody can sign in, but kiosks keep recording attendance, so no punches are lost.',
        ur: '"Licence" میں پلان، ختم ہونے کی تاریخ، عملے کی حد اور ختم ہونے کے بعد رعایتی دن مقرر کرتے ہیں۔ رعایتی مدت ختم ہونے پر انسٹالیشن خود معطل ہو کر آپ کا پیغام دکھا سکتی ہے۔ "Suspend now" یہ فوراً کر دیتا ہے: کوئی لاگ ان نہیں کر سکتا، لیکن کیوسک حاضری ریکارڈ کرتے رہتے ہیں، اس لیے کوئی پنچ ضائع نہیں ہوتا۔',
      },
      do: async h => {
        await h.point({ text: 'Plan', exact: true }, { hold: 800 });
        await h.point({ text: 'Expires on', exact: true }, { hold: 800 });
        await h.point({ text: 'Active staff limit', exact: true }, { hold: 800 });
        await h.point({ text: 'Grace days after expiry', exact: true }, { hold: 800 });
        await h.point({ text: 'Suspend automatically when the grace period ends' }, { hold: 1000 });
        await h.point('Suspend now', { hold: 1600 });
      },
    },
    {
      say: {
        en: 'Changes here are kept only after Save installation settings. When you are finished, click Exit console and return to sign in. Hosted clients are managed from the OneNet Provider Console instead, which has its own chapter.',
        ur: 'یہاں کی تبدیلیاں "Save installation settings" دبانے کے بعد ہی محفوظ ہوتی ہیں۔ کام ختم ہو تو "Exit console and return to sign in" پر کلک کریں۔ ہوسٹ کیے گئے کلائنٹس کا انتظام اس کے بجائے ون نیٹ "Provider Console" سے ہوتا ہے، جس کا الگ باب ہے۔',
      },
      do: async h => {
        await h.point('Save installation settings', { hold: 1300 });
        await captionTop(h);
        await h.click('Exit console and return to sign in', { after: 1500 });
        await captionBottom(h);
      },
      hold: 900,
    },
  ],
};
