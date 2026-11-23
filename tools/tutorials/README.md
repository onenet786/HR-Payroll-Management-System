# Video tutorials

Narrated screen recordings of the whole system, in two full versions (English voice and Urdu voice), one video per
chapter plus one complete movie with chapter marks. Everything is generated from the chapter files in `chapters/`,
so the videos can be re-recorded after any change to the app.

Output: `dist-tutorials/English/` and `dist-tutorials/Urdu/` (not committed): `NN-<Chapter>.mp4`,
`00-Complete-Guide-<Language>.mp4` and `Chapters.txt` (chapter start times).

## Requirements

- The demo server: a built web app served by `server.cjs` on `http://localhost:8090` against the demo database
  `hr_payroll_tutorial` (company "AlJannat Mall"). Accounts: `hradmin@aljannatmall.local` (Super Admin) and
  `usman.tariq@example.com` (employee), password `AlJannat-Demo-2026`.
  Build the app with `VITE_API_BASE_URL= npx vite build --outDir <folder>/dist` (never into the repo's `dist`, which
  is the production bundle) and run `server.cjs` from a folder whose `.env` points `DATABASE_URL` at the demo database,
  with `NODE_ENV=production DEBUG=false PORT=8090 MFA_ENFORCE_PRIVILEGED=false`.
- Microsoft Edge, `ffmpeg`/`ffprobe` on PATH, `playwright-core` (found in the npx cache or via `PLAYWRIGHT_CORE`).
- Windows voices: Microsoft Hazel (English) and Microsoft Uzma (Urdu:
  `Add-WindowsCapability -Online -Name 'Language.TextToSpeech~~~ur-PK~0.0.1.0'`, as Administrator).
- `tools/tutorials/.cache/tutorial-base.dump`: snapshot of the demo database. Restore it before a full recording so
  every run starts from the same data:
  `pg_restore --clean --if-exists -d <demo database url> tools/tutorials/.cache/tutorial-base.dump`

## Commands

```
node tools/tutorials/build.mjs --lang en --only 05 --dry   # quick check of chapter 05: no voice, timed placeholders
node tools/tutorials/build.mjs --lang en --only 05         # chapter 05 with the English voice
node tools/tutorials/build.mjs --lang en                   # every chapter + the complete movie
node tools/tutorials/build.mjs --lang ur                   # Urdu version
node tools/tutorials/build.mjs --lang en --movie           # only re-join existing chapter videos
```

A step that fails does not stop the recording: it is listed at the end (`!! step N: ...`) and a screenshot is saved as
`tools/tutorials/.cache/work/<lang>/fail-<chapter>-<step>.png`. A finished chapter must have no `!!` lines.

## Chapter format

One file per chapter: `chapters/NN-name.mjs`, exporting a default object (see `chapters/01-sign-in.mjs`):

```js
export default {
  id: '05',                       // two digits, file order = video order
  slug: 'Master-Data-Lists',      // output file name
  as: 'admin',                    // 'admin' | 'employee' | 'none' (signed out). Signed in before recording starts.
  start: '/',                     // page opened behind the title card
  title:    { en: '...', ur: '...' },
  subtitle: { en: '...', ur: '...' },          // one sentence on the title card
  audience: { en: ['HR staff'], ur: ['ایچ آر عملہ'] },
  intro:    { en: '...', ur: '...' },          // spoken while the title card shows
  setup: async h => {},           // optional, runs behind the title card (e.g. open the right screen)
  open: async (page, { baseUrl, h }) => {},    // optional, replaces `start` (simulated pages: kiosk, phone, terminal)
  initScript: () => {},           // optional, added to every page before the app loads (e.g. a mocked window.kioskApi)
  steps: [
    { say: { en: '...', ur: '...' },           // spoken + shown as caption (other language as a small second line)
      caption: { en: '...', ur: '...' },       // optional: different caption text (e.g. a URL written properly)
      do: async h => { await h.click('Save'); }, // runs while it is spoken; the step lasts as long as the voice
      hold: 550 },                             // optional pause after the step (ms)
  ],
};
```

Helpers (`lib/helpers.mjs`): every visible action moves the tutorial cursor to the control and highlights it first.

| Helper | Use |
| --- | --- |
| `h.nav('Payroll', 'Loans & Advances')` | open a sidebar module and the item in its menu card |
| `h.click(target, { after })` | click (target: button/link text, `{ text }`, `{ label }`, `{ placeholder }`, `{ css }`, `{ role, name }`, or `page => locator`) |
| `h.fill(target, value)` | click a field and type into it, visibly |
| `h.select(target, 'Option label')` | choose in a `<select>` |
| `h.check(target)` | tick a checkbox |
| `h.point(target, { hold })` | show and highlight something without clicking |
| `h.scroll(dy)` / `h.scrollTo(target)` | scroll the page smoothly |
| `h.press('Escape')`, `h.wait(ms)`, `h.goto('/')`, `h.visible(target)` | keys, pauses, navigation, wait for something |

## Writing rules (what makes the videos good)

- Audience is a lay person: one idea per step, short plain sentences, say *why* as well as *what*, name the button
  exactly as it is written on screen. 6 to 14 steps per chapter; a chapter runs about 1.5 to 4 minutes.
- Show real work with the demo data (open a record, fill a form, save, show the result), not only a tour.
  Use believable Pakistani demo values (names, CNIC 35202-1234567-1 style, PKR amounts).
- Spoken text: write numbers and symbols the way they should be read ("thirty minutes", "https colon slash slash")
  and put the properly written form in `caption`.
- Urdu: natural, simple Urdu as spoken in an office; keep English UI labels in quotes ("Save" پر کلک کریں) because the
  screens are in English. Both `en` and `ur` are required for every spoken line.
- Chapters are recorded in order on one database (restored from the snapshot first), so a chapter may rely on records
  created by an earlier chapter, but must not break later ones. Prefer to create your own clearly named demo record.
- Never sign out in the middle of a chapter (the next chapter has its own sign-in), never change the demo passwords,
  never delete the demo company, branches or the admin account.
- Keep the caption readable: the caption bar covers the bottom ~150 px of the screen, so scroll what you talk about
  into the upper part of the screen (`h.scrollTo`) before pointing at it.

## Chapter outline

| # | Chapter | Audience |
| --- | --- | --- |
| 01 | Signing in | everyone |
| 02 | Finding your way around (dashboard, 12-step bar, menus, search, notifications, Urdu/English, page guide, compliance panel) | everyone |
| 03 | My security (MFA by app or email, trusted devices, change password) | everyone with an account |
| 04 | Company & Master Data (company profile, NTN, branches) | administrator |
| 05 | Master Data Lists (departments, designations, grades, cost centres...) | administrator |
| 06 | Statutory configuration (tax slabs, EOBI, social security, approval of rates, notifications, file templates) | administrator / payroll |
| 07 | Company Options & Attendance Policy | administrator |
| 08 | Users, Roles & Permissions | administrator |
| 09 | Holiday Calendar | HR |
| 10 | Employee Directory (add an employee, profile, documents, photo, bank) | HR |
| 11 | Employee Lifecycle (joining, confirmation, transfer, exit) | HR |
| 12 | Recruitment | HR |
| 13 | Performance | HR / managers |
| 14 | Asset Management | HR / admin |
| 15 | Leave Management | HR / managers |
| 16 | Biometric Devices & Kiosks (enrol fingerprint and face, kiosk terminals, setup codes) | HR / IT |
| 17 | Attendance Register (review, corrections, approvals) | HR |
| 18 | Loans & Advances | HR / payroll |
| 19 | Salary Revisions | HR / payroll |
| 20 | Payroll Processing (prepare, approve, disburse, payslips, bank file, parallel run) | payroll |
| 21 | Gratuity & Final Settlement | payroll |
| 22 | Reports | managers / HR / payroll |
| 23 | Notifications Center | HR |
| 24 | Data Backup & database maintenance | administrator |
| 25 | Data Import (CyberAP) | administrator |
| 26 | Vendor console: edition and licence (OneNet support) | OneNet staff |
| 27 | Employee self-service on the web | employees |
| 28 | The phone app | employees |
| 29 | The attendance kiosk (punching; settings and registration) | employees / IT |
| 30 | Installing on Windows Server (package, services, backups, updates, port 80, HTTPS, certificate on PCs) | IT |
| 31 | Installing on a Linux server with aaPanel (hrpayroll-server.sh) | IT |
| 32 | Installing the kiosk on a PC | IT |
| 33 | Provider Console (hosting several clients) | OneNet staff |
