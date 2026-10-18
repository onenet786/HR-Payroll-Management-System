var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/seed-demo-workflow.ts
var import_node_crypto = __toESM(require("node:crypto"), 1);
var import_bcryptjs = __toESM(require("bcryptjs"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_pg = __toESM(require("pg"), 1);

// src/data/attendanceRules.ts
var DEFAULT_SHIFT = {
  id: "default-day-shift",
  name: "Default Day Shift",
  startTime: "09:00",
  endTime: "17:00",
  graceMinutes: 15,
  halfDayMinutes: 120,
  overtimeMultiplier: 2,
  breakMinutes: 0,
  overtimeAfterMinutes: 480,
  workingDays: [1, 2, 3, 4, 5, 6]
};
var timeMinutes = (value) => {
  if (!value || !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value)) return void 0;
  const [hours, minutes] = value.split(":").map(Number);
  if (hours > 23 || minutes > 59) return void 0;
  return hours * 60 + minutes;
};
var elapsedMinutes = (start, end) => end >= start ? end - start : end + 1440 - start;
var completedBreakMinutes = (breaks = []) => breaks.reduce((total, item) => {
  const start = timeMinutes(item.outAt);
  const end = timeMinutes(item.returnAt);
  return start === void 0 || end === void 0 ? total : total + elapsedMinutes(start, end);
}, 0);
function effectiveShiftForDate(shift = DEFAULT_SHIFT, workDate) {
  const inRamadan = Boolean(workDate && shift.ramadanStartDate && shift.ramadanEndDate && workDate >= shift.ramadanStartDate && workDate <= shift.ramadanEndDate);
  const date = workDate ? /* @__PURE__ */ new Date(`${workDate}T00:00:00`) : void 0;
  const isFriday = date?.getDay() === 5;
  const base = inRamadan ? { ...shift, startTime: shift.ramadanStartTime || shift.startTime, endTime: shift.ramadanEndTime || shift.endTime } : shift;
  return isFriday ? { ...base, startTime: shift.fridayStartTime || base.startTime, endTime: shift.fridayEndTime || base.endTime } : base;
}
function evaluateAttendanceTimes(punchIn, punchOut, shift = DEFAULT_SHIFT, breaks = [], workDate) {
  const effectiveShift = effectiveShiftForDate(shift, workDate);
  const start = timeMinutes(effectiveShift.startTime) ?? 540;
  const end = timeMinutes(effectiveShift.endTime) ?? 1020;
  const input = timeMinutes(punchIn);
  const output = timeMinutes(punchOut);
  if (input === void 0) return { status: "Absent", overtimeMinutes: 0, workedMinutes: 0 };
  const lateBy = elapsedMinutes(start, input);
  const isPlausiblyEarly = lateBy > 720;
  const status = isPlausiblyEarly || lateBy <= effectiveShift.graceMinutes ? "Present" : lateBy >= effectiveShift.halfDayMinutes ? "Half Day" : "Late";
  if (output === void 0) return { status, overtimeMinutes: 0, workedMinutes: 0 };
  const grossWorked = elapsedMinutes(input, output);
  const recordedBreaks = completedBreakMinutes(breaks);
  const breakDeduction = Math.max(recordedBreaks, effectiveShift.breakMinutes || 0);
  const workedMinutes = Math.max(0, grossWorked - breakDeduction);
  const scheduledMinutes = elapsedMinutes(start, end) - (effectiveShift.breakMinutes || 0);
  const overtimeThreshold = effectiveShift.overtimeAfterMinutes ?? scheduledMinutes;
  return { status, workedMinutes, overtimeMinutes: Math.max(0, workedMinutes - overtimeThreshold) };
}
function countScheduledWorkingDays(year, month, shift = DEFAULT_SHIFT, holidays = []) {
  const workingDays = new Set(shift.workingDays?.length ? shift.workingDays : DEFAULT_SHIFT.workingDays);
  const holidayDates = new Set(holidays.map((item) => item.date));
  const lastDay = new Date(year, month, 0).getDate();
  let total = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day);
    const iso2 = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (workingDays.has(date.getDay()) && !holidayDates.has(iso2)) total += 1;
  }
  return total;
}
var DUPLICATE_PUNCH_WINDOW_MS = 2 * 6e4;

// src/data/attendancePeriod.ts
function attendancePeriodId(month, year) {
  return `attendance-period-${year}-${String(month).padStart(2, "0")}`;
}
function findAttendanceLockIssues(attendances, month, year) {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return attendances.filter((item) => item.date.startsWith(prefix)).flatMap((item) => {
    const issues = [];
    if (item.regularizationRequested && item.regularizationApproved === void 0) {
      issues.push({ attendanceId: item.id, employeeId: item.employeeId, reason: "Regularization is awaiting a decision" });
    }
    if (item.method === "Manual" && item.regularizationApproved !== true) {
      issues.push({ attendanceId: item.id, employeeId: item.employeeId, reason: "Manual attendance is not approved" });
    }
    if (item.biometricMatch?.lowConfidence && item.regularizationApproved === void 0 && !item.regularizationRequested) {
      issues.push({ attendanceId: item.id, employeeId: item.employeeId, reason: "Low-confidence biometric match is not reviewed" });
    }
    if (item.punchIn && !item.punchOut && !["On Leave", "Holiday"].includes(item.status)) {
      issues.push({ attendanceId: item.id, employeeId: item.employeeId, reason: "Punch-out is missing" });
    }
    return issues;
  });
}
function attendanceIntegrityHash(attendances, month, year) {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const canonical = attendances.filter((item) => item.date.startsWith(prefix)).sort((a, b) => (a.id || "").localeCompare(b.id || "")).map((item) => [item.id, item.employeeId, item.date, item.punchIn || "", item.punchOut || "", item.status, item.method, item.overtimeMinutes, item.regularizationApproved ?? ""].join("|")).join("\n");
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
var dayKey = (year, month, day) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
var hashRows = (rows) => {
  const canonical = rows.slice().sort((left, right) => `${left.employeeId}|${left.date}`.localeCompare(`${right.employeeId}|${right.date}`)).map((row) => [row.employeeId, row.date, row.status, row.attendanceId || "", row.source || ""].join("|")).join("\n");
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};
function buildAttendanceRegister(attendances, employees, leaves, holidays, month, year) {
  const attendanceByEmployeeDay = new Map(attendances.filter((item) => item.date.startsWith(`${year}-${String(month).padStart(2, "0")}`)).map((item) => [`${item.employeeId}|${item.date}`, item]));
  const holidayDates = new Set(holidays.map((item) => item.date));
  const lastDay = new Date(year, month, 0).getDate();
  const eligible = employees.filter((employee) => (employee.status === "Active" || employee.status === "On Leave") && employee.dateOfJoining <= dayKey(year, month, lastDay));
  return eligible.flatMap((employee) => Array.from({ length: lastDay }, (_, offset) => {
    const date = dayKey(year, month, offset + 1);
    const attendance = attendanceByEmployeeDay.get(`${employee.id}|${date}`);
    const leave = leaves.find((item) => item.employeeId === employee.id && item.status === "Approved" && item.startDate <= date && item.endDate >= date);
    const weekday2 = (/* @__PURE__ */ new Date(`${date}T00:00:00`)).getDay();
    const workingDays = employee.shift?.workingDays?.length ? employee.shift.workingDays : [1, 2, 3, 4, 5, 6];
    if (attendance?.regularizationRequested && attendance.regularizationApproved === void 0) return { employeeId: employee.id, date, status: "Pending Review", attendanceId: attendance.id, source: attendance.method };
    if (attendance?.punchIn && !attendance.punchOut && !["On Leave", "Holiday"].includes(attendance.status)) return { employeeId: employee.id, date, status: "Missing Punch", attendanceId: attendance.id, source: attendance.method };
    if (!attendance && date < employee.dateOfJoining) return { employeeId: employee.id, date, status: "Not Joined", source: "Roster" };
    if (attendance) {
      const status = attendance.status === "On Leave" ? "Paid Leave" : attendance.status === "Holiday" ? "Holiday" : attendance.status;
      return { employeeId: employee.id, date, status, attendanceId: attendance.id, source: attendance.method };
    }
    if (holidayDates.has(date)) return { employeeId: employee.id, date, status: "Holiday", source: "Holiday" };
    if (leave) return { employeeId: employee.id, date, status: leave.leaveType === "Unpaid" ? "Unpaid Leave" : "Paid Leave", source: "Leave" };
    if (!workingDays.includes(weekday2)) return { employeeId: employee.id, date, status: "Weekly Off", source: "Roster" };
    return { employeeId: employee.id, date, status: "Absent", source: "Roster" };
  }));
}
function createAttendancePeriod(attendances, employees, leaves, holidays, month, year, actor, now2 = (/* @__PURE__ */ new Date()).toISOString(), previous) {
  if (previous && previous.status !== "Reopened") throw new Error("This attendance register is already locked. Reopen it with a documented reason before locking a new version.");
  const issues = findAttendanceLockIssues(attendances, month, year);
  if (issues.length) throw new Error(`Attendance period cannot be locked: ${issues.length} exception(s) require review.`);
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const records = attendances.filter((item) => item.date.startsWith(prefix));
  if (!records.length) throw new Error("Attendance period cannot be locked because it contains no attendance records.");
  const registerRows = buildAttendanceRegister(attendances, employees, leaves, holidays, month, year);
  const unresolved = registerRows.filter((row) => row.status === "Pending Review" || row.status === "Missing Punch");
  if (unresolved.length) throw new Error(`Attendance period cannot be locked: ${unresolved.length} register day(s) require review.`);
  return {
    id: attendancePeriodId(month, year),
    periodMonth: month,
    periodYear: year,
    status: "Locked",
    lockedAt: now2,
    lockedBy: actor,
    attendanceCount: records.length,
    employeeCount: employees.filter((item) => item.status === "Active" || item.status === "On Leave").length,
    integrityHash: attendanceIntegrityHash(attendances, month, year),
    exceptionCount: 0,
    registerVersion: (previous?.registerVersion || 0) + 1,
    registerRows,
    registerHash: hashRows(registerRows),
    history: [...previous?.history || [], { action: "Locked", at: now2, by: actor, registerVersion: (previous?.registerVersion || 0) + 1, registerHash: hashRows(registerRows) }]
  };
}
function registerPayrollSummary(rows, employeeId) {
  const summary = { presentDays: 0, halfDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, absentDays: 0, notJoinedDays: 0, holidayDays: 0, weeklyOffDays: 0, rosteredDays: 0 };
  for (const row of rows) {
    if (row.employeeId !== employeeId) continue;
    if (row.status === "Present" || row.status === "Late" || row.status === "Working Day") summary.presentDays += 1;
    else if (row.status === "Half Day") summary.halfDays += 1;
    else if (row.status === "Paid Leave") summary.paidLeaveDays += 1;
    else if (row.status === "Unpaid Leave") summary.unpaidLeaveDays += 1;
    else if (row.status === "Absent") summary.absentDays += 1;
    else if (row.status === "Not Joined") summary.notJoinedDays += 1;
    else if (row.status === "Holiday") summary.holidayDays += 1;
    else if (row.status === "Weekly Off") summary.weeklyOffDays += 1;
    if (!["Holiday", "Weekly Off", "Not Joined"].includes(row.status)) summary.rosteredDays += 1;
  }
  return summary;
}

// src/data/provincialCompliance.ts
var schemeByProvince = { Punjab: "PESSI", Sindh: "SESSI", KPK: "KP ESSI", Balochistan: "BESSI", ICT: "Federal / ICT" };
function establishmentRule(config, type) {
  return type && config?.establishmentRules?.[type] || {};
}
function provincialPolicy(config, province, establishmentType) {
  const resolvedProvince = province || "Punjab";
  const rule = establishmentRule(config, establishmentType);
  return {
    province: resolvedProvince,
    scheme: config.provincialSocialSecuritySchemes?.[resolvedProvince] || schemeByProvince[resolvedProvince],
    // An establishment-specific notified wage (for example a separate rate for factories) takes precedence.
    minimumWage: rule.minimumWage || (config.provincialMinimumWages?.[resolvedProvince] ?? config.minimumWage),
    socialSecurityRate: config.provincialSocialSecurityRates?.[resolvedProvince] ?? config.pessiEmployerRate,
    wageCeiling: config.provincialSocialSecurityCeilings?.[resolvedProvince] ?? config.socialSecurityWageCeiling ?? 0,
    version: config.statutoryPolicyVersion || config.taxYear || "Unversioned"
  };
}
function employeeProvince(employee, branches) {
  return branches.find((branch) => branch.id === employee.branchId)?.province;
}
function socialSecurityContribution(employee, province, config, wageBase, isDailyWager) {
  const policy = provincialPolicy(config, province);
  if (config.socialSecurityExcludedCategories?.includes(employee.workerCategory || "Worker")) return { amount: 0, reason: `${employee.workerCategory} staff are excluded from ${policy.scheme}` };
  if (isDailyWager && !employee.socialSecurityNumber) return { amount: 0, reason: "Daily wager without social-security registration" };
  const ceiling = policy.wageCeiling || 4e4;
  if (config.socialSecurityEligibility === "Only employees within wage ceiling" && wageBase > ceiling) return { amount: 0, reason: `Wage above the ${policy.scheme} ceiling of PKR ${ceiling.toLocaleString()}` };
  return { amount: Math.round(Math.min(wageBase, ceiling) * (policy.socialSecurityRate / 100)), reason: "" };
}

// src/data/masterData.ts
function resolveWageBasis(employee, wageTypes = []) {
  return wageTypes.find((item) => item.id === employee.wageTypeId)?.calculationBasis ?? (employee.wageType === "Daily Wager" ? "Daily" : "Monthly");
}

// src/data/defaults.ts
function slabRatePercent(rate) {
  return rate > 0 && rate < 1 ? rate * 100 : rate;
}
var DEFAULT_TAX_SLABS = [
  { id: "fbr-slab-1", minIncome: 0, maxIncome: 6e5, baseTax: 0, percentage: 0 },
  { id: "fbr-slab-2", minIncome: 6e5, maxIncome: 12e5, baseTax: 0, percentage: 5 },
  { id: "fbr-slab-3", minIncome: 12e5, maxIncome: 22e5, baseTax: 3e4, percentage: 15 },
  { id: "fbr-slab-4", minIncome: 22e5, maxIncome: 32e5, baseTax: 18e4, percentage: 25 },
  { id: "fbr-slab-5", minIncome: 32e5, maxIncome: 41e5, baseTax: 43e4, percentage: 30 },
  { id: "fbr-slab-6", minIncome: 41e5, maxIncome: 999999999, baseTax: 7e5, percentage: 35 }
];
var DEFAULT_STATUTORY_CONFIG = {
  id: "stat-pk-2026-27",
  minimumWage: 37e3,
  // PKR per month as of recent notices
  eobiEmployerRate: 5,
  // 5% of minimum wage (PKR 1,850)
  eobiEmployeeRate: 1,
  // 1% of minimum wage (PKR 370)
  pessiEmployerRate: 6,
  // 6% of basic salary (or capped wage)
  gratuityRateDaysPerYear: 30,
  // 30 days basic pay per year on final settlement
  providentFundMaxEmployeeContribution: 10,
  updatedAt: "2026-07-01",
  effectiveFrom: "2026-07-01",
  taxYear: "2027",
  socialSecurityWageCeiling: 4e4,
  provincialSocialSecurityRates: {
    Punjab: 6,
    Sindh: 6,
    KPK: 6,
    Balochistan: 6,
    ICT: 6
  },
  provincialMinimumWages: { Punjab: 37e3, Sindh: 37e3, KPK: 37e3, Balochistan: 37e3, ICT: 37e3 },
  provincialSocialSecuritySchemes: { Punjab: "PESSI", Sindh: "SESSI", KPK: "KP ESSI", Balochistan: "BESSI", ICT: "Federal / ICT" },
  statutoryPolicyVersion: "PK-TY2027-2026-07-01",
  overtimeMultiplier: 2,
  dailyWagerOvertimeMultiplier: 2,
  medicalAllowanceExemptPercentOfBasic: 10,
  surchargeRatePercent: 0,
  surchargeThresholdAnnual: 1e7,
  socialSecurityEligibility: "Capped wage for all",
  settlementDailyRateDivisor: 30,
  gratuityMinimumServiceYears: 1,
  gratuityCountPartYearOverSixMonths: false,
  gratuityResignationUnderFiveYearsPercent: 100,
  annualLeaveDaysPerYear: 14,
  maxLeaveEncashDays: 30,
  absenceDeductionBasis: "Calendar Days",
  standardMonthlyHours: 208
};
function calculateAnnualTax(annualTaxableIncome, slabs) {
  if (!annualTaxableIncome || annualTaxableIncome <= 6e5) return 0;
  const effectiveSlabs = Array.isArray(slabs) && slabs.length > 0 ? slabs : DEFAULT_TAX_SLABS;
  const matchingSlab = effectiveSlabs.find(
    (s) => s && typeof s.minIncome === "number" && annualTaxableIncome > s.minIncome && annualTaxableIncome <= (s.maxIncome ?? Infinity)
  ) || effectiveSlabs.find(
    (s) => s && typeof s.minIncome === "number" && annualTaxableIncome >= s.minIncome && annualTaxableIncome < (s.maxIncome ?? Infinity)
  );
  let baseCalculatedTax = 0;
  if (!matchingSlab) {
    const highest = effectiveSlabs[effectiveSlabs.length - 1] || DEFAULT_TAX_SLABS[DEFAULT_TAX_SLABS.length - 1];
    const excess = annualTaxableIncome - (highest?.minIncome ?? 41e5);
    baseCalculatedTax = (highest?.baseTax ?? 7e5) + excess * slabRatePercent(highest?.percentage ?? 35) / 100;
  } else {
    const excess = annualTaxableIncome - (matchingSlab.minIncome ?? 0);
    baseCalculatedTax = (matchingSlab.baseTax ?? 0) + excess * slabRatePercent(matchingSlab.percentage ?? 0) / 100;
  }
  if (annualTaxableIncome > 1e7) {
    baseCalculatedTax += baseCalculatedTax * 0.1;
  }
  return Math.round(baseCalculatedTax);
}
function annualTaxLiability(annualTaxableIncome, slabs, config) {
  const tax = calculateAnnualTax(annualTaxableIncome, slabs);
  const rate = Math.max(0, config?.surchargeRatePercent || 0);
  const surcharge = rate && annualTaxableIncome > (config?.surchargeThresholdAnnual ?? Number.POSITIVE_INFINITY) ? tax * rate / 100 : 0;
  return { tax: tax + surcharge, surcharge };
}
function pakistanTaxYearForPeriod(month, year) {
  return String(month >= 7 ? year + 1 : year);
}
function calculateReconciledMonthlyTax(employee, grossSalary, month, year, slabs, historicalPayslips = [], config) {
  const taxYear = pakistanTaxYearForPeriod(month, year);
  const taxYearStartYear = Number(taxYear) - 1;
  const taxYearStart = `${taxYearStartYear}-07-01`;
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const previous = historicalPayslips.filter((item) => item.employeeId === employee.id && item.periodMonth && item.periodYear && `${item.periodYear}-${String(item.periodMonth).padStart(2, "0")}-01` >= taxYearStart && `${item.periodYear}-${String(item.periodMonth).padStart(2, "0")}-01` < periodStart);
  const priorEmployerIncome = Math.max(0, employee.priorEmployerTaxableIncome || 0);
  const priorEmployerTax = Math.max(0, employee.priorEmployerTaxDeducted || 0);
  const currentEmployerIncomeBefore = previous.reduce((sum, item) => sum + (item.taxableIncomeThisPeriod ?? item.grossSalary), 0);
  const currentEmployerTaxBefore = previous.reduce((sum, item) => sum + item.incomeTaxDeduction, 0);
  const remainingPeriods = month >= 7 ? 19 - month : 7 - month;
  const projectedAnnualTaxableIncome = priorEmployerIncome + currentEmployerIncomeBefore + grossSalary * remainingPeriods;
  const liability = annualTaxLiability(projectedAnnualTaxableIncome, slabs, config);
  const projectedAnnualTaxLiability = liability.tax;
  const taxDeductedBeforeCurrentPeriod = priorEmployerTax + currentEmployerTaxBefore;
  const incomeTaxDeduction = Math.max(0, Math.round((projectedAnnualTaxLiability - taxDeductedBeforeCurrentPeriod) / remainingPeriods));
  return {
    taxYear,
    taxableIncomeYtd: priorEmployerIncome + currentEmployerIncomeBefore + grossSalary,
    taxDeductedBeforeCurrentPeriod,
    projectedAnnualTaxableIncome,
    projectedAnnualTaxLiability,
    surchargeAnnual: Math.round(liability.surcharge),
    incomeTaxDeduction
  };
}
function computePayslipDetails(employee, month, year, attendances, leaves, statConfigs, taxSlabs, departments, designations, branches, loanAdvances = [], wageTypes = [], holidays = [], historicalPayslips = [], payrollAdjustments = [], registerRows) {
  const isDailyWager = resolveWageBasis(employee, wageTypes) === "Daily";
  const totalDaysInMonth = new Date(year, month, 0).getDate();
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(totalDaysInMonth).padStart(2, "0")}`;
  const branch = branches.find((b) => b.id === employee.branchId);
  const siteRule = establishmentRule(statConfigs, branch?.establishmentType);
  const overlapDays = (startDate, endDate) => {
    const start = /* @__PURE__ */ new Date(`${startDate > periodStart ? startDate : periodStart}T00:00:00`);
    const end = /* @__PURE__ */ new Date(`${endDate < periodEnd ? endDate : periodEnd}T00:00:00`);
    if (end < start) return 0;
    return Math.floor((end.getTime() - start.getTime()) / 864e5) + 1;
  };
  const empAtts = attendances.filter(
    (a) => a.employeeId === employee.id && a.date.startsWith(`${year}-${String(month).padStart(2, "0")}`)
  );
  const register = registerRows?.some((row) => row.employeeId === employee.id) ? registerPayrollSummary(registerRows, employee.id) : void 0;
  const presentDays = register ? register.presentDays : empAtts.filter((a) => a.status === "Present" || a.status === "Late").length;
  const halfDays = register ? register.halfDays : empAtts.filter((a) => a.status === "Half Day").length;
  const absentAttendanceDates = empAtts.filter((a) => a.status === "Absent").map((a) => a.date);
  const leaveDays = register ? register.paidLeaveDays : empAtts.filter((a) => a.status === "On Leave").length;
  const notJoinedDays = register?.notJoinedDays || 0;
  const totalOtMinutes = empAtts.reduce((sum, a) => sum + (a.overtimeMinutes || 0), 0);
  const overtimeHours = Number((totalOtMinutes / 60).toFixed(2));
  const empLeaves = leaves.filter(
    (l) => l.employeeId === employee.id && l.status === "Approved" && l.startDate <= periodEnd && l.endDate >= periodStart
  );
  const unpaidLeaveDays = register ? register.unpaidLeaveDays : empLeaves.filter((l) => l.leaveType === "Unpaid").reduce((sum, l) => sum + overlapDays(l.startDate, l.endDate), 0);
  const explicitAbsentDays = register ? register.absentDays : absentAttendanceDates.filter(
    (date) => !empLeaves.some((l) => l.leaveType === "Unpaid" && l.startDate <= date && l.endDate >= date)
  ).length;
  const paidLeaveDays = register ? register.paidLeaveDays : empLeaves.filter((l) => l.leaveType !== "Unpaid").reduce((sum, l) => sum + overlapDays(l.startDate, l.endDate), 0);
  const absentDays = explicitAbsentDays + unpaidLeaveDays;
  const scheduledWorkingDays = countScheduledWorkingDays(year, month, employee.shift, holidays);
  const absenceDeductionBasis = statConfigs.absenceDeductionBasis || "Calendar Days";
  let baseContractSalary = employee.basicSalary;
  let basicEarnings = 0;
  let houseRentAllowance = 0;
  let conveyanceAllowance = 0;
  let medicalAllowance = 0;
  let otherAllowances = 0;
  let hourlyRate = 0;
  let overtimePay = 0;
  let unpaidLeaveDeduction = 0;
  if (isDailyWager) {
    const effectiveDaysPaid = presentDays + halfDays * 0.5 + paidLeaveDays;
    basicEarnings = effectiveDaysPaid * baseContractSalary;
    hourlyRate = baseContractSalary / 8;
    overtimePay = overtimeHours * hourlyRate * (siteRule.overtimeMultiplier ?? statConfigs.dailyWagerOvertimeMultiplier ?? statConfigs.overtimeMultiplier ?? 2);
  } else {
    const hasCustomAllowances = employee.houseRentAllowance !== void 0 || employee.conveyanceAllowance !== void 0 || employee.medicalAllowance !== void 0 || employee.otherAllowances !== void 0;
    let basicComponent = baseContractSalary;
    if (hasCustomAllowances) {
      houseRentAllowance = employee.houseRentAllowance ?? 0;
      conveyanceAllowance = employee.conveyanceAllowance ?? 0;
      medicalAllowance = employee.medicalAllowance ?? 0;
      otherAllowances = employee.otherAllowances ?? 0;
      basicComponent = baseContractSalary;
    } else {
      basicComponent = baseContractSalary * 0.5;
      houseRentAllowance = baseContractSalary * 0.3;
      conveyanceAllowance = baseContractSalary * 0.1;
      medicalAllowance = baseContractSalary * 0.1;
    }
    const deductionDivisor = absenceDeductionBasis === "Scheduled Working Days" ? Math.max(1, scheduledWorkingDays) : absenceDeductionBasis === "Fixed 30 Days" ? 30 : totalDaysInMonth;
    unpaidLeaveDeduction = Math.min(
      baseContractSalary,
      absentDays * (baseContractSalary / deductionDivisor) + notJoinedDays * (baseContractSalary / totalDaysInMonth)
    );
    basicEarnings = basicComponent;
    const otBaseHourly = basicComponent / (statConfigs.standardMonthlyHours || 208);
    overtimePay = overtimeHours * otBaseHourly * (siteRule.overtimeMultiplier ?? statConfigs.overtimeMultiplier ?? 2);
  }
  const periodAdjustments = payrollAdjustments.filter((item) => item.employeeId === employee.id && item.periodMonth === month && item.periodYear === year && item.status === "Approved" && !item.payrollRunId);
  const adjustmentTotal = (type) => periodAdjustments.filter((item) => item.type === type).reduce((sum, item) => sum + item.amount, 0);
  const bonusEarnings = adjustmentTotal("Bonus");
  const commissionEarnings = adjustmentTotal("Commission");
  const arrearsEarnings = adjustmentTotal("Arrears");
  const reimbursements = adjustmentTotal("Reimbursement");
  const otherAdjustmentsDeduction = adjustmentTotal("Deduction");
  const manualTaxAdjustment = adjustmentTotal("Tax Adjustment");
  const taxableAdjustments = periodAdjustments.filter((item) => item.taxable && !["Deduction", "Tax Adjustment", "Reimbursement"].includes(item.type)).reduce((sum, item) => sum + item.amount, 0);
  const baseGrossSalary = Math.round(
    basicEarnings + houseRentAllowance + conveyanceAllowance + medicalAllowance + otherAllowances + overtimePay - unpaidLeaveDeduction
  );
  const grossSalary = baseGrossSalary + bonusEarnings + commissionEarnings + arrearsEarnings;
  const perquisitesValue = Math.max(0, (employee.perquisiteVehicleMonthly || 0) + (employee.perquisiteAccommodationMonthly || 0) + (employee.perquisiteOtherMonthly || 0));
  const exemptAllowance = isDailyWager ? 0 : Math.round(Math.min(medicalAllowance, basicEarnings * Math.max(0, statConfigs.medicalAllowanceExemptPercentOfBasic ?? 0) / 100));
  const taxableGrossSalary = Math.max(0, baseGrossSalary + taxableAdjustments + perquisitesValue - exemptAllowance);
  let incomeTaxDeduction = 0;
  let taxReconciliation = {
    taxYear: pakistanTaxYearForPeriod(month, year),
    taxableIncomeYtd: grossSalary,
    taxDeductedBeforeCurrentPeriod: 0,
    projectedAnnualTaxableIncome: grossSalary * 12,
    projectedAnnualTaxLiability: 0,
    surchargeAnnual: 0,
    incomeTaxDeduction: 0
  };
  if (employee.fbrEnabled !== false) {
    taxReconciliation = calculateReconciledMonthlyTax(employee, taxableGrossSalary, month, year, taxSlabs, historicalPayslips, statConfigs);
    incomeTaxDeduction = taxReconciliation.incomeTaxDeduction;
  }
  let eobiEmployeeDeduction = 0;
  let eobiEmployerContribution = 0;
  if (employee.eobiEnabled !== false) {
    if (employee.eobiNumber || !isDailyWager) {
      eobiEmployeeDeduction = Math.round(statConfigs.minimumWage * (statConfigs.eobiEmployeeRate / 100));
      eobiEmployerContribution = Math.round(statConfigs.minimumWage * (statConfigs.eobiEmployerRate / 100));
    }
  }
  const pessiEmployerContribution = socialSecurityContribution(employee, branch?.province, statConfigs, basicEarnings, isDailyWager).amount;
  let providentFundDeduction = 0;
  let providentFundEmployerContribution = 0;
  if (employee.providentFundOptIn) {
    providentFundDeduction = Math.round(basicEarnings * (employee.providentFundRate / 100));
    providentFundEmployerContribution = providentFundDeduction;
  }
  const activeLoans = loanAdvances.filter(
    (l) => l.employeeId === employee.id && l.status === "Active" && l.remainingInstallments > 0
  );
  const loanRepaymentDeduction = activeLoans.reduce((sum, l) => sum + l.monthlyInstallment, 0);
  const totalDeductions = Math.round(
    incomeTaxDeduction + manualTaxAdjustment + eobiEmployeeDeduction + providentFundDeduction + loanRepaymentDeduction + otherAdjustmentsDeduction
  );
  const netSalary = Math.max(0, grossSalary + reimbursements - totalDeductions);
  const departmentName = departments.find((d) => d.id === employee.departmentId)?.name || "Unknown Dept";
  const designationTitle = designations.find((d) => d.id === employee.designationId)?.title || "Unknown Title";
  const branchName = branch?.name || "Unknown Branch";
  return {
    id: `pay-${employee.id}-${month}-${year}`,
    payrollRunId: "",
    employeeId: employee.id,
    employeeName: employee.fullName,
    employeeCode: employee.employeeCode,
    cnic: employee.cnic,
    departmentName,
    designationTitle,
    branchName,
    bankName: employee.bankName,
    bankAccountNumber: employee.bankAccountNumber,
    iban: employee.iban,
    totalDaysInMonth,
    daysPresent: presentDays,
    daysAbsent: absentDays,
    daysLeave: leaveDays,
    unpaidLeaveDays,
    overtimeHours,
    overtimePay,
    basicEarnings: Math.round(basicEarnings),
    houseRentAllowance: Math.round(houseRentAllowance),
    conveyanceAllowance: Math.round(conveyanceAllowance),
    medicalAllowance: Math.round(medicalAllowance),
    otherAllowances,
    bonusEarnings,
    commissionEarnings,
    arrearsEarnings,
    reimbursements,
    otherAdjustmentsDeduction,
    manualTaxAdjustment,
    payrollAdjustmentIds: periodAdjustments.map((item) => item.id),
    grossSalary,
    incomeTaxDeduction,
    ...taxReconciliation,
    eobiEmployeeDeduction,
    pessiEmployeeDeduction: 0,
    // usually paid 100% by employer in Pak
    providentFundDeduction,
    loanRepaymentDeduction,
    unpaidLeaveDeduction: Math.round(unpaidLeaveDeduction),
    totalDeductions,
    netSalary,
    eobiEmployerContribution,
    pessiEmployerContribution,
    providentFundEmployerContribution,
    province: branch?.province,
    paidDays: presentDays + paidLeaveDays + halfDays * 0.5,
    scheduledWorkingDays,
    notJoinedDays,
    absenceDeductionBasis,
    attendanceSource: register ? "Certified Register" : "Attendance Logs",
    explicitAbsentDays,
    taxableIncomeThisPeriod: taxableGrossSalary,
    perquisitesValue,
    exemptAllowance,
    runType: "Regular",
    statutoryConfigId: statConfigs.id,
    calculationVersion: "PK-PAYROLL-3.0-YTD",
    periodMonth: month,
    periodYear: year
  };
}

// src/data/bankAdvice.ts
function bankAdvicePayload(payslips) {
  return JSON.stringify(payslips.slice().sort((a, b) => (a.id || "").localeCompare(b.id || "")).map((item) => ({
    id: item.id,
    employeeId: item.employeeId,
    employeeCode: item.employeeCode,
    bankName: item.bankName,
    iban: (item.iban || "").replace(/\s/g, "").toUpperCase(),
    bankAccountNumber: item.bankAccountNumber,
    netSalary: item.netSalary
  })));
}

// src/data/payrollPreflight.ts
function payrollPreflight(employees, draftPayslips, historicalPayslips, branches, statutoryConfig, wageTypes = []) {
  const issues = [];
  const normalizeIdentity = (value) => (value || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  const duplicateCNICs = /* @__PURE__ */ new Map();
  const duplicateBankAccounts = /* @__PURE__ */ new Map();
  for (const employee of employees.filter((item) => item.status !== "Terminated")) {
    const cnic = normalizeIdentity(employee.cnic);
    const bankIdentity = normalizeIdentity(employee.iban) || `${normalizeIdentity(employee.bankName)}:${normalizeIdentity(employee.bankAccountNumber)}`;
    if (cnic) duplicateCNICs.set(cnic, [...duplicateCNICs.get(cnic) || [], employee]);
    if (bankIdentity && bankIdentity !== ":") duplicateBankAccounts.set(bankIdentity, [...duplicateBankAccounts.get(bankIdentity) || [], employee]);
  }
  for (const sheet of draftPayslips) {
    const employee = employees.find((item) => item.id === sheet.employeeId);
    if (!employee) continue;
    const add = (severity, code, message) => issues.push({ employeeId: employee.id, employeeName: employee.fullName, severity, code, message });
    if (!/^\d{5}-\d{7}-\d$/.test(employee.cnic || "")) add("Critical", "INVALID_CNIC", "CNIC is missing or invalid.");
    const cnicMatches = duplicateCNICs.get(normalizeIdentity(employee.cnic)) || [];
    if (cnicMatches.length > 1) add("Critical", "DUPLICATE_CNIC", `CNIC is also assigned to ${cnicMatches.filter((item) => item.id !== employee.id).map((item) => item.fullName).join(", ")}. Resolve the duplicate before payroll.`);
    if (!employee.bankName?.trim() || !employee.bankAccountNumber?.trim()) add("Critical", "MISSING_BANK", "Bank name or account number is missing.");
    if (employee.iban && !/^PK\d{2}[A-Z0-9]{20}$/i.test(employee.iban.replace(/\s/g, ""))) add("Critical", "INVALID_IBAN", "IBAN must be a valid 24-character Pakistan IBAN.");
    if (employee.fbrEnabled !== false && !employee.ntn?.trim()) add("Warning", "MISSING_NTN", "FBR withholding is enabled but the employee NTN is not recorded.");
    const bankIdentity = normalizeIdentity(employee.iban) || `${normalizeIdentity(employee.bankName)}:${normalizeIdentity(employee.bankAccountNumber)}`;
    const bankMatches = duplicateBankAccounts.get(bankIdentity) || [];
    if (bankIdentity !== ":" && bankMatches.length > 1) add("Warning", "DUPLICATE_BANK_ACCOUNT", `Payment account is also used by ${bankMatches.filter((item) => item.id !== employee.id).map((item) => item.fullName).join(", ")}. Confirm this shared account is legitimate before release.`);
    if (!Number.isFinite(sheet.netSalary) || sheet.netSalary <= 0) add("Critical", "NON_POSITIVE_NET", "Net salary is zero or negative.");
    if (branches && statutoryConfig) {
      const province = employeeProvince(employee, branches);
      const policy = provincialPolicy(statutoryConfig, province, branches.find((branch) => branch.id === employee.branchId)?.establishmentType);
      const monthlyBasic = resolveWageBasis(employee, wageTypes) === "Daily" ? employee.basicSalary * 26 : employee.basicSalary;
      if (monthlyBasic < policy.minimumWage) add("Critical", "BELOW_MINIMUM_WAGE", `Basic wage is below the ${policy.province} configured minimum wage of PKR ${policy.minimumWage.toLocaleString()}.`);
      if (employee.eobiEnabled === false && !employee.eobiExemptionReason?.trim()) add("Warning", "MISSING_EOBI_REASON", "EOBI is disabled without a documented exemption reason.");
      if (!employee.socialSecurityNumber && !employee.socialSecurityExemptionReason?.trim()) add("Warning", "MISSING_SOCIAL_SECURITY_REASON", `${policy.scheme} registration is missing without a documented exemption reason.`);
    }
    const previous = historicalPayslips.filter((item) => item.employeeId === employee.id && item.payrollRunId !== sheet.payrollRunId).sort((a, b) => (b.periodYear || 0) - (a.periodYear || 0) || (b.periodMonth || 0) - (a.periodMonth || 0))[0];
    if (previous?.netSalary > 0) {
      const variance = Math.abs(sheet.netSalary - previous.netSalary) / previous.netSalary;
      if (variance >= 0.25) add("Warning", "NET_VARIANCE", `Net salary changed by ${Math.round(variance * 100)}% from the previous payroll.`);
    }
  }
  return issues;
}

// src/data/lifecycle.ts
function gratuityServiceYears(dateOfJoining, separationDate, rules) {
  const months = Math.max(0, (Date.parse(`${separationDate}T00:00:00Z`) - Date.parse(`${dateOfJoining}T00:00:00Z`)) / (30.436875 * 864e5));
  const completed = Math.floor(months / 12);
  return completed + (rules.gratuityCountPartYearOverSixMonths && months - completed * 12 > 6 ? 1 : 0);
}
function gratuityEntitlement(monthlyBasis, dateOfJoining, separationDate, separationType, rules) {
  const years = gratuityServiceYears(dateOfJoining, separationDate, rules);
  const exactYears = Math.max(0, (Date.parse(`${separationDate}T00:00:00Z`) - Date.parse(`${dateOfJoining}T00:00:00Z`)) / (365.2425 * 864e5));
  if (exactYears < (rules.gratuityMinimumServiceYears ?? 1)) return { years, amount: 0 };
  const daily = monthlyBasis / (rules.settlementDailyRateDivisor || 30);
  const resignationPercent = separationType === "Resignation" && exactYears < 5 ? rules.gratuityResignationUnderFiveYearsPercent ?? 100 : 100;
  return { years, amount: Math.round(daily * rules.gratuityRateDaysPerYear * years * resignationPercent / 100) };
}
function calculateFinalSettlement(employee, separationType, separationDate, leaveEncashDays, noticeDays, statConfig, wageTypes = []) {
  const monthlyBasis = resolveWageBasis(employee, wageTypes) === "Daily" ? employee.basicSalary * 26 : employee.basicSalary;
  const daily = monthlyBasis / (statConfig.settlementDailyRateDivisor || 30);
  const entitlement = gratuityEntitlement(monthlyBasis, employee.dateOfJoining, separationDate, separationType, statConfig);
  const completedYears = entitlement.years;
  const gratuityAmount = employee.gratuityOptIn ? entitlement.amount : 0;
  const leaveEncashmentAmount = Math.round(daily * Math.max(0, leaveEncashDays));
  const noticePayAmount = Math.round(daily * Math.max(0, noticeDays));
  return {
    employeeId: employee.id,
    separationType,
    lastWorkingDate: separationDate,
    separationDate,
    yearsOfService: completedYears,
    basicSalaryAtSeparation: monthlyBasis,
    gratuityAmount,
    encashableLeaveDays: Math.max(0, leaveEncashDays),
    leaveEncashmentAmount,
    noticePayDays: Math.max(0, noticeDays),
    noticePayAmount,
    pendingSalaryDays: 0,
    pendingSalaryAmount: 0,
    totalSettlementAmount: gratuityAmount + leaveEncashmentAmount + noticePayAmount
  };
}

// src/data/masterCodes.ts
var ascii = (value = "") => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
var words = (value = "") => ascii(value).match(/[A-Z0-9]+/g) ?? [];
var compactToken = (value = "", max = 8) => words(value).join("").slice(0, max);
var readableToken = (value = "", max = 6) => {
  const parts = words(value);
  if (parts.length > 1) return parts.map((part) => part[0]).join("").slice(0, max);
  return (parts[0] ?? "").slice(0, max);
};
var recordToken = (record, max = 8) => compactToken(record?.code, max) || readableToken(record?.name, max);
var companyCodeToken = (company) => compactToken(company?.code, 8) || readableToken(company?.name, 6);
var normalizeManualMasterCode = (value = "") => (value || "").trim().toUpperCase();
function nextUniqueMasterCode(base, records, currentId = "") {
  if (!base) return "";
  const used = new Set(records.filter((record) => record.id !== currentId && record.code).map((record) => normalizeManualMasterCode(record.code ?? "")));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${String(suffix).padStart(2, "0")}`)) suffix += 1;
  return `${base}-${String(suffix).padStart(2, "0")}`;
}
function designationCodeBase(title, company, branch, department) {
  const tokens = [companyCodeToken(company), recordToken(branch), recordToken(department), readableToken(title)];
  return tokens.every(Boolean) ? tokens.join("-") : "";
}
function departmentCodeBase(name, company, branch) {
  const tokens = [companyCodeToken(company), recordToken(branch), readableToken(name)];
  return tokens.every(Boolean) ? tokens.join("-") : "";
}
function zoneCodeBase(name, company) {
  const tokens = [companyCodeToken(company), "ZN", readableToken(name, 8)];
  return tokens.every(Boolean) ? tokens.join("-") : "";
}
function ucTownCodeBase(name, zone) {
  const child = ascii(name).replace(/^\s*(?:(?:UC|TOWN)\s*[-_./]*\s*)+/i, "");
  const tokens = [words(zone?.code).join("-"), "UC", compactToken(child, 8)];
  return tokens.every(Boolean) ? tokens.join("-") : "";
}
function wageTypeCodeBase(name, company) {
  const tokens = [companyCodeToken(company), "WT", readableToken(name, 6)];
  return tokens.every(Boolean) ? tokens.join("-") : "";
}
function generateMasterCode(kind, input, records, currentId = "") {
  const base = kind === "department" ? departmentCodeBase(input.name, input.company, input.branch) : kind === "designation" ? designationCodeBase(input.title, input.company, input.branch, input.department) : kind === "zone" ? zoneCodeBase(input.name, input.company) : kind === "ucTown" ? ucTownCodeBase(input.name, input.zone) : wageTypeCodeBase(input.name, input.company);
  return nextUniqueMasterCode(base, records, currentId);
}
var LEGAL_SUFFIXES = /\b(?:pvt|private|ltd|limited|llc|inc|corp|corporation|co|company|pk|pakistan|smc|plc)\b\.?/gi;
function companyInitialsPrefix(name) {
  const cleaned = (name || "").replace(/\(.*?\)/g, " ").replace(LEGAL_SUFFIXES, " ");
  const parts = cleaned.replace(/([a-z0-9])([A-Z])/g, "$1 $2").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!parts.length) return "EMP";
  let prefix = parts.map((part) => part[0]).join("").slice(0, 3);
  const last = parts[parts.length - 1];
  for (let index = 1; prefix.length < 3 && index < last.length; index += 1) prefix += last[index];
  return prefix.toUpperCase().padEnd(3, "X");
}

// scripts/seed-demo-workflow.ts
import_dotenv.default.config({ path: [".env.local", ".env"], quiet: true });
var CLEARED_TABLES = [
  "payslip_alert_deliveries",
  "payslip_deliveries",
  "payroll_payslips",
  "payroll_runs",
  "payroll_adjustments",
  "attendance_periods",
  "attendances",
  "leaves",
  "mobile_duty_authorizations",
  "loan_advances",
  "salary_revisions",
  "performance_reviews",
  "gratuity_settlements",
  "lifecycle_requests",
  "company_assets",
  "job_applications",
  "job_postings",
  "notifications",
  "employee_documents",
  "biometric_templates",
  "employees",
  "designations",
  "departments",
  "uc_towns",
  "zones",
  "wage_types",
  "holidays"
];
var CLEARED_LEGACY_COLLECTIONS = [
  "payrollPayslips",
  "payrollRuns",
  "payrollAdjustments",
  "attendancePeriods",
  "attendances",
  "leaves",
  "mobileDutyAuthorizations",
  "loanAdvances",
  "salaryRevisions",
  "performanceReviews",
  "gratuitySettlements",
  "lifecycleRequests",
  "companyAssets",
  "jobApplications",
  "jobPostings",
  "notifications",
  "biometricTemplates",
  "employees",
  "designations",
  "departments",
  "ucTowns",
  "zones",
  "wageTypes",
  "holidays"
];
var args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || "true"];
}));
var dryRun = args.has("dry-run");
var pad = (value) => String(value).padStart(2, "0");
var ymd = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`;
var daysIn = (year, month) => new Date(year, month, 0).getDate();
var weekday = (date) => (/* @__PURE__ */ new Date(`${date}T00:00:00`)).getDay();
var addDays = (date, days) => {
  const d = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
var addMonths = (year, month, delta) => {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: index % 12 + 1 };
};
var monthName = (year, month) => new Date(year, month - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
var taxYearOf = (year, month) => String(month >= 7 ? year + 1 : year);
var noise = (key) => import_node_crypto.default.createHash("sha256").update(key).digest().readUInt32BE(0) / 4294967295;
var minutesToTime = (minutes) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}:00`;
var now = /* @__PURE__ */ new Date();
var today = now.toISOString().slice(0, 10);
var yesterday = addDays(today, -1);
var openMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
var iso = (date, time = "10:00:00") => `${date}T${time}+05:00`;
async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is not set (.env.local or environment).");
  const pool = new import_pg.default.Pool({
    connectionString: databaseUrl,
    ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "false" } : false
  });
  const client = await pool.connect();
  try {
    const database = (await client.query("SELECT current_database() AS name")).rows[0].name;
    if (args.get("yes-clear") !== database) {
      throw new Error(`This clears every employee, attendance, leave, payroll and HR record in database "${database}" (users, roles, companies, branches and statutory settings are kept).
Back up first (npm run postgres:backup), then re-run with --yes-clear=${database}  (add --dry-run to preview without saving).`);
    }
    const rows = async (table) => (await client.query(`SELECT id, data FROM ${table} ORDER BY created_at, id`)).rows.map((row) => ({ ...row.data, id: row.id }));
    let companies = await rows("companies");
    let branches = await rows("branches");
    const statConfigs = await rows("stat_config");
    let taxSlabs = await rows("tax_slabs");
    const users = (await client.query(`SELECT id, data FROM users`)).rows.map((row) => ({ ...row.data, id: row.id }));
    const roleIds = new Set((await client.query(`SELECT id FROM roles`)).rows.map((row) => row.id));
    const notes = [];
    const created = [];
    if (!companies.length) {
      companies = [{
        id: "co-demo",
        name: "Demo Textiles",
        legalName: "Demo Textiles (Pvt) Ltd",
        industry: "Textiles",
        taxRegistrationNumber: "1234567-8",
        ntn: "1234567-8",
        eobiRegistrationNumber: "EOBI-LHR-1001",
        socialSecurityRegion: "Punjab",
        city: "Lahore",
        province: "Punjab",
        status: "Active",
        payrollFrequency: "Monthly",
        defaultCurrency: "PKR"
      }];
      created.push('company "Demo Textiles" (no company existed)');
    }
    const company = companies[0];
    if (!branches.some((branch) => branch.companyId === company.id)) {
      branches = [...branches, {
        id: "br-demo-hq",
        companyId: company.id,
        code: "HQ",
        name: "Head Office",
        city: company.city || "Lahore",
        province: company.province || "Punjab",
        address: company.registeredAddress || "Main Boulevard",
        establishmentType: "Shop / Commercial",
        geofenceLatitude: 31.5204,
        geofenceLongitude: 74.3587,
        geofenceRadiusMeters: 250
      }];
      created.push('branch "Head Office" (the company had no branch)');
    }
    const companyBranches = branches.filter((branch) => branch.companyId === company.id);
    const headOffice = companyBranches[0];
    const site = companyBranches[1] || headOffice;
    const months = [-3, -2, -1].map((delta) => addMonths(openMonth.year, openMonth.month, delta));
    let statConfig = statConfigs.find((config2) => config2.taxYear === taxYearOf(openMonth.year, openMonth.month));
    if (!statConfig && !statConfigs.length) {
      statConfig = { ...DEFAULT_STATUTORY_CONFIG };
      created.push(`statutory configuration ${statConfig.id} (none existed)`);
    }
    if (!statConfig) {
      const taxYear = taxYearOf(openMonth.year, openMonth.month);
      const found = statConfigs.map((item) => `${item.id}: tax year "${item.taxYear ?? ""}", effective from ${item.effectiveFrom || "(blank)"}`).join("\n  ");
      throw new Error(`No statutory configuration covers Tax Year ${taxYear} (July ${Number(taxYear) - 1} - June ${taxYear}). Found:
  ${found}
Payroll needs the tax year written exactly as "${taxYear}". Propose it under Settings \u2192 Statutory Config (tax year ${taxYear}, effective from ${Number(taxYear) - 1}-07-01) and have a second admin approve it; nothing was changed.`);
    }
    const config = statConfig;
    const missingRates = ["minimumWage", "eobiEmployerRate", "eobiEmployeeRate", "pessiEmployerRate", "gratuityRateDaysPerYear"].filter((field) => !Number.isFinite(Number(config[field])));
    if (missingRates.length) {
      throw new Error(`Statutory configuration ${config.id} is incomplete (missing ${missingRates.join(", ")}). Complete it under Settings \u2192 Statutory Governance first; nothing was changed.`);
    }
    const payrollMonths = months.filter(({ year, month }) => taxYearOf(year, month) === config.taxYear && (!config.effectiveFrom || ymd(year, month, 1) >= config.effectiveFrom));
    if (payrollMonths.length < months.length) notes.push(`Payroll seeded for ${payrollMonths.length} month(s) only: earlier months fall outside Tax Year ${config.taxYear}.`);
    if (!taxSlabs.length) {
      taxSlabs = DEFAULT_TAX_SLABS;
      created.push("FBR tax slabs (none existed)");
    }
    const firstMonth = payrollMonths[0] || openMonth;
    const seedStart = ymd(firstMonth.year, firstMonth.month, 1);
    const departments = [];
    const designations = [];
    const department = (key, name, branch) => {
      const item = { id: `dep-${key}`, branchId: branch.id, name, code: generateMasterCode("department", { name, title: "", company, branch }, departments) };
      departments.push(item);
      return item;
    };
    const designation = (key, dept, title, grade) => {
      const branch = companyBranches.find((item2) => item2.id === dept.branchId);
      const item = { id: `des-${key}`, departmentId: dept.id, title, grade, code: generateMasterCode("designation", { name: "", title, company, branch, department: dept }, designations) };
      designations.push(item);
      return item;
    };
    const hr = department("hr", "Human Resources", headOffice);
    const fin = department("fin", "Finance & Accounts", headOffice);
    const it = department("it", "Information Technology", headOffice);
    const sales = department("sales", "Sales & Marketing", headOffice);
    const prd = department("prd", "Production", site);
    const qc = department("qc", "Quality Control", site);
    const adm = department("adm", "Administration & Security", site);
    const D = {
      hrm: designation("hr-manager", hr, "HR Manager", "M2"),
      hro: designation("hr-officer", hr, "HR Officer", "O1"),
      fm: designation("fin-manager", fin, "Finance Manager", "M2"),
      acc: designation("accountant", fin, "Accountant", "O2"),
      ito: designation("it-officer", it, "IT Officer", "O2"),
      sm: designation("sales-manager", sales, "Sales Manager", "M1"),
      se: designation("sales-exec", sales, "Sales Executive", "O1"),
      sup: designation("supervisor", prd, "Production Supervisor", "S1"),
      opr: designation("operator", prd, "Machine Operator", "W1"),
      qci: designation("qc-inspector", qc, "QC Inspector", "W2"),
      sg: designation("security", adm, "Security Guard", "W1"),
      ao: designation("admin-officer", adm, "Admin Officer", "O1")
    };
    const wageTypes = [];
    for (const [key, name, calculationBasis] of [["monthly", "Monthly Salaried", "Monthly"], ["daily", "Daily Wager", "Daily"]]) {
      wageTypes.push({ id: `wt-${key}`, companyId: company.id, name, calculationBasis, status: "Active", code: generateMasterCode("wageType", { name, title: "", company }, wageTypes) });
    }
    const zones = [];
    const ucTowns = [];
    for (const [key, name, towns] of [["north", "North Zone", ["Shadman", "Model Town"]], ["south", "South Zone", ["Township", "Johar Town"]]]) {
      const zone = { id: `zone-${key}`, companyId: company.id, name, status: "Active", code: generateMasterCode("zone", { name, title: "", company }, zones) };
      zones.push(zone);
      towns.forEach((town, index) => ucTowns.push({ id: `uc-${key}-${index + 1}`, zoneId: zone.id, name: town, status: "Active", code: generateMasterCode("ucTown", { name: town, title: "", zone }, ucTowns) }));
    }
    const officeShift = { id: "shift-office", name: "Office Shift", startTime: "09:00", endTime: "17:00", graceMinutes: 15, halfDayMinutes: 120, overtimeMultiplier: 2, breakMinutes: 60, overtimeAfterMinutes: 480, workingDays: [1, 2, 3, 4, 5, 6], fridayStartTime: "09:00", fridayEndTime: "17:30" };
    const factoryShift = { ...officeShift, id: "shift-factory", name: "Factory Morning Shift", startTime: "08:00", endTime: "16:00", fridayStartTime: "08:00", fridayEndTime: "16:30" };
    const prefix = companyInitialsPrefix(company.name || company.legalName);
    const sequence = /* @__PURE__ */ new Map();
    const codeFor = (dept) => {
      const token = dept.code.split("-").filter(Boolean).pop().replace(/[^A-Z0-9]/g, "");
      const next = (sequence.get(token) || 0) + 1;
      sequence.set(token, next);
      return `${prefix}-${token}-${String(next).padStart(5, "0")}`;
    };
    const monthTwoStart = payrollMonths[1] ? ymd(payrollMonths[1].year, payrollMonths[1].month, 1) : seedStart;
    const newJoinerDate = addDays(monthTwoStart, 16);
    const seeds = [
      ["e01", "Ayesha Siddiqui", "Female", hr, D.hrm, 21e4, "2019-03-01", { maritalStatus: "Married" }],
      ["e02", "Bilal Ahmed", "Male", hr, D.hro, 85e3, "2022-06-01"],
      ["e03", "Imran Qureshi", "Male", fin, D.fm, 26e4, "2018-01-15", { perquisiteVehicleMonthly: 15e3 }],
      ["e04", "Fatima Noor", "Female", fin, D.acc, 121e3, "2021-09-01"],
      ["e05", "Hassan Raza", "Male", it, D.ito, 11e4, "2023-02-01"],
      ["e06", "Sana Javed", "Female", sales, D.sm, 18e4, "2020-04-01"],
      ["e07", "Usman Tariq", "Male", sales, D.se, 7e4, "2024-01-08", { zoneId: "zone-north", ucTownId: "uc-north-1", zone: "North Zone", ucTown: "Shadman" }],
      ["e08", "Kashif Mehmood", "Male", prd, D.sup, 9e4, "2017-08-01"],
      ["e09", "Zainab Bibi", "Female", prd, D.opr, 42e3, "2022-11-01"],
      ["e10", "Naveed Akhtar", "Male", prd, D.opr, 1600, "2025-03-03", { wageType: "Daily Wager", wageTypeId: "wt-daily", providentFundOptIn: false, gratuityOptIn: false }],
      ["e11", "Rabia Anwar", "Female", qc, D.qci, 52e3, "2023-05-15"],
      ["e12", "Tariq Javed", "Male", qc, D.qci, 5e4, "2021-05-10"],
      ["e13", "Shahid Iqbal", "Male", adm, D.sg, 38e3, "2020-10-01", { eobiEnabled: true }],
      ["e14", "Mariam Khan", "Female", adm, D.ao, 65e3, newJoinerDate, { probationEndDate: addDays(newJoinerDate, 90) }]
    ];
    const managerFor = { hr: "e01", fin: "e03", sales: "e06", prd: "e08", qc: "e08", adm: "e01", it: "e03" };
    const employees = seeds.map(([key, fullName, gender, dept, des, basicSalary, dateOfJoining, extra = {}], index) => {
      const n = String(index + 1).padStart(2, "0");
      const deptKey = dept.id.replace("dep-", "");
      const isFactory = dept === prd || dept === qc;
      const isNewJoiner = key === "e14";
      return {
        id: `emp-${key}`,
        companyId: company.id,
        branchId: dept.branchId,
        departmentId: dept.id,
        designationId: des.id,
        employeeCode: codeFor(dept),
        fullName,
        gender,
        email: `${fullName.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
        contactNumber: `+92300${String(555e4 + index * 137).padStart(7, "0")}`,
        cnic: `35202-${String(41e5 + index * 7919).padStart(7, "0")}-${index % 9 + 1}`,
        cnicExpiryDate: key === "e09" ? addDays(today, 25) : "2032-06-30",
        dateOfBirth: `${1980 + index % 15}-${pad(index % 12 + 1)}-${pad(index % 27 + 1)}`,
        dateOfJoining,
        status: "Active",
        wageType: "Monthly Salaried",
        wageTypeId: "wt-monthly",
        employmentType: "Permanent",
        basicSalary,
        shiftId: isFactory ? factoryShift.id : officeShift.id,
        shift: isFactory ? factoryShift : officeShift,
        providentFundOptIn: true,
        providentFundRate: 5,
        gratuityOptIn: true,
        bankName: index % 3 === 0 ? "Habib Bank Limited (HBL)" : index % 3 === 1 ? "Meezan Bank" : "United Bank Limited (UBL)",
        bankBranchName: index % 2 ? "Gulberg" : "Main Branch",
        bankAccountNumber: `0${n}7${String(31415926 + index * 2718).padStart(10, "0")}`,
        iban: `PK${String(10 + index).padStart(2, "0")}${index % 3 === 0 ? "HABB" : index % 3 === 1 ? "MEZN" : "UNIL"}${String(1e15 + index * 7777777).slice(0, 16)}`,
        eobiNumber: `EOBI-${2e3 + index * 17}`,
        socialSecurityNumber: isNewJoiner ? "" : `PESSI-${7700 + index * 13}`,
        socialSecurityExemptionReason: isNewJoiner ? "Registration filed, awaiting PESSI number" : void 0,
        // An individual's NTN is their CNIC number.
        ntn: `35202${String(41e5 + index * 7919).padStart(7, "0")}${index % 9 + 1}`,
        fbrEnabled: true,
        eobiEnabled: true,
        reportingManagerId: managerFor[deptKey] && managerFor[deptKey] !== key ? `emp-${managerFor[deptKey]}` : void 0,
        workerCategory: des.grade.startsWith("M") ? "Managerial" : des.grade.startsWith("S") ? "Supervisory" : "Worker",
        emergencyContactName: "Next of kin",
        emergencyContactNumber: `+92321${String(444e4 + index).padStart(7, "0")}`,
        bankVerifiedAt: isNewJoiner ? void 0 : iso(addDays(dateOfJoining, 7)),
        bankVerifiedBy: isNewJoiner ? void 0 : "HR Manager",
        probationConfirmedAt: isNewJoiner ? void 0 : iso(addDays(dateOfJoining, 92)),
        onboardingChecklist: isNewJoiner ? { cnicCopy: { done: true, at: iso(newJoinerDate), by: "HR Officer" }, appointmentLetter: { done: true, at: iso(newJoinerDate), by: "HR Officer" } } : { cnicCopy: { done: true }, appointmentLetter: { done: true }, bankVerified: { done: true }, policyAcknowledged: { done: true } },
        ...extra
      };
    });
    const emp = (key) => employees.find((item) => item.id === `emp-${key}`);
    const holidays = [
      ["Independence Day", `${openMonth.year}-08-14`, true],
      ["Eid Milad-un-Nabi (approx.)", `${openMonth.year}-08-26`, false],
      ["Iqbal Day", `${openMonth.year}-11-09`, true],
      ["Quaid-e-Azam Day", `${openMonth.year}-12-25`, true],
      ["Kashmir Solidarity Day", `${openMonth.year + 1}-02-05`, true],
      ["Pakistan Day", `${openMonth.year + 1}-03-23`, true],
      ["Labour Day", `${openMonth.year + 1}-05-01`, true]
    ].map(([name, date, isRecurring], index) => ({ id: `hol-${index + 1}`, name, date, type: "Public", isRecurring, description: "Gazetted public holiday" }));
    const holidayDates = new Set(holidays.map((item) => item.date));
    const isWorkday = (employee, date) => (employee.shift?.workingDays || [1, 2, 3, 4, 5, 6]).includes(weekday(date)) && !holidayDates.has(date);
    const nthWorkday = (year, month, n) => {
      let count = 0;
      for (let day = 1; day <= daysIn(year, month); day += 1) {
        const date = ymd(year, month, day);
        if (weekday(date) !== 0 && !holidayDates.has(date) && ++count === n) return date;
      }
      return ymd(year, month, daysIn(year, month));
    };
    const workdaysFrom = (start, count) => {
      for (let first = start; ; first = addDays(first, 1)) {
        const dates = Array.from({ length: count }, (_, offset) => addDays(first, offset));
        if (dates.every((date) => weekday(date) !== 0 && !holidayDates.has(date))) return dates;
      }
    };
    const leaves = [];
    const leave = (id, key, leaveType, dates, status, reason) => {
      const request = { id, employeeId: `emp-${key}`, leaveType, startDate: dates[0], endDate: dates[dates.length - 1], totalDays: dates.length, reason, status, appliedOn: addDays(dates[0], -5) };
      if (status !== "Pending") Object.assign(request, { approvedBy: "Ayesha Siddiqui (HR Manager)", approvedOn: addDays(dates[0], -3) });
      leaves.push(request);
      return request;
    };
    const [m1, m2, m3] = [payrollMonths[0], payrollMonths[1], payrollMonths[2]];
    if (m1) leave("lv-01", "e01", "Annual", workdaysFrom(nthWorkday(m1.year, m1.month, 8), 3), "Approved", "Family visit to Islamabad");
    if (m2) leave("lv-02", "e04", "Sick", [nthWorkday(m2.year, m2.month, 5)], "Approved", "Fever, medical certificate attached");
    if (m2) leave("lv-03", "e11", "Unpaid", workdaysFrom(nthWorkday(m2.year, m2.month, 12), 2), "Approved", "Personal matter, paid leave balance kept for later");
    if (m3) leave("lv-04", "e09", "Casual", [nthWorkday(m3.year, m3.month, 10)], "Approved", "Child school meeting");
    if (m3) leave("lv-05", "e07", "Annual", workdaysFrom(nthWorkday(m3.year, m3.month, 18), 2), "Rejected", "Requested during month-end sales closing");
    const futureDates = workdaysFrom(addDays(today, 3), 2);
    leave("lv-06", "e02", "Annual", futureDates, "Approved", "Sister wedding");
    leave("lv-07", "e11", "Casual", [workdaysFrom(addDays(today, 1), 1)[0]], "Pending", "Applied from the mobile app: bank work");
    leave("lv-08", "e05", "Annual", workdaysFrom(addDays(today, 7), 4), "Pending", "Umrah travel");
    const onLeave = (employeeId, date) => leaves.some((item) => item.employeeId === employeeId && item.status === "Approved" && item.startDate <= date && item.endDate >= date);
    const sitePoint = { lat: headOffice.geofenceLatitude ?? 31.5204, lng: headOffice.geofenceLongitude ?? 74.3587 };
    const duty = {
      id: "mda-e07",
      employeeId: "emp-e07",
      dutyType: "Market / field duty",
      validFrom: seedStart,
      validTo: `${openMonth.year}-12-31`,
      instructions: "Visit retailers in North Zone daily; punch in/out from the mobile app and check in at each shop.",
      assignedLocation: "North Zone markets",
      allowFieldVisits: true,
      status: "Approved",
      assignedByUserId: "demo-hr-manager",
      assignedByName: "Ayesha Siddiqui (HR Manager)",
      createdAt: iso(seedStart),
      updatedAt: iso(seedStart)
    };
    const attendances = [];
    const absentDays = /* @__PURE__ */ new Set();
    if (m3) absentDays.add(`emp-e13|${nthWorkday(m3.year, m3.month, 6)}`);
    if (m2) absentDays.add(`emp-e10|${nthWorkday(m2.year, m2.month, 9)}`);
    const overtimeKeys = /* @__PURE__ */ new Set(["e08", "e09", "e10"]);
    const methodFor = (key) => key === "e07" ? "Mobile GPS" : ["e05", "e06", "e14"].includes(key) ? "Camera" : "Biometric";
    const location = (date, time, offset, address) => ({
      latitude: Number((sitePoint.lat + 0.018 + offset * 4e-3 + (noise(`lat|${date}|${time}`) - 0.5) * 6e-3).toFixed(6)),
      longitude: Number((sitePoint.lng + 0.011 - offset * 3e-3 + (noise(`lng|${date}|${time}`) - 0.5) * 6e-3).toFixed(6)),
      accuracyMeters: 8 + Math.round(noise(`acc|${date}|${time}`) * 14),
      capturedAt: iso(date, time),
      source: "device-gps",
      address
    });
    for (const employee of employees) {
      const key = employee.id.replace("emp-", "");
      const shift = employee.shift;
      const [startH, startM] = shift.startTime.split(":").map(Number);
      for (let date = employee.dateOfJoining > seedStart ? employee.dateOfJoining : seedStart; date <= yesterday; date = addDays(date, 1)) {
        if (!isWorkday(employee, date) || onLeave(employee.id, date) || absentDays.has(`${employee.id}|${date}`)) continue;
        const r = noise(`${employee.id}|${date}`);
        const start = startH * 60 + startM;
        let inMinutes = start - 12 + Math.round(r * 24);
        if (r > 0.93) inMinutes = start + 25 + Math.round(r * 20);
        if (key === "e02" && m1 && date === nthWorkday(m1.year, m1.month, 4)) inMinutes = start + 150;
        const endTime = weekday(date) === 5 && shift.fridayEndTime ? shift.fridayEndTime : shift.endTime;
        const [endH, endM] = endTime.split(":").map(Number);
        let outMinutes = endH * 60 + endM + Math.round(noise(`out|${employee.id}|${date}`) * 20);
        if (overtimeKeys.has(key) && weekday(date) !== 5 && noise(`ot|${employee.id}|${date}`) > 0.55) outMinutes += 120;
        const punchIn = minutesToTime(inMinutes);
        const punchOut = minutesToTime(outMinutes);
        const evaluated = evaluateAttendanceTimes(punchIn, punchOut, shift, [], date);
        const method = methodFor(key);
        const log = {
          id: `att-${employee.id}-${date}`,
          employeeId: employee.id,
          date,
          punchIn,
          punchOut,
          method,
          status: evaluated.status,
          overtimeMinutes: evaluated.overtimeMinutes,
          outReason: "End of Shift",
          employeeBranchId: employee.branchId,
          terminalBranchId: employee.branchId,
          lastPunchAt: iso(date, punchOut),
          ...method !== "Mobile GPS" && { terminalId: employee.branchId === headOffice.id ? "KIOSK-HQ-01" : "KIOSK-SITE-01", terminalLocation: employee.branchId === headOffice.id ? "Head Office Reception" : "Factory Gate" }
        };
        if (method === "Camera") log.biometricMatch = { kind: "face", score: 0.29, threshold: 0.45, strengthPercent: 80, lowConfidence: false };
        if (method === "Biometric") log.biometricMatch = { kind: "fingerprint", score: 1200, threshold: 21474, strengthPercent: 94, lowConfidence: false };
        if (method === "Mobile GPS") {
          const visitIn = minutesToTime(inMinutes + 90);
          const visitOut = minutesToTime(inMinutes + 150);
          Object.assign(log, {
            mobileDutyAuthorizationId: duty.id,
            geofenceStatus: "authorized-offsite",
            punchInReasonCategory: "Field duty",
            punchInReasonNote: "Starting market visits",
            punchOutReasonCategory: "End of field duty",
            punchOutReasonNote: "Route completed",
            punchInLocation: location(date, punchIn, 0, "Shadman Market"),
            punchOutLocation: location(date, punchOut, 2, "Model Town Link Road"),
            latitude: location(date, punchIn, 0, "").latitude,
            longitude: location(date, punchIn, 0, "").longitude,
            locationAccuracyMeters: location(date, punchIn, 0, "").accuracyMeters,
            locationSource: "device-gps",
            fieldVisits: [{
              id: `visit-${date}`,
              clientName: `Retailer ${1 + Math.floor(noise(`client|${date}`) * 40)}`,
              checkIn: visitIn,
              checkOut: visitOut,
              checkInReasonCategory: "Client visit",
              checkInReasonNote: "Order booking",
              checkOutReasonCategory: "Visit completed",
              checkOutReasonNote: "Order taken",
              checkInLocation: location(date, visitIn, 1, "Retail outlet"),
              checkOutLocation: location(date, visitOut, 1, "Retail outlet"),
              method: "Mobile GPS",
              verificationMethod: "Camera"
            }]
          });
        }
        attendances.push(log);
      }
    }
    const attendanceOf = (key, date) => attendances.find((item) => item.id === `att-emp-${key}-${date}`);
    if (m2) {
      const fixed = attendanceOf("e12", nthWorkday(m2.year, m2.month, 7));
      if (fixed) Object.assign(fixed, {
        regularizationRequested: true,
        regularizationReason: "Forgot to punch out; left at 16:05 after shift",
        regularizationApproved: true,
        requestedAt: iso(fixed.date, "17:00:00"),
        requestedById: "emp-e12",
        reviewedAt: iso(addDays(fixed.date, 1)),
        reviewedBy: "Kashif Mehmood (Supervisor)",
        reviewedById: "demo-line-manager",
        reviewComment: "Confirmed with gate register"
      });
    }
    const openDays = attendances.filter((item) => item.date.startsWith(`${openMonth.year}-${pad(openMonth.month)}`));
    const lastOpen = (key) => openDays.filter((item) => item.employeeId === `emp-${key}`).sort((a, b) => b.date.localeCompare(a.date))[0];
    const missing = lastOpen("e09");
    if (missing) {
      delete missing.punchOut;
      missing.overtimeMinutes = 0;
      missing.outReason = void 0;
    }
    const regularize = lastOpen("e12");
    if (regularize) Object.assign(regularize, { regularizationRequested: true, regularizationReason: "Kiosk was offline at the gate; punched late by mistake", requestedAt: iso(regularize.date, "18:00:00"), requestedById: "emp-e12" });
    const lowConfidence = lastOpen("e05");
    if (lowConfidence) lowConfidence.biometricMatch = { kind: "face", score: 0.43, threshold: 0.45, strengthPercent: 10, lowConfidence: true };
    const loans = [
      {
        id: "loan-e08",
        employeeId: "emp-e08",
        type: "Loan",
        principalAmount: 12e4,
        approvedAmount: 12e4,
        disbursedDate: addDays(seedStart, -20),
        totalInstallments: 12,
        remainingInstallments: 12,
        monthlyInstallment: 1e4,
        totalRepaid: 0,
        reason: "Motorcycle purchase",
        status: "Active",
        appliedOn: addDays(seedStart, -35),
        approvedBy: "Imran Qureshi (Finance Manager)",
        approvedOn: addDays(seedStart, -25)
      },
      {
        id: "adv-e10",
        employeeId: "emp-e10",
        type: "Advance",
        principalAmount: 15e3,
        approvedAmount: 0,
        disbursedDate: "",
        totalInstallments: 3,
        remainingInstallments: 3,
        monthlyInstallment: 5e3,
        totalRepaid: 0,
        reason: "Child school admission fee",
        status: "Pending",
        appliedOn: yesterday
      }
    ];
    const adjustments = [];
    const adjustment = (id, key, period, type, amount, taxable, reason, status) => {
      adjustments.push({
        id,
        employeeId: `emp-${key}`,
        periodMonth: period.month,
        periodYear: period.year,
        type,
        amount,
        taxable,
        reason,
        status,
        createdAt: iso(ymd(period.year, period.month, 20)),
        createdById: "demo-payroll-maker",
        createdBy: "Payroll Officer",
        ...status !== "Pending" && { reviewedAt: iso(ymd(period.year, period.month, 22)), reviewedById: "demo-payroll-checker", reviewedBy: "Finance Manager" }
      });
    };
    if (m2) adjustment("adj-commission-e07", "e07", m2, "Commission", 18e3, true, "Sales target achieved (112%)", "Approved");
    if (m3) adjustment("adj-fuel-e07", "e07", m3, "Reimbursement", 6500, false, "Fuel for field visits (receipts on file)", "Approved");
    if (m3) adjustment("adj-bonus-e08", "e08", m3, "Bonus", 1e4, true, "Zero-defect production month", "Approved");
    adjustment("adj-bonus-e09", "e09", openMonth, "Bonus", 5e3, true, "Best operator of the month", "Pending");
    const periods = [];
    const runs = [];
    const payslips = [];
    const notifications = [];
    for (const [index, period] of payrollMonths.entries()) {
      const lockedOn = iso(addDays(ymd(period.year, period.month, daysIn(period.year, period.month)), 2), "11:00:00");
      const locked = createAttendancePeriod(attendances, employees, leaves, holidays, period.month, period.year, "Ayesha Siddiqui (HR Manager)", lockedOn);
      periods.push(locked);
      const runId = `run-${period.month}-${period.year}-seed`;
      const sheets = employees.filter((item) => item.status === "Active" || item.status === "On Leave").map((item) => ({
        ...computePayslipDetails(item, period.month, period.year, attendances, leaves, config, taxSlabs, departments, designations, companyBranches, loans, wageTypes, holidays, payslips, adjustments, locked.registerRows),
        id: `${runId}-${item.id}`,
        payrollRunId: runId
      }));
      const critical = payrollPreflight(employees, sheets, payslips, companyBranches, config, wageTypes).filter((issue) => issue.severity === "Critical");
      if (critical.length) throw new Error(`Payroll preflight failed for ${monthName(period.year, period.month)}: ${critical.map((issue) => `${issue.employeeName}: ${issue.message}`).join("; ")}`);
      const isLast = index === payrollMonths.length - 1;
      const createdAt = addDays(ymd(period.year, period.month, daysIn(period.year, period.month)), 3);
      const sum = (field) => sheets.reduce((total, sheet) => total + Number(sheet[field] || 0), 0);
      const run = {
        id: runId,
        title: `Payroll - ${monthName(period.year, period.month)}`,
        periodMonth: period.month,
        periodYear: period.year,
        startDate: ymd(period.year, period.month, 1),
        endDate: ymd(period.year, period.month, daysIn(period.year, period.month)),
        status: isLast ? "Approved" : "Disbursed",
        createdAt,
        totalGrossPay: sum("grossSalary"),
        totalDeductions: sum("totalDeductions"),
        totalNetPay: sum("netSalary"),
        totalEobiEmployer: sum("eobiEmployerContribution"),
        totalSocialSecurityEmployer: sum("pessiEmployerContribution"),
        employeeCount: sheets.length,
        statutoryConfigId: config.id,
        statutoryEffectiveFrom: config.effectiveFrom,
        createdById: "demo-payroll-maker",
        attendancePeriodId: locked.id,
        attendanceIntegrityHash: locked.integrityHash,
        attendanceRegisterHash: locked.registerHash,
        preflightCriticalCount: 0,
        preflightWarningCount: payrollPreflight(employees, sheets, payslips, companyBranches, config, wageTypes).length,
        approvedAt: iso(addDays(createdAt, 1), "15:00:00"),
        approvedBy: "Imran Qureshi (Finance Manager)",
        approvedById: "demo-payroll-checker",
        bankAdviceChecksum: import_node_crypto.default.createHash("sha256").update(bankAdvicePayload(sheets)).digest("hex"),
        bankAdviceGeneratedAt: iso(addDays(createdAt, 2), "10:00:00"),
        bankAdviceGeneratedById: "demo-payroll-maker",
        bankAdviceEmployeeCount: sheets.length,
        bankAdviceTotal: sum("netSalary"),
        bankAdviceProfile: "Generic CSV",
        auditTrail: [
          { action: "Created", at: iso(createdAt, "12:00:00"), by: "Payroll Officer", actorId: "demo-payroll-maker" },
          { action: "Approved", at: iso(addDays(createdAt, 1), "15:00:00"), by: "Imran Qureshi (Finance Manager)", actorId: "demo-payroll-checker" }
        ]
      };
      if (!isLast) {
        const paidOn = addDays(createdAt, 3);
        Object.assign(run, {
          disbursedAt: iso(paidOn, "11:30:00"),
          disbursedBy: "Treasury Officer",
          disbursedById: "demo-finance-disburser",
          disbursementReference: `HBL-IBFT-${period.year}${pad(period.month)}-0${index + 1}`,
          taxDeposit: { cprNumber: `IT-${period.year}${pad(period.month)}-${7710 + index}`, amount: sum("incomeTaxDeduction"), depositedOn: addDays(paidOn, 10), recordedAt: iso(addDays(paidOn, 10)), recordedById: "demo-payroll-maker", recordedBy: "Payroll Officer" }
        });
        run.auditTrail.push({ action: "Disbursed", at: iso(paidOn, "11:30:00"), by: "Treasury Officer", actorId: "demo-finance-disburser" });
        for (const sheet of sheets) {
          notifications.push({
            id: `payroll-disbursed-${runId}-${sheet.employeeId}`,
            type: "payroll_processed",
            title: "Salary has been disbursed",
            message: `Your salary for ${run.title} has been disbursed. Check your payslip and bank account for the payment.`,
            titleUrdu: "\u062A\u0646\u062E\u0648\u0627\u06C1 \u062C\u0627\u0631\u06CC \u06A9\u0631 \u062F\u06CC \u06AF\u0626\u06CC \u06C1\u06D2",
            messageUrdu: `${run.title} \u06A9\u06CC \u0622\u067E \u06A9\u06CC \u062A\u0646\u062E\u0648\u0627\u06C1 \u062C\u0627\u0631\u06CC \u06A9\u0631 \u062F\u06CC \u06AF\u0626\u06CC \u06C1\u06D2\u06D4 \u0627\u062F\u0627\u0626\u06CC\u06AF\u06CC \u06A9\u06D2 \u0644\u06CC\u06D2 \u0627\u067E\u0646\u06CC \u067E\u06D2 \u0633\u0644\u067E \u0627\u0648\u0631 \u0628\u06CC\u0646\u06A9 \u0627\u06A9\u0627\u0624\u0646\u0679 \u062F\u06CC\u06A9\u06BE\u06CC\u06BA\u06D4`,
            targetEmployeeId: sheet.employeeId,
            createdAt: iso(paidOn, "11:31:00"),
            readBy: [],
            priority: "high"
          });
        }
        for (const loan of loans) {
          if (loan.status !== "Active" || !sheets.some((sheet) => sheet.employeeId === loan.employeeId && sheet.loanRepaymentDeduction > 0)) continue;
          loan.remainingInstallments -= 1;
          loan.totalRepaid += loan.monthlyInstallment;
          if (loan.remainingInstallments === 0) loan.status = "Closed";
        }
      }
      const used = new Set(sheets.flatMap((sheet) => sheet.payrollAdjustmentIds || []));
      for (const item of adjustments) if (used.has(item.id)) item.payrollRunId = runId;
      runs.push(run);
      payslips.push(...sheets);
    }
    const revisions = [
      {
        id: "rev-e04-annual",
        employeeId: "emp-e04",
        previousSalary: 11e4,
        newSalary: 121e3,
        incrementAmount: 11e3,
        incrementPercentage: 10,
        effectiveDate: seedStart,
        reason: "Annual increment from performance review (rating 4.4/5)",
        approvedBy: "Imran Qureshi (Finance Manager)",
        approvedOn: addDays(seedStart, -4),
        type: "Annual Increment",
        status: "Approved",
        sourcePerformanceReviewId: "pr-e04",
        createdById: "demo-hr-manager",
        createdBy: "Ayesha Siddiqui (HR Manager)",
        approvedById: "demo-payroll-checker"
      },
      {
        id: "rev-e02-draft",
        employeeId: "emp-e02",
        previousSalary: 85e3,
        newSalary: 93500,
        incrementAmount: 8500,
        incrementPercentage: 10,
        effectiveDate: ymd(openMonth.year, openMonth.month, 1),
        reason: "Annual increment proposal; awaiting finance approval",
        approvedBy: "",
        approvedOn: "",
        type: "Annual Increment",
        status: "Draft",
        createdById: "demo-hr-manager",
        createdBy: "Ayesha Siddiqui (HR Manager)"
      }
    ];
    const reviews = [
      {
        id: "pr-e04",
        employeeId: "emp-e04",
        reviewerId: "emp-e03",
        period: `Annual-${openMonth.year - 1}`,
        reviewDate: addDays(seedStart, -15),
        kpis: [{ kpi: "Month-end close on time", weight: 40, selfScore: 5, managerScore: 5 }, { kpi: "Reconciliation accuracy", weight: 40, selfScore: 4, managerScore: 4 }, { kpi: "Team support", weight: 20, selfScore: 4, managerScore: 4 }],
        overallSelfRating: 4.4,
        overallManagerRating: 4.4,
        strengths: "Reliable month-end close",
        areasOfImprovement: "Automate bank reconciliation",
        managerComments: "Recommended for 10% increment",
        status: "Approved",
        incrementRecommended: true,
        incrementPercent: 10,
        approvedBy: "Ayesha Siddiqui (HR Manager)",
        approvedOn: addDays(seedStart, -6),
        salaryRevisionId: "rev-e04-annual"
      },
      {
        id: "pr-e07",
        employeeId: "emp-e07",
        reviewerId: "emp-e06",
        period: `H1-${openMonth.year}`,
        reviewDate: addDays(today, -6),
        kpis: [{ kpi: "Monthly sales target", weight: 60, selfScore: 4, managerScore: 4 }, { kpi: "New retailers onboarded", weight: 40, selfScore: 4, managerScore: 3 }],
        overallSelfRating: 4,
        overallManagerRating: 3.6,
        strengths: "Strong retailer relationships",
        areasOfImprovement: "Timely visit reports",
        managerComments: "Good half; needs consistent reporting",
        status: "Submitted",
        incrementRecommended: false,
        trainingRecommended: true
      }
    ];
    const resignationDate = ymd(openMonth.year, openMonth.month, daysIn(openMonth.year, openMonth.month));
    const lifecycle = [
      {
        id: "lc-e14-probation",
        employeeId: "emp-e14",
        type: "Probation Confirmation",
        effectiveDate: emp("e14").probationEndDate,
        reason: "Probation completed with satisfactory feedback from department head",
        status: "Pending",
        createdAt: iso(yesterday),
        createdById: "demo-hr-officer",
        createdBy: "Bilal Ahmed (HR Officer)"
      },
      {
        id: "lc-e12-resign",
        employeeId: "emp-e12",
        type: "Resignation",
        effectiveDate: resignationDate,
        reason: "Resigned to join family business in Multan; one month notice served",
        status: "Pending",
        noticeDays: 0,
        leaveEncashDays: 6,
        createdAt: iso(addDays(today, -10)),
        createdById: "demo-hr-officer",
        createdBy: "Bilal Ahmed (HR Officer)"
      }
    ];
    const settlementPreview = calculateFinalSettlement(emp("e12"), "Resignation", resignationDate, 6, 0, config, wageTypes);
    const gratuity = [];
    const assets = [
      { id: "ast-lpt-1", assetTag: "ASSET-LPT-001", name: "Dell Latitude 5440", category: "Laptop", serialNumber: "DL5440-8812", purchaseDate: "2025-02-10", purchaseCost: 285e3, condition: "Good", assignedTo: "emp-e03", assignedDate: "2025-02-15", status: "Assigned" },
      { id: "ast-lpt-2", assetTag: "ASSET-LPT-002", name: "HP ProBook 450", category: "Laptop", serialNumber: "HP450-1203", purchaseDate: "2025-06-01", purchaseCost: 24e4, condition: "Good", assignedTo: "emp-e05", assignedDate: "2025-06-03", status: "Assigned" },
      { id: "ast-mob-1", assetTag: "ASSET-MOB-001", name: "Samsung Galaxy A35", category: "Mobile", serialNumber: "SMA35-5531", purchaseDate: "2025-12-01", purchaseCost: 95e3, condition: "Good", assignedTo: "emp-e07", assignedDate: addDays(seedStart, -3), status: "Assigned", notes: "Field attendance phone" },
      { id: "ast-sim-1", assetTag: "ASSET-SIM-001", name: "Jazz corporate SIM", category: "SIM Card", purchaseDate: "2025-12-01", purchaseCost: 500, condition: "New", assignedTo: "emp-e07", assignedDate: addDays(seedStart, -3), status: "Assigned" },
      { id: "ast-tool-1", assetTag: "ASSET-TL-004", name: "Digital vernier caliper", category: "Tool", purchaseDate: "2024-03-12", purchaseCost: 18e3, condition: "Fair", assignedTo: "emp-e12", assignedDate: "2024-03-15", status: "Assigned", notes: "Return before final settlement" },
      { id: "ast-lpt-3", assetTag: "ASSET-LPT-003", name: "Lenovo ThinkPad E14", category: "Laptop", purchaseDate: addDays(today, -20), purchaseCost: 21e4, condition: "New", status: "Available", notes: "Reserved for new admin officer" }
    ];
    const jobs = [
      {
        id: "job-qc",
        title: "QC Inspector (replacement)",
        departmentId: qc.id,
        branchId: qc.branchId,
        vacancies: 1,
        experienceRequired: "2-4 years",
        qualificationRequired: "DAE Textile / B.Sc",
        salaryRange: "PKR 48,000 - 55,000",
        jobType: "Full Time",
        postedDate: addDays(today, -8),
        closingDate: addDays(today, 14),
        status: "Open",
        description: "Replacement for a resigning inspector; fabric and stitching inspection."
      },
      {
        id: "job-sales",
        title: "Sales Executive - South Zone",
        departmentId: sales.id,
        branchId: sales.branchId,
        vacancies: 2,
        experienceRequired: "1-3 years",
        qualificationRequired: "Graduate",
        salaryRange: "PKR 60,000 - 75,000 + commission",
        jobType: "Full Time",
        postedDate: addDays(today, -20),
        closingDate: addDays(today, 5),
        status: "Open",
        description: "Field sales with mobile attendance and daily retailer visits."
      }
    ];
    const applications = [
      { id: "app-1", jobPostingId: "job-qc", applicantName: "Adeel Hussain", applicantEmail: "adeel.h@example.com", applicantPhone: "+923335550101", appliedDate: addDays(today, -6), stage: "Applied", expectedSalary: 5e4 },
      { id: "app-2", jobPostingId: "job-qc", applicantName: "Sadia Parveen", applicantEmail: "sadia.p@example.com", applicantPhone: "+923335550102", appliedDate: addDays(today, -5), stage: "Interview Scheduled", interviewDate: addDays(today, 2), expectedSalary: 52e3 },
      { id: "app-3", jobPostingId: "job-sales", applicantName: "Waqas Ali", applicantEmail: "waqas.a@example.com", applicantPhone: "+923335550103", appliedDate: addDays(today, -15), stage: "Offer Extended", offerAmount: 68e3, expectedSalary: 7e4, interviewNotes: "Strong field experience" },
      { id: "app-4", jobPostingId: "job-sales", applicantName: "Hira Batool", applicantEmail: "hira.b@example.com", applicantPhone: "+923335550104", appliedDate: addDays(today, -14), stage: "Rejected", rejectionReason: "Not available for field travel" }
    ];
    notifications.push(
      { id: "ntf-holiday", type: "holiday_reminder", title: "Upcoming public holiday", message: "Iqbal Day (9 November) is a public holiday. Offices and the factory remain closed.", createdAt: iso(addDays(today, -1)), readBy: [], priority: "low" },
      { id: "ntf-leave-e02", type: "leave_approved", title: "Leave approved", message: `Your annual leave from ${futureDates[0]} to ${futureDates[futureDates.length - 1]} has been approved.`, targetEmployeeId: "emp-e02", createdAt: iso(addDays(today, -1)), readBy: [], priority: "medium" },
      { id: "ntf-review-e07", type: "review_due", title: "Performance review submitted", message: "Your H1 review was submitted by your manager and is awaiting HR.", targetEmployeeId: "emp-e07", createdAt: iso(addDays(today, -6)), readBy: [], priority: "low" },
      { id: "ntf-asset-e07", type: "asset_assigned", title: "Asset assigned", message: "Samsung Galaxy A35 and a corporate SIM are assigned to you for field attendance.", targetEmployeeId: "emp-e07", createdAt: iso(addDays(seedStart, -3)), readBy: ["emp-e07"], priority: "low" }
    );
    await client.query("BEGIN");
    for (const table of CLEARED_TABLES) {
      const exists = (await client.query(`SELECT to_regclass($1) AS name`, [`public.${table}`])).rows[0].name;
      if (exists) await client.query(`DELETE FROM ${table}`);
    }
    if ((await client.query(`SELECT to_regclass('public.hr_documents') AS name`)).rows[0].name) {
      await client.query(`DELETE FROM hr_documents WHERE collection_name = ANY($1::text[])`, [CLEARED_LEGACY_COLLECTIONS]);
    }
    const counts = /* @__PURE__ */ new Map();
    const put = async (table, input, ownerId) => {
      const record = input;
      const data = JSON.stringify(Object.fromEntries(Object.entries(record).filter(([, value]) => value !== void 0)));
      const employeeId = record.employeeId || ownerId || null;
      const status = typeof record.status === "string" ? record.status : null;
      if (table === "attendances") {
        await client.query(`INSERT INTO attendances(id, employee_id, date, status, data, version, updated_at) VALUES($1,$2,$3,$4,$5::jsonb,1,now())`, [record.id, employeeId, record.date, status, data]);
      } else if (table === "payroll_payslips") {
        await client.query(
          `INSERT INTO payroll_payslips(id, payroll_run_id, employee_id, status, net_salary, data, version, updated_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,1,now())`,
          [record.id, record.payrollRunId, employeeId, status, Number(record.netSalary || 0), data]
        );
      } else if (table === "payroll_runs") {
        await client.query(
          `INSERT INTO payroll_runs(id, month, employee_id, status, data, version, updated_at) VALUES($1,$2,$3,$4,$5::jsonb,1,now())`,
          [record.id, `${record.periodYear}-${pad(Number(record.periodMonth))}`, employeeId, status, data]
        );
      } else {
        await client.query(
          `INSERT INTO ${table}(id, employee_id, status, data, version, updated_at) VALUES($1,$2,$3,$4::jsonb,1,now())
          ON CONFLICT(id) DO UPDATE SET employee_id=EXCLUDED.employee_id, status=COALESCE(EXCLUDED.status, ${table}.status), data=EXCLUDED.data, version=${table}.version+1, updated_at=now()`,
          [record.id, employeeId, status, data]
        );
      }
      counts.set(table, (counts.get(table) || 0) + 1);
    };
    for (const item of companies) if (created.some((text) => text.startsWith("company"))) await put("companies", { ...item, status: "Active" });
    for (const item of companyBranches) if (created.some((text) => text.startsWith("branch")) && item.id === "br-demo-hq") await put("branches", item);
    if (created.some((text) => text.startsWith("statutory"))) await put("stat_config", config);
    if (created.some((text) => text.startsWith("FBR"))) for (const slab of taxSlabs) await put("tax_slabs", slab);
    for (const item of departments) await put("departments", { ...item, status: "Active" });
    for (const item of designations) await put("designations", { ...item, status: "Active" });
    for (const item of wageTypes) await put("wage_types", item);
    for (const item of zones) await put("zones", item);
    for (const item of ucTowns) await put("uc_towns", item);
    for (const item of holidays) await put("holidays", item);
    for (const item of employees) await put("employees", item, item.id);
    for (const item of leaves) await put("leaves", item);
    await put("mobile_duty_authorizations", duty);
    for (const item of attendances) await put("attendances", item);
    for (const item of periods) await put("attendance_periods", { ...item, status: item.status });
    for (const item of loans) await put("loan_advances", item);
    for (const item of adjustments) await put("payroll_adjustments", item);
    for (const item of runs) await put("payroll_runs", item);
    for (const item of payslips) await put("payroll_payslips", item);
    for (const item of revisions) await put("salary_revisions", item);
    for (const item of reviews) await put("performance_reviews", item);
    for (const item of lifecycle) await put("lifecycle_requests", item);
    for (const item of gratuity) await put("gratuity_settlements", item);
    for (const item of assets) await put("company_assets", item);
    for (const item of jobs) await put("job_postings", item);
    for (const item of applications) await put("job_applications", item);
    for (const item of notifications) await put("notifications", item);
    const logins = [];
    if (roleIds.has("role-employee")) {
      for (const [key, username] of [["e07", "demo.usman"], ["e11", "demo.rabia"]]) {
        const employee = emp(key);
        const existing = users.find((user) => [user.username, user.email].some((value) => String(value || "").toLowerCase() === username || String(value || "").toLowerCase() === employee.email));
        if (existing) {
          await client.query(`UPDATE users SET employee_id=$2, data = data || jsonb_build_object('employeeId', $3::text), updated_at=now() WHERE id=$1`, [existing.id, employee.id, employee.id]);
          logins.push(`${employee.fullName}: existing login ${existing.email || existing.username} re-linked to the seeded employee (password unchanged)`);
          continue;
        }
        const password = import_node_crypto.default.randomBytes(9).toString("base64url");
        const id = `usr-demo-${key}`;
        const data = { id, username, email: employee.email, roleId: "role-employee", employeeId: employee.id, status: "Active", passwordHash: await import_bcryptjs.default.hash(password, 10), passwordChangedAt: now.toISOString() };
        await client.query(`INSERT INTO users(id, username, email, role_id, employee_id, status, data) VALUES($1,$2,$3,'role-employee',$4,'Active',$5::jsonb)`, [id, username, employee.email, employee.id, JSON.stringify(data)]);
        logins.push(`${employee.fullName} (${employee.employeeCode}): email ${employee.email}  password ${password}`);
      }
    } else {
      notes.push('Role "Employee" (role-employee) is missing, so no mobile-app logins were created. Run npm run postgres:migrate.');
    }
    const dangling = users.filter((user) => user.employeeId && !employees.some((item) => item.id === user.employeeId) && !logins.some((line2) => line2.includes(`"${user.username}"`)));
    if (dangling.length) notes.push(`${dangling.length} existing login(s) were linked to employees that no longer exist: ${dangling.map((user) => user.username || user.email).join(", ")}. Re-link them under User Management.`);
    await client.query(
      `INSERT INTO hr_audit_log(actor_uid, actor_role_id, action, collection_name, document_id, new_data) VALUES('seed-script','system','create','demoSeed',$1,$2::jsonb)`,
      [`demo-seed-${now.toISOString()}`, JSON.stringify({ employees: employees.length, attendances: attendances.length, payrollRuns: runs.length, kept: "users, roles, companies, branches, statutory settings" })]
    );
    if (dryRun) await client.query("ROLLBACK");
    else await client.query("COMMIT");
    const line = (text = "") => console.log(text);
    line(dryRun ? "\nDRY RUN: nothing was saved. The seed would write:" : `
Seeded database "${database}" for ${company.name}:`);
    for (const [table, count] of counts) line(`  ${table.padEnd(28)} ${count}`);
    if (created.length) line(`
Also created (missing before): ${created.join("; ")}`);
    line("\nPayroll:");
    for (const run of runs) line(`  ${run.title.padEnd(28)} ${run.status.padEnd(10)} employees ${run.employeeCount}  gross PKR ${run.totalGrossPay.toLocaleString()}  net PKR ${run.totalNetPay.toLocaleString()}`);
    line(`
Waiting for you in ${monthName(openMonth.year, openMonth.month)} (open month):`);
    line(`  \u2022 Attendance \u2192 Needs Review: missing punch-out (${emp("e09").fullName}), regularization (${emp("e12").fullName}), low-confidence face match (${emp("e05").fullName})`);
    line(`  \u2022 Leave: 2 pending requests (${emp("e11").fullName}, ${emp("e05").fullName}); Loans: 1 pending advance (${emp("e10").fullName})`);
    line(`  \u2022 Payroll: ${runs.at(-1)?.title || "last run"} is Approved with bank advice ready \u2192 enter the bank reference to disburse; 1 pending bonus adjustment`);
    line(`  \u2022 Salary revision draft (${emp("e02").fullName}), probation confirmation (${emp("e14").fullName}), resignation (${emp("e12").fullName}: settlement PKR ${settlementPreview.totalSettlementAmount.toLocaleString()} on approval)`);
    if (logins.length) {
      line("\nMobile app logins (shown once; change them after the demo):");
      for (const text of logins) line(`  ${text}`);
    }
    if (notes.length) {
      line("\nNotes:");
      for (const text of notes) line(`  \u2022 ${text}`);
    }
    line("\nEmployees must enroll their face/fingerprint again (Biometric Devices) before kiosk punches work.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => void 0);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((error) => {
  console.error(`
${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
