import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const docsDir = path.join(root, 'docs');
const assetsDir = path.join(docsDir, 'assets');

// Load diagram images as base64
const d1Path = path.join(assetsDir, 'diagram1-flow-of-data.jpg');
const d2Path = path.join(assetsDir, 'diagram2-punch-to-paid-day.jpg');

const d1Base64 = fs.existsSync(d1Path) ? fs.readFileSync(d1Path).toString('base64') : '';
const d2Base64 = fs.existsSync(d2Path) ? fs.readFileSync(d2Path).toString('base64') : '';

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OneNet HR &amp; Payroll Management System - Complete User Guide &amp; Operations Manual</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');

    @page {
      size: A4 portrait;
      margin: 16mm 14mm 18mm 14mm;
      @bottom-right {
        content: counter(page);
        font-family: 'Inter', sans-serif;
        font-size: 8pt;
        color: #64748b;
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 9.5pt;
      line-height: 1.55;
      color: #1e293b;
      background: #ffffff;
    }

    .page-break {
      page-break-before: always;
    }

    .avoid-break {
      page-break-inside: avoid;
    }

    /* Cover Page */
    .cover-page {
      height: 98vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 40px 30px;
      background: linear-gradient(135deg, #064e3b 0%, #0f172a 100%);
      color: #ffffff;
      border-radius: 12px;
      margin-bottom: 20px;
    }

    .cover-top {
      border-bottom: 2px solid rgba(255, 255, 255, 0.15);
      padding-bottom: 24px;
    }

    .cover-badge {
      display: inline-block;
      background: #10b981;
      color: #ffffff;
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      padding: 6px 14px;
      border-radius: 9999px;
      margin-bottom: 16px;
    }

    .cover-title {
      font-size: 32pt;
      font-weight: 800;
      line-height: 1.15;
      color: #ffffff;
      letter-spacing: -0.5px;
      margin-bottom: 12px;
    }

    .cover-subtitle {
      font-size: 14pt;
      font-weight: 400;
      color: #94a3b8;
      max-width: 650px;
      line-height: 1.4;
    }

    .cover-features {
      margin: 40px 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .cover-feat-card {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 14px 18px;
    }

    .cover-feat-card h4 {
      font-size: 10.5pt;
      font-weight: 700;
      color: #34d399;
      margin-bottom: 4px;
    }

    .cover-feat-card p {
      font-size: 8.5pt;
      color: #cbd5e1;
      line-height: 1.4;
    }

    .cover-footer {
      border-top: 1px solid rgba(255, 255, 255, 0.15);
      padding-top: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 8.5pt;
      color: #94a3b8;
    }

    .cover-footer strong {
      color: #ffffff;
    }

    /* Headings */
    h1 {
      font-size: 20pt;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
      margin-top: 20px;
      margin-bottom: 12px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 8px;
    }

    h2 {
      font-size: 14pt;
      font-weight: 700;
      color: #065f46;
      margin-top: 18px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    h3 {
      font-size: 11pt;
      font-weight: 700;
      color: #1e293b;
      margin-top: 14px;
      margin-bottom: 6px;
    }

    h4 {
      font-size: 9.5pt;
      font-weight: 600;
      color: #334155;
      margin-top: 10px;
      margin-bottom: 4px;
    }

    p {
      margin-bottom: 8px;
      color: #334155;
    }

    ul, ol {
      margin-left: 20px;
      margin-bottom: 10px;
    }

    li {
      margin-bottom: 4px;
      color: #334155;
    }

    /* Table of Contents */
    .toc-container {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px 20px;
      margin: 16px 0 24px 0;
    }

    .toc-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 24px;
      font-size: 9pt;
    }

    .toc-item {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px dotted #cbd5e1;
      padding-bottom: 2px;
    }

    .toc-item a {
      color: #0f172a;
      text-decoration: none;
      font-weight: 500;
    }

    /* Callout Boxes */
    .callout {
      border-radius: 8px;
      padding: 12px 16px;
      margin: 12px 0;
      font-size: 9pt;
      border-left: 4px solid;
    }

    .callout-info {
      background: #f0fdf4;
      border-color: #10b981;
      color: #065f46;
    }

    .callout-warning {
      background: #fffbeb;
      border-color: #f59e0b;
      color: #92400e;
    }

    .callout-statutory {
      background: #eff6ff;
      border-color: #3b82f6;
      color: #1e40af;
    }

    .callout strong {
      display: block;
      margin-bottom: 2px;
      font-weight: 700;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 16px 0;
      font-size: 8.5pt;
    }

    th, td {
      border: 1px solid #e2e8f0;
      padding: 7px 10px;
      text-align: left;
    }

    th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 7.5pt;
      letter-spacing: 0.5px;
    }

    tr:nth-child(even) {
      background: #f8fafc;
    }

    /* Diagram Images */
    .diagram-container {
      margin: 16px 0;
      text-align: center;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
    }

    .diagram-img {
      max-width: 100%;
      height: auto;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
    }

    .diagram-caption {
      margin-top: 8px;
      font-size: 8pt;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Menu Card */
    .menu-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 18px;
      margin: 14px 0;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }

    .menu-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }

    .menu-title {
      font-size: 11.5pt;
      font-weight: 700;
      color: #0f172a;
    }

    .menu-step-badge {
      background: #e0e7ff;
      color: #3730a3;
      font-size: 7.5pt;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 9999px;
      text-transform: uppercase;
    }

    .step-list {
      counter-reset: step-counter;
      list-style: none;
      margin-left: 0;
      padding-left: 0;
    }

    .step-list li {
      counter-increment: step-counter;
      position: relative;
      padding-left: 28px;
      margin-bottom: 8px;
      color: #334155;
    }

    .step-list li::before {
      content: counter(step-counter);
      position: absolute;
      left: 0;
      top: 1px;
      width: 18px;
      height: 18px;
      background: #10b981;
      color: #ffffff;
      border-radius: 50%;
      font-size: 7.5pt;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      line-height: 18px;
    }

    .badge {
      display: inline-block;
      padding: 2px 6px;
      font-size: 7pt;
      font-weight: 700;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .badge-green { background: #dcfce7; color: #15803d; }
    .badge-blue { background: #dbeafe; color: #1d4ed8; }
    .badge-amber { background: #fef3c7; color: #b45309; }
    .badge-red { background: #fee2e2; color: #b91c1c; }

    .code-snippet {
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 8pt;
      background: #f1f5f9;
      padding: 2px 5px;
      border-radius: 4px;
      color: #0f766e;
    }
  </style>
</head>
<body>

  <!-- COVER PAGE -->
  <div class="cover-page">
    <div class="cover-top">
      <span class="cover-badge">Enterprise Edition 2.5</span>
      <h1 class="cover-title">HR &amp; Payroll Management System</h1>
      <p class="cover-subtitle">Complete End-to-End Customer Operations Manual &amp; Menu-by-Menu User Guide</p>
    </div>

    <div class="cover-features">
      <div class="cover-feat-card">
        <h4>Pakistan Statutory Engine</h4>
        <p>FBR Finance Act 2026 salaried slabs (Tax Year 2027), optional high-income surcharge, EOBI, SESSI/PESSI provincial social security caps, and automated minimum wage checks.</p>
      </div>
      <div class="cover-feat-card">
        <h4>Multi-Channel Attendance</h4>
        <p>Windows Kiosk terminal, USB/LAN DigitalPersona fingerprint bridge, IP RTSP facial camera, and GPS mobile app with 2-minute anti-passback cooldown.</p>
      </div>
      <div class="cover-feat-card">
        <h4>7-Step Payroll Cycle</h4>
        <p>Automated Gross-to-Net engine linking leaves, daily rules, overtime, loans, revisions, and bank payment advice files (HBL, MCB, UBL, Alfalah, Meezan).</p>
      </div>
      <div class="cover-feat-card">
        <h4>Offboarding &amp; Gratuity</h4>
        <p>Statutory 30 days basic pay per year gratuity calculation, asset clearance gate, and automatic loan recovery on terminal settlement.</p>
      </div>
    </div>

    <div class="cover-footer">
      <div>
        <p>Organization: <strong>OneNet Solutions Pk.</strong></p>
        <p>System of Record: <strong>PostgreSQL Enterprise Architecture</strong></p>
        <p>Target Audience: <strong>HR Directors, Payroll Specialists, Line Managers &amp; Operations Auditors</strong></p>
      </div>
      <div style="text-align: right;">
        <p>Built-in tax slabs: <strong>Tax Year 2027 (from 1 July 2026)</strong></p>
        <p>Published: <strong>November 2026</strong></p>
      </div>
    </div>
  </div>

  <!-- TABLE OF CONTENTS -->
  <div class="page-break"></div>
  <h1>Document Table of Contents</h1>
  <div class="toc-container">
    <div class="toc-grid">
      <div class="toc-item"><span>1. System Architecture &amp; Data Flow</span><span>Page 3</span></div>
      <div class="toc-item"><span>2. Diagram 1: Flow of Data Between Screens</span><span>Page 3</span></div>
      <div class="toc-item"><span>3. Diagram 2: How a Punch Becomes a Paid Day</span><span>Page 5</span></div>
      <div class="toc-item"><span>4. Menu 1: Operations Dashboard (Step 12)</span><span>Page 9</span></div>
      <div class="toc-item"><span>5. Menu 2: Company Setup &amp; Master Data (Step 2)</span><span>Page 9</span></div>
      <div class="toc-item"><span>6. Menu 3: Statutory Settings &amp; FBR Tax Slabs (Step 1)</span><span>Page 11</span></div>
      <div class="toc-item"><span>7. Menu 4: Employee Directory &amp; Profiles (Step 3)</span><span>Page 13</span></div>
      <div class="toc-item"><span>8. Menu 5: Holiday Calendar (Step 4)</span><span>Page 14</span></div>
      <div class="toc-item"><span>9. Menu 6: Leave Management &amp; Approvals (Step 5)</span><span>Page 15</span></div>
      <div class="toc-item"><span>10. Menu 7: Attendance Register &amp; Needs Review (Step 7)</span><span>Page 16</span></div>
      <div class="toc-item"><span>11. Menu 8: Biometrics, Cameras &amp; Kiosk (Step 6)</span><span>Page 18</span></div>
      <div class="toc-item"><span>12. Menu 9: Loans &amp; Salary Advances (Step 8)</span><span>Page 19</span></div>
      <div class="toc-item"><span>13. Menu 10: Salary Revisions &amp; Increments (Step 9)</span><span>Page 19</span></div>
      <div class="toc-item"><span>14. Menu 11: Payroll Processing Engine (Step 10)</span><span>Page 21</span></div>
      <div class="toc-item"><span>15. Menu 12: Gratuity &amp; Final Settlement (Step 11)</span><span>Page 23</span></div>
      <div class="toc-item"><span>16. Supporting Modules: Assets, Recruitment &amp; Appraisals</span><span>Page 28</span></div>
      <div class="toc-item"><span>17. Statutory Outputs, Banking &amp; Accounting Journals</span><span>Page 29</span></div>
      <div class="toc-item"><span>18. Standard Operating Procedures (SOP Checklist)</span><span>Page 30</span></div>
    </div>
  </div>

  <h2>Executive System Overview</h2>
  <p>The <strong>OneNet HR &amp; Payroll Management System</strong> is engineered to eliminate manual spreadsheets and fragmented data silos across Pakistan enterprise operations. By interconnecting employee onboarding, multi-channel biometric attendance, statutory tax compliance, loan recoveries, and automated banking disbursements into a single immutable audit trail, the software ensures 100% compliance with Pakistani labor laws and tax ordinances.</p>
  
  <div class="callout callout-info">
    <strong>Core Operating Principle</strong>
    Every screen in the system serves a specific upstream or downstream data contract. The Operations Dashboard (Screen 12) reads from all transactional screens and writes nothing; Attendance exceptions in "Needs Review" strictly block the payroll cycle from locking until cleared; and Statutory Settings define mathematical baselines applied instantly across the entire roster.
  </div>

  <!-- SECTION 1: ARCHITECTURAL BLUEPRINTS -->
  <div class="page-break"></div>
  <h1>1. System Architectural Blueprints</h1>
  <p>The entire operation of the suite is governed by two foundational engineering diagrams: the <strong>Screen Data Interconnection Flow (Diagram 1)</strong> and the <strong>Attendance-to-Payroll Pipeline (Diagram 2)</strong>.</p>

  <h2>Diagram 1: Flow of Data Between Screens</h2>
  <p>This master diagram illustrates how statutory configurations, organizational hierarchies, employee demographics, time records, and monetary inputs seamlessly converge into the monthly payroll engine and produce legal reporting outputs.</p>

  <div class="diagram-container avoid-break">
    ${d1Base64 ? `<img src="data:image/jpeg;base64,${d1Base64}" class="diagram-img" alt="Diagram 1: Flow of Data Between Screens" />` : '<p><em>[Diagram 1 Embedded Image]</em></p>'}
    <div class="diagram-caption">Figure 1.1: BIN ISHAQ HR &amp; Payroll | Diagram 1: Flow Of Data Between Screens</div>
  </div>

  <h3>Key Flow Connections in Diagram 1:</h3>
  <ul>
    <li><strong>A. Set Up Once &rarr; B. People:</strong> Statutory Config (1) validates employee salaries against the Provincial Minimum Wage (PKR 37,000), while Company &amp; Master Data (2) supplies branches, departments, grades, and shifts for employee onboarding.</li>
    <li><strong>A. Set Up Once &rarr; D. Money &amp; 10. Payroll:</strong> Feeds the 30-day gratuity formula into Gratuity (11) and tax slabs, EOBI/PESSI ceilings, and 2x overtime multipliers into Payroll (10).</li>
    <li><strong>B. People &rarr; C. Time:</strong> Employee Directory (3) supplies biometric enrollment templates to Attendance Sources (6), shift rosters to Attendance (7), and hire dates to Leave Management (5).</li>
    <li><strong>C. Time &rarr; 10. Payroll:</strong> The locked Attendance Register (7) feeds payable workdays, unexcused absents, overtime hours, and late penalties directly into Payroll Step 2. Approved unpaid leaves from Leave Management (5) prorate salary deductions.</li>
    <li><strong>D. Money Inputs &rarr; 10. Payroll:</strong> Active loan monthly repayment installments (8) and approved salary increments (9) automatically deduct from or augment gross-to-net calculations.</li>
    <li><strong>10. Payroll &rarr; Outputs (E) &amp; Dashboard (12):</strong> Generates digital/PDF payslips, bank advice files, EOBI/PESSI returns, FBR withholding reports, and accounting journals, while updating the real-time Operations Dashboard.</li>
  </ul>

  <!-- DIAGRAM 2 -->
  <div class="page-break"></div>
  <h2>Diagram 2: How a Punch Becomes a Paid Day</h2>
  <p>This diagram establishes the rigorous state machine that transforms physical biometric readings, camera frames, and mobile GPS check-ins into verified paid attendance records.</p>

  <div class="diagram-container avoid-break">
    ${d2Base64 ? `<img src="data:image/jpeg;base64,${d2Base64}" class="diagram-img" alt="Diagram 2: How a Punch Becomes a Paid Day" />` : '<p><em>[Diagram 2 Embedded Image]</em></p>'}
    <div class="diagram-caption">Figure 1.2: BIN ISHAQ HR &amp; Payroll | Diagram 2: How A Punch Becomes A Paid Day</div>
  </div>

  <h3>The Step-by-Step Punch Lifecycle:</h3>
  <ol>
    <li><strong>Biometric Setup &amp; Device Registry:</strong> Every employee is enrolled with normalized face descriptor vectors, fingerprint templates, and dual English/Urdu legal consent. Physical devices and cameras are registered with specific branch locations and an 85% match confidence threshold (<span class="code-snippet">Euclidean distance &lt; 0.255</span>).</li>
    <li><strong>Multi-Channel Ingestion:</strong>
      <ul>
        <li><strong>Mobile App / Web:</strong> Checks GPS against the branch geofence radius. If outside radius or no GPS, the punch is diverted to <em>Needs Review</em> for managerial decision.</li>
        <li><strong>Fingerprint Reader:</strong> Validates against template through local USB/LAN bridge.</li>
        <li><strong>IP Camera (RTSP):</strong> Runs real-time face matching. If &ge; 85%, accepts punch. If low match, keeps frame for 30 days and alerts <em>Needs Review</em>.</li>
        <li><strong>Webcam Kiosk:</strong> Performs face recognition with active yaw liveness attestation, fallback to fingerprint or PIN.</li>
        <li><strong>Manual Entry:</strong> Tagged 'Manual'; requires line manager approval with reason and evidence within 3 working days.</li>
      </ul>
    </li>
    <li><strong>Anti-Passback Cooldown (2 Minutes):</strong> If the same employee triggers any reader within 120 seconds of their previous punch, the duplicate is ignored with a countdown cooldown warning, preventing accidental double punches.</li>
    <li><strong>Daily Classification Rules:</strong>
      <ul>
        <li><strong>15-Minute Grace Period:</strong> Shift starts at 09:00; punches up to 09:15 are marked on-time <em>Present</em>. Punches after 09:15 are marked <em>Late</em>.</li>
        <li><strong>Half Day:</strong> Triggered when total work duration is between 4 and 6 hours.</li>
        <li><strong>Absent:</strong> Recorded when no punch exists and no approved leave is on file.</li>
        <li><strong>Overtime:</strong> Automatically accumulated for approved time worked beyond 8 standard hours (480 mins).</li>
      </ul>
    </li>
    <li><strong>The "Lock the Month" Integrity Check:</strong> The system enforces that the monthly attendance register cannot be locked while any punch remains pending in <em>Needs Review</em>. Step 2 of the Payroll Engine only ingests a certified, locked register.</li>
  </ol>

  <!-- MENU-BY-MENU CHAPTERS -->
  <div class="page-break"></div>
  <h1>2. Complete Menu-by-Menu User Guide</h1>

  <!-- NAVIGATION -->
  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Finding your way: modules and mega menus</span>
      <span class="menu-step-badge">Navigation</span>
    </div>
    <p>The left menu shows <strong>Dashboard</strong> and five modules. Click a module to open its menu: a card with the related screens appears over the page you are on (the page stays underneath). Click a screen to open it; press <strong>ESC</strong> or the &times; to close the panel. Yellow numbers are pending work (leave requests, attendance corrections, loans, lifecycle requests); a red <strong>fix</strong> marks setup that is incomplete; <strong>Step 1&ndash;12</strong> matches the 12-step flow bar at the top of every page.</p>
    <table>
      <thead><tr><th>Module</th><th>Cards and screens</th></tr></thead>
      <tbody>
        <tr><td>People</td><td>Directory (Employee Directory, Employee Lifecycle) &middot; Talent (Recruitment, Performance) &middot; Resources (Asset Management)</td></tr>
        <tr><td>Time &amp; Attendance</td><td>Attendance (Attendance Register, Holiday Calendar) &middot; Leave (Leave Management) &middot; Devices (Biometric Devices &amp; Kiosks)</td></tr>
        <tr><td>Payroll</td><td>Processing (Payroll Processing) &middot; Adjustments (Loans &amp; Advances, Salary Revisions) &middot; Separation (Gratuity &amp; Settlement)</td></tr>
        <tr><td>Reports</td><td>People &amp; Time (Employee, Attendance, Leave) &middot; Pay &amp; Compliance (Payroll, Statutory) &middot; Control (Devices, Audit, CyberAP Archive)</td></tr>
        <tr><td>Setup &amp; Administration</td><td>Organization (Company &amp; Master Data, Master Data Lists) &middot; Rules &amp; Policy (Statutory Config &amp; Tax Slabs, <strong>Company Options &amp; Attendance Policy</strong>) &middot; System &amp; Data (Users, Roles &amp; Permissions, Data Backup, Data Import, Notifications)</td></tr>
      </tbody>
    </table>
    <p><strong>Fast lists:</strong> Attendance and Employee Directory open with their filters only. Choose a day (or <strong>Today</strong>), an employee, a department or a status (attendance), or search / choose a status or department (employees); records then appear 50 per page with Previous / Next. Long dropdowns (employees, departments, branches, users) have a search box: type part of a name or code. For longer periods use Reports.</p>
    <p>You only see the screens your role allows. On a phone, open the menu with the &#9776; button.</p>
    <p><strong>Jump to record (Ctrl+K):</strong> press Ctrl+K, type a name, employee code or CNIC and choose the employee: the Employee Directory opens filtered to that person (and, with permission to edit employees, their record opens for editing).</p>
    <p><strong>Employees in a web browser:</strong> an employee who signs in from a browser gets the employee self-service screens &mdash; the same as the phone app (today's status, attendance punch when allowed, leave, payslips, notices) &mdash; with a <strong>Change password</strong> button, not the HR portal.</p>
    <p><strong>Your own password:</strong> every user can change it in <strong>My Security &rarr; Change password</strong>: current password, then a new one of at least 12 characters (twice). Your other signed-in devices are signed out, and remembered devices ask for the MFA code again.</p>
    <p><strong>Signing out:</strong> after <strong>Logout</strong> the page reloads completely, so the next person on the same browser sees none of the previous user's data.</p>
    <p><strong>Saving is safe:</strong> when you create, approve or disburse a payroll run, add or edit an employee, add an attendance entry, decide a regularization, reject leave or delete a holiday, and the server refuses or the connection fails, a message tells you why and the screen does <em>not</em> pretend it saved; forms stay open with what you typed. A double click cannot create two payroll runs.</p>
    <p><strong>Security notes for administrators:</strong> two-step verification stays on the method that was enrolled &mdash; an account that uses an authenticator app cannot switch to an email code at sign-in (use an MFA reset if the phone is lost). A user account that is not linked to an employee sees only what its role permits (it has no "own records"). Employee photos must be JPEG, PNG, WebP or GIF images.</p>
    <p><strong>Dates:</strong> "today" is always your computer's own local date (earlier versions could show yesterday's date before 5 AM in Pakistan).</p>
  </div>

  <!-- MENU 1: DASHBOARD -->
  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Menu 1: Operations Dashboard</span>
      <span class="menu-step-badge">Step 12 of 12 &bull; Observation Layer</span>
    </div>
    <p><strong>Business Purpose:</strong> The primary command center providing real-time visibility across the enterprise workforce. It aggregates active headcount, daily punctuality, pending workflow queues, and financial payroll liability without modifying transactional data.</p>
    
    <h4>Key Metrics Displayed:</h4>
    <ul>
      <li><strong>Total Active Staff:</strong> Headcount currently on the payroll roster.</li>
      <li><strong>Today's Attendance Gauge:</strong> Real-time count of staff clocked In, Late arrivals, Approved Leaves, and Unexcused Absents.</li>
      <li><strong>Action Items Requiring Decision:</strong> Number of pending leave applications, manual attendance regularizations, and loan requests.</li>
      <li><strong>Estimated Monthly Payroll Liability:</strong> Projected Gross Pay, Total Statutory Deductions, and Net Bank Disbursement.</li>
    </ul>

    <div class="callout callout-statutory">
      <strong>Operator Rule</strong>
      The dashboard never computes arbitrary numbers of its own. If any number appears incorrect, the adjustment must be made in the corresponding operational screen (e.g., Attendance Register, Leave Management, or Employee Directory).
    </div>
  </div>

  <!-- MENU 2: COMPANY & MASTER DATA -->
  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Menu 2: Company Setup &amp; Master Data</span>
      <span class="menu-step-badge">Step 2 of 12 &bull; Foundation</span>
    </div>
    <p><strong>Business Purpose:</strong> Defines the legal identity of the enterprise and establishes standardized hierarchy lists used across employee onboarding, attendance geofencing, and cost-center payroll registers.</p>

    <h4>Operational Walkthrough:</h4>
    <ol class="step-list">
      <li><strong>Company Identity:</strong> Enter Legal Entity Name (e.g., <em>OneNet Solutions Pk.</em>), NTN (National Tax Number), STRN (Sales Tax Registration), and EOBI/SESSI corporate registration IDs.</li>
      <li><strong>Branches &amp; Geofencing:</strong> Configure operational locations (e.g., Karachi Head Office, Lahore Hub). Specify Branch Province (Sindh, Punjab, KPK, Balochistan), GPS Latitude/Longitude coordinates, and geofence radius (meters) for mobile punch authorization.</li>
      <li><strong>Departments &amp; Designations:</strong> Build corporate organizational charts. Designations can be assigned seniority grades (e.g., A1, M2) for compensation benchmarking.</li>
      <li><strong>Shift Schedules:</strong> Define standard work hours, daily grace period (default 15 mins), and night-shift flags that cross midnight.</li>
      <li><strong>Wage Types:</strong> Configure compensation classifications: Monthly Salaried vs. Daily Wager.</li>
    </ol>
  </div>

  <!-- MENU 3: STATUTORY CONFIG & FBR TAX SLABS -->
  <div class="page-break"></div>
  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Menu 3: Statutory Settings &amp; FBR Tax Slabs</span>
      <span class="menu-step-badge">Step 1 of 12 &bull; Statutory Foundation</span>
    </div>
    <p><strong>Business Purpose:</strong> Houses the statutory tax matrices and social insurance parameters governing all monthly gross-to-net payroll deductions across Pakistan.</p>

    <h4>Built-in FBR Salaried Tax Slabs (Finance Act 2026, Tax Year 2027, from 1 July 2026):</h4>
    <p>Income Tax Ordinance, 2001, First Schedule, Part I, Division I (salaried individuals); Finance Act 2026 rates. This is the table the program ships with; tax rates change with every Finance Act, so <strong>check them against FBR every year</strong>.</p>

    <table>
      <thead>
        <tr>
          <th>Slab #</th>
          <th>Annual Taxable Income Range (PKR)</th>
          <th>Fixed Base Tax</th>
          <th>Tax Rate on Excess</th>
          <th>Formula Description</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Slab 1</strong></td>
          <td>Rs. 0 &ndash; 600,000</td>
          <td>Rs. 0</td>
          <td>0%</td>
          <td>Nil</td>
        </tr>
        <tr>
          <td><strong>Slab 2</strong></td>
          <td>Rs. 600,001 &ndash; 1,200,000</td>
          <td>Rs. 0</td>
          <td>1%</td>
          <td>1% of the amount exceeding Rs. 600,000</td>
        </tr>
        <tr>
          <td><strong>Slab 3</strong></td>
          <td>Rs. 1,200,001 &ndash; 2,200,000</td>
          <td>Rs. 6,000</td>
          <td>11%</td>
          <td>Rs. 6,000 + 11% of the amount exceeding Rs. 1,200,000</td>
        </tr>
        <tr>
          <td><strong>Slab 4</strong></td>
          <td>Rs. 2,200,001 &ndash; 3,200,000</td>
          <td>Rs. 116,000</td>
          <td>20%</td>
          <td>Rs. 116,000 + 20% of the amount exceeding Rs. 2,200,000</td>
        </tr>
        <tr>
          <td><strong>Slab 5</strong></td>
          <td>Rs. 3,200,001 &ndash; 4,100,000</td>
          <td>Rs. 316,000</td>
          <td>25%</td>
          <td>Rs. 316,000 + 25% of the amount exceeding Rs. 3,200,000</td>
        </tr>
        <tr>
          <td><strong>Slab 6</strong></td>
          <td>Rs. 4,100,001 &ndash; 5,600,000</td>
          <td>Rs. 541,000</td>
          <td>29%</td>
          <td>Rs. 541,000 + 29% of the amount exceeding Rs. 4,100,000</td>
        </tr>
        <tr>
          <td><strong>Slab 7</strong></td>
          <td>Rs. 5,600,001 &ndash; 7,000,000</td>
          <td>Rs. 976,000</td>
          <td>32%</td>
          <td>Rs. 976,000 + 32% of the amount exceeding Rs. 5,600,000</td>
        </tr>
        <tr>
          <td><strong>Slab 8</strong></td>
          <td>Exceeding Rs. 7,000,000</td>
          <td>Rs. 1,424,000</td>
          <td>35%</td>
          <td>Rs. 1,424,000 + 35% of the amount exceeding Rs. 7,000,000</td>
        </tr>
      </tbody>
    </table>

    <div class="callout callout-warning">
      <strong>High-income surcharge (Section 4AB) &mdash; only if you set it</strong>
      No surcharge is added by default (rate 0). If the Finance Act for the year sets one, enter the <strong>Surcharge rate (% of tax)</strong> and the income threshold in Statutory Settings &rarr; Salary tax rules; it is then added to the tax of employees above that threshold.
    </div>

    <div class="callout callout-statutory">
      <strong>Existing companies keep their own slabs</strong>
      New installations start with the table above. A company that already has slabs keeps them unchanged until someone clicks <strong>Update from FBR</strong> and a second authorized user approves the proposal.
    </div>

    <h4>Social Security &amp; Minimum Wage Parameters:</h4>
    <ul>
      <li><strong>Government Minimum Wage:</strong> PKR 37,000 per month (used as baseline for EOBI contributions and statutory wage check).</li>
      <li><strong>EOBI Contributions:</strong> Employee pays 1% of minimum wage (PKR 370/mo); Employer pays 5% (PKR 1,850/mo).</li>
      <li><strong>Provincial Social Security (SESSI / PESSI):</strong> Employer contributes 6% of basic earnings up to the configured statutory wage ceiling (PKR 40,000).</li>
      <li><strong>Statutory Overtime:</strong> Standard 208 working hours/month; Overtime hours compensated at 2.0x normal basic hourly rate.</li>
    </ul>

    <h4>Built-In UI Controls:</h4>
    <ul>
      <li><strong>"Download CSV":</strong> Generates an official spreadsheet export of the active FBR tax table.</li>
      <li><strong>"Update from FBR":</strong> does not go online. It proposes the built-in Tax Year 2027 table (above) in place of your slabs; a second person must approve it before payroll uses it.</li>
    </ul>

    <div class="callout callout-warning">
      <strong>Change control: saved as you type, approved by a second person</strong>
      Statutory settings and Company Options &amp; Attendance Policy have no Save button: values are kept as you type, and once you pause typing the pending proposal is written to the server (so a burst of edits makes one audit entry, not one per key). Payroll keeps the live rates until a different authorized user approves the proposal.
    </div>
  </div>

  <!-- MENU 4: EMPLOYEE DIRECTORY -->
  <div class="page-break"></div>
  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Menu 4: Employee Directory &amp; Onboarding</span>
      <span class="menu-step-badge">Step 3 of 12 &bull; Personnel Roster</span>
    </div>
    <p><strong>Business Purpose:</strong> Manages master employee personnel files, statutory tax exemptions, CNIC identity records, salary structures, and Pakistani banking details.</p>

    <h4>Step-by-Step Onboarding Instructions:</h4>
    <ol class="step-list">
      <li>Select <strong>"Add Employee"</strong> to launch the onboarding modal.</li>
      <li><strong>Identity:</strong> Input Full Name, Employee Code, CNIC (formatted as <span class="code-snippet">42101-1234567-1</span>), Mobile Number, and Personal Email. Type the mobile number in any common form (<span class="code-snippet">+92 321 4444444</span>, <span class="code-snippet">0321-4444444</span>, <span class="code-snippet">3214444444</span>); it is tidied to <span class="code-snippet">+923XXXXXXXXX</span> when you leave the field.</li>
      <li><strong>Date of Joining:</strong> defaults to today; change it to the real joining date. Payroll (part-month pay), leave entitlement, gratuity and length of service all count from this date. It can be corrected later in Edit Employee.</li>
      <li><strong>Hierarchy Assignment:</strong> Select Company Branch, Department, Designation, and Shift. The branch selection determines the employee's provincial social security jurisdiction (e.g., SESSI in Sindh, PESSI in Punjab).</li>
      <li><strong>Compensation Structure:</strong> Input Basic Contract Salary. The system automatically structures standard allowances:
        <ul>
          <li><strong>Base Basic Wage:</strong> 50%</li>
          <li><strong>House Rent Allowance:</strong> 30%</li>
          <li><strong>Conveyance Allowance:</strong> 10%</li>
          <li><strong>Medical Allowance:</strong> 10%</li>
          <li><em>Or input custom negotiated allowances directly.</em></li>
        </ul>
      </li>
      <li><strong>Statutory Opt-Ins:</strong> Check eligibility for FBR Income Tax withholding, EOBI, Provincial Social Security, and Provident Fund (with employee contribution %).</li>
      <li><strong>Banking Advice:</strong> Select Pakistani Bank (HBL, MCB, UBL, Alfalah, Meezan, etc.), Bank Account Number, and 24-character Pakistani IBAN (<span class="code-snippet">PK...</span>). The IBAN may be typed with spaces or in small letters; it is saved in capitals without spaces and checked with the international IBAN check digits, so a mistyped IBAN is refused (<em>This IBAN is not valid: its check digits do not match&hellip;</em>).</li>
      <li>Save the record. The employee is now active and immediately eligible for attendance and payroll inclusion.</li>
    </ol>
    <p><strong>Editing an employee:</strong> the form also holds Father's Name, Blood Group, Religion and Present / Permanent Address. Employees imported from CyberAP show an <em>Imported from CyberAP</em> box: their CyberAP ID, notes, salary heads, per-day allowance rates, and amber warnings when the salary was WITHHELD in CyberAP or CyberAP had no real basic salary (load salaries with Salary Revisions &rarr; Upload salary sheet).</p>
    <p><strong>Salary on the edit form:</strong> with two-person control on (full edition), an existing employee's salary is read-only in Edit Employee, with the note <em>Change salary through Salary Revisions (needs a second approver)</em>. Use Menu 10. New employees still get their salary on the add form. The edit form also refuses a CNIC that already belongs to another employee.</p>
  </div>

  <!-- MENU 5: HOLIDAY CALENDAR -->
  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Menu 5: Holiday Calendar</span>
      <span class="menu-step-badge">Step 4 of 12 &bull; Time Foundation</span>
    </div>
    <p><strong>Business Purpose:</strong> Tracks federal gazetted public holidays and corporate foundation days. When payroll runs, paid non-working days are automatically credited.</p>

    <h4>Key Operational Rules:</h4>
    <ul>
      <li><strong>Non-Deduction from Leaves:</strong> If an approved leave request spans across a gazetted holiday (e.g., Pakistan Day on March 23), the holiday is **not deducted** from the employee's annual or casual leave balance.</li>
      <li><strong>Paid Attendance Credit:</strong> Employees scheduled to work on a gazetted holiday are marked with status <span class="badge badge-green">Holiday</span> and receive full pay without requiring manual time punches.</li>
      <li><strong>Recurring annually:</strong> a recurring holiday (14 August, 23 March, 25 December) counts every year from the year it was entered onwards. Do not mark moon-based holidays (Eid, Ashura) as recurring.</li>
      <li><strong>Optional holidays:</strong> not a day off for everyone. Staff who take one apply for leave for that day; everyone else works and is paid normally.</li>
    </ul>
  </div>

  <!-- MENU 6: LEAVE MANAGEMENT -->
  <div class="page-break"></div>
  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Menu 6: Leave Management &amp; Approvals</span>
      <span class="menu-step-badge">Step 5 of 12 &bull; Absence Governance</span>
    </div>
    <p><strong>Business Purpose:</strong> Manages employee leave applications, supervisor approvals, balance tracking, and encashment reconciliations.</p>

    <h4>Leave Categories Supported:</h4>
    <table>
      <thead>
        <tr>
          <th>Leave Type</th>
          <th>Annual Entitlement</th>
          <th>Pay Status</th>
          <th>Payroll Deduction Impact</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Casual Leave</strong></td>
          <td>10 Days</td>
          <td>100% Paid</td>
          <td>No salary deduction; maintains full monthly gross.</td>
        </tr>
        <tr>
          <td><strong>Sick / Medical Leave</strong></td>
          <td>8 Days</td>
          <td>100% Paid</td>
          <td>No salary deduction upon supervisor medical approval.</td>
        </tr>
        <tr>
          <td><strong>Annual / Earned Leave</strong></td>
          <td>14 Days</td>
          <td>100% Paid</td>
          <td>Eligible for encashment upon resignation or year-end.</td>
        </tr>
        <tr>
          <td><strong>Unpaid Leave (LWP)</strong></td>
          <td>As approved</td>
          <td>Unpaid</td>
          <td>Deducts the monthly package (basic + allowances) per unpaid day on the configured absence basis, e.g. <span class="code-snippet">(Monthly Package / Total Days in Month) &times; Unpaid Days</span>. With the "Scheduled Working Days" basis, weekly offs and holidays inside a leave are not charged.</td>
        </tr>
      </tbody>
    </table>

    <h4>Supervisor Approval Workflow:</h4>
    <ol class="step-list">
      <li>Employee submits leave via mobile app or web portal specifying type, dates, and reason.</li>
      <li>HR or Line Manager receives alert under <strong>"Pending Leave Requests"</strong>.</li>
      <li>Manager reviews quota balance and selects <strong>Approve</strong> or <strong>Reject</strong>. Nobody can approve or reject their own leave (full edition): both buttons are disabled on your own request.</li>
      <li>Approved leave immediately reflects on the Attendance Stream as <span class="badge badge-blue">On Leave</span>, protecting the employee from unexcused absence penalties.</li>
    </ol>
    <p><strong>Add Leave Record (HR records leave directly):</strong> the leave balance is checked the same way as for an approval. If the server refuses (for example not enough balance), the message is shown and the form stays open so you can correct it. A recorded approved leave also marks those days <span class="badge badge-blue">On Leave</span> in attendance, like a normal approval.</p>
  </div>

  <!-- MENU 7: ATTENDANCE & INGESTION -->
  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Menu 7: Attendance Register &amp; Needs Review</span>
      <span class="menu-step-badge">Step 7 of 12 &bull; Time &amp; Attendance</span>
    </div>
    <p><strong>Business Purpose:</strong> Central ingestion clearinghouse for all digital attendance records, shift grace evaluations, overtime tracking, and exception regularizations.</p>

    <h4>Daily Evaluation Rules:</h4>
    <ul>
      <li><strong>15-Minute Grace Window:</strong> Shift starts at 09:00 AM. Punch-ins between 09:00:01 and 09:15:00 are marked <span class="badge badge-green">Present</span>. Punch-ins at 09:15:01 or later are classified as <span class="badge badge-amber">Late</span>.</li>
      <li><strong>Half-Day Calculation:</strong> If total hours worked between Punch-In and Punch-Out are under 4 hours, status updates to <span class="badge badge-amber">Half Day</span>.</li>
      <li><strong>Overtime Engine:</strong> Working hours exceeding 8 hours (480 mins) are stored in <span class="code-snippet">overtimeMinutes</span> and converted to hours for 2x overtime payroll compensation.</li>
      <li><strong>Night shifts, Fridays and Ramadan (also at the kiosk):</strong> a punch-out after midnight closes the previous day's shift; punches between midnight and 5 AM get the correct date; the employee's Friday and Ramadan timings apply to kiosk punches too.</li>
    </ul>

    <h4>The "Needs Review" Queue:</h4>
    <p>Punches with missing checkout, off-site mobile GPS punches, or employee manual regularization claims appear in the <strong>Needs Review</strong> panel. HR managers can inspect evidence and select <strong>Approve</strong> or <strong>Decline</strong>. If the server refuses the decision (month locked, still inside the line manager's 3-day window, or no permission), a message explains why and nothing changes on screen.</p>

    <div class="callout callout-warning">
      <strong>Payroll Blocker</strong>
      The system will <strong>refuse to lock or create a payroll run</strong> if any attendance record remains unreviewed for that period. All pending exceptions must be cleared first.
    </div>
  </div>

  <!-- MENU 8: BIOMETRIC DEVICES & KIOSK -->
  <div class="page-break"></div>
  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Menu 8: Biometrics, Cameras &amp; Kiosk Terminal</span>
      <span class="menu-step-badge">Step 6 of 12 &bull; Physical Ingestion</span>
    </div>
    <p><strong>Business Purpose:</strong> Connects physical reception hardware, USB fingerprint readers, and IP cameras to the attendance stream.</p>

    <h4>Supported Ingestion Channels:</h4>
    <ul>
      <li><strong>Desktop Kiosk Terminal:</strong> Runs full-screen on Windows at reception. Employs continuous camera stream with active face tracking, MediaPipe landmarks, and yaw-rotation liveness detection.</li>
      <li><strong>DigitalPersona URU 4500 USB Reader:</strong> Communicates via background C# bridge service (<span class="code-snippet">tools/uru4500-bridge</span>) capturing ANSI-378 biometric minutiae templates.</li>
      <li><strong>IP RTSP Camera:</strong> Direct stream ingestion for entrance gates with automatic face recognition matching against enrolled employee vectors.</li>
      <li><strong>2-Minute Anti-Passback Cooldown:</strong> Enforces a strict 120-second timer between consecutive punches. Prevents accidental double-swipes or buddy-punching duplicates.</li>
    </ul>
    <div class="callout callout-warning">
      <strong>Kiosk security (admin PIN and locked window)</strong>
      The first time Settings is opened, the kiosk asks you to set an <strong>admin PIN</strong> (6 to 12 digits; keep it safe; <em>Change PIN</em> in Settings). After that the PIN is needed to open or save Settings, Exit, clear the local attendance cache, register or remove the device key, and test an IP camera. 5 wrong PINs lock it for 30 seconds, doubling up to 15 minutes (the lock survives a restart); the admin session ends after 5 idle minutes or when Settings closes. The window is locked: no menu, DevTools, reload, Alt+F4 or other shortcuts, no navigating away; it closes only through Exit with the PIN or Windows shutdown / log-off (developers: <span class="code-snippet">KIOSK_DEVTOOLS=1</span>).
    </div>
    <ul>
      <li><strong>Face camera:</strong> the default is the single-person 1-on-1 mode with the liveness head-turn. <em>Multi-Face</em> (several people at once) is off by default; switch it on in Settings (<em>Allow Multi-Face walk-through mode</em>, with a warning). Multi-face punches have no liveness check, so every one goes to Needs Review.</li>
      <li><strong>Employee-code punches</strong> are recorded as <em>RFID/code</em> punches, never as fingerprint or face.</li>
      <li><strong>Clock checks:</strong> a punch goes to Needs Review when the kiosk clock is more than 10 minutes wrong, or when a punch saved offline arrives more than 12 hours late. Keep the kiosk PC's date, time and time zone correct (Pakistan, automatic time). A kiosk cannot overwrite attendance HR has corrected; it can still add the punch-out.</li>
      <li><strong>Fingerprint bridge:</strong> the kiosk starts its own <span class="code-snippet">URU4500Bridge.exe</span> with a secret and checks it before use. An older bridge installed as a service is refused until replaced with the new one from the kiosk package (or <em>Allow unverified fingerprint bridge</em> is switched on &mdash; not recommended). For web enrollment in Chrome/Edge, put <span class="code-snippet">allowed-origins.txt</span> next to the bridge with the portal address exactly as in the address bar, without a path (e.g. <span class="code-snippet">https://hr.company.com</span>), one per line, and restart the bridge. The Windows desktop app needs nothing.</li>
      <li><strong>Server address:</strong> plain <span class="code-snippet">http://</span> only for an IP address (e.g. <span class="code-snippet">http://192.168.1.10:8080</span>) or localhost; names such as HEADOFFICE or *.local need <span class="code-snippet">https://</span> (run Enable-Https.ps1 on the Windows server and install its CA on the kiosk PC). A name typed without http/https is treated as https. Setup codes made on a plain-http Windows server contain its IP address automatically.</li>
      <li><strong>Android app:</strong> its data is not backed up and cannot be transferred to another phone; sign in again on a new device.</li>
    </ul>
    <p><strong>Registering a kiosk PC:</strong> in User Management &rarr; Kiosk terminals, click <strong>Create setup code</strong>, copy the code (shown once) and paste it on the kiosk PC under Settings &rarr; Server Registration &rarr; Setup code. Alternatively sign in there once with a Kiosk Terminal account. The Kiosk terminals list shows the account name for every kiosk, including those registered with a setup code.</p>
  </div>

  <!-- MENU 9: LOANS & ADVANCES -->
  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Menu 9: Loans &amp; Salary Advances</span>
      <span class="menu-step-badge">Step 8 of 12 &bull; Financial Inputs</span>
    </div>
    <p><strong>Business Purpose:</strong> Disburses and manages corporate employee loans and emergency salary advances, with automated monthly payroll deductions.</p>

    <h4>Operating Procedure:</h4>
    <ol class="step-list">
      <li>Create loan record: specify Employee, Type (Company Loan or Salary Advance), Principal Amount, Monthly Installment, and Repayment Tenure (months).</li>
      <li><strong>Two-person approval:</strong> the system records who entered the application. A <em>different</em> authorized user selects <strong>Approve</strong> or <strong>Reject</strong>; the person who entered it cannot decide it, and an employee cannot decide their own loan. Approving cannot change the amount or number of installments. In the Lite edition (no maker-checker) one owner may do both.</li>
      <li>After approval the loan's terms are fixed. Once active, the system deducts the monthly installment from the employee's payslip in every payroll run. A loan approved after the end of a payroll month is not deducted in that month.</li>
      <li>Repayment only moves forward when that salary is <strong>disbursed</strong>: the system then adds to the repaid amount and reduces <span class="code-snippet">remainingInstallments</span>. Each payslip records exactly which loans it deducted and how much, and an installment never exceeds what is still owed.</li>
      <li>If an employee leaves before full repayment, the remaining unpaid balance is automatically recovered from their final gratuity settlement.</li>
    </ol>
  </div>

  <!-- MENU 10: SALARY REVISIONS -->
  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Menu 10: Salary Revisions &amp; Increments</span>
      <span class="menu-step-badge">Step 9 of 12 &bull; Compensation Adjustments</span>
    </div>
    <p><strong>Business Purpose:</strong> Tracks annual performance increments, promotion adjustments, and grade band revisions before running payroll.</p>
    <ul>
      <li>Records Old Basic Salary, New Basic Salary, Effective Date, and Appraisal Reference.</li>
      <li>Every draft records who prepared it, and the preparer cannot approve it &mdash; including drafts created automatically from approved performance reviews.</li>
      <li>The payroll engine checks effective dates and applies revised salary structures automatically. A back-dated revision creates arrears that count each past month once. In the full edition this is the only way to change an existing employee's salary.</li>
      <li><strong>Upload salary sheet</strong> (many employees at once, e.g. after a CyberAP migration): download the template (current staff, those without a salary first), fill the <em>Basic Salary</em> column in Excel, save as CSV and upload. The preview shows each row as <em>Draft revision</em> or the reason it is skipped (unknown code, blank, same salary, employee has left). Each usable row becomes a draft revision.</li>
      <li><strong>Approve all drafts</strong> approves every draft another user prepared, one by one, and updates each basic salary. With maker-checker on, the person who uploaded the sheet cannot approve it.</li>
    </ul>
  </div>

  <!-- MENU 11: PAYROLL PROCESSING ENGINE -->
  <div class="page-break"></div>
  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Menu 11: Payroll Processing Engine</span>
      <span class="menu-step-badge">Step 10 of 12 &bull; The Core Engine</span>
    </div>
    <p><strong>Business Purpose:</strong> Executes the monthly payroll calculation, freezing attendance, applying progressive statutory tax withholding, recovering loan installments, and generating bank payment files.</p>

    <h4>The 7-Step Payroll Processing Cycle:</h4>
    <ol class="step-list">
      <li><strong>Period Selection:</strong> Choose Payroll Month and Year. The system verifies that no duplicate cycle exists for the period.</li>
      <li><strong>Attendance Verification:</strong> Ingests the locked attendance register. Verifies payable days, unpaid leaves, and overtime hours.</li>
      <li><strong>Money Inputs Ingestion:</strong> Ingests approved salary revisions, active loan installments, and terminal settlements.</li>
      <li><strong>Gross-to-Net Computation:</strong> Simulates gross earnings, FBR tax withholding, EOBI, PESSI, Provident Fund, and Net Pay for all eligible employees.</li>
      <li><strong>Draft Creation &amp; Dual Approval:</strong> <em>Run New Payroll Cycle</em> is disabled while it works, so a double click cannot create two runs. A different user reviews the draft register and selects <strong>Approve</strong>, which freezes the calculations.</li>
      <li><strong>Disbursement Authorization:</strong> Once bank funds are transferred, select <strong>Mark Disbursed</strong> to finalize the cycle. Loan repayments are recorded at this step.</li>
      <li><strong>Output Delivery:</strong> Generate individual digital payslips, download bank advice CSVs, and export statutory schedules.</li>
    </ol>
    <div class="callout callout-statutory">
      <strong>Payroll Preview after a run</strong>
      Once a month has a payroll run that is not cancelled, the Payroll Preview shows the payslips that run saved &mdash; the same amounts as the bank file. Only staff who are not in that run are calculated live. (Earlier versions recalculated the preview, which could disagree with the run.)
    </div>

    <h4>Mathematical Gross-to-Net Breakdown:</h4>
    <table>
      <thead>
        <tr>
          <th>Component</th>
          <th>Calculation Formula</th>
          <th>Statutory / Legal Basis</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Gross Salary</strong></td>
          <td>Basic + House Rent + Conveyance + Medical + Other + Overtime Pay &minus; Unpaid Leave Deduction (allowances are reduced for absence and for joiners / leavers in the same proportion as basic)</td>
          <td>Employment Contract</td>
        </tr>
        <tr>
          <td><strong>Overtime Pay</strong></td>
          <td><span class="code-snippet">(Basic / 208 hrs) &times; Overtime Hours &times; 2.0</span></td>
          <td>Factories Act, 1934</td>
        </tr>
        <tr>
          <td><strong>FBR Income Tax</strong></td>
          <td>Project the recurring taxable salary for the year &rarr; apply the 8 progressive slabs (+ surcharge only if configured) &rarr; monthly withholding. One-off taxable bonuses are taxed in the month paid (not projected as if repeated); manual Tax Adjustments count as tax already deducted.</td>
          <td>ITO 2001, 1st Sched Part I Div I</td>
        </tr>
        <tr>
          <td><strong>EOBI Employee</strong></td>
          <td><span class="code-snippet">Minimum Wage (PKR 37,000) &times; 1% = PKR 370 / month</span></td>
          <td>EOBI Act, 1976</td>
        </tr>
        <tr>
          <td><strong>EOBI Employer</strong></td>
          <td><span class="code-snippet">Minimum Wage (PKR 37,000) &times; 5% = PKR 1,850 / month</span></td>
          <td>EOBI Act, 1976</td>
        </tr>
        <tr>
          <td><strong>Social Security (PESSI)</strong></td>
          <td><span class="code-snippet">min(Basic, PKR 40,000) &times; 6% = max PKR 2,400 / month</span></td>
          <td>Provincial Social Security Act</td>
        </tr>
        <tr>
          <td><strong>Net Pay</strong></td>
          <td>Gross Salary &minus; (Tax + EOBI + PF + Loan Installment)</td>
          <td>Bank Advice Payout</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- MENU 12: GRATUITY & FINAL SETTLEMENT -->
  <div class="page-break"></div>
  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Menu 12: Gratuity &amp; Final Settlement</span>
      <span class="menu-step-badge">Step 11 of 12 &bull; Terminal Settlement</span>
    </div>
    <p><strong>Business Purpose:</strong> Computes legal end-of-service settlements for exiting personnel in accordance with Pakistani labor laws.</p>

    <h4>Statutory Gratuity Formula:</h4>
    <p>Under the Industrial and Commercial Employment (Standing Orders) Ordinance, 1968, employees with continuous service of 1 year or more are entitled to 30 days basic wages for every completed year of service:</p>
    
    <div class="callout callout-statutory">
      <strong>Gratuity Calculation Formula</strong>
      <span class="code-snippet">Gratuity = (Completed Years of Service) &times; (Last Drawn Basic Salary) &times; (30 / 30)</span>
      <p style="margin-top: 4px; font-size: 8pt;">Pro-rated for fractions of service exceeding 6 months. Service is counted from the employee's Date of Joining up to and including the last working day, so someone who worked exactly 5 years gets 5 years.</p>
    </div>

    <h4>Terminal Settlement Checklist:</h4>
    <ul>
      <li><strong>(+) Statutory Gratuity:</strong> Calculated based on tenure and final basic wage.</li>
      <li><strong>(+) Unpaid Days:</strong> Pro-rated salary for workdays completed in the exit month.</li>
      <li><strong>(+) Leave Encashment:</strong> Cash payment for unutilized annual leave balances.</li>
      <li><strong>(+) Notice Period Pay:</strong> Paid if company waives contractual notice.</li>
      <li><strong>(&minus;) Asset Clearances:</strong> Physical return of issued laptops, mobile phones, security keys. While any asset is still assigned to the employee, the final settlement cannot be processed or paid.</li>
      <li><strong>(&minus;) Loan Balance Recovery:</strong> Any remaining unpaid loan principal is deducted directly from the final check.</li>
    </ul>
  </div>

  <!-- REPORTS -->
  <div class="page-break"></div>
  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Reports: Employee, Attendance, Payroll, Statutory, Leave, Devices, Audit &amp; CyberAP Archive</span>
      <span class="menu-step-badge">History on demand</span>
    </div>
    <p><strong>Business Purpose:</strong> The daily screens keep only the working set so they stay fast, even with years of imported history: current staff (plus former staff who left in the last two months, or still have an unpaid settlement, an open loan or a pending lifecycle request) and the current and previous month of attendance. In Employee Directory, the "Terminated" filter therefore shows recent leavers only; use Reports &rarr; Employee directory with status "Left" or "Everyone" for all former staff. Everything older or larger is a report: the server reads it when you open the report, for any period, and you can download it as CSV (opens in Excel, Urdu names included) or print it / save it as PDF.</p>

    <h4>How to run a report:</h4>
    <ol class="step-list">
      <li>Open <strong>Reports &rarr; Employee Reports</strong> or <strong>Reports &rarr; Attendance Reports</strong> in the menu and pick a report. It runs at once with sensible defaults (usually this month).</li>
      <li>Set the filters: period (today, this month, last month, this year, last year or custom dates), branch, department, designation, zone, UC / town, and one employee (the employee search also finds former staff).</li>
      <li>Press <strong>Show</strong>. Results come 100 rows per page; totals at the bottom cover all pages.</li>
      <li><strong>CSV</strong> downloads every row; <strong>Print / PDF</strong> opens a printable page (up to 500 rows, landscape for wide reports). Every CSV download is recorded in the audit log.</li>
    </ol>

    <h4>Employee reports:</h4>
    <table>
      <thead><tr><th>Report</th><th>What it shows</th></tr></thead>
      <tbody>
        <tr><td>Employee directory</td><td>Every employee with job, place and contact details; filter by status (current staff, left, everyone) or name / code / CNIC.</td></tr>
        <tr><td>Headcount by group</td><td>Employees per branch, department, designation, zone, UC / town, supervisor or gender, split into active, on leave, suspended and left.</td></tr>
        <tr><td>Joiners and leavers</td><td>Who joined or left in a period, with separation type and reason.</td></tr>
        <tr><td>Missing or invalid data</td><td>Current staff with an invalid CNIC, no bank account, no real salary, no date of birth, designation or contact number.</td></tr>
        <tr><td>Upcoming expiries</td><td>CNIC expiry, contract end and unconfirmed probation end dates in a period (default: next 60 days).</td></tr>
      </tbody>
    </table>

    <h4>Attendance reports:</h4>
    <table>
      <thead><tr><th>Report</th><th>What it shows</th></tr></thead>
      <tbody>
        <tr><td>Daily attendance</td><td>Every current employee on one day: present, late, absent, on leave, holiday or no record yet, with punch times and a count per status.</td></tr>
        <tr><td>Monthly register (muster roll)</td><td>One line per employee, one column per day (P present, L late, HD half day, A absent, LV leave, H holiday) with monthly totals and overtime.</td></tr>
        <tr><td>Attendance summary</td><td>Per employee for any period, up to the whole imported history: present, late, half days, absent, leave, holidays, days recorded, overtime hours.</td></tr>
        <tr><td>Late arrivals / Absentees</td><td>Every late or absent day in a period (up to 400 days for all staff; any period for one employee).</td></tr>
        <tr><td>Overtime</td><td>Overtime hours and days per employee in a period.</td></tr>
        <tr><td>Missing punch-out</td><td>Past days with a punch-in but no punch-out, to correct before payroll.</td></tr>
        <tr><td>Attendance log (detailed)</td><td>Every day with punches, method, terminal branch, overtime, review state and source (CyberAP for imported days). Up to 62 days for all staff; choose one employee for their full history.</td></tr>
        <tr><td>Mobile duty and field visits</td><td>Days punched from the mobile app or with field visits: location check, distance from the branch and number of visits.</td></tr>
      </tbody>
    </table>

    <h4>Payroll reports:</h4>
    <table>
      <thead><tr><th>Report</th><th>What it shows</th></tr></thead>
      <tbody>
        <tr><td>Payroll register</td><td>Every payslip of a month: paid days, basic, allowances, overtime, gross, income tax, EOBI, provident fund, loan, total deductions and net, with totals.</td></tr>
        <tr><td>Payslip history</td><td>Payslips over any period, for one employee or everyone.</td></tr>
        <tr><td>Bank transfer sheet</td><td>Net pay with bank, account number and IBAN; employees without a bank account are marked "Cash / cheque".</td></tr>
        <tr><td>Salary cost by group</td><td>Per branch, department or designation: employees paid, gross, tax, employer EOBI, social security and provident fund, net and total employer cost.</td></tr>
        <tr><td>Loans and advances</td><td>Amount, monthly installment, installments left, repaid and balance; open loans by default.</td></tr>
        <tr><td>Salary revisions</td><td>Increments and promotions effective in a period, with old and new salary.</td></tr>
        <tr><td>Gratuity and final settlements</td><td>Gratuity, leave encashment, notice pay, pending salary, total and payment status by separation date.</td></tr>
      </tbody>
    </table>
    <p>Payslips keep the name, department and branch as they were in that month, so old payroll reports stay true after transfers. Choose which runs to include: <em>Paid (disbursed)</em>, <em>Approved and paid</em> (default) or <em>All except cancelled</em>.</p>

    <h4>Statutory reports (paid runs by default):</h4>
    <table>
      <thead><tr><th>Report</th><th>What it shows</th></tr></thead>
      <tbody>
        <tr><td>Income tax withheld per employee</td><td>Salary paid and tax deducted per employee, with CNIC and NTN, for the tax year (July to June) by default: the basis for annual tax certificates.</td></tr>
        <tr><td>Income tax withheld per month</td><td>Tax deducted per month across all staff, to reconcile with the monthly withholding deposit.</td></tr>
        <tr><td>EOBI contributions</td><td>Employee and employer EOBI per employee with EOBI number and CNIC (last month by default), for the EOBI return.</td></tr>
        <tr><td>Social security contributions</td><td>Provincial social security (PESSI / SESSI) per employee with social security number and province.</td></tr>
      </tbody>
    </table>

    <h4>Leave reports:</h4>
    <table>
      <thead><tr><th>Report</th><th>What it shows</th></tr></thead>
      <tbody>
        <tr><td>Leave register</td><td>Every leave request that overlaps a period, filtered by type and status, with approver and reason.</td></tr>
        <tr><td>Leave taken per employee</td><td>Approved days per type (annual, casual, sick, maternity / paternity / Hajj, unpaid) and pending days, for leave starting in a period.</td></tr>
        <tr><td>Leave balances</td><td>Entitled, taken and remaining annual, casual and sick leave per current employee for a calendar year, calculated exactly as in the leave screen (annual and casual pro-rata for joiners; pending requests reduce what is left).</td></tr>
      </tbody>
    </table>

    <h4>Device reports:</h4>
    <table>
      <thead><tr><th>Report</th><th>What it shows</th></tr></thead>
      <tbody>
        <tr><td>Kiosk terminals</td><td>Each registered terminal with its account, registration date, last contact, status (active / revoked) and attendance days recorded in a period.</td></tr>
        <tr><td>Punches by method and branch</td><td>Attendance days per punch method (kiosk, fingerprint, camera, mobile, manual) and branch, with employees and punches made at another branch.</td></tr>
        <tr><td>Biometric enrolment</td><td>Current employees missing a fingerprint or a face (or fully enrolled), to plan enrolment.</td></tr>
      </tbody>
    </table>

    <h4>Audit reports:</h4>
    <table>
      <thead><tr><th>Report</th><th>What it shows</th></tr></thead>
      <tbody>
        <tr><td>Audit log</td><td>Every recorded change, approval, report export and data import: when, who, role, action, record and address. Filter by action and user.</td></tr>
        <tr><td>Sign-ins</td><td>Sessions started in a period with last activity, how they ended (signed out, expired, active) and the address.</td></tr>
        <tr><td>Data import runs</td><td>Every CyberAP analysis and import with its options and result counts.</td></tr>
      </tbody>
    </table>

    <h4>CyberAP archive:</h4>
    <p>At import, every row of the old system's tables (salary sheets, loans, holidays, settings and more) was kept unchanged. <strong>Reports &rarr; CyberAP Archive</strong> lets you browse them: choose a table (the list shows how many rows each has), then filter by employee, an optional date range or any text. Columns are the old table's own columns; passwords, photos and fingerprint data are never shown. Old CyberAP payroll is found here, not in the Payroll reports.</p>

    <div class="callout callout-statutory">
      <strong>Who can see reports</strong>
      Employee reports need the Employees or Payroll permission; attendance reports the Attendance or Payroll permission; payroll and statutory reports the Payroll permission; leave reports the Leave or Employees permission; device reports the Employees or Attendance permission; audit reports the User Management permission; the CyberAP archive the Payroll or Data import permission. The <strong>View reports</strong> permission (User Management &rarr; Roles) opens employee, attendance, leave and device reports for read-only managers, but never salaries, audit or the archive. Super Admin sees all reports.
    </div>
  </div>

  <!-- SUPPORTING MODULES -->
  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Supporting Operational Modules</span>
      <span class="menu-step-badge">Administrative Services</span>
    </div>
    <h4>Company Assets (Menu 13):</h4>
    <p>Tracks company property (serial numbers, models, custody). Directly connected to the Gratuity module: while an asset is still assigned to an employee, their final settlement cannot be processed or paid until it is marked 'Returned'.</p>

    <h4>Recruitment &amp; Job Applications (Menu 14):</h4>
    <p>Post vacancies, screen applicants, schedule interviews, and onboard hired candidates into Menu 4 (Employee Directory) with <strong>Onboard as employee</strong>. A posting can name an optional <strong>Designation (post)</strong>; onboarding a hired applicant fills it in (otherwise the department's first designation). Postings whose closing date has passed show <strong>Closed (expired)</strong> and are not counted as open.</p>

    <h4>Performance Reviews &amp; KPIs (Menu 15):</h4>
    <p>Conduct quarterly and annual appraisals. Review periods follow the current year: Annual, H1/H2 and Q1&ndash;Q4 for last year, this year and next year. Approved increments become draft salary revisions in Menu 10, which a different user must approve.</p>

    <h4>User Access &amp; Permissions (Menu 16):</h4>
    <p>Enforces dual-authorization segregation of duties. Configures roles: Super Admin, HR Manager, Payroll Officer, Auditor, and Kiosk Terminal.</p>

    <h4>Notification Center:</h4>
    <p>HR also sees notices sent to individual employees, each marked <strong>Seen by employee</strong> or <strong>Not yet seen by employee</strong>. The Unread count is your own inbox only.</p>
  </div>

  <!-- STATUTORY OUTPUTS & BANKING -->
  <div class="page-break"></div>
  <h1>3. Statutory Outputs, Banking Files &amp; Accounting</h1>
  <p>The payroll engine automatically produces five standardized statutory and financial outputs upon approving a payroll run:</p>

  <div class="avoid-break">
    <h3>1. Bank Advice Payment File (HBL, MCB, UBL, Alfalah, Meezan)</h3>
    <p>A standardized CSV/TXT disbursement file formatted for direct portal upload to major Pakistani commercial banks. Contains Employee Name, Account Number, 24-digit IBAN, CNIC, and Net Salary.</p>

    <h3>2. Individual Digital &amp; Printable Payslips</h3>
    <p>Employees receive real-time access on their mobile self-service app. HR administrators can view, print, or download PDF payslips showing complete breakdowns of basic wages, allowances, overtime, tax withholding, EOBI, PF, and loan deductions.</p>

    <h3>3. EOBI Monthly Contribution Return (Form PR-01 / PR-02)</h3>
    <p>Summary report detailing total insured headcount, employee 1% deductions (PKR 370/person), and employer 5% contributions (PKR 1,850/person) for filing on the EOBI portal.</p>

    <h3>4. Provincial Social Security Statement (SESSI / PESSI)</h3>
    <p>Provincial schedule itemizing covered employees earning up to PKR 40,000, calculating the 6% employer contribution for monthly challan submission.</p>

    <h3>5. FBR Annual Withholding Tax Certificate (Section 149)</h3>
    <p>Itemized statement of total taxable salary paid and total income tax deducted at source under the First Schedule of the Income Tax Ordinance, 2001.</p>

    <h3>6. General Ledger Accounting Journal Entry</h3>
    <p>Provides dual-entry bookkeeping records for the enterprise accounting department. The journal balances also when there are late-arrival fines, and CSV exports keep negative amounts as numbers (e.g. -1500) so spreadsheets can total them:</p>
    <table>
      <thead>
        <tr>
          <th>Account Title</th>
          <th>Account Type</th>
          <th>Debit (PKR)</th>
          <th>Credit (PKR)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Salaries &amp; Wages Expense</td>
          <td>Expense</td>
          <td>Gross Pay</td>
          <td>&ndash;</td>
        </tr>
        <tr>
          <td>Employer EOBI Contribution Expense</td>
          <td>Expense</td>
          <td>Total EOBI Employer</td>
          <td>&ndash;</td>
        </tr>
        <tr>
          <td>Employer Social Security Expense</td>
          <td>Expense</td>
          <td>Total PESSI Employer</td>
          <td>&ndash;</td>
        </tr>
        <tr>
          <td>FBR Withholding Tax Payable</td>
          <td>Current Liability</td>
          <td>&ndash;</td>
          <td>Total Income Tax</td>
        </tr>
        <tr>
          <td>EOBI Payable (Employee + Employer)</td>
          <td>Current Liability</td>
          <td>&ndash;</td>
          <td>Total EOBI</td>
        </tr>
        <tr>
          <td>PESSI / SESSI Payable</td>
          <td>Current Liability</td>
          <td>&ndash;</td>
          <td>Total PESSI</td>
        </tr>
        <tr>
          <td>Employee Loan Advance Clearing</td>
          <td>Asset Clearing</td>
          <td>&ndash;</td>
          <td>Loan Deductions</td>
        </tr>
        <tr>
          <td>Net Salaries Payable (Bank Clearing)</td>
          <td>Current Liability</td>
          <td>&ndash;</td>
          <td>Total Net Pay</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- SOP CHECKLIST -->
  <div class="page-break"></div>
  <h1>4. Standard Operating Procedures (SOP Checklist)</h1>

  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Daily Morning Routine (HR &amp; Reception)</span>
      <span class="menu-step-badge">Daily SOP</span>
    </div>
    <ul class="step-list">
      <li><strong>08:30 AM &ndash; Kiosk &amp; Hardware Check:</strong> Ensure the Windows reception kiosk is launched, camera stream is active, and USB fingerprint bridge is online.</li>
      <li><strong>09:30 AM &ndash; Punctuality Stream Review:</strong> Open Menu 7 (Attendance). Filter for today's logs to inspect on-time arrivals, grace period entries, and late arrivals.</li>
      <li><strong>10:00 AM &ndash; Needs Review Queue:</strong> Check for any unrecognized camera matches, off-site mobile punches, or manual regularization requests. Approve or decline pending items.</li>
    </ul>
  </div>

  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Monthly Payroll Cutoff Routine (Payroll Specialists)</span>
      <span class="menu-step-badge">Monthly SOP</span>
    </div>
    <ul class="step-list">
      <li><strong>25th of Month &ndash; Cutoff Notice:</strong> Issue employee deadline for submitting pending leaves, expense claims, and regularization requests.</li>
      <li><strong>28th of Month &ndash; Clear Needs Review:</strong> Review and resolve 100% of attendance exceptions in Menu 7. Verify that no items remain in "Needs Review".</li>
      <li><strong>29th of Month &ndash; Generate Draft Payroll:</strong> Open Menu 11 (Payroll). Select active month/year and click <em>Run New Payroll Cycle</em>. Review gross-to-net simulation grid.</li>
      <li><strong>30th of Month &ndash; Dual Authorization:</strong> Payroll Officer reviews calculations and selects <em>Approve</em>. HR Director conducts final audit and authorizes bank release.</li>
      <li><strong>1st of New Month &ndash; Bank Disbursement:</strong> Download Bank Advice File from Menu 11. Upload to commercial bank portal. Once payments clear, select <em>Mark Disbursed</em>.</li>
      <li><strong>10th of New Month &ndash; Statutory Filings:</strong> Submit EOBI challan via portal and deposit FBR withholding tax via e.fbr.gov.pk challan (CPR).</li>
    </ul>
  </div>

  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Employee Exit &amp; Clearance Routine (HR Operations)</span>
      <span class="menu-step-badge">Offboarding SOP</span>
    </div>
    <ul class="step-list">
      <li>Receive formal resignation or termination notice. Update employee status to 'Resigned' / 'Notice Period'.</li>
      <li>Open Menu 13 (Assets). Check in and inspect all issued equipment (laptops, phones, cards). Confirm zero open assets.</li>
      <li>Open Menu 9 (Loans). Confirm remaining loan principal balance.</li>
      <li>Open Menu 12 (Gratuity &amp; Settlement). Compute 30 days/year gratuity, add unpaid days and leave encashment, deduct remaining loan balance.</li>
      <li>Generate Final Settlement Certificate, obtain employee sign-off, and release disbursement.</li>
    </ul>
  </div>

</body>
</html>`;

// Write HTML file
const htmlPath = path.join(docsDir, 'user-guide-full.html');
fs.writeFileSync(htmlPath, htmlContent, 'utf8');
console.log(`Created HTML guide: ${htmlPath}`);

// Headless Chrome PDF compilation
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const targetPdfPath = path.join(docsDir, 'OneNet_HR_Payroll_Complete_User_Guide.pdf');
const rootPdfPath = path.join(root, 'OneNet_HR_Payroll_Complete_User_Guide.pdf');

const fileUrl = pathToFileURL(path.resolve(htmlPath)).href;

try {
  console.log('Rendering full PDF via headless Chrome engine...');
  execFileSync(chromePath, [
    '--headless=new',
    '--disable-gpu',
    `--print-to-pdf=${targetPdfPath}`,
    '--no-pdf-header-footer',
    fileUrl
  ]);
  
  if (fs.existsSync(targetPdfPath)) {
    fs.copyFileSync(targetPdfPath, rootPdfPath);
    const stats = fs.statSync(targetPdfPath);
    console.log(`✅ Success! Generated PDF: ${targetPdfPath}`);
    console.log(`✅ Copied to root: ${rootPdfPath}`);
    console.log(`📊 File Size: ${(stats.size / 1024).toFixed(1)} KB`);
  } else {
    console.error('❌ PDF was not generated.');
  }
} catch (err) {
  console.error('❌ Error rendering PDF:', err.message);
}
