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
        <p>Official FBR Finance Act 2024/2025 Slabs, Section 4AB Surcharge, EOBI, SESSI/PESSI provincial social security caps, and automated minimum wage checks.</p>
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
        <p>Applicable Fiscal Periods: <strong>Tax Years 2024–2025 &amp; 2025–2026</strong></p>
        <p>Published: <strong>October 2026</strong></p>
      </div>
    </div>
  </div>

  <!-- TABLE OF CONTENTS -->
  <div class="page-break"></div>
  <h1>Document Table of Contents</h1>
  <div class="toc-container">
    <div class="toc-grid">
      <div class="toc-item"><span>1. System Architecture &amp; Data Flow</span><span>Page 3</span></div>
      <div class="toc-item"><span>2. Diagram 1: Flow of Data Between Screens</span><span>Page 4</span></div>
      <div class="toc-item"><span>3. Diagram 2: How a Punch Becomes a Paid Day</span><span>Page 5</span></div>
      <div class="toc-item"><span>4. Menu 1: Operations Dashboard (Step 12)</span><span>Page 6</span></div>
      <div class="toc-item"><span>5. Menu 2: Company Setup &amp; Master Data (Step 2)</span><span>Page 7</span></div>
      <div class="toc-item"><span>6. Menu 3: Statutory Settings &amp; FBR Tax Slabs (Step 1)</span><span>Page 8</span></div>
      <div class="toc-item"><span>7. Menu 4: Employee Directory &amp; Profiles (Step 3)</span><span>Page 9</span></div>
      <div class="toc-item"><span>8. Menu 5: Holiday Calendar (Step 4)</span><span>Page 10</span></div>
      <div class="toc-item"><span>9. Menu 6: Leave Management &amp; Approvals (Step 5)</span><span>Page 11</span></div>
      <div class="toc-item"><span>10. Menu 7: Attendance Register &amp; Needs Review (Step 7)</span><span>Page 12</span></div>
      <div class="toc-item"><span>11. Menu 8: Biometrics, Cameras &amp; Kiosk (Step 6)</span><span>Page 13</span></div>
      <div class="toc-item"><span>12. Menu 9: Loans &amp; Salary Advances (Step 8)</span><span>Page 14</span></div>
      <div class="toc-item"><span>13. Menu 10: Salary Revisions &amp; Increments (Step 9)</span><span>Page 15</span></div>
      <div class="toc-item"><span>14. Menu 11: Payroll Processing Engine (Step 10)</span><span>Page 16</span></div>
      <div class="toc-item"><span>15. Menu 12: Gratuity &amp; Final Settlement (Step 11)</span><span>Page 17</span></div>
      <div class="toc-item"><span>16. Supporting Modules: Assets, Recruitment &amp; Appraisals</span><span>Page 18</span></div>
      <div class="toc-item"><span>17. Statutory Outputs, Banking &amp; Accounting Journals</span><span>Page 19</span></div>
      <div class="toc-item"><span>18. Standard Operating Procedures (SOP Checklist)</span><span>Page 20</span></div>
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

    <h4>Official FBR Income Tax Slabs (Finance Act 2024 / 2025):</h4>
    <p>Enacted under the First Schedule, Part I, Division I, Clause (2) of the Income Tax Ordinance, 2001 for salaried individuals:</p>

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
          <td>0.0%</td>
          <td>Where taxable income does not exceed Rs. 600,000: 0%</td>
        </tr>
        <tr>
          <td><strong>Slab 2</strong></td>
          <td>Rs. 600,001 &ndash; 1,200,000</td>
          <td>Rs. 0</td>
          <td>5.0%</td>
          <td>5% of the amount exceeding Rs. 600,000</td>
        </tr>
        <tr>
          <td><strong>Slab 3</strong></td>
          <td>Rs. 1,200,001 &ndash; 2,200,000</td>
          <td>Rs. 30,000</td>
          <td>15.0%</td>
          <td>Rs. 30,000 + 15% of the amount exceeding Rs. 1,200,000</td>
        </tr>
        <tr>
          <td><strong>Slab 4</strong></td>
          <td>Rs. 2,200,001 &ndash; 3,200,000</td>
          <td>Rs. 180,000</td>
          <td>25.0%</td>
          <td>Rs. 180,000 + 25% of the amount exceeding Rs. 2,200,000</td>
        </tr>
        <tr>
          <td><strong>Slab 5</strong></td>
          <td>Rs. 3,200,001 &ndash; 4,100,000</td>
          <td>Rs. 430,000</td>
          <td>30.0%</td>
          <td>Rs. 430,000 + 30% of the amount exceeding Rs. 3,200,000</td>
        </tr>
        <tr>
          <td><strong>Slab 6</strong></td>
          <td>Exceeding Rs. 4,100,000</td>
          <td>Rs. 700,000</td>
          <td>35.0%</td>
          <td>Rs. 700,000 + 35% of the amount exceeding Rs. 4,100,000</td>
        </tr>
      </tbody>
    </table>

    <div class="callout callout-warning">
      <strong>Section 4AB Surcharge (Finance Act 2024 / 2025)</strong>
      A mandatory <strong>10% super-tax surcharge</strong> is automatically levied on the total income tax payable for high-earning salaried individuals whose annual taxable income exceeds <strong>PKR 10,000,000 (10 Million PKR)</strong>.
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
      <li><strong>"Update from FBR":</strong> One-click button to synchronize and restore the official Finance Act rates directly into the PostgreSQL database.</li>
    </ul>
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
      <li><strong>Identity:</strong> Input Full Name, Employee Code, CNIC (formatted as <span class="code-snippet">42101-1234567-1</span>), Mobile Number, and Personal Email.</li>
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
      <li><strong>Banking Advice:</strong> Select Pakistani Bank (HBL, MCB, UBL, Alfalah, Meezan, etc.), Bank Account Number, and 24-character Pakistani IBAN (<span class="code-snippet">PK...</span>).</li>
      <li>Save the record. The employee is now active and immediately eligible for attendance and payroll inclusion.</li>
    </ol>
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
          <td>Deducts calendar-day salary: <span class="code-snippet">(Basic Salary / Total Days in Month) &times; Unpaid Days</span></td>
        </tr>
      </tbody>
    </table>

    <h4>Supervisor Approval Workflow:</h4>
    <ol class="step-list">
      <li>Employee submits leave via mobile app or web portal specifying type, dates, and reason.</li>
      <li>HR or Line Manager receives alert under <strong>"Pending Leave Requests"</strong>.</li>
      <li>Manager reviews quota balance and selects <strong>Approve</strong> or <strong>Reject</strong>.</li>
      <li>Approved leave immediately reflects on the Attendance Stream as <span class="badge badge-blue">On Leave</span>, protecting the employee from unexcused absence penalties.</li>
    </ol>
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
    </ul>

    <h4>The "Needs Review" Queue:</h4>
    <p>Punches with missing checkout, off-site mobile GPS punches, or employee manual regularization claims appear in the <strong>Needs Review</strong> panel. HR managers can inspect evidence and select <strong>Approve</strong> or <strong>Decline</strong>.</p>

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
      <li>Select <strong>Approve</strong>. Once active, the system automatically deducts the monthly installment from the employee's net payslip during every payroll run.</li>
      <li>The system tracks total repaid amount and decrements <span class="code-snippet">remainingInstallments</span>.</li>
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
      <li>The payroll engine checks effective dates and applies revised salary structures automatically.</li>
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
      <li><strong>Draft Creation &amp; Dual Approval:</strong> Manager reviews the draft register and selects <strong>Approve</strong>. Approval freezes the calculations and commits loan deductions.</li>
      <li><strong>Disbursement Authorization:</strong> Once bank funds are transferred, select <strong>Mark Disbursed</strong> to finalize the cycle.</li>
      <li><strong>Output Delivery:</strong> Generate individual digital payslips, download bank advice CSVs, and export statutory schedules.</li>
    </ol>

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
          <td>Basic + House Rent + Conveyance + Medical + Other + Overtime Pay &minus; Unpaid Leave Deduction</td>
          <td>Employment Contract</td>
        </tr>
        <tr>
          <td><strong>Overtime Pay</strong></td>
          <td><span class="code-snippet">(Basic / 208 hrs) &times; Overtime Hours &times; 2.0</span></td>
          <td>Factories Act, 1934</td>
        </tr>
        <tr>
          <td><strong>FBR Income Tax</strong></td>
          <td>Annualize Gross &times; 12 &rarr; Apply 6 Progressive Slabs (+ 10% Surcharge if &gt; 10M) &divide; 12</td>
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
      <p style="margin-top: 4px; font-size: 8pt;">Pro-rated for fractions of service exceeding 6 months.</p>
    </div>

    <h4>Terminal Settlement Checklist:</h4>
    <ul>
      <li><strong>(+) Statutory Gratuity:</strong> Calculated based on tenure and final basic wage.</li>
      <li><strong>(+) Unpaid Days:</strong> Pro-rated salary for workdays completed in the exit month.</li>
      <li><strong>(+) Leave Encashment:</strong> Cash payment for unutilized annual leave balances.</li>
      <li><strong>(+) Notice Period Pay:</strong> Paid if company waives contractual notice.</li>
      <li><strong>(&minus;) Asset Clearances:</strong> Physical return of issued laptops, mobile phones, security keys. Exit is blocked until all assets are checked in.</li>
      <li><strong>(&minus;) Loan Balance Recovery:</strong> Any remaining unpaid loan principal is deducted directly from the final check.</li>
    </ul>
  </div>

  <!-- SUPPORTING MODULES -->
  <div class="menu-card avoid-break">
    <div class="menu-header">
      <span class="menu-title">Supporting Operational Modules</span>
      <span class="menu-step-badge">Administrative Services</span>
    </div>
    <h4>Company Assets (Menu 13):</h4>
    <p>Tracks company property (serial numbers, models, custody). Directly connected to the Gratuity module—prevents settlement disbursement until all assets are marked 'Returned'.</p>

    <h4>Recruitment &amp; Job Applications (Menu 14):</h4>
    <p>Post vacancies, screen applicants, schedule interviews, and seamlessly onboard hired candidates directly into Menu 4 (Employee Directory) with one click.</p>

    <h4>Performance Reviews &amp; KPIs (Menu 15):</h4>
    <p>Conduct quarterly and annual appraisals. Scores feed directly into Menu 10 (Salary Revisions) to determine merit increment percentages.</p>

    <h4>User Access &amp; Permissions (Menu 16):</h4>
    <p>Enforces dual-authorization segregation of duties. Configures roles: Super Admin, HR Manager, Payroll Officer, Auditor, and Kiosk Terminal.</p>
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
    <p>Provides dual-entry bookkeeping records for the enterprise accounting department:</p>
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
