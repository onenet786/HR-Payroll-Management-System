// Chapter 16: Biometric Devices & Kiosks (what a kiosk is, enrolling fingerprint and face, kiosk terminals, setup codes,
// disconnecting a lost kiosk). The demo PC has no fingerprint reader or camera: the enrolment screens are shown and
// explained, and the steps stop where the hardware is needed. HID Diagnostic / Simulate are test tools and are not used.
//
// Before recording, two kiosk terminals are registered through the API with one-time setup codes (exactly what the
// kiosk app does with a pasted code), so the Kiosk terminals list has real entries on a fresh database.

// The browser's own confirm() box is not captured by the recording: show a look-alike first, then answer the real one.
async function showDialog(h, message, button = 'OK') {
  await h.page.evaluate(([msg, btn]) => {
    const box = document.createElement('div');
    box.id = 'tut-fake-dialog';
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.18);display:flex;justify-content:center;align-items:flex-start;padding-top:18px;font-family:Segoe UI,system-ui,sans-serif';
    box.innerHTML = `<div style="width:460px;background:#fff;border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,.35);padding:20px 22px 16px;color:#1f2937">
      <div style="font-size:14px;font-weight:600;margin-bottom:10px">localhost:8090 says</div>
      <div style="font-size:13px;line-height:1.45;margin-bottom:18px">${msg}</div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button id="tut-fake-ok" style="background:#0f6cbd;color:#fff;border:0;border-radius:4px;padding:6px 22px;font-size:13px">${btn}</button>
        <button style="background:#fff;color:#1f2937;border:1px solid #d1d5db;border-radius:4px;padding:6px 16px;font-size:13px">Cancel</button>
      </div></div>`;
    document.body.appendChild(box);
  }, [message, button]);
  await h.wait(1600);
  const { box } = await h.point({ css: '#tut-fake-ok' }, { hold: 600, scroll: false });
  if (box) await h.page.evaluate(([x, y]) => window.__tut && window.__tut.ripple(x, y), [box.x + box.width / 2, box.y + box.height / 2]);
  await h.wait(350);
}
const hideDialog = async h => { await h.page.evaluate(() => document.getElementById('tut-fake-dialog')?.remove()); await h.highlightOff(); };

async function registerKiosk(page, baseUrl, token, name) {
  const origin = new URL(baseUrl).origin;
  const created = await page.request.post(new URL('api/kiosk-devices/setup-codes', baseUrl).toString(), {
    headers: { authorization: `Bearer ${token}`, origin }, data: { label: name, expiresInHours: 24, maxUses: 1 },
  });
  const { code } = await created.json();
  const setupToken = JSON.parse(Buffer.from(String(code).split('.')[1], 'base64url').toString('utf8')).t;
  const reg = await page.request.post(new URL('api/kiosk/register', baseUrl).toString(), { headers: { origin }, data: { setupToken, terminalName: name } });
  const { deviceToken } = await reg.json();
  // First sync, as the kiosk does right after registration (sets "Last sync").
  await page.request.get(new URL('api/kiosk/sync/employees', baseUrl).toString(), { headers: { 'x-kiosk-token': deviceToken, origin } });
}

export default {
  id: '16',
  slug: 'Biometric-Devices-and-Kiosks',
  as: 'admin',
  title: { en: 'Biometric Devices & Kiosks', ur: 'بایومیٹرک آلات اور کیوسک' },
  subtitle: {
    en: 'Enrol fingerprints and faces, see the kiosk terminals, register a new kiosk and disconnect a lost one.',
    ur: 'فنگر پرنٹ اور چہرہ درج کریں، کیوسک ٹرمینل دیکھیں، نیا کیوسک رجسٹر کریں اور گم شدہ کیوسک منقطع کریں۔',
  },
  audience: { en: ['HR staff', 'IT staff'], ur: ['ایچ آر عملہ', 'آئی ٹی عملہ'] },
  intro: {
    en: 'Employees mark attendance at a kiosk with a fingerprint or their face. In this chapter you will see how employees are enrolled and how kiosk terminals are connected to the system.',
    ur: 'ملازمین کیوسک پر فنگر پرنٹ یا چہرے سے حاضری لگاتے ہیں۔ اس باب میں آپ دیکھیں گے کہ ملازمین کا بایومیٹرک اندراج کیسے ہوتا ہے اور کیوسک ٹرمینل سسٹم سے کیسے جوڑے جاتے ہیں۔',
  },
  open: async (page, { baseUrl }) => {
    await page.goto(baseUrl);
    const token = await page.evaluate(() => localStorage.getItem('hr_auth_token'));
    await registerKiosk(page, baseUrl, token, 'Main Gate Kiosk');
    await registerKiosk(page, baseUrl, token, 'Warehouse Kiosk');
    await page.goto(baseUrl);
  },
  steps: [
    {
      say: {
        en: 'A kiosk is a Windows computer or an Android tablet at the entrance, with a fingerprint reader or a camera. Employees punch in and out there, and the punches arrive here automatically.',
        ur: 'کیوسک داخلی دروازے پر رکھا ہوا ایک ونڈوز کمپیوٹر یا اینڈرائیڈ ٹیبلٹ ہوتا ہے، جس کے ساتھ فنگر پرنٹ ریڈر یا کیمرہ لگا ہوتا ہے۔ ملازمین وہاں آنے اور جانے کی حاضری لگاتے ہیں، اور یہ حاضری خود بخود یہاں پہنچ جاتی ہے۔',
      },
      do: async h => { await h.nav('Time & Attendance', 'Biometric Devices & Kiosks'); },
    },
    {
      say: {
        en: 'Before that, each employee must be enrolled once. This screen is used at the HR desk, on a computer with a USB fingerprint reader.',
        ur: 'اس سے پہلے ہر ملازم کا ایک بار اندراج ضروری ہے۔ یہ اسکرین ایچ آر ڈیسک پر ایسے کمپیوٹر پر استعمال ہوتی ہے جس کے ساتھ یو ایس بی فنگر پرنٹ ریڈر لگا ہو۔',
      },
      do: async h => { await h.point({ text: 'Biometric Fingerprint Devices' }, { hold: 2200 }); },
    },
    {
      say: {
        en: 'The reader talks to the system through a small bridge program installed on that computer. Click Connect Bridge to connect. This demo computer has no reader, so the status never turns to Connected.',
        ur: 'ریڈر اس کمپیوٹر پر انسٹال ایک چھوٹے "bridge" پروگرام کے ذریعے سسٹم سے بات کرتا ہے۔ جوڑنے کے لیے "Connect Bridge" پر کلک کریں۔ اس ڈیمو کمپیوٹر کے ساتھ ریڈر نہیں ہے، اس لیے اسٹیٹس کبھی "Connected" نہیں ہوتا۔',
      },
      do: async h => {
        await h.point('Connect Bridge', { hold: 1600 });
        // The page keeps retrying, so the status reads Connecting… or Disconnected depending on the moment.
        await h.point(page => page.getByText(/^(Connecting…|Connecting\.\.\.|Disconnected)$/).first(), { hold: 1600 });
      },
    },
    {
      say: {
        en: 'Open the Enroll Biometrics tab and choose the employee. You can type part of the name, the code or the CNIC to find them quickly.',
        ur: '"Enroll Biometrics" والا ٹیب کھولیں اور ملازم منتخب کریں۔ جلدی تلاش کرنے کے لیے نام، کوڈ یا شناختی کارڈ نمبر کا کچھ حصہ لکھ سکتے ہیں۔',
      },
      do: async h => {
        await h.click({ role: 'button', name: 'Enroll Biometrics' }, { after: 700 });
        await h.fill({ placeholder: 'Type a name, code or CNIC to narrow the list' }, 'Usman', { delay: 80 });
        await h.select(page => page.locator('select').filter({ hasText: 'Usman Tariq' }), 'Usman Tariq — AJM-SM-00002');
      },
    },
    {
      say: {
        en: 'For a fingerprint, the employee places the same finger on the reader three times, and you click Scan Sample each time. After the third sample the fingerprint is saved under the employee record.',
        ur: 'فنگر پرنٹ کے لیے ملازم ایک ہی انگلی تین بار ریڈر پر رکھتا ہے، اور آپ ہر بار "Scan Sample" پر کلک کرتے ہیں۔ تیسرے نمونے کے بعد فنگر پرنٹ ملازم کے ریکارڈ میں محفوظ ہو جاتا ہے۔',
      },
      do: async h => {
        await h.scrollTo({ text: 'Samples captured' });
        await h.point({ text: 'Samples captured' }, { hold: 1200 });
        await h.point({ role: 'button', name: /Scan Sample/ }, { hold: 1800 });
      },
    },
    {
      say: {
        en: 'Here the button is grey because no reader is connected. On the HR computer with the reader plugged in, it becomes active.',
        ur: 'یہاں یہ بٹن مدھم ہے کیونکہ کوئی ریڈر جڑا ہوا نہیں۔ ایچ آر کے کمپیوٹر پر ریڈر لگا ہو تو یہ فعال ہو جاتا ہے۔',
      },
      do: async h => { await h.point({ role: 'button', name: /Scan Sample/ }, { hold: 2000 }); },
    },
    {
      say: {
        en: 'On the right, the Biometric Employees list shows who already has fingerprints or a face saved, and who is not enrolled yet.',
        ur: 'دائیں طرف "Biometric Employees" کی فہرست بتاتی ہے کہ کس کے فنگر پرنٹ یا چہرہ پہلے سے محفوظ ہیں، اور کس کا اندراج ابھی باقی ہے۔',
      },
      do: async h => { await h.scrollTo({ text: /Biometric Employees/ }); await h.point({ text: /Biometric Employees/ }, { hold: 2400 }); },
    },
    {
      say: {
        en: 'Further down is face enrolment for camera kiosks. Click Start Camera, ask the employee to look straight, then left and right for the live check, and click Save 5 Faces. The live check stops anyone using a photo.',
        ur: 'نیچے کیمرے والے کیوسک کے لیے چہرے کا اندراج ہے۔ "Start Camera" پر کلک کریں، ملازم سے کہیں کہ سیدھا دیکھے، پھر بائیں اور دائیں، تاکہ لائیو چیک ہو جائے، اور پھر "Save 5 Faces" پر کلک کریں۔ لائیو چیک کی وجہ سے کوئی تصویر دکھا کر حاضری نہیں لگا سکتا۔',
      },
      do: async h => {
        await h.scrollTo({ role: 'button', name: 'Start Camera' });
        await h.point({ text: 'Camera preview idle' }, { hold: 900, scroll: false });
        await h.point({ role: 'button', name: 'Start Camera' }, { hold: 1500 });
        await h.point({ text: 'Active liveness · Photo replay protection', exact: false }, { hold: 1300 });
        await h.point({ role: 'button', name: 'Save 5 Faces' }, { hold: 1300 });
      },
    },
    {
      say: {
        en: 'This demo computer has no camera, so we stop here. Saved fingerprints and faces are sent to every kiosk automatically at its next sync.',
        ur: 'اس ڈیمو کمپیوٹر میں کیمرہ نہیں ہے، اس لیے ہم یہیں رکتے ہیں۔ محفوظ کیے گئے فنگر پرنٹ اور چہرے اگلی سنک پر ہر کیوسک کو خود بخود بھیج دیے جاتے ہیں۔',
      },
      do: async h => { await h.point({ text: 'Camera preview idle' }, { hold: 1800 }); },
    },
    {
      say: {
        en: 'Now the kiosks themselves. Open Setup and Administration, then Users, Roles and Permissions, and scroll to Kiosk terminals.',
        ur: 'اب خود کیوسک کی بات۔ "Setup & Administration" کھولیں، پھر "Users, Roles & Permissions"، اور نیچے "Kiosk terminals" تک جائیں۔',
      },
      caption: {
        en: 'Now the kiosks themselves: Setup & Administration → Users, Roles & Permissions → Kiosk terminals.',
        ur: 'اب کیوسک: "Setup & Administration" ← "Users, Roles & Permissions" ← "Kiosk terminals"۔',
      },
      do: async h => {
        await h.nav('Setup & Administration', 'Users, Roles & Permissions');
        await h.scrollTo({ css: '#kiosk-devices-title' });
        await h.point({ css: '#kiosk-devices-title' }, { hold: 1200 });
      },
    },
    {
      say: {
        en: 'Every registered kiosk is listed with the date it was registered and its last sync. A kiosk that has not synced for a long time is probably switched off or offline.',
        ur: 'ہر رجسٹر شدہ کیوسک یہاں درج ہے، ساتھ رجسٹریشن کی تاریخ اور آخری سنک کا وقت۔ اگر کسی کیوسک نے کافی دیر سے سنک نہیں کیا تو شاید وہ بند ہے یا انٹرنیٹ سے کٹا ہوا ہے۔',
      },
      do: async h => {
        const row = page => page.locator('section[aria-labelledby="kiosk-devices-title"] .divide-y > div', { hasText: 'Main Gate Kiosk' }).last();
        await h.point(row, { hold: 2600 });
      },
    },
    {
      say: {
        en: 'To add a new kiosk, an administrator creates a setup code here. Type a label, such as the branch, choose how many kiosks it may register and how long it stays valid, then click Create setup code. On the kiosk computer, open Settings, then Server Registration, and paste the code.',
        ur: 'نیا کیوسک جوڑنے کے لیے ایڈمنسٹریٹر یہاں سیٹ اپ کوڈ بناتا ہے۔ کوئی لیبل لکھیں، مثلاً برانچ کا نام، منتخب کریں کہ یہ کتنے کیوسک رجسٹر کر سکتا ہے اور کتنی دیر چلے گا، پھر "Create setup code" پر کلک کریں۔ کیوسک کمپیوٹر پر "Settings" کھولیں، پھر "Server Registration"، اور کوڈ پیسٹ کریں۔',
      },
      caption: {
        en: 'New kiosk: create a setup code here (label, how many kiosks, valid for) → Create setup code. On the kiosk: Settings → Server Registration → paste the code.',
        ur: 'نیا کیوسک: یہاں سیٹ اپ کوڈ بنائیں (لیبل، کتنے کیوسک، مدت) ← "Create setup code"۔ کیوسک پر: "Settings" ← "Server Registration" ← کوڈ پیسٹ کریں۔',
      },
      do: async h => {
        await h.scrollTo(page => page.getByText('Create a setup code', { exact: true }));
        await h.point(page => page.getByText('Create a setup code', { exact: true }), { hold: 900 });
        await h.point({ placeholder: 'e.g. Mall 12 entrance' }, { hold: 900 });
        await h.point(page => page.getByRole('button', { name: 'Create setup code' }), { hold: 1300 });
      },
    },
    {
      say: {
        en: 'The other way is written here: create a user with the Kiosk Terminal role, then sign in once with that account in the kiosk’s Server Registration, together with the server address. Never use an administrator account on a kiosk.',
        ur: 'دوسرا طریقہ یہاں لکھا ہے: "Kiosk Terminal" رول والا ایک یوزر بنائیں، پھر کیوسک کی "Server Registration" میں سرور کے ایڈریس کے ساتھ اسی اکاؤنٹ سے ایک بار لاگ ان کریں۔ کیوسک پر کبھی ایڈمنسٹریٹر اکاؤنٹ استعمال نہ کریں۔',
      },
      do: async h => { await h.point(page => page.getByText(/To add a kiosk/).first(), { hold: 3000 }); },
    },
    {
      say: {
        en: 'If a kiosk is lost or stolen, click Disconnect next to it and confirm. It stops syncing and cannot upload punches until it is registered again.',
        ur: 'اگر کوئی کیوسک گم ہو جائے یا چوری ہو جائے تو اس کے سامنے "Disconnect" پر کلک کریں اور تصدیق کریں۔ پھر وہ نہ سنک کر سکتا ہے نہ حاضری بھیج سکتا ہے، جب تک دوبارہ رجسٹر نہ کیا جائے۔',
      },
      do: async h => {
        const row = page => page.locator('section[aria-labelledby="kiosk-devices-title"] .divide-y > div', { hasText: 'Warehouse Kiosk' }).filter({ has: page.getByRole('button', { name: 'Disconnect' }) }).last();
        await h.click(page => row(page).getByRole('button', { name: 'Disconnect' }), { after: 0 }).catch(() => undefined);
      },
    },
    {
      say: {
        en: 'The browser asks you to confirm. Click OK.',
        ur: 'براؤزر تصدیق مانگتا ہے۔ "OK" پر کلک کریں۔',
      },
      do: async h => {
        // The click above opened a real confirm() that Playwright dismissed; show it, then answer it for real.
        await showDialog(h, 'Disconnect "Warehouse Kiosk"? It will stop syncing and uploading punches until it is registered again.');
        await hideDialog(h);
        h.page.once('dialog', d => d.accept().catch(() => undefined));
        const row = page => page.locator('section[aria-labelledby="kiosk-devices-title"] .divide-y > div', { hasText: 'Warehouse Kiosk' }).filter({ has: page.getByRole('button', { name: 'Disconnect' }) }).last();
        await row(h.page).getByRole('button', { name: 'Disconnect' }).click({ timeout: 4000 });
        await h.wait(1500);
      },
    },
    {
      say: {
        en: 'The kiosk now shows Disconnected with the date. The Main Gate kiosk keeps working as before.',
        ur: 'اب اس کیوسک کے سامنے تاریخ کے ساتھ "Disconnected" لکھا ہے۔ "Main Gate" والا کیوسک پہلے کی طرح کام کرتا رہتا ہے۔',
      },
      do: async h => {
        const done = page => page.locator('section[aria-labelledby="kiosk-devices-title"] .divide-y > div', { hasText: 'Warehouse Kiosk' }).filter({ hasText: 'Disconnected' }).last();
        await h.point(page => done(page).getByText(/Disconnected/), { hold: 2600 });
      },
    },
  ],
};
