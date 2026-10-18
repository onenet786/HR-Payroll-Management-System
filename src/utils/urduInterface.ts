/**
 * Display-only Urdu layer for the HR portal. When enabled it swaps exact, known English interface strings
 * (labels, buttons, headings, placeholders) for Urdu inside one container and restores them when disabled.
 * Data values (names, amounts, codes) never match the dictionary and stay untouched; English remains the
 * authoritative financial record.
 */
export const URDU_INTERFACE: Record<string, string> = {
  // Common actions
  'Approve': 'منظور کریں', 'Reject': 'مسترد کریں', 'Cancel': 'منسوخ کریں', 'Save': 'محفوظ کریں', 'Submit': 'جمع کرائیں', 'Close': 'بند کریں',
  'Edit': 'ترمیم', 'Delete': 'حذف کریں', 'Search': 'تلاش', 'Download': 'ڈاؤن لوڈ', 'Upload': 'اپ لوڈ', 'Add': 'شامل کریں', 'Remove': 'ہٹائیں',
  'Assign': 'تفویض کریں', 'Review': 'جائزہ', 'Return': 'واپسی', 'Restore': 'بحال کریں', 'Process': 'عمل کریں', 'Raise': 'درج کریں', 'Actions': 'کارروائیاں',
  'Submit for approval': 'منظوری کے لیے بھیجیں', 'Withdraw': 'واپس لیں', 'Approve & apply': 'منظور کریں اور لاگو کریں', 'Decline': 'رد کریں',
  'Run New Payroll Cycle': 'نیا پے رول چلائیں', 'Lock Register': 'رجسٹر لاک کریں', 'Lock Corrected Register': 'درست شدہ رجسٹر لاک کریں',
  'Mark Disbursed': 'ادائیگی درج کریں', 'Cancel Run': 'پے رول منسوخ کریں', 'Email payslips': 'پے سلپ ای میل کریں', 'SMS alert': 'ایس ایم ایس اطلاع',
  'WhatsApp alert': 'واٹس ایپ اطلاع', 'Bank Advice File': 'بینک ادائیگی فائل', 'Download bank file': 'بینک فائل ڈاؤن لوڈ کریں', 'Record CPR': 'سی پی آر درج کریں',
  'Fix records': 'ریکارڈ درست کریں', 'Show info': 'معلومات دکھائیں', 'Set up MFA': 'ایم ایف اے ترتیب دیں', 'Raise a request': 'درخواست درج کریں',
  // Status and attendance
  'Status': 'حیثیت', 'Pending': 'زیر التواء', 'Approved': 'منظور شدہ', 'Rejected': 'مسترد', 'Draft': 'مسودہ', 'Disbursed': 'ادا شدہ', 'Cancelled': 'منسوخ',
  'Active': 'فعال', 'Inactive': 'غیر فعال', 'Terminated': 'برطرف', 'Suspended': 'معطل', 'Present': 'حاضر', 'Absent': 'غیر حاضر', 'Late': 'تاخیر',
  'Half Day': 'آدھا دن', 'On Leave': 'رخصت پر', 'Holiday': 'تعطیل', 'Overtime': 'اوور ٹائم', 'In Punch': 'آمد', 'Out Punch': 'روانگی',
  'Pending Approval': 'منظوری زیر التواء', 'Pending Tasks': 'زیر التواء کام', 'Recent decisions': 'حالیہ فیصلے', 'Pending proposal': 'زیر التواء تجویز',
  'Start': 'آغاز', 'End': 'اختتام', 'Start time': 'آغاز کا وقت', 'End time': 'اختتام کا وقت', 'Start Date': 'تاریخ آغاز', 'Reason': 'وجہ', 'Notes': 'نوٹس',
  'Requested Status': 'مطلوبہ حیثیت', 'Present Days': 'حاضری کے دن', 'Half Days': 'آدھے دن', 'Total Days Off': 'کل چھٹیاں',
  // People and organisation
  'Employee': 'ملازم', 'All Employees': 'تمام ملازمین', 'Select employee': 'ملازم منتخب کریں', 'Select Employee': 'ملازم منتخب کریں',
  'Full Name': 'پورا نام', 'Employee Code': 'ملازم کوڈ', 'Pakistan CNIC': 'شناختی کارڈ نمبر', 'CNIC Expiry (NADRA)': 'شناختی کارڈ کی میعاد',
  'Gender': 'جنس', 'Male': 'مرد', 'Female': 'خاتون', 'Date of Birth': 'تاریخ پیدائش', 'Marital Status': 'ازدواجی حیثیت', 'Single': 'غیر شادی شدہ',
  'Married': 'شادی شدہ', 'Divorced': 'طلاق یافتہ', 'Widowed': 'بیوہ / رنڈوا', 'Mobile Contact': 'موبائل نمبر', 'Official Email ID': 'سرکاری ای میل',
  'Department': 'شعبہ', 'Designation': 'عہدہ', 'Assigned Branch': 'مختص برانچ', 'Zone': 'زون', 'Wage Type': 'اجرت کی قسم', 'Manager': 'مینیجر',
  'Worker Category': 'ملازم کا زمرہ', 'Contract End (if fixed-term)': 'معاہدے کا اختتام', 'Probation Review Due': 'پروبیشن جائزہ کی تاریخ',
  'Probation decision recorded': 'پروبیشن کا فیصلہ درج ہے', 'Driving Licence Expiry': 'ڈرائیونگ لائسنس کی میعاد', 'Certification Expiry': 'سرٹیفیکیشن کی میعاد',
  'Work Permit / Visa Expiry': 'ورک پرمٹ / ویزا کی میعاد', 'Shift Start': 'شفٹ کا آغاز', 'Shift End': 'شفٹ کا اختتام', 'Grace Minutes': 'رعایتی منٹ',
  'Break Minutes': 'وقفہ (منٹ)', 'Employee Lifecycle': 'ملازمت کا دورانیہ', 'Request type': 'درخواست کی قسم', 'Effective date': 'مؤثر تاریخ',
  'Reason / justification': 'وجہ / جواز', 'Awaiting approval': 'منظوری کا منتظر', 'Requests': 'درخواستیں', 'Letters': 'خطوط', 'Onboarding': 'شمولیت',
  'Resignation': 'استعفیٰ', 'Termination': 'برطرفی', 'Retirement': 'ریٹائرمنٹ', 'Promotion': 'ترقی', 'Transfer': 'تبادلہ', 'Same branch': 'وہی برانچ',
  'Same department': 'وہی شعبہ', 'Select designation': 'عہدہ منتخب کریں', 'Experience certificate': 'تجربے کا سرٹیفکیٹ', 'Employment letter': 'ملازمت کا خط',
  // Pay and banking
  'Gross Salary': 'کل تنخواہ', 'Net Take-Home': 'قابلِ ادائیگی تنخواہ', 'Take Home (FBR Auto)': 'قابلِ ادائیگی (خودکار ٹیکس)', 'Basic Pay': 'بنیادی تنخواہ',
  'Medical': 'طبی', 'Conveyance': 'سفری الاؤنس', 'Rent': 'کرایہ', 'Other': 'دیگر', 'Other Allowances': 'دیگر الاؤنسز', 'Provident Fund': 'پراویڈنٹ فنڈ',
  'Disbursal Bank': 'ادائیگی کا بینک', 'Account Number': 'اکاؤنٹ نمبر', 'PKR IBAN Number': 'آئی بین نمبر', 'Enable FBR Tax': 'ایف بی آر ٹیکس فعال',
  'Enable EOBI': 'ای او بی آئی فعال', 'Opt In PF Fund': 'پراویڈنٹ فنڈ میں شمولیت', 'Opt In Gratuity': 'گریجویٹی میں شمولیت',
  'Prior Employer Taxable Income': 'سابقہ آجر کی قابلِ ٹیکس آمدنی', 'Prior Employer Tax Deducted': 'سابقہ آجر کا کاٹا گیا ٹیکس',
  'Vehicle Perquisite (PKR / month, taxable)': 'گاڑی کی سہولت (ماہانہ، قابلِ ٹیکس)', 'Accommodation Perquisite (PKR / month, taxable)': 'رہائش کی سہولت (ماہانہ، قابلِ ٹیکس)',
  'Other Perquisites (PKR / month, taxable)': 'دیگر سہولیات (ماہانہ، قابلِ ٹیکس)', 'Tax Year': 'ٹیکس سال', 'Taxable income YTD': 'سال بھر کی قابلِ ٹیکس آمدنی',
  'Tax deducted previously': 'پہلے کاٹا گیا ٹیکس', 'Projected annual income': 'متوقع سالانہ آمدنی', 'Salary Advance': 'تنخواہ کا ایڈوانس',
  'Total Settlement Amount': 'کل تصفیہ رقم', 'Total Outstanding': 'کل واجب الادا', 'Settlement Breakdown': 'تصفیہ کی تفصیل', 'Separation Type': 'علیحدگی کی قسم',
  'Revision Type': 'ترمیم کی قسم', 'Revision History': 'ترامیم کی تاریخ', 'Historical Runs': 'سابقہ پے رول', 'Net Total': 'خالص کل',
  // Leave
  'Leave Type': 'چھٹی کی قسم', 'Casual Leave': 'اتفاقی چھٹی', 'Sick Leave': 'بیماری کی چھٹی', 'Annual Leave': 'سالانہ چھٹی', 'Unpaid Leave': 'بلا تنخواہ چھٹی',
  'Paternity Leave': 'پدری چھٹی', 'Unpaid': 'بلا تنخواہ', 'Sick': 'بیماری', 'Weekly': 'ہفتہ وار', 'Recurring annually': 'ہر سال',
  // Reports and settings
  'PF ledger': 'پراویڈنٹ فنڈ لیجر', 'Gratuity provision': 'گریجویٹی پروویژن', 'Tax deposit reconciliation': 'ٹیکس جمع کی مطابقت', 'Annual tax summary': 'سالانہ ٹیکس خلاصہ',
  'Missing registrations': 'نامکمل رجسٹریشن', 'Tax vs annual liability': 'ٹیکس بمقابلہ سالانہ ذمہ داری', 'Open certificate': 'سرٹیفکیٹ کھولیں',
  'Retroactive attendance correction': 'سابقہ حاضری کی درستگی', 'Off-cycle runs': 'اضافی پے رول', 'Reversal journal CSV': 'ریورسل جرنل',
  'Compliance alerts': 'تعمیل کی اطلاعات', 'Source of these rates': 'شرحوں کا ماخذ', 'Salary tax rules': 'تنخواہ ٹیکس کے قواعد',
  'Provincial social security coverage': 'صوبائی سوشل سیکیورٹی', 'Statutory change control (maker-checker)': 'قانونی تبدیلی کا کنٹرول (دو افراد کی منظوری)',
  'Update from FBR': 'ایف بی آر سے تازہ کریں', 'Category': 'زمرہ', 'Type': 'قسم', 'Code': 'کوڈ', 'Rate': 'شرح', 'Auto': 'خودکار', 'Self': 'خود',
  'Username': 'صارف نام', 'Password': 'پاس ورڈ', 'System Users': 'سسٹم صارفین', 'Role Name': 'کردار کا نام', 'Permissions Scope': 'اختیارات',
};

const ATTRIBUTES = ['placeholder', 'title', 'aria-label'] as const;

export function translateInterfaceText(text: string): string | undefined {
  const match = text.match(/^(\s*)(.*?)(\s*:?\s*)$/s);
  if (!match) return undefined;
  const [, lead, core, trail] = match;
  const urdu = URDU_INTERFACE[core.replace(/&amp;/g, '&')];
  return urdu ? `${lead}${urdu}${trail}` : undefined;
}

/** Enables the Urdu layer inside `root`; returns a function that restores every changed string. */
export function applyUrduInterface(root: HTMLElement): () => void {
  const originalText = new Map<Text, string>();
  const appliedText = new Map<Text, string>();
  const originalAttributes = new Map<Element, Map<string, string>>();
  let applying = false;

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      const parent = text.parentElement;
      if (!parent || parent.closest('input, textarea, [data-no-translate], script, style')) return;
      const current = text.nodeValue || '';
      if (appliedText.get(text) === current) return;
      const translated = translateInterfaceText(current);
      if (translated && translated !== current) {
        // Any value we did not write ourselves is fresh English from React and becomes the restore point.
        originalText.set(text, current);
        appliedText.set(text, translated);
        text.nodeValue = translated;
        parent.closest('label, button, th, h1, h2, h3, h4, b, span, p')?.setAttribute('dir', 'auto');
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    for (const attribute of ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      const translated = value ? translateInterfaceText(value) : undefined;
      if (value && translated && translated !== value) {
        const saved = originalAttributes.get(element) || new Map<string, string>();
        if (!saved.has(attribute)) saved.set(attribute, value);
        originalAttributes.set(element, saved);
        element.setAttribute(attribute, translated);
      }
    }
    element.childNodes.forEach(visit);
  };

  // React re-renders reset text; the observer re-applies translations to whatever changed.
  const observer = new MutationObserver(records => {
    if (applying) return;
    applying = true;
    for (const record of records) {
      if (record.type === 'characterData') visit(record.target);
      record.addedNodes.forEach(visit);
    }
    applying = false;
  });
  applying = true;
  visit(root);
  applying = false;
  observer.observe(root, { subtree: true, childList: true, characterData: true });

  return () => {
    observer.disconnect();
    originalText.forEach((value, node) => { if (node.isConnected) node.nodeValue = value; });
    originalAttributes.forEach((attributes, element) => attributes.forEach((value, name) => element.setAttribute(name, value)));
  };
}
