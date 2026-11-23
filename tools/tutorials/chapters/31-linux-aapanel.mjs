// Chapter 31: installing on a Linux server with aaPanel using the single script deploy/hrpayroll-server.sh.
// Simulated (tools/tutorials/sim/31-linux-aapanel.html): the terminal text is copied from the script, the server panel
// is a generic mock of the aaPanel steps the script prints at the end.
import { appShot, mark, play, run, simUrl } from '../sim/it-sim.mjs';

const page = (h, name) => run(h, n => window.psim.page(n), name);
const scene = (h, id) => run(h, s => window.psim.scene(s), id);
const nav = async (h, id, name) => { await h.click({ css: `#${id}` }, { after: 300 }); await page(h, name); };

export default {
  id: '31',
  slug: 'Installing-on-Linux-with-aaPanel',
  as: 'none',
  title: { en: 'Installing on a Linux server with aaPanel', ur: 'aaPanel والے لینکس سرور پر انسٹالیشن' },
  subtitle: {
    en: 'One script, hrpayroll-server.sh, installs and updates HR & Payroll; aaPanel runs it, gives it a domain and HTTPS.',
    ur: 'ایک اسکرپٹ hrpayroll-server.sh ایچ آر اور پے رول انسٹال اور اپ ڈیٹ کرتا ہے؛ aaPanel اسے چلاتا ہے اور ڈومین اور HTTPS دیتا ہے۔',
  },
  audience: { en: ['OneNet staff', 'IT administrator'], ur: ['ون نیٹ عملہ', 'آئی ٹی ایڈمنسٹریٹر'] },
  intro: {
    en: 'This chapter is for OneNet staff and IT administrators. One file, hrpayroll-server.sh, installs HR and Payroll on an Ubuntu 24.04 server managed with aaPanel, and it does every update. Node.js, the database, the domain and HTTPS are set up in aaPanel itself.',
    ur: 'یہ باب ون نیٹ کے عملے اور آئی ٹی ایڈمنسٹریٹرز کے لیے ہے۔ ایک فائل hrpayroll-server.sh ایچ آر اور پے رول کو aaPanel والے Ubuntu 24.04 سرور پر انسٹال کرتی ہے اور ہر اپ ڈیٹ بھی یہی کرتی ہے۔ Node.js، ڈیٹا بیس، ڈومین اور HTTPS خود aaPanel میں سیٹ کیے جاتے ہیں۔',
  },
  open: async (p, { baseUrl }) => {
    const shot = await appShot(p, baseUrl);
    await p.goto(simUrl('31-linux-aapanel.html'));
    await p.evaluate(src => window.psim.setShot(src), shot);
  },
  steps: [
    {
      say: {
        en: 'First, once, in aaPanel: open Website, Node project, Node version manager, and install Node 22. The script never installs Node by itself.',
        ur: 'پہلے، صرف ایک بار، aaPanel میں: Website، پھر Node project اور "Node version manager" کھولیں اور Node 22 انسٹال کریں۔ اسکرپٹ خود Node کبھی انسٹال نہیں کرتا۔',
      },
      caption: { en: 'Once in aaPanel: Website → Node project → Node version manager → install Node 22.', ur: 'aaPanel میں ایک بار: Website ← Node project ← "Node version manager" ← Node 22 انسٹال کریں۔' },
      do: async h => {
        await nav(h, 'nav-website', 'node');
        await h.click({ css: '#btn-nodever' }, { after: 500 });
        await h.click({ css: '#btn-install22' }, { after: 900 });
        await run(h, () => window.psim.close());
      },
    },
    {
      say: {
        en: 'Then Databases, PgSQL, Add database. Use the name and user hrpayroll and a strong password. Write the password down: the script will ask for it.',
        ur: 'پھر Databases، PgSQL اور "Add database"۔ نام اور یوزر hrpayroll رکھیں اور مضبوط پاس ورڈ دیں۔ پاس ورڈ لکھ لیں: اسکرپٹ یہی پوچھے گا۔',
      },
      caption: { en: 'Databases → PgSQL → Add database: name and user hrpayroll, a strong password (write it down).', ur: 'Databases ← PgSQL ← "Add database": نام اور یوزر hrpayroll، مضبوط پاس ورڈ (لکھ لیں)۔' },
      do: async h => {
        await nav(h, 'nav-databases', 'db');
        await h.click({ css: '#btn-adddb' }, { after: 400 });
        await h.fill({ css: '#db-name' }, 'hrpayroll');
        await h.fill({ css: '#db-user' }, 'hrpayroll');
        await h.fill({ css: '#db-pass' }, 'Hr-Pay-2026-Strong!', { delay: 30 });
        await h.click({ css: '#btn-db-ok' }, { after: 600 });
      },
    },
    {
      say: {
        en: 'At your domain provider, point the address at the server with an A record: hr, to the server\'s IP address. Do it now, because the HTTPS certificate needs it later.',
        ur: 'اپنے ڈومین فراہم کنندہ کے پاس A ریکارڈ بنا کر ایڈریس کو سرور کی طرف کریں: hr کو سرور کے آئی پی ایڈریس پر۔ یہ ابھی کر لیں، کیونکہ بعد میں HTTPS سرٹیفکیٹ کو اس کی ضرورت ہوگی۔',
      },
      caption: { en: 'DNS at your domain provider: A record  hr.aljannatmall.com → 203.0.113.25 (needed before HTTPS).', ur: 'ڈومین فراہم کنندہ پر DNS: A ریکارڈ hr.aljannatmall.com ← 203.0.113.25 (HTTPS سے پہلے ضروری)۔' },
      do: async h => {
        await scene(h, 'sc-dns');
        await h.fill({ css: '#dns-host' }, 'hr');
        await h.fill({ css: '#dns-value' }, '203.0.113.25');
        await h.click({ css: '#dns-save' }, { after: 400 });
        await h.point({ css: '#dns-row' }, { hold: 1000 });
      },
    },
    {
      say: {
        en: 'In Files, open the folder slash root and upload just this one file: hrpayroll-server.sh. Nothing else is uploaded by hand.',
        ur: 'Files میں /root فولڈر کھولیں اور صرف یہ ایک فائل اپ لوڈ کریں: hrpayroll-server.sh۔ اس کے علاوہ کچھ بھی ہاتھ سے اپ لوڈ نہیں ہوتا۔',
      },
      caption: { en: 'Files → /root → Upload hrpayroll-server.sh (the only file you copy).', ur: 'Files ← /root ← hrpayroll-server.sh اپ لوڈ کریں (صرف یہی فائل)۔' },
      do: async h => {
        await page(h, 'home');
        await nav(h, 'nav-files', 'files');
        await h.click({ css: '#btn-upload' }, { after: 500 });
        await h.point({ css: '#file-sh' }, { hold: 1000 });
      },
    },
    {
      say: {
        en: 'Open Terminal and run: sudo bash slash root slash hrpayroll-server.sh setup.',
        ur: 'Terminal کھولیں اور یہ چلائیں: sudo bash /root/hrpayroll-server.sh setup',
      },
      caption: { en: 'Terminal:  sudo bash /root/hrpayroll-server.sh setup', ur: 'Terminal:  sudo bash /root/hrpayroll-server.sh setup' },
      do: async h => {
        await nav(h, 'nav-terminal', 'term');
        await play(h, '#t-lx', 'lx-login');
      },
    },
    {
      say: {
        en: 'It finds Node 22 from aaPanel and creates a read-only deploy key, so that this server may download the private code from GitHub. Copy the whole line that starts with ssh-ed25519.',
        ur: 'یہ aaPanel سے Node 22 ڈھونڈ لیتا ہے اور ایک صرف پڑھنے والی deploy key بناتا ہے، تاکہ یہ سرور GitHub سے پرائیویٹ کوڈ ڈاؤن لوڈ کر سکے۔ ssh-ed25519 سے شروع ہونے والی پوری لائن کاپی کریں۔',
      },
      do: async h => {
        await play(h, '#t-lx', 'lx-key');
        await mark(h, 'lx-pub', 1500);
      },
    },
    {
      say: {
        en: 'On GitHub, open the repository, Settings, Deploy keys, Add deploy key. Give it a title, paste the key, leave Allow write access switched off, and click Add key.',
        ur: 'GitHub پر ریپوزٹری کھولیں، پھر Settings، "Deploy keys" اور "Add deploy key"۔ عنوان لکھیں، key پیسٹ کریں، "Allow write access" بند ہی رہنے دیں اور "Add key" پر کلک کریں۔',
      },
      caption: { en: 'GitHub → repository → Settings → Deploy keys → Add deploy key. Paste the key; leave "Allow write access" OFF.', ur: 'GitHub ← ریپوزٹری ← Settings ← "Deploy keys" ← "Add deploy key"۔ key پیسٹ کریں؛ "Allow write access" بند رکھیں۔' },
      do: async h => {
        await scene(h, 'sc-gh');
        await h.fill({ css: '#gh-title' }, 'HR server (hr-server)');
        await h.fill({ css: '#gh-key' }, 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK7v2qR9mXcL4pW0sHy8eTf3Nd6uJb1oZaQ5kVt2GxYw hrpayroll-deploy@hr-server', { delay: 8 });
        await h.point({ css: '#gh-write' }, { hold: 900 });
        await h.click({ css: '#gh-add' }, { after: 500 });
        await h.point({ css: '#gh-added' }, { hold: 900 });
      },
    },
    {
      say: {
        en: 'Back in the terminal, press Enter. The script checks the access, lists the branches with the newest first, downloads the code, installs the packages and builds the web app. The first time this takes five to ten minutes.',
        ur: 'ٹرمینل میں واپس آ کر Enter دبائیں۔ اسکرپٹ رسائی چیک کرتا ہے، برانچیں دکھاتا ہے جن میں سب سے نئی پہلے ہوتی ہے، کوڈ ڈاؤن لوڈ کرتا ہے، پیکجز انسٹال کرتا ہے اور ویب ایپ بناتا ہے۔ پہلی بار اس میں پانچ سے دس منٹ لگتے ہیں۔',
      },
      do: async h => {
        await page(h, 'term');
        await play(h, '#t-lx', 'lx-clone');
        await mark(h, 'lx-b12', 900);
      },
    },
    {
      say: {
        en: 'Now it asks for the domain, a contact e-mail, the company name, the internal port, and the database name, user and password from aaPanel. It writes the settings file dot env with new random keys. Keep a copy of it off the server: without its backup key, backups cannot be restored.',
        ur: 'اب یہ ڈومین، رابطے کا ای میل، کمپنی کا نام، اندرونی پورٹ، اور aaPanel والا ڈیٹا بیس نام، یوزر اور پاس ورڈ پوچھتا ہے۔ پھر نئی رینڈم چابیوں کے ساتھ سیٹنگز فائل .env لکھتا ہے۔ اس کی کاپی سرور سے باہر رکھیں: اس کی بیک اپ چابی کے بغیر بیک اپ بحال نہیں ہو سکتے۔',
      },
      caption: { en: 'Domain, e-mail, company, port, database name/user/password → .env with new random keys (an existing .env is never overwritten). Keep a copy off the server.', ur: 'ڈومین، ای میل، کمپنی، پورٹ، ڈیٹا بیس نام/یوزر/پاس ورڈ ← نئی چابیوں کے ساتھ .env (پرانی .env کبھی نہیں بدلتی)۔ کاپی سرور سے باہر رکھیں۔' },
      do: async h => {
        await play(h, '#t-lx', 'lx-env');
        await mark(h, 'lx-envwarn', 1200);
      },
    },
    {
      say: {
        en: 'It creates the database tables and offers to create the first administrator, with an e-mail address and a password of at least twelve characters.',
        ur: 'یہ ڈیٹا بیس کے ٹیبلز بناتا ہے اور پہلا ایڈمنسٹریٹر بنانے کی پیشکش کرتا ہے، ای میل ایڈریس اور کم از کم بارہ حروف کے پاس ورڈ کے ساتھ۔',
      },
      do: async h => {
        await play(h, '#t-lx', 'lx-migrate');
        await mark(h, 'lx-admin', 1000);
      },
    },
    {
      say: {
        en: 'At the end it prints Next steps in aaPanel, with the exact values for the Node project, the domain, HTTPS, the firewall, the nightly backup and DNS. Let\'s do them.',
        ur: 'آخر میں یہ "Next steps in aaPanel" دکھاتا ہے، جس میں Node project، ڈومین، HTTPS، فائر وال، رات کے بیک اپ اور DNS کی بالکل درست ویلیوز ہوتی ہیں۔ آئیے انہیں کرتے ہیں۔',
      },
      do: async h => {
        await play(h, '#t-lx', 'lx-next');
        await mark(h, 'nx-head', 1400);
      },
    },
    {
      say: {
        en: 'Website, Node project, Add Node project. Project directory slash www slash wwwroot slash hr-payroll, start command node server.cjs, port 8080, run user www, and Node 22.',
        ur: 'Website، پھر Node project اور "Add Node project"۔ پروجیکٹ ڈائریکٹری /www/wwwroot/hr-payroll، اسٹارٹ کمانڈ node server.cjs، پورٹ 8080، رن یوزر www اور Node 22۔',
      },
      caption: { en: 'Add Node project: /www/wwwroot/hr-payroll · node server.cjs · port 8080 · user www · Node v22.12.0', ur: '"Add Node project": /www/wwwroot/hr-payroll · node server.cjs · پورٹ 8080 · یوزر www · Node v22.12.0' },
      do: async h => {
        await nav(h, 'nav-website', 'node');
        await h.click({ css: '#btn-addnode' }, { after: 400 });
        await h.fill({ css: '#np-dir' }, '/www/wwwroot/hr-payroll', { delay: 25 });
        await h.fill({ css: '#np-name' }, 'hr-payroll', { delay: 25 });
        await h.fill({ css: '#np-cmd' }, 'node server.cjs', { delay: 25 });
        await h.fill({ css: '#np-port' }, '8080');
        await h.point({ css: '#np-user' }, { hold: 400 });
        await h.click({ css: '#btn-np-ok' }, { after: 600 });
        await h.point({ css: '#np-row' }, { hold: 800 });
      },
    },
    {
      say: {
        en: 'Open the project settings. Under Mapping, add the domain hr.aljannatmall.com.',
        ur: 'پروجیکٹ کی سیٹنگز کھولیں۔ Mapping میں ڈومین hr.aljannatmall.com شامل کریں۔',
      },
      caption: { en: 'Project → Mapping → add hr.aljannatmall.com', ur: 'پروجیکٹ ← Mapping ← hr.aljannatmall.com شامل کریں' },
      do: async h => {
        await h.click({ css: '#btn-np-set' }, { after: 400 });
        await h.fill({ css: '#map-domain' }, 'hr.aljannatmall.com');
        await h.click({ css: '#btn-map' }, { after: 500 });
        await h.point({ css: '#map-row' }, { hold: 700 });
      },
    },
    {
      say: {
        en: 'Under SSL, choose Let\'s Encrypt and click Apply, then switch on Force HTTPS. aaPanel renews the certificate by itself.',
        ur: 'SSL میں "Let\'s Encrypt" منتخب کر کے "Apply" پر کلک کریں، پھر "Force HTTPS" آن کریں۔ aaPanel سرٹیفکیٹ خود ہی تجدید کرتا رہتا ہے۔',
      },
      caption: { en: 'Project → SSL → Let\'s Encrypt → Apply, then "Force HTTPS" on.', ur: 'پروجیکٹ ← SSL ← "Let\'s Encrypt" ← "Apply"، پھر "Force HTTPS" آن۔' },
      do: async h => {
        await h.click({ css: '#tab-ssl' }, { after: 400 });
        await h.click({ css: '#btn-ssl' }, { after: 900 });
        await h.click({ css: '#force-sw' }, { after: 700 });
        await run(h, () => window.psim.close());
      },
    },
    {
      say: {
        en: 'In Security, ports 80 and 443 must be open. Do not open port 8080: the app listens only inside the server and is reached through HTTPS.',
        ur: 'Security میں پورٹ 80 اور 443 کھلے ہونے چاہئیں۔ پورٹ 8080 نہ کھولیں: ایپ صرف سرور کے اندر سنتی ہے اور HTTPS کے ذریعے کھلتی ہے۔',
      },
      caption: { en: 'Security → firewall: 80 and 443 open; do NOT open 8080 (the app listens on 127.0.0.1 only).', ur: 'Security ← فائر وال: 80 اور 443 کھلے؛ 8080 نہ کھولیں (ایپ صرف 127.0.0.1 پر)۔' },
      do: async h => {
        await nav(h, 'nav-security', 'security');
        await h.point({ css: '#fw-80' }, { hold: 700 });
        await h.point({ css: '#fw-443' }, { hold: 700 });
        await h.point({ css: '#fw-note' }, { hold: 900 });
      },
    },
    {
      say: {
        en: 'In Cron, add a Shell script task that runs daily at 2:30 at night: bash slash root slash hrpayroll-server.sh backup. That is the encrypted nightly backup; the newest fourteen are kept.',
        ur: 'Cron میں ایک "Shell Script" ٹاسک بنائیں جو روزانہ رات ڈھائی بجے چلے: bash /root/hrpayroll-server.sh backup۔ یہ رات کا خفیہ بیک اپ ہے؛ تازہ ترین چودہ رکھے جاتے ہیں۔',
      },
      caption: { en: 'Cron → Shell Script, daily 02:30:  bash /root/hrpayroll-server.sh backup  (14 encrypted backups kept)', ur: 'Cron ← "Shell Script"، روزانہ 02:30:  bash /root/hrpayroll-server.sh backup  (14 خفیہ بیک اپ)' },
      do: async h => {
        await nav(h, 'nav-cron', 'cron');
        await h.fill({ css: '#cron-name' }, 'HR Payroll backup');
        await h.fill({ css: '#cron-script' }, 'bash /root/hrpayroll-server.sh backup', { delay: 25 });
        await h.click({ css: '#btn-cron' }, { after: 500 });
        await h.point({ css: '#cron-row' }, { hold: 700 });
      },
    },
    {
      say: {
        en: 'Now open https colon slash slash hr.aljannatmall.com and sign in as the administrator.',
        ur: 'اب https://hr.aljannatmall.com کھولیں اور ایڈمنسٹریٹر کے طور پر لاگ ان کریں۔',
      },
      caption: { en: 'Open https://hr.aljannatmall.com and sign in as the administrator.', ur: 'https://hr.aljannatmall.com کھولیں اور ایڈمنسٹریٹر کے طور پر لاگ ان کریں۔' },
      do: async h => {
        await scene(h, 'sc-site');
        await h.point({ css: '#site-url' }, { hold: 1800 });
      },
    },
    {
      say: {
        en: 'Every update is one command: sudo bash slash root slash hrpayroll-server.sh update. It takes a backup and prepares the new version in a separate folder while the site keeps running, then swaps it in.',
        ur: 'ہر اپ ڈیٹ ایک کمانڈ ہے: sudo bash /root/hrpayroll-server.sh update۔ یہ بیک اپ لیتا ہے اور نیا ورژن الگ فولڈر میں تیار کرتا ہے جبکہ سائٹ چلتی رہتی ہے، پھر اسے بدل دیتا ہے۔',
      },
      caption: { en: 'Every update:  sudo bash /root/hrpayroll-server.sh update  (backup, new version prepared beside the live one, then swapped in)', ur: 'ہر اپ ڈیٹ:  sudo bash /root/hrpayroll-server.sh update  (بیک اپ، نیا ورژن ساتھ تیار، پھر تبدیل)' },
      do: async h => {
        await page(h, 'term');
        await play(h, '#t-lx', 'lx-update');
        await mark(h, 'up-restart', 1000);
      },
    },
    {
      say: {
        en: 'Then press Restart on the project in aaPanel, so the new version starts.',
        ur: 'پھر aaPanel میں پروجیکٹ پر "Restart" دبائیں تاکہ نیا ورژن شروع ہو جائے۔',
      },
      caption: { en: 'aaPanel → Website → Node project → hr-payroll → Restart', ur: 'aaPanel ← Website ← Node project ← hr-payroll ← "Restart"' },
      do: async h => {
        await nav(h, 'nav-website', 'node');
        await h.click({ css: '#btn-np-restart' }, { after: 900 });
      },
    },
    {
      say: {
        en: 'Finally run check. It tests the code version, the database, the app, the public address and the newest backup. If something is wrong after an update, rollback returns to the previous version.',
        ur: 'آخر میں check چلائیں۔ یہ کوڈ ورژن، ڈیٹا بیس، ایپ، پبلک ایڈریس اور تازہ ترین بیک اپ چیک کرتا ہے۔ اگر اپ ڈیٹ کے بعد کوئی مسئلہ ہو تو rollback پچھلے ورژن پر واپس لے جاتا ہے۔',
      },
      caption: { en: 'sudo bash /root/hrpayroll-server.sh check  — and  … rollback  to go back to the previous version.', ur: 'sudo bash /root/hrpayroll-server.sh check  — اور پچھلے ورژن کے لیے  … rollback' },
      do: async h => {
        await page(h, 'term');
        await play(h, '#t-lx', 'lx-check');
        await mark(h, 'ck-ok', 1200);
      },
    },
  ],
};
