// How much attendance the collection API sends to a browser.
//
// Browsers load attendance as one collection and poll it: they keep only the working set (the current and the
// previous month); everything older is read through Reports (server/reports.cjs). The app_settings row 'dataLimits'
// (written by the legacy importer, editable in SQL) can change that:
//   attendanceReadMonths  months before the current one that are sent (default 1 = previous + current month);
//                         an explicit 0 sends all history (not recommended once history is large)
//   attendanceReadLimit   row cap of one read (default 100000)
//   employeesIncludeFormer  true sends every former employee too (default: only those still relevant, see documents.cjs)
// A read for one employee (self-service or ?employeeId=) is not windowed, so an employee's full history stays visible.
const CACHE_MS = 30_000;
const DEFAULT_LIMIT = 100000;
const DEFAULT_MONTHS = 1;
let cache = { value: null, expiresAt: 0 };

async function loadDataLimits(db) {
  const now = Date.now();
  if (cache.value && cache.expiresAt > now) return cache.value;
  let value = { attendanceReadMonths: DEFAULT_MONTHS, attendanceReadLimit: DEFAULT_LIMIT, employeesIncludeFormer: false };
  try {
    const row = (await db.query(`SELECT data FROM app_settings WHERE key='dataLimits'`)).rows[0];
    if (row?.data) {
      const months = row.data.attendanceReadMonths === undefined || row.data.attendanceReadMonths === null ? DEFAULT_MONTHS : Math.floor(Number(row.data.attendanceReadMonths));
      const limit = Math.floor(Number(row.data.attendanceReadLimit));
      value = {
        attendanceReadMonths: Number.isFinite(months) && months >= 0 ? Math.min(months, 120) : DEFAULT_MONTHS,
        attendanceReadLimit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500000) : DEFAULT_LIMIT,
        employeesIncludeFormer: row.data.employeesIncludeFormer === true,
      };
    }
  } catch (error) {
    if (error?.code !== '42P01') throw error; // app_settings not created yet: defaults
  }
  cache = { value, expiresAt: now + CACHE_MS };
  return value;
}

function resetDataLimitsCache() { cache = { value: null, expiresAt: 0 }; }

/** First day (YYYY-MM-DD) of the month `months` before the current one, Pakistan time. */
function windowStart(months, now = Date.now()) {
  const karachi = new Date(now + 5 * 3_600_000);
  const start = new Date(Date.UTC(karachi.getUTCFullYear(), karachi.getUTCMonth() - months, 1));
  return start.toISOString().slice(0, 10);
}

module.exports = { loadDataLimits, resetDataLimitsCache, windowStart, DEFAULT_LIMIT, DEFAULT_MONTHS };
