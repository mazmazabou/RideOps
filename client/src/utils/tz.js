// Campus-timezone helpers. The tenant config's IANA timezone is the single
// authority for interpreting and displaying ride times — the viewer's browser
// timezone must not change what a booking means. Until the tenant config
// loads (or when it has no timezone), everything falls back to browser-local
// behavior, which matches the pre-timezone-aware output.

let displayTimeZone = null;

export function setDisplayTimeZone(tz) {
  displayTimeZone = tz || null;
}

export function getDisplayTimeZone() {
  return displayTimeZone;
}

const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const fmtCache = new Map();

function formatterFor(tz) {
  let fmt = fmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
    });
    fmtCache.set(tz, fmt);
  }
  return fmt;
}

export function getZonedParts(date, tz) {
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
    dow: DOW[parts.weekday],
  };
}

/** ISO instant for 'YYYY-MM-DD' + 'HH:MM' read as campus wall-clock time. */
export function zonedTimeToUtcISO(dateStr, timeStr, tz = displayTimeZone) {
  if (!tz) return new Date(`${dateStr}T${timeStr}:00`).toISOString();
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  const want = Date.UTC(y, m - 1, d, h, min || 0);
  let guess = want;
  for (let i = 0; i < 2; i++) {
    const p = getZonedParts(new Date(guess), tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    if (asUtc === want) break;
    guess += want - asUtc;
  }
  return new Date(guess).toISOString();
}

// ── Service-day helpers ─────────────────────────────────────────────────────
// With an overnight service window (e.g. 22:00-03:00), an early-morning ride
// belongs to the PREVIOUS calendar day's service. "Service day" is the day a
// ride (or the current moment) counts toward on dispatch/driver "today" views.

let serviceWindow = null;    // default window { startMin, endMin, overnight }
let dayWindows = {};         // per-day overrides keyed by our-day (0=Mon..6=Sun)

function parseWindow(startStr, endStr) {
  if (!startStr || !endStr) return null;
  const [sH, sM] = String(startStr).split(':').map(Number);
  const [eH, eM] = String(endStr).split(':').map(Number);
  const startMin = sH * 60 + (sM || 0);
  const endMin = eH * 60 + (eM || 0);
  return { startMin, endMin, overnight: endMin < startMin, start: startStr, end: endStr };
}

export function setServiceWindow(startStr, endStr, overridesRaw) {
  serviceWindow = parseWindow(startStr, endStr);
  dayWindows = {};
  if (overridesRaw) {
    try {
      const obj = typeof overridesRaw === 'string' ? JSON.parse(overridesRaw) : overridesRaw;
      for (const [day, w] of Object.entries(obj || {})) {
        const parsed = parseWindow(w?.start, w?.end);
        const d = Number(day);
        if (parsed && d >= 0 && d <= 6) dayWindows[d] = parsed;
      }
    } catch { /* malformed overrides degrade to the default window */ }
  }
}

/** The service window for a given our-day (0=Mon..6=Sun), override or default. */
export function windowForOurDay(ourDay) {
  return dayWindows[ourDay] || serviceWindow;
}

export function isOvernightWindow(ourDay) {
  const w = ourDay === undefined ? serviceWindow : windowForOurDay(ourDay);
  return !!w?.overnight;
}

function partsOf(date, tz = displayTimeZone) {
  if (tz) return getZonedParts(date, tz);
  return {
    y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate(),
    h: date.getHours(), min: date.getMinutes(), dow: date.getDay(),
  };
}

const pad2 = (n) => String(n).padStart(2, '0');

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** Calendar date ('YYYY-MM-DD') of an instant in campus time. */
export function campusDateStr(dateOrIso = new Date()) {
  const p = partsOf(dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso));
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

export function campusToday() {
  return campusDateStr(new Date());
}

/** Campus-time {h, min, dow} of an instant. */
export function campusTimeParts(dateOrIso = new Date()) {
  return partsOf(dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso));
}

/** The service day an instant counts toward (early-morning hours during the
 *  PREVIOUS day's overnight window attribute to that previous day). */
export function serviceDayOf(dateOrIso) {
  const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  const p = partsOf(date);
  const dayStr = `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
  const ourDay = (p.dow + 6) % 7;
  const prev = windowForOurDay((ourDay + 6) % 7);
  if (prev?.overnight && p.h * 60 + p.min <= prev.endMin) {
    return addDays(dayStr, -1);
  }
  return dayStr;
}

export function currentServiceDay() {
  return serviceDayOf(new Date());
}

/** 'YYYY-MM-DDTHH:MM' (datetime-local input value) showing the instant in campus time. */
export function isoToZonedInputValue(iso, tz = displayTimeZone) {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  if (!tz) {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  const p = getZonedParts(date, tz);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}
