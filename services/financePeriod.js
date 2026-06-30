// Sentinel "cycle day" values that mean a rule rather than a fixed day number.
// Stored in ciclo_dia so no DB schema change is needed.
const CYCLE_LAST_BUSINESS = 99;  // último dia útil do mês
const CYCLE_LAST_CALENDAR = 100; // último dia do mês (civil)

function isCycleSentinel(value) {
  const n = Number(value);
  return n === CYCLE_LAST_BUSINESS || n === CYCLE_LAST_CALENDAR;
}

function clampCycleDay(value) {
  const day = Number(value);
  if (!Number.isFinite(day)) return 1;
  if (isCycleSentinel(day)) return day; // preserve sentinels
  return Math.min(31, Math.max(1, Math.floor(day)));
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function adjustToNextBusinessDay(date) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = next.getDay();
  if (dow === 6) {
    next.setDate(next.getDate() + 2);
  } else if (dow === 0) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function adjustToPrevBusinessDay(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay();
  if (dow === 6) d.setDate(d.getDate() - 1);       // Sáb → Sex
  else if (dow === 0) d.setDate(d.getDate() - 2);  // Dom → Sex
  return d;
}

function getCycleStartForMonth(year, monthIndex, cycleDay, adjustWeekend) {
  const dayNum = Number(cycleDay);
  if (dayNum === CYCLE_LAST_CALENDAR) {
    return new Date(year, monthIndex, daysInMonth(year, monthIndex));
  }
  if (dayNum === CYCLE_LAST_BUSINESS) {
    return adjustToPrevBusinessDay(new Date(year, monthIndex, daysInMonth(year, monthIndex)));
  }
  const clampedDay = Math.min(clampCycleDay(cycleDay), daysInMonth(year, monthIndex));
  let start = new Date(year, monthIndex, clampedDay);
  if (adjustWeekend) {
    start = adjustToNextBusinessDay(start);
  }
  return start;
}

function getCyclePeriodForMonth(year, monthIndex, cycleDay, adjustWeekend) {
  const start = getCycleStartForMonth(year, monthIndex, cycleDay, adjustWeekend);
  const nextBase = new Date(year, monthIndex + 1, 1);
  const nextStart = getCycleStartForMonth(
    nextBase.getFullYear(),
    nextBase.getMonth(),
    cycleDay,
    adjustWeekend
  );
  const end = new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() - 1);
  return { start, end, cycleYear: year, cycleMonth: monthIndex, nextStart };
}

function getCyclePeriod(referenceDate, cycleDay, adjustWeekend) {
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const year = ref.getFullYear();
  const month = ref.getMonth();

  const currentStart = getCycleStartForMonth(year, month, cycleDay, adjustWeekend);
  let cycleYear = year;
  let cycleMonth = month;
  let start = currentStart;

  if (ref < currentStart) {
    const prev = new Date(year, month - 1, 1);
    cycleYear = prev.getFullYear();
    cycleMonth = prev.getMonth();
    start = getCycleStartForMonth(cycleYear, cycleMonth, cycleDay, adjustWeekend);
  }

  const nextBase = new Date(cycleYear, cycleMonth + 1, 1);
  const nextStart = getCycleStartForMonth(
    nextBase.getFullYear(),
    nextBase.getMonth(),
    cycleDay,
    adjustWeekend
  );
  const end = new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() - 1);

  return { start, end, cycleYear, cycleMonth, nextStart };
}

module.exports = {
  clampCycleDay,
  isCycleSentinel,
  getCyclePeriod,
  getCyclePeriodForMonth,
  CYCLE_LAST_BUSINESS,
  CYCLE_LAST_CALENDAR,
};
