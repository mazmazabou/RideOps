export function formatTime(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatDate(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// 0=Mon convention day labels
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ourDayLabel(day) {
  return DAY_LABELS[day] || '';
}

// JS getDay (0=Sun) to our format (0=Mon)
export function jsDateToOurDay(jsDay) {
  return jsDay === 0 ? 6 : jsDay - 1;
}

// Our day (0=Mon) to FullCalendar/JS day (0=Sun, 1=Mon)
export function ourDayToFCDay(ourDay) {
  return (ourDay + 1) % 7;
}

// Contrast text color for shift calendar events
export function contrastTextColor(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#222' : '#fff';
}

export function formatServiceHoursText(cfg) {
  const opDays = String(cfg.operating_days || '0,1,2,3,4,5,6').split(',').map(Number).sort();
  const labels = opDays.map(ourDayLabel);
  let dayStr;
  if (labels.length > 2) {
    let consecutive = true;
    for (let i = 1; i < opDays.length; i++) {
      if (opDays[i] !== opDays[i - 1] + 1) { consecutive = false; break; }
    }
    dayStr = consecutive ? labels[0] + '\u2013' + labels[labels.length - 1] : labels.join(', ');
  } else {
    dayStr = labels.join(', ');
  }
  function fmtTime(t) {
    const parts = String(t).split(':');
    const h = parseInt(parts[0]);
    const m = parts[1] || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return h12 + ':' + m + ' ' + ampm;
  }
  return dayStr + ', ' + fmtTime(cfg.service_hours_start || '08:00') + ' \u2013 ' + fmtTime(cfg.service_hours_end || '19:00');
}

export function formatDaysOfWeek(arr) {
  const names = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };
  return (arr || []).map(d => names[d] || d).join(', ') || '\u2014';
}

export function formatTimeAmPm(t) {
  if (!t) return '\u2014';
  const p = t.split(':');
  let h = parseInt(p[0], 10);
  const m = p[1] || '00';
  const ap = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return h + ':' + m + ' ' + ap;
}

export function formatDateReadable(d) {
  if (!d) return '\u2014';
  let str = String(d);
  if (str.indexOf('T') >= 0) str = str.split('T')[0];
  const dt = new Date(str + 'T00:00:00');
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
