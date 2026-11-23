// Chapter 17: Attendance Register (filters, reading a day, fixing a missed punch-out with a reason, reviewing corrections).
// Demo data used: 4-Nov-2026 has late arrivals; on 7-Nov-2026 Zainab Bibi has a punch-in without a punch-out; Tariq Javed
// and Hassan Raza have corrections waiting for review.
//
// The app asks for times, reasons and comments with the browser's prompt() box, which the recording does not capture:
// each one is shown as a look-alike box with the answer typed in, then the real prompt is answered with the same text.

async function showPrompt(h, message, answer) {
  await h.page.evaluate(msg => {
    const box = document.createElement('div');
    box.id = 'tut-fake-dialog';
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.18);display:flex;justify-content:center;align-items:flex-start;padding-top:18px;font-family:Segoe UI,system-ui,sans-serif';
    box.innerHTML = `<div style="width:500px;background:#fff;border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,.35);padding:20px 22px 16px;color:#1f2937">
      <div style="font-size:14px;font-weight:600;margin-bottom:10px">localhost:8090 says</div>
      <div style="font-size:13px;line-height:1.45;margin-bottom:12px">${msg}</div>
      <div id="tut-fake-input" style="border:2px solid #0f6cbd;border-radius:4px;padding:6px 8px;font-size:13px;min-height:20px;margin-bottom:16px"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button id="tut-fake-ok" style="background:#0f6cbd;color:#fff;border:0;border-radius:4px;padding:6px 22px;font-size:13px">OK</button>
        <button style="background:#fff;color:#1f2937;border:1px solid #d1d5db;border-radius:4px;padding:6px 16px;font-size:13px">Cancel</button>
      </div></div>`;
    document.body.appendChild(box);
  }, message);
  await h.wait(700);
  for (const ch of answer) {
    await h.page.evaluate(c => { const el = document.getElementById('tut-fake-input'); if (el) el.textContent += c; }, ch);
    await h.wait(answer.length > 20 ? 28 : 90);
  }
  await h.wait(500);
  const { box } = await h.point({ css: '#tut-fake-ok' }, { hold: 500, scroll: false });
  if (box) await h.page.evaluate(([x, y]) => window.__tut && window.__tut.ripple(x, y), [box.x + box.width / 2, box.y + box.height / 2]);
  await h.wait(300);
  await h.page.evaluate(() => document.getElementById('tut-fake-dialog')?.remove());
  await h.highlightOff();
}
// Answers the real prompt() boxes, in order, for the next click.
function answerPrompts(h, answers) {
  const queue = [...answers];
  const handler = dialog => { const next = queue.shift(); (next === undefined ? dialog.dismiss() : dialog.accept(next)).catch(() => undefined); if (!queue.length) h.page.off('dialog', handler); };
  h.page.on('dialog', handler);
}
// Scrolls an element to just under the sticky top bar, so it stays clear of the caption at the bottom.
async function toTop(h, target, offset = 70) {
  const loc = await h.resolve(target);
  await loc.evaluate((el, off) => { const y = el.getBoundingClientRect().top; const main = document.scrollingElement; let p = el.parentElement; while (p && !(p.scrollHeight > p.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement; (p || main).scrollBy({ top: y - off, behavior: 'smooth' }); }, offset);
  await h.wait(800);
}
async function setDay(h, iso) {
  const { loc } = await h.point(page => page.locator('label', { hasText: 'Day' }).locator('input[type=date]'), { hold: 500 });
  await loc.fill(iso);
  await h.wait(900);
  await h.highlightOff();
  await toTop(h, { text: 'Digital Attendance Stream' });
}
// The stream sits at the end of the page: extra room below lets it scroll up clear of the caption bar.
const roomBelow = h => h.page.evaluate(() => { const m = document.querySelector('main'); if (m) m.style.paddingBottom = '520px'; });
const ZAINAB_REASON = 'Gate register shows exit at 18:05, confirmed by supervisor Kashif Mehmood';

export default {
  id: '17',
  slug: 'Attendance-Register',
  as: 'admin',
  title: { en: 'Attendance Register', ur: 'حاضری رجسٹر' },
  subtitle: {
    en: 'Read the daily punches, spot late and missing punches, correct them with a reason, and review corrections.',
    ur: 'روزانہ کی حاضری دیکھیں، تاخیر اور چھوٹی ہوئی پنچ پہچانیں، وجہ کے ساتھ درست کریں، اور درستگیوں کا جائزہ لیں۔',
  },
  audience: { en: ['HR staff', 'Supervisors'], ur: ['ایچ آر عملہ', 'سپروائزر'] },
  intro: {
    en: 'Every punch from the kiosks, the phone app and the web lands in the Attendance Register. In this chapter you will read a day, fix a forgotten punch-out and review corrections before payroll.',
    ur: 'کیوسک، فون ایپ اور ویب سے لگنے والی ہر حاضری حاضری رجسٹر میں آتی ہے۔ اس باب میں آپ ایک دن کی حاضری پڑھیں گے، بھولی ہوئی چھٹی کی پنچ درست کریں گے، اور پے رول سے پہلے درستگیوں کا جائزہ لیں گے۔',
  },
  steps: [
    {
      say: {
        en: 'Open Time and Attendance, then Attendance Register. In the step bar at the top, Attendance shows how many items need review.',
        ur: '"Time & Attendance" کھولیں، پھر "Attendance Register"۔ اوپر والی مراحل کی پٹی میں "Attendance" کے نیچے لکھا ہوتا ہے کہ کتنی چیزیں جائزے کی منتظر ہیں۔',
      },
      caption: {
        en: 'Open Time & Attendance → Attendance Register. In the step bar, Attendance shows how many items need review.',
        ur: '"Time & Attendance" ← "Attendance Register" کھولیں۔ مراحل کی پٹی میں "Attendance" بتاتا ہے کہ کتنی چیزیں جائزے کی منتظر ہیں۔',
      },
      do: async h => {
        await h.nav('Time & Attendance', 'Attendance Register');
        await h.point({ text: /need review/ }, { hold: 1500 });
      },
    },
    {
      say: {
        en: 'Scroll down to the Digital Attendance Stream. It shows nothing at first: with thousands of punches, the list appears only after you choose a day, an employee, a department or a status.',
        ur: 'نیچے "Digital Attendance Stream" تک جائیں۔ شروع میں یہاں کچھ نظر نہیں آتا: ہزاروں پنچز ہوتی ہیں، اس لیے فہرست تب آتی ہے جب آپ کوئی دن، ملازم، شعبہ یا اسٹیٹس منتخب کریں۔',
      },
      do: async h => {
        await roomBelow(h);
        await toTop(h, { text: 'Digital Attendance Stream' });
        await h.point({ text: 'Choose a day, an employee, a department or a status to list attendance.' }, { hold: 2200 });
      },
    },
    {
      say: {
        en: 'Choose a day, here the fourth of November. The punches of that day appear, fifty per page.',
        ur: 'کوئی دن منتخب کریں، یہاں چار نومبر۔ اس دن کی پنچز آ جاتی ہیں، ایک صفحے پر پچاس۔',
      },
      caption: { en: 'Choose a day, here 4-Nov-2026. The punches of that day appear, 50 per page.', ur: 'دن منتخب کریں، یہاں 4-Nov-2026۔ اس دن کی پنچز آ جاتی ہیں، ایک صفحے پر 50۔' },
      do: async h => { await setDay(h, '2026-11-04'); await h.point({ text: /^\d+ records$/ }, { hold: 1200 }); },
    },
    {
      say: {
        en: 'Each row shows the time in and the time out, how the punch was made, for example the biometric kiosk, any overtime, and the status of the day.',
        ur: 'ہر قطار میں آنے اور جانے کا وقت، پنچ کس طریقے سے لگی، مثلاً بایومیٹرک کیوسک، اوور ٹائم اگر ہو، اور دن کا اسٹیٹس نظر آتا ہے۔',
      },
      do: async h => {
        const first = page => page.locator('tbody tr').filter({ has: page.locator('img') }).first();
        await h.point(page => first(page).locator('td').nth(2), { hold: 800 });
        await h.point(page => first(page).locator('td').nth(3), { hold: 800 });
        await h.point(page => first(page).locator('td').nth(4), { hold: 800 });
        await h.point(page => first(page).locator('td').nth(7), { hold: 800 });
      },
    },
    {
      say: {
        en: 'Late means the employee arrived after the grace time of the shift. Half Day means a short day, with too few hours. A day with no punch at all counts as absent in the monthly register.',
        ur: '"Late" کا مطلب ہے کہ ملازم شفٹ کے رعایتی وقت کے بعد آیا۔ "Half Day" کا مطلب ہے چھوٹا دن، یعنی بہت کم گھنٹے۔ جس دن کوئی پنچ ہی نہ ہو وہ ماہانہ رجسٹر میں غیر حاضری شمار ہوتا ہے۔',
      },
      do: async h => {
        await h.select(page => page.locator('label', { hasText: 'Status' }).locator('select'), 'Late');
        await h.point(page => page.locator('tbody tr').filter({ hasText: 'Late' }).first().locator('td').nth(7), { hold: 2200 });
        await h.select(page => page.locator('label', { hasText: 'Status' }).locator('select'), 'All');
      },
    },
    {
      say: {
        en: 'Now the seventh of November. Look at Zainab Bibi: she punched in at eight in the morning but there is no punch-out. She forgot to punch when she left.',
        ur: 'اب سات نومبر۔ زینب بی بی کو دیکھیں: صبح آٹھ بجے آنے کی پنچ ہے لیکن جانے کی پنچ نہیں۔ وہ جاتے وقت پنچ لگانا بھول گئیں۔',
      },
      caption: { en: 'Now 7-Nov-2026. Zainab Bibi punched in at 08:01 but there is no punch-out: she forgot to punch when she left.', ur: 'اب 7-Nov-2026۔ زینب بی بی کی آمد 08:01 پر ہے لیکن جانے کی پنچ نہیں: وہ جاتے وقت پنچ بھول گئیں۔' },
      do: async h => {
        await setDay(h, '2026-11-07');
        const row = page => page.locator('tbody tr', { hasText: 'Zainab Bibi' });
        await h.scrollTo(page => row(page));
        await h.point(page => row(page).locator('td').nth(3), { hold: 2200 });
      },
    },
    {
      say: {
        en: 'Check the gate register or ask her supervisor, then click Fix punch-out. Type the real leaving time, in twenty-four hour format.',
        ur: 'گیٹ رجسٹر دیکھیں یا ان کے سپروائزر سے پوچھیں، پھر "Fix punch-out" پر کلک کریں۔ جانے کا اصل وقت چوبیس گھنٹے والے انداز میں لکھیں۔',
      },
      do: async h => {
        const fix = page => page.locator('tbody tr', { hasText: 'Zainab Bibi' }).getByRole('button', { name: 'Fix punch-out' });
        await h.point(fix, { hold: 700 });
        await showPrompt(h, 'Punch-out was not recorded for Zainab Bibi on 2026-11-07. Enter the actual leaving time (HH:MM, 24-hour):', '18:05');
      },
    },
    {
      say: {
        en: 'Then write the reason and the evidence, at least ten characters. Every correction keeps this reason for the auditors.',
        ur: 'پھر وجہ اور ثبوت لکھیں، کم از کم دس حروف۔ ہر درستگی کے ساتھ یہ وجہ آڈٹ کے لیے محفوظ رہتی ہے۔',
      },
      do: async h => {
        await showPrompt(h, 'Reason and evidence (e.g. gate register, supervisor confirmation) — at least 10 characters:', ZAINAB_REASON);
        answerPrompts(h, ['18:05', ZAINAB_REASON]);
        await h.page.locator('tbody tr', { hasText: 'Zainab Bibi' }).getByRole('button', { name: 'Fix punch-out' }).click({ timeout: 4000 });
        await h.wait(1200);
        await h.point(page => page.locator('tbody tr', { hasText: 'Zainab Bibi' }).locator('td').nth(3), { hold: 1200 });
      },
    },
    {
      say: {
        en: 'The punch-out now shows eighteen oh five. The correction does not count yet: it goes to review, together with the other corrections at the top of this page.',
        ur: 'جانے کا وقت اب 18:05 دکھا رہا ہے۔ یہ درستگی ابھی شمار نہیں ہوتی: یہ جائزے کے لیے جاتی ہے، اس صفحے کے اوپر باقی درستگیوں کے ساتھ۔',
      },
      caption: { en: 'The punch-out now shows 18:05. It does not count yet: it goes to review with the other corrections at the top of the page.', ur: 'جانے کا وقت اب 18:05 ہے۔ یہ ابھی شمار نہیں ہوتا: یہ صفحے کے اوپر باقی درستگیوں کے ساتھ جائزے میں جاتا ہے۔' },
      do: async h => {
        await toTop(h, { text: /Pending Attendance Regularization Requests/ });
        await h.point({ text: /Pending Attendance Regularization Requests/ }, { hold: 1800 });
      },
    },
    {
      say: {
        en: 'You cannot approve a correction you made yourself, so its buttons are grey. Another HR user or the supervisor must check it. This is the maker-checker rule.',
        ur: 'اپنی کی ہوئی درستگی آپ خود منظور نہیں کر سکتے، اس لیے اس کے بٹن مدھم ہیں۔ کوئی دوسرا ایچ آر یوزر یا سپروائزر اسے چیک کرے گا۔ اسے "maker-checker" اصول کہتے ہیں۔',
      },
      do: async h => {
        const card = page => page.locator('div', { hasText: 'Missing punch-out recorded as 18:05' }).filter({ has: page.getByRole('button', { name: 'Approve' }) }).last();
        await h.scrollTo(card);
        await h.point(page => card(page).getByRole('button', { name: 'Approve' }), { hold: 2600 });
      },
    },
    {
      say: {
        en: 'Tariq Javed\'s correction was sent by him: the kiosk at the gate was offline. After checking, click Approve.',
        ur: 'طارق جاوید کی درستگی انہوں نے خود بھیجی ہے: گیٹ والا کیوسک آف لائن تھا۔ تصدیق کے بعد "Approve" پر کلک کریں۔',
      },
      do: async h => {
        const card = page => page.locator('div', { hasText: 'Kiosk was offline at the gate' }).filter({ has: page.getByRole('button', { name: 'Approve' }) }).last();
        if (!(await card(h.page).count())) { await h.wait(1500); return; }
        await h.scrollTo(card);
        await h.point(page => card(page).getByText(/Kiosk was offline/), { hold: 1000 });
        await h.point(page => card(page).getByRole('button', { name: 'Approve' }), { hold: 700 });
      },
    },
    {
      say: {
        en: 'Write what you checked, for example the gate log, and click OK. The day is then recalculated against the shift.',
        ur: 'لکھیں کہ آپ نے کیا چیک کیا، مثلاً گیٹ لاگ، اور "OK" پر کلک کریں۔ پھر اس دن کا حساب شفٹ کے مطابق دوبارہ ہو جاتا ہے۔',
      },
      do: async h => {
        const card = page => page.locator('div', { hasText: 'Kiosk was offline at the gate' }).filter({ has: page.getByRole('button', { name: 'Approve' }) }).last();
        if (!(await card(h.page).count())) { await h.wait(1500); return; }
        const comment = 'Gate log checked: arrived 08:04, kiosk offline that morning';
        await showPrompt(h, 'Approval comment — evidence reviewed (e.g. gate log, manager confirmation):', comment);
        answerPrompts(h, [comment]);
        await card(h.page).getByRole('button', { name: 'Approve' }).click({ timeout: 4000 });
        await h.wait(1200);
      },
    },
    {
      say: {
        en: 'Hassan Raza\'s punch was flagged by the system itself: the face match was weak. Confirm with his supervisor. If he was really there, approve it. If not, click Decline, and the day is not credited.',
        ur: 'حسن رضا کی پنچ کو سسٹم نے خود نشان زد کیا ہے: چہرے کی مماثلت کمزور تھی۔ ان کے سپروائزر سے تصدیق کریں۔ اگر وہ واقعی موجود تھے تو منظور کریں۔ اگر نہیں، تو "Decline" پر کلک کریں، اور اس دن کی حاضری نہیں ملے گی۔',
      },
      do: async h => {
        const card = page => page.locator('div', { hasText: 'Low-confidence face match' }).filter({ has: page.getByRole('button', { name: 'Decline' }) }).last();
        if (!(await card(h.page).count())) { await h.wait(1500); return; }
        await h.scrollTo(card);
        await h.point(page => card(page).getByText(/Face match strength/), { hold: 1400 });
        await h.point(page => card(page).getByRole('button', { name: 'Decline' }), { hold: 1600 });
      },
    },
    {
      say: {
        en: 'To look at one person, choose them in the Employee filter. For longer periods and printing, use Reports, then Attendance Reports. Clear every correction before you run payroll.',
        ur: 'کسی ایک ملازم کی حاضری دیکھنے کے لیے "Employee" فلٹر میں اسے منتخب کریں۔ لمبی مدت اور پرنٹ کے لیے "Reports" اور پھر "Attendance Reports" استعمال کریں۔ پے رول چلانے سے پہلے ہر درستگی نمٹا دیں۔',
      },
      do: async h => {
        await toTop(h, { text: 'Digital Attendance Stream' });
        await setDay(h, '');
        await h.click({ css: 'button[aria-label="Attendance employee filter"]' }, { after: 400 });
        await h.fill({ placeholder: 'Type to search…' }, 'Tariq Javed', { delay: 70 });
        await h.click({ role: 'option', name: 'Tariq Javed' }, { after: 900 });
        await h.point(page => page.locator('tbody tr', { hasText: 'Tariq Javed' }).first(), { hold: 1600 });
      },
    },
  ],
};
