/**
 * apra-notification-clock.js
 * ==========================
 * Deadlines for the two CPS 234 notification obligations, used by
 * /cps234-notification-calculator/.
 *
 *  - Paragraph 35: as soon as possible and no later than 72 HOURS after
 *    becoming aware of a material information security incident (or one
 *    notified to another regulator). Elapsed hours, weekends included.
 *  - Paragraph 36: as soon as possible and no later than 10 BUSINESS DAYS
 *    after becoming aware of a material information security control
 *    weakness the entity expects it will not be able to remediate in a
 *    timely manner. The day of awareness is not counted.
 *
 * Conservative by default: only Saturdays and Sundays are skipped. Public
 * holidays differ by state (and substitute days with them), and counting a
 * day as a holiday when it is not one in the entity's state would show a
 * deadline LATER than the real one. So national public holidays are only
 * skipped when the visitor asks, and the page always lists any that fall
 * inside the window.
 *
 * Dates are handled as local calendar dates (the visitor's own time zone),
 * which is what "business day" means to the person counting.
 */

export const INCIDENT_HOURS = 72;
export const WEAKNESS_BUSINESS_DAYS = 10;

/** Easter Sunday, Gregorian calendar (anonymous / Meeus algorithm). */
export function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Holidays observed on the same date in every state and territory.
 *  Actual dates only: substitute days vary by state and are left out. */
export function nationalHolidays(year) {
  const easter = easterSunday(year);
  return [
    { date: new Date(year, 0, 1), name: "New Year's Day" },
    { date: new Date(year, 0, 26), name: 'Australia Day' },
    { date: addDays(easter, -2), name: 'Good Friday' },
    { date: addDays(easter, 1), name: 'Easter Monday' },
    { date: new Date(year, 3, 25), name: 'Anzac Day' },
    { date: new Date(year, 11, 25), name: 'Christmas Day' },
    { date: new Date(year, 11, 26), name: 'Boxing Day' },
  ];
}

const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

/**
 * aware: Date (local). Returns both deadlines.
 * opts.skipNationalHolidays: also skip the national holidays above.
 */
export function deadlines(aware, opts = {}) {
  const skip = !!opts.skipNationalHolidays;
  const incident = new Date(aware.getTime() + INCIDENT_HOURS * 3600 * 1000);

  const holidayMap = new Map();
  for (const y of [aware.getFullYear(), aware.getFullYear() + 1]) {
    for (const h of nationalHolidays(y)) holidayMap.set(ymd(h.date), h.name);
  }

  let day = new Date(aware.getFullYear(), aware.getMonth(), aware.getDate());
  let counted = 0;
  const holidaysInWindow = [];
  const businessDays = [];
  while (counted < WEAKNESS_BUSINESS_DAYS) {
    day = addDays(day, 1);
    if (isWeekend(day)) continue;
    const hol = holidayMap.get(ymd(day));
    if (hol) {
      holidaysInWindow.push({ date: ymd(day), name: hol, skipped: skip });
      if (skip) continue;
    }
    counted++;
    businessDays.push(ymd(day));
  }
  /* "No later than" the 10th business day: the end of that day. */
  const weakness = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);
  return {
    incident,
    weakness,
    weaknessDate: ymd(day),
    calendarDays: Math.round((new Date(day.getFullYear(), day.getMonth(), day.getDate()) - new Date(aware.getFullYear(), aware.getMonth(), aware.getDate())) / 86400000),
    businessDays,
    holidaysInWindow,
  };
}
