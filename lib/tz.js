// lib/tz.js — IANA timezone helpers (no external deps)
// A campus's timezone is the single authority for interpreting ride times:
// naive "what the rider picked" wall-clock values are anchored to the campus
// timezone here, independent of the server's or the browser's own clock.
'use strict';

const formatterCache = new Map();

function formatterFor(tz) {
  let fmt = formatterCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, weekday: 'short'
    });
    formatterCache.set(tz, fmt);
  }
  return fmt;
}

const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock parts of an instant as read in the given timezone.
 *  Returns { y, m (1-12), d, h (0-23), min, dow (JS convention 0=Sun) }. */
function getZonedParts(date, tz) {
  const parts = {};
  for (const p of formatterFor(tz).formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour) % 24, // some ICU versions render midnight as "24"
    min: Number(parts.minute),
    dow: DOW[parts.weekday]
  };
}

/** The instant at which the given wall-clock time occurs in the given timezone.
 *  Two-pass correction handles DST offsets; during a nonexistent local time
 *  (spring-forward gap) the result lands on the shifted clock time. */
function zonedTimeToUtc(y, m, d, h, min, tz) {
  const want = Date.UTC(y, m - 1, d, h, min);
  let guess = want;
  for (let i = 0; i < 2; i++) {
    const p = getZonedParts(new Date(guess), tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    if (asUtc === want) break;
    guess += want - asUtc;
  }
  return new Date(guess);
}

function isValidTimezone(tz) {
  try {
    formatterFor(tz);
    return true;
  } catch {
    return false;
  }
}

module.exports = { getZonedParts, zonedTimeToUtc, isValidTimezone };
