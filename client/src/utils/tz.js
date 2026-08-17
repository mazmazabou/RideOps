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
