// lib/helpers.js — Utility/helper functions
'use strict';

function createHelpers(pool, query, TENANT, SETTING_DEFAULTS, SETTING_TYPES) {
  function generateId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /** Strip HTML tags from user input for defense-in-depth against stored XSS */
  function stripHtml(str) {
    if (!str) return str;
    return str.replace(/<[^>]*>/g, '');
  }

  function formatLocalDate(date) {
    const local = new Date(date.toLocaleString('en-US', { timeZone: TENANT.timezone }));
    const y = local.getFullYear();
    const m = String(local.getMonth() + 1).padStart(2, '0');
    const d = String(local.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  async function findTodayShift(employeeId) {
    const now = new Date();
    const local = new Date(now.toLocaleString('en-US', { timeZone: TENANT.timezone }));
    const todayDow = (local.getDay() + 6) % 7; // Mon=0..Fri=4, matches shifts.day_of_week

    const monday = new Date(local);
    monday.setDate(local.getDate() - todayDow);
    const weekStart = formatLocalDate(monday);

    const result = await query(
      `SELECT id, start_time, end_time, week_start FROM shifts
       WHERE employee_id = $1 AND day_of_week = $2
         AND (week_start IS NULL OR week_start = $3)
       ORDER BY week_start DESC NULLS LAST, start_time ASC`,
      [employeeId, todayDow, weekStart]
    );
    if (!result.rowCount) return null;

    // Pick the shift whose start_time is closest to now (handles split shifts)
    const nowMinutes = local.getHours() * 60 + local.getMinutes();
    let best = result.rows[0], bestDist = Infinity;
    for (const row of result.rows) {
      const [h, m] = row.start_time.split(':').map(Number);
      const dist = Math.abs(nowMinutes - (h * 60 + m));
      // Week-specific shifts take priority over recurring
      if (row.week_start && !best.week_start) { best = row; bestDist = dist; continue; }
      if (!row.week_start && best.week_start) continue;
      if (dist < bestDist) { best = row; bestDist = dist; }
    }
    return best;
  }

  function isValidEmail(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidMemberId(value) {
    if (!value || typeof value !== 'string') return false;
    if (!TENANT.idFieldPattern) return value.trim().length > 0;
    return new RegExp(TENANT.idFieldPattern).test(value);
  }

  function isValidPhone(value) {
    if (!value) return true;
    return typeof value === 'string' && /^[0-9+()\-\s]{7,20}$/.test(value);
  }

  function jsDateToOurDay(jsDay) {
    return jsDay === 0 ? 6 : jsDay - 1;
  }

  async function isWithinServiceHours(requestedTime) {
    const date = new Date(requestedTime);
    if (isNaN(date.getTime())) return false;
    const local = new Date(date.toLocaleString('en-US', { timeZone: TENANT.timezone }));
    const day = local.getDay();
    const ourDay = jsDateToOurDay(day);
    const opDaysStr = await getSetting('operating_days', '0,1,2,3,4,5,6');
    const opDays = String(opDaysStr).split(',').map(Number);
    if (!opDays.includes(ourDay)) return false;
    const startStr = await getSetting('service_hours_start', '08:00');
    const endStr = await getSetting('service_hours_end', '19:00');
    const [startH, startM] = String(startStr).split(':').map(Number);
    const [endH, endM] = String(endStr).split(':').map(Number);
    const totalMinutes = local.getHours() * 60 + local.getMinutes();
    return totalMinutes >= (startH * 60 + (startM || 0)) && totalMinutes <= (endH * 60 + (endM || 0));
  }

  async function getServiceHoursMessage() {
    const startStr = await getSetting('service_hours_start', '08:00');
    const endStr = await getSetting('service_hours_end', '19:00');
    const opDaysStr = await getSetting('operating_days', '0,1,2,3,4,5,6');
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const opDays = String(opDaysStr).split(',').map(Number).sort();
    const dayNames = opDays.map(d => dayLabels[d]).join(', ');
    return `Requested time outside service hours (${startStr}-${endStr} ${dayNames})`;
  }

  function isLocalHostname(hostname) {
    const host = String(hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  }

  function isDevRequest(req) {
    return process.env.NODE_ENV !== 'production' && isLocalHostname(req.hostname);
  }

  async function getRiderMissCount(riderId) {
    const res = await query('SELECT count FROM rider_miss_counts WHERE rider_id = $1', [riderId]);
    return res.rows[0]?.count || 0;
  }

  async function setRiderMissCount(riderId, count, txClient) {
    const q = txClient || pool;
    await q.query(
      `INSERT INTO rider_miss_counts (rider_id, count)
       VALUES ($1, $2)
       ON CONFLICT (rider_id) DO UPDATE SET count = EXCLUDED.count`,
      [riderId, count]
    );
  }

  async function incrementRiderMissCount(riderId, txClient) {
    const q = txClient || pool;
    const res = await q.query(
      `INSERT INTO rider_miss_counts (rider_id, count)
       VALUES ($1, 1)
       ON CONFLICT (rider_id) DO UPDATE SET count = rider_miss_counts.count + 1
       RETURNING count`,
      [riderId]
    );
    return res.rows[0].count;
  }

  async function getSetting(key, defaultValue) {
    try {
      const res = await query('SELECT setting_value, setting_type FROM tenant_settings WHERE setting_key = $1', [key]);
      const raw = res.rows[0] ? res.rows[0].setting_value : (defaultValue !== undefined ? String(defaultValue) : SETTING_DEFAULTS[key]);
      if (raw === undefined || raw === null) return defaultValue;
      const type = res.rows[0] ? res.rows[0].setting_type : (SETTING_TYPES[key] || 'string');
      if (type === 'number') return Number(raw);
      if (type === 'boolean') return raw === 'true';
      return raw;
    } catch {
      const fallback = defaultValue !== undefined ? defaultValue : SETTING_DEFAULTS[key];
      return fallback;
    }
  }

  async function addRideEvent(rideId, actorUserId, type, notes, initials, txClient) {
    const q = txClient || pool;
    await q.query(
      `INSERT INTO ride_events (id, ride_id, actor_user_id, type, notes, initials) VALUES ($1, $2, $3, $4, $5, $6)`,
      [generateId('event'), rideId, actorUserId || null, type, notes || null, initials || null]
    );
  }

  async function getEmployees() {
    const res = await query(
      `SELECT id, username, name, email, phone, role, active
       FROM users WHERE role = 'driver' AND deleted_at IS NULL ORDER BY name`
    );
    return res.rows;
  }

  async function allowDriverAction(req, res, ride) {
    if (!ride.assigned_driver_id) {
      res.status(400).json({ error: 'Ride must be assigned to a driver before performing this action' });
      return false;
    }
    if (req.session.role === 'office') return true;
    if (ride.assigned_driver_id !== req.session.userId) {
      res.status(403).json({ error: 'Only the assigned driver can perform this action' });
      return false;
    }
    return true;
  }

  function mapRide(row) {
    return {
      id: row.id,
      riderId: row.rider_id,
      riderName: row.rider_name,
      riderEmail: row.rider_email,
      riderPhone: row.rider_phone,
      pickupLocation: row.pickup_location,
      dropoffLocation: row.dropoff_location,
      requestedTime: row.requested_time,
      status: row.status,
      assignedDriverId: row.assigned_driver_id,
      graceStartTime: row.grace_start_time,
      consecutiveMisses: row.consecutive_misses || 0,
      notes: row.notes || '',
      recurringId: row.recurring_id || null,
      cancelledBy: row.cancelled_by || null,
      vehicleId: row.vehicle_id || null,
      driverName: row.driver_name || null,
      driverPhone: row.driver_phone || null,
      riderPreferredName: row.rider_preferred_name || null,
      riderAvatar: row.rider_avatar_url || null,
      riderMajor: row.rider_major || null,
      riderGraduationYear: row.rider_graduation_year || null,
      riderBio: row.rider_bio || null,
      driverPreferredName: row.driver_preferred_name || null,
      driverAvatar: row.driver_avatar_url || null,
      driverBio: row.driver_bio || null
    };
  }

  async function normalizeDays(days) {
    if (!Array.isArray(days)) return [];
    const opDaysStr = await getSetting('operating_days', '0,1,2,3,4,5,6');
    const opDays = String(opDaysStr).split(',').map(Number);
    return Array.from(new Set(days.map((d) => Number(d)).filter((n) => n >= 0 && n <= 6 && opDays.includes(n)))).sort();
  }

  function generateRecurringDates(startDate, endDate, days) {
    // days uses 0=Mon...6=Sun convention
    // NOTE: Day-of-week calculation uses TENANT.timezone to avoid midnight-boundary drift
    // between server timezone and campus timezone. The toLocaleString conversion ensures
    // that e.g. a Sunday-night UTC time is correctly identified as Monday in Pacific time.
    const result = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const local = new Date(current.toLocaleString('en-US', { timeZone: TENANT.timezone }));
      const ourDay = jsDateToOurDay(local.getDay());
      if (days.includes(ourDay)) {
        result.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }
    return result;
  }

  return {
    generateId,
    stripHtml,
    formatLocalDate,
    findTodayShift,
    isValidEmail,
    isValidMemberId,
    isValidPhone,
    jsDateToOurDay,
    isWithinServiceHours,
    getServiceHoursMessage,
    isDevRequest,
    getRiderMissCount,
    setRiderMissCount,
    incrementRiderMissCount,
    getSetting,
    addRideEvent,
    getEmployees,
    allowDriverAction,
    mapRide,
    normalizeDays,
    generateRecurringDates
  };
}

module.exports = createHelpers;
