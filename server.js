if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const DEMO_MODE = process.env.DEMO_MODE === 'true';

let emailModule;
if (DEMO_MODE) {
  emailModule = {
    isConfigured: () => false,
    sendWelcomeEmail: async () => {},
    sendPasswordResetEmail: async () => {}
  };
} else {
  emailModule = require('./email');
}
const { isConfigured: emailConfigured, sendWelcomeEmail, sendPasswordResetEmail } = emailModule;
const { dispatchNotification, sendRiderEmail, createRiderNotification } = require('./notification-service');

// ----- Tenant configuration -----
const DEFAULT_TENANT = {
  orgName: 'RideOps',
  orgShortName: 'RideOps',
  orgTagline: 'Accessible Campus Transportation',
  orgInitials: 'RO',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  primaryColor: '#4682B4',
  secondaryColor: '#D2B48C',
  secondaryTextColor: '#4B3A2A',
  mapUrl: null,
  mapTitle: 'Campus Map',
  idFieldLabel: 'Member ID',
  idFieldMaxLength: null,
  idFieldPattern: null,
  idFieldPlaceholder: '',
  serviceScopeText: 'Campus only',
  locationsFile: null,
  rules: [
    'This is a free accessible transportation service available during the academic year, between 8:00am–7:00pm, Monday–Friday.',
    'Vehicles (golf carts) are not street-legal and cannot leave campus grounds.',
    'If the driver arrives and the rider is not present, the driver will wait up to 5 minutes (grace period). After 5 minutes, the ride is marked as a no-show.',
    '5 consecutive no-shows will result in automatic service termination. Completed rides reset the no-show counter.',
    'Riders must be present at the designated pickup location at the requested time.'
  ]
};

function loadTenantConfig() {
  const tenantFile = process.env.TENANT_FILE;
  if (!tenantFile) return { ...DEFAULT_TENANT };
  try {
    const overrides = JSON.parse(fs.readFileSync(path.resolve(__dirname, tenantFile), 'utf8'));
    return { ...DEFAULT_TENANT, ...overrides };
  } catch (err) {
    console.warn(`[tenant] Could not load ${tenantFile}, using defaults.`);
    return { ...DEFAULT_TENANT };
  }
}
const TENANT = loadTenantConfig();

// Locations: tenant file or generic defaults
let campusLocations;
try {
  campusLocations = TENANT.locationsFile
    ? require(path.resolve(__dirname, 'tenants', TENANT.locationsFile))
    : require('./tenants/default-locations');
} catch { campusLocations = require('./tenants/default-locations'); }

// All campus locations for demo mode campus switching
const allCampusLocations = { default: campusLocations };
try { allCampusLocations.usc = require('./tenants/usc-buildings'); } catch {}
try { allCampusLocations.stanford = require('./tenants/stanford-locations'); } catch {}
try { allCampusLocations.ucla = require('./tenants/ucla-locations'); } catch {}
try { allCampusLocations.uci = require('./tenants/uci-locations'); } catch {}

// ----- Notification event types -----
const NOTIFICATION_EVENT_TYPES = [
  { key: 'driver_tardy', label: 'Driver Clocked In Late', description: 'A driver clocks in after their scheduled shift start time', defaultThreshold: null, thresholdUnit: null, category: 'staff' },
  { key: 'driver_no_clock_in', label: 'Driver Missing from Shift', description: 'A driver has not clocked in within X minutes of their shift start', defaultThreshold: 15, thresholdUnit: 'minutes_after_shift_start', category: 'staff' },
  { key: 'rider_no_show', label: 'Rider No-Show', description: 'A rider is marked as a no-show', defaultThreshold: null, thresholdUnit: null, category: 'rides' },
  { key: 'rider_approaching_termination', label: 'Rider Approaching Termination', description: 'A rider reaches N-1 consecutive no-shows', defaultThreshold: null, thresholdUnit: null, category: 'rides' },
  { key: 'rider_terminated', label: 'Rider Terminated', description: 'A rider hits the max no-show strikes and is terminated', defaultThreshold: null, thresholdUnit: null, category: 'rides' },
  { key: 'ride_pending_stale', label: 'Ride Pending Too Long', description: 'A ride request has been pending with no action for X minutes', defaultThreshold: 10, thresholdUnit: 'minutes', category: 'rides' },
  { key: 'ride_completed', label: 'Ride Completed', description: 'A ride is marked as completed', defaultThreshold: null, thresholdUnit: null, category: 'rides' },
  { key: 'new_ride_request', label: 'New Ride Request', description: 'A new ride is submitted by a rider', defaultThreshold: null, thresholdUnit: null, category: 'rides' },
  { key: 'daily_summary', label: 'Daily Summary', description: 'End-of-day summary email with ride stats, tardiness, and issues', defaultThreshold: null, thresholdUnit: null, category: 'reports' }
];

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/rideops';
const SIGNUP_ENABLED = process.env.DISABLE_RIDER_SIGNUP !== 'true';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'require' || process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

pool.on('connect', (client) => {
  client.query(`SET timezone = '${TENANT.timezone}'`);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'rideops-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

const defaultPasswordHash = bcrypt.hashSync('demo123', 10);

// ----- DB helpers -----
async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

async function initDb() {
  const schemaSql = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT,
      role TEXT NOT NULL,
      active BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rider_miss_counts (
      email TEXT PRIMARY KEY,
      count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      employee_id TEXT REFERENCES users(id),
      day_of_week SMALLINT NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rides (
      id TEXT PRIMARY KEY,
      rider_id TEXT REFERENCES users(id),
      rider_name TEXT NOT NULL,
      rider_email TEXT NOT NULL,
      rider_phone TEXT,
      pickup_location TEXT NOT NULL,
      dropoff_location TEXT NOT NULL,
      notes TEXT,
      requested_time TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL,
      assigned_driver_id TEXT REFERENCES users(id),
      grace_start_time TIMESTAMPTZ,
      consecutive_misses INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ride_events (
      id TEXT PRIMARY KEY,
      ride_id TEXT REFERENCES rides(id) ON DELETE CASCADE,
      actor_user_id TEXT REFERENCES users(id),
      type TEXT NOT NULL,
      at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'standard',
      status TEXT DEFAULT 'available',
      total_miles NUMERIC DEFAULT 0,
      last_maintenance_date DATE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tenant_settings (
      id TEXT PRIMARY KEY,
      setting_key VARCHAR(100) NOT NULL UNIQUE,
      setting_value VARCHAR(500) NOT NULL,
      setting_type VARCHAR(20) NOT NULL DEFAULT 'string',
      label VARCHAR(200),
      description TEXT,
      category VARCHAR(50) DEFAULT 'general',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS program_content (
      id TEXT PRIMARY KEY,
      rules_html TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await query(schemaSql);
  await runMigrations();
  await seedDefaultUsers();
  await seedDefaultVehicles();
  await seedDefaultSettings();
  await seedDefaultContent();
}

async function runMigrations() {
  const statements = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS member_id VARCHAR(50);`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;`,
    `ALTER TABLE rides ADD COLUMN IF NOT EXISTS recurring_id TEXT;`,
    `ALTER TABLE rides ADD COLUMN IF NOT EXISTS consecutive_misses INTEGER DEFAULT 0;`,
    `ALTER TABLE rides ADD COLUMN IF NOT EXISTS notes TEXT;`,
    `ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancelled_by TEXT;`,
    `ALTER TABLE rides ADD COLUMN IF NOT EXISTS vehicle_id TEXT REFERENCES vehicles(id);`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_name VARCHAR(50);`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS major VARCHAR(100);`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS graduation_year INTEGER;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(120);`,
    `ALTER TABLE ride_events ADD COLUMN IF NOT EXISTS notes TEXT;`,
    `ALTER TABLE ride_events ADD COLUMN IF NOT EXISTS initials TEXT;`,
    `CREATE TABLE IF NOT EXISTS recurring_rides (
      id TEXT PRIMARY KEY,
      rider_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      pickup_location TEXT NOT NULL,
      dropoff_location TEXT NOT NULL,
      time_of_day TIME NOT NULL,
      days_of_week INTEGER[] NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`,
    `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS notes TEXT;`,
    `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS week_start DATE;`,
    `CREATE TABLE IF NOT EXISTS clock_events (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL REFERENCES users(id),
      shift_id TEXT REFERENCES shifts(id),
      event_date DATE NOT NULL,
      scheduled_start TIME,
      clock_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      clock_out_at TIMESTAMPTZ,
      tardiness_minutes INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_clock_events_employee ON clock_events(employee_id);`,
    `CREATE INDEX IF NOT EXISTS idx_clock_events_date ON clock_events(event_date);`,
    `CREATE TABLE IF NOT EXISTS notification_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type VARCHAR(80) NOT NULL,
      channel VARCHAR(20) NOT NULL,
      enabled BOOLEAN DEFAULT true,
      threshold_value INTEGER,
      threshold_unit VARCHAR(30),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, event_type, channel)
    );`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      metadata JSONB DEFAULT '{}',
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_user_read
      ON notifications(user_id, read, created_at DESC);`,
    `CREATE TABLE IF NOT EXISTS maintenance_logs (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      service_date DATE NOT NULL DEFAULT CURRENT_DATE,
      notes TEXT,
      mileage_at_service NUMERIC,
      performed_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`
  ];
  for (const stmt of statements) {
    await query(stmt);
  }
}

async function seedDefaultUsers() {
  const defaults = [
    { id: 'emp1', username: 'alex', name: 'Alex', email: 'hello+alex@ride-ops.com', member_id: '1000000001', phone: '213-555-0101', role: 'driver', active: false, preferred_name: 'Alex' },
    { id: 'emp2', username: 'jordan', name: 'Jordan', email: 'hello+jordan@ride-ops.com', member_id: '1000000002', phone: '213-555-0102', role: 'driver', active: false, preferred_name: 'Jordan' },
    { id: 'emp3', username: 'taylor', name: 'Taylor', email: 'hello+taylor@ride-ops.com', member_id: '1000000003', phone: '213-555-0103', role: 'driver', active: false, preferred_name: 'Taylor' },
    { id: 'emp4', username: 'morgan', name: 'Morgan', email: 'hello+morgan@ride-ops.com', member_id: '1000000004', phone: '213-555-0104', role: 'driver', active: false, preferred_name: 'Morgan' },
    { id: 'office', username: 'office', name: 'Office', email: 'hello+office@ride-ops.com', member_id: '1000009999', phone: '213-555-0199', role: 'office', active: true },
    { id: 'rider1', username: 'casey', name: 'Casey Rivera', email: 'hello+casey@ride-ops.com', member_id: '1000000011', phone: '213-555-0111', role: 'rider', active: false, preferred_name: 'Casey', major: 'Occupational Therapy', graduation_year: 2027 },
    { id: 'rider2', username: 'riley', name: 'Riley Chen', email: 'hello+riley@ride-ops.com', member_id: '1000000012', phone: '213-555-0112', role: 'rider', active: false, preferred_name: 'Riley', major: 'Computer Science', graduation_year: 2026 }
  ];

  for (const user of defaults) {
    await query(
      `INSERT INTO users (id, username, password_hash, name, email, member_id, phone, role, active, preferred_name, major, graduation_year)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         username = EXCLUDED.username,
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         member_id = EXCLUDED.member_id,
         phone = EXCLUDED.phone,
         role = EXCLUDED.role,
         active = EXCLUDED.active,
         preferred_name = COALESCE(EXCLUDED.preferred_name, users.preferred_name),
         major = COALESCE(EXCLUDED.major, users.major),
         graduation_year = COALESCE(EXCLUDED.graduation_year, users.graduation_year)`,
      [user.id, user.username, defaultPasswordHash, user.name, user.email, user.member_id || null, user.phone || null, user.role, user.active, user.preferred_name || null, user.major || null, user.graduation_year || null]
    );
  }
}

async function seedDefaultVehicles() {
  const defaults = [
    { id: 'veh_cart1', name: 'Cart 1', type: 'standard' },
    { id: 'veh_cart2', name: 'Cart 2', type: 'standard' },
    { id: 'veh_cart3', name: 'Cart 3', type: 'standard' },
    { id: 'veh_accessible', name: 'Accessible Cart', type: 'accessible' }
  ];
  for (const v of defaults) {
    await query(
      `INSERT INTO vehicles (id, name, type) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [v.id, v.name, v.type]
    );
  }
}

async function seedDefaultSettings() {
  const defaults = [
    { key: 'max_no_show_strikes', value: '5', type: 'number', label: 'Max No-Show Strikes', description: 'Number of consecutive no-shows before service termination', category: 'rides' },
    { key: 'grace_period_minutes', value: '5', type: 'number', label: 'Grace Period (minutes)', description: 'Minutes driver waits at pickup before no-show is allowed', category: 'rides' },
    { key: 'strikes_enabled', value: 'true', type: 'boolean', label: 'Strikes Enabled', description: 'Whether no-show strikes result in service termination', category: 'rides' },
    { key: 'tardy_threshold_minutes', value: '1', type: 'number', label: 'Tardy Threshold (minutes)', description: 'Minutes late before a clock-in counts as tardy', category: 'staff' },
    { key: 'service_hours_start', value: '08:00', type: 'time', label: 'Service Hours Start', description: 'Earliest time rides can be requested', category: 'operations' },
    { key: 'service_hours_end', value: '19:00', type: 'time', label: 'Service Hours End', description: 'Latest time rides can be requested', category: 'operations' },
    { key: 'operating_days', value: '0,1,2,3,4', type: 'string', label: 'Operating Days', description: 'Days of the week service operates (0=Mon, 1=Tue, ... 6=Sun)', category: 'operations' },
    { key: 'auto_deny_outside_hours', value: 'true', type: 'boolean', label: 'Auto-Deny Outside Hours', description: 'Automatically reject ride requests outside service hours', category: 'operations' },
    { key: 'notify_office_tardy', value: 'true', type: 'boolean', label: 'Notify Office of Tardiness', description: 'Alert office when a driver clocks in late', category: 'notifications' },
    { key: 'notify_rider_no_show', value: 'true', type: 'boolean', label: 'Notify Rider of No-Show', description: 'Send notification to rider when marked no-show', category: 'notifications' },
    { key: 'notify_rider_strike_warning', value: 'true', type: 'boolean', label: 'Notify Rider of Strike Warning', description: 'Warn rider when approaching strike limit', category: 'notifications' }
  ];
  for (const s of defaults) {
    await query(
      `INSERT INTO tenant_settings (id, setting_key, setting_value, setting_type, label, description, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (setting_key) DO NOTHING`,
      [generateId('setting'), s.key, s.value, s.type, s.label, s.description, s.category]
    );
  }
}

async function seedDefaultContent() {
  const existing = await query("SELECT id FROM program_content WHERE id = 'default'");
  if (existing.rowCount > 0) return;
  const defaultHtml = '<h3>Program Rules &amp; Guidelines</h3><ul>' +
    '<li>This is a free accessible transportation service available during operating hours, Monday&ndash;Friday.</li>' +
    '<li>Vehicles (golf carts) are not street-legal and cannot leave campus grounds.</li>' +
    '<li>Riders must be present at the designated pickup location at the requested time.</li>' +
    '<li>Drivers will wait up to 5 minutes (grace period). After that, the ride may be marked as a no-show.</li>' +
    '<li><strong>5 consecutive no-shows result in automatic service termination.</strong> Completed rides reset the counter.</li>' +
    '</ul>';
  await query(
    "INSERT INTO program_content (id, rules_html, updated_at) VALUES ('default', $1, NOW())",
    [defaultHtml]
  );
}

async function seedNotificationPreferences(userId) {
  const emailOnByDefault = ['driver_tardy', 'rider_no_show', 'rider_approaching_termination', 'rider_terminated', 'daily_summary'];
  for (const evt of NOTIFICATION_EVENT_TYPES) {
    for (const channel of ['email', 'in_app']) {
      const defaultEnabled = channel === 'in_app' ? true : emailOnByDefault.includes(evt.key);
      await query(`
        INSERT INTO notification_preferences (id, user_id, event_type, channel, enabled, threshold_value, threshold_unit)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id, event_type, channel) DO NOTHING
      `, [generateId('notifpref'), userId, evt.key, channel, defaultEnabled, evt.defaultThreshold, evt.thresholdUnit]);
    }
  }
}

// ----- Helpers -----
function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
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

async function isWithinServiceHours(requestedTime) {
  const date = new Date(requestedTime);
  if (isNaN(date.getTime())) return false;
  const local = new Date(date.toLocaleString('en-US', { timeZone: TENANT.timezone }));
  const day = local.getDay();
  const ourDay = jsDateToOurDay(day);
  const opDaysStr = await getSetting('operating_days', '0,1,2,3,4');
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
  const opDaysStr = await getSetting('operating_days', '0,1,2,3,4');
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

async function getRiderMissCount(email) {
  const res = await query('SELECT count FROM rider_miss_counts WHERE email = $1', [email]);
  return res.rows[0]?.count || 0;
}

async function setRiderMissCount(email, count) {
  await query(
    `INSERT INTO rider_miss_counts (email, count)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET count = EXCLUDED.count`,
    [email, count]
  );
}

const SETTING_DEFAULTS = {
  max_no_show_strikes: '5',
  grace_period_minutes: '5',
  strikes_enabled: 'true',
  tardy_threshold_minutes: '1',
  service_hours_start: '08:00',
  service_hours_end: '19:00',
  operating_days: '0,1,2,3,4',
  auto_deny_outside_hours: 'true',
  notify_office_tardy: 'true',
  notify_rider_no_show: 'true',
  notify_rider_strike_warning: 'true'
};

const SETTING_TYPES = {
  max_no_show_strikes: 'number',
  grace_period_minutes: 'number',
  strikes_enabled: 'boolean',
  tardy_threshold_minutes: 'number',
  service_hours_start: 'time',
  service_hours_end: 'time',
  operating_days: 'string',
  auto_deny_outside_hours: 'boolean',
  notify_office_tardy: 'boolean',
  notify_rider_no_show: 'boolean',
  notify_rider_strike_warning: 'boolean'
};

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

function jsDateToOurDay(jsDay) {
  return jsDay === 0 ? 6 : jsDay - 1;
}

async function incrementRiderMissCount(email) {
  const res = await query(
    `INSERT INTO rider_miss_counts (email, count)
     VALUES ($1, 1)
     ON CONFLICT (email) DO UPDATE SET count = rider_miss_counts.count + 1
     RETURNING count`,
    [email]
  );
  return res.rows[0].count;
}

async function addRideEvent(rideId, actorUserId, type, notes, initials) {
  await query(
    `INSERT INTO ride_events (id, ride_id, actor_user_id, type, notes, initials) VALUES ($1, $2, $3, $4, $5, $6)`,
    [generateId('event'), rideId, actorUserId || null, type, notes || null, initials || null]
  );
}

async function getEmployees() {
  const res = await query(
    `SELECT id, username, name, email, phone, role, active
     FROM users WHERE role = 'driver' ORDER BY name`
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
  const opDaysStr = await getSetting('operating_days', '0,1,2,3,4');
  const opDays = String(opDaysStr).split(',').map(Number);
  return Array.from(new Set(days.map((d) => Number(d)).filter((n) => n >= 0 && n <= 6 && opDays.includes(n)))).sort();
}

function generateRecurringDates(startDate, endDate, days) {
  // days uses 0=Mon...6=Sun convention
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

// ----- Auth middleware -----
async function requireAuth(req, res, next) {
  if (!req.session.userId) {
    if (req.path.startsWith('/api/') || req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Not authenticated', code: 'SESSION_EXPIRED' });
    }
    return res.redirect('/login');
  }
  // Verify user still exists in DB (prevents ghost sessions after deletion)
  const userCheck = await query('SELECT id FROM users WHERE id = $1', [req.session.userId]);
  if (!userCheck.rowCount) {
    req.session.destroy(() => {});
    if (req.path.startsWith('/api/') || req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'User account no longer exists', code: 'SESSION_EXPIRED' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireOffice(req, res, next) {
  if (!req.session.userId || req.session.role !== 'office') {
    if (req.path.startsWith('/api/') || req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ error: 'Office access required' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireStaff(req, res, next) {
  if (!req.session.userId || (req.session.role !== 'office' && req.session.role !== 'driver')) {
    if (req.path.startsWith('/api/') || req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ error: 'Staff access required' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireRider(req, res, next) {
  if (!req.session.userId || req.session.role !== 'rider') {
    if (req.path.startsWith('/api/') || req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ error: 'Rider access required' });
    }
    return res.redirect('/login');
  }
  next();
}

function setSessionFromUser(req, user) {
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.name = user.name;
  req.session.role = user.role;
  req.session.email = user.email;
  req.session.memberId = user.member_id;
}

// ----- Auth endpoints -----
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const userRes = await query('SELECT * FROM users WHERE username = $1', [username.toLowerCase()]);
  const user = userRes.rows[0];
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  setSessionFromUser(req, user);
  const responseData = { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role };
  if (user.must_change_password) responseData.mustChangePassword = true;
  res.json(responseData);
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({
    id: req.session.userId,
    username: req.session.username,
    name: req.session.name,
    email: req.session.email,
    member_id: req.session.memberId,
    memberId: req.session.memberId,
    role: req.session.role,
    demoMode: DEMO_MODE
  });
});

app.get('/api/auth/signup-allowed', (req, res) => {
  res.json({ allowed: SIGNUP_ENABLED });
});

app.get('/api/client-config', (req, res) => {
  res.json({ isDev: isDevRequest(req) });
});

app.get('/api/tenant-config', (req, res) => res.json(TENANT));

app.get('/api/program-rules', async (req, res) => {
  try {
    const result = await query("SELECT rules_html FROM program_content WHERE id = 'default'");
    if (!result.rowCount) return res.json({ rulesHtml: '' });
    res.json({ rulesHtml: result.rows[0].rules_html });
  } catch (err) {
    console.error('GET /api/program-rules error:', err);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

app.put('/api/program-rules', requireOffice, async (req, res) => {
  const { rulesHtml } = req.body;
  if (typeof rulesHtml !== 'string') return res.status(400).json({ error: 'rulesHtml must be a string' });
  if (/<script/i.test(rulesHtml)) return res.status(400).json({ error: 'Script tags not allowed' });
  try {
    const existing = await query("SELECT id FROM program_content WHERE id = 'default'");
    if (existing.rowCount > 0) {
      await query("UPDATE program_content SET rules_html = $1, updated_at = NOW() WHERE id = 'default'", [rulesHtml]);
    } else {
      await query("INSERT INTO program_content (id, rules_html, updated_at) VALUES ('default', $1, NOW())", [rulesHtml]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/program-rules error:', err);
    res.status(500).json({ error: 'Failed to save rules' });
  }
});

// ----- Settings endpoints -----
app.get('/api/settings', requireOffice, async (req, res) => {
  try {
    const result = await query('SELECT setting_key, setting_value, setting_type, label, description, category FROM tenant_settings ORDER BY category, setting_key');
    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push({
        key: row.setting_key,
        value: row.setting_value,
        type: row.setting_type,
        label: row.label,
        description: row.description
      });
    }
    res.json(grouped);
  } catch (err) {
    console.error('settings fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.put('/api/settings', requireOffice, async (req, res) => {
  try {
    const updates = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Expected array of { key, value }' });

    // Build lookup of incoming values for cross-field validation
    const incoming = {};
    for (const { key, value } of updates) { if (key) incoming[key] = value; }

    const errors = [];

    // operating_days: non-empty, valid day numbers
    if ('operating_days' in incoming) {
      const val = incoming.operating_days;
      if (!val || String(val).trim() === '') {
        errors.push('At least one operating day must be selected');
      } else {
        const days = String(val).split(',').map(d => d.trim());
        if (!days.every(d => /^[0-6]$/.test(d))) {
          errors.push('Operating days must be integers 0-6');
        }
      }
    }

    // service hours: start must be before end
    const startVal = incoming.service_hours_start;
    const endVal = incoming.service_hours_end;
    if (startVal || endVal) {
      let s = startVal, e = endVal;
      if (!s) { const r = await query("SELECT setting_value FROM tenant_settings WHERE setting_key='service_hours_start'"); s = r.rows[0]?.setting_value || '08:00'; }
      if (!e) { const r = await query("SELECT setting_value FROM tenant_settings WHERE setting_key='service_hours_end'"); e = r.rows[0]?.setting_value || '19:00'; }
      const timeRe = /^\d{2}:\d{2}$/;
      if (s && !timeRe.test(s)) errors.push('Service hours start must be HH:MM');
      if (e && !timeRe.test(e)) errors.push('Service hours end must be HH:MM');
      if (timeRe.test(s) && timeRe.test(e) && s >= e) errors.push('Service hours start must be earlier than end');
    }

    // Numeric minimums
    for (const [key, label] of [['grace_period_minutes','Grace period'],['max_no_show_strikes','Max no-show strikes'],['tardy_threshold_minutes','Tardy threshold']]) {
      if (key in incoming) {
        const val = parseInt(incoming[key], 10);
        if (isNaN(val) || val < 1) errors.push(`${label} must be at least 1`);
      }
    }

    if (errors.length) return res.status(400).json({ error: errors.join('; '), errors });

    for (const { key, value } of updates) {
      if (!key || value === undefined) continue;
      await query(
        `UPDATE tenant_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2`,
        [String(value), key]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('settings update error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

app.get('/api/settings/public/operations', async (req, res) => {
  try {
    const result = await query(
      `SELECT setting_key, setting_value FROM tenant_settings WHERE category = 'operations' OR setting_key IN ('grace_period_minutes', 'max_no_show_strikes', 'strikes_enabled')`
    );
    const config = {};
    for (const row of result.rows) {
      config[row.setting_key] = row.setting_value;
    }
    // Apply defaults for any missing keys
    for (const key of ['service_hours_start', 'service_hours_end', 'operating_days', 'grace_period_minutes', 'max_no_show_strikes', 'strikes_enabled']) {
      if (!config[key]) config[key] = SETTING_DEFAULTS[key];
    }
    res.json(config);
  } catch (err) {
    console.error('public operations config error:', err);
    res.json({
      service_hours_start: '08:00',
      service_hours_end: '19:00',
      operating_days: '0,1,2,3,4',
      grace_period_minutes: '5',
      max_no_show_strikes: '5',
      strikes_enabled: 'true'
    });
  }
});

app.get('/api/settings/:key', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT setting_value, setting_type FROM tenant_settings WHERE setting_key = $1', [req.params.key]);
    if (!result.rowCount) return res.status(404).json({ error: 'Setting not found' });
    res.json({ key: req.params.key, value: result.rows[0].setting_value, type: result.rows[0].setting_type });
  } catch (err) {
    console.error('setting fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// Self-service profile
app.get('/api/me', requireAuth, async (req, res) => {
  const result = await query(
    `SELECT id, username, name, email, member_id, phone, role, avatar_url, preferred_name, major, graduation_year, bio FROM users WHERE id = $1`,
    [req.session.userId]
  );
  const user = result.rows[0];
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.put('/api/me', requireAuth, async (req, res) => {
  const { name, phone, preferredName, major, graduationYear, bio, avatarUrl } = req.body;
  if (name && name.length > 120) return res.status(400).json({ error: 'Name too long' });
  if (phone !== undefined && !isValidPhone(phone)) return res.status(400).json({ error: 'Invalid phone format' });
  // Validate new profile fields
  const stripTags = (s) => typeof s === 'string' ? s.replace(/<[^>]*>/g, '') : s;
  if (preferredName !== undefined && preferredName !== null) {
    if (stripTags(preferredName).length > 50) return res.status(400).json({ error: 'Preferred name too long (max 50)' });
    if (preferredName !== stripTags(preferredName)) return res.status(400).json({ error: 'HTML not allowed in preferred name' });
  }
  if (major !== undefined && major !== null) {
    if (stripTags(major).length > 100) return res.status(400).json({ error: 'Major too long (max 100)' });
    if (major !== stripTags(major)) return res.status(400).json({ error: 'HTML not allowed in major' });
  }
  if (graduationYear !== undefined && graduationYear !== null) {
    const yr = parseInt(graduationYear, 10);
    if (isNaN(yr) || yr < 2020 || yr > 2035) return res.status(400).json({ error: 'Graduation year must be between 2020 and 2035' });
  }
  if (bio !== undefined && bio !== null) {
    if (stripTags(bio).length > 120) return res.status(400).json({ error: 'Bio too long (max 120)' });
    if (bio !== stripTags(bio)) return res.status(400).json({ error: 'HTML not allowed in bio' });
  }
  if (avatarUrl !== undefined && avatarUrl !== null && avatarUrl !== '') {
    const isDiceBear = avatarUrl.startsWith('https://api.dicebear.com/');
    const isDataUri = avatarUrl.startsWith('data:image/');
    if (!isDiceBear && !isDataUri) return res.status(400).json({ error: 'Avatar must be a DiceBear URL or image data URI' });
    if (isDataUri) {
      const base64Part = avatarUrl.split(',')[1] || '';
      const sizeBytes = Math.ceil(base64Part.length * 3 / 4);
      if (sizeBytes > 500 * 1024) return res.status(400).json({ error: 'Avatar image must be under 500KB' });
    }
  }
  // For profile fields: undefined = not sent (keep old), empty string = clear, value = update
  const profileVal = (v) => v === undefined ? undefined : (v || null);
  const sets = ['name = COALESCE($1, name)', 'phone = COALESCE($2, phone)'];
  const params = [name || null, phone || null];
  let pIdx = 3;
  // Only include profile fields in SET clause when explicitly provided
  const profileFields = [
    { key: 'preferred_name', val: preferredName },
    { key: 'major', val: major },
    { key: 'graduation_year', val: graduationYear !== undefined ? (graduationYear ? parseInt(graduationYear, 10) : null) : undefined },
    { key: 'bio', val: bio },
    { key: 'avatar_url', val: avatarUrl }
  ];
  for (const f of profileFields) {
    if (f.val !== undefined) {
      sets.push(`${f.key} = $${pIdx}`);
      params.push(f.val || null);
      pIdx++;
    }
  }
  sets.push('updated_at = NOW()');
  params.push(req.session.userId);
  const result = await query(
    `UPDATE users SET ${sets.join(', ')}
     WHERE id = $${pIdx}
     RETURNING id, username, name, email, member_id, phone, role, avatar_url, preferred_name, major, graduation_year, bio`,
    params
  );
  if (!result.rowCount) return res.status(404).json({ error: 'User not found' });
  const user = result.rows[0];
  // refresh session display name
  req.session.name = user.name;
  res.json(user);
});

// Change own password
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  if (DEMO_MODE) return res.status(403).json({ error: 'Password changes are disabled in demo mode' });
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const userRes = await query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);
  const user = userRes.rows[0];
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  await query(
    `UPDATE users SET password_hash = $1, must_change_password = FALSE, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [hash, req.session.userId]
  );
  res.json({ success: true });
});

app.post('/api/auth/signup', async (req, res) => {
  if (!SIGNUP_ENABLED) {
    return res.status(403).json({ error: 'Signup is currently disabled' });
  }
  const { name, email, phone, password, uscId } = req.body;
  if (!name || !email || !password || !uscId) {
    return res.status(400).json({ error: `Name, email, password, and ${TENANT.idFieldLabel} are required` });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (!isValidMemberId(uscId)) {
    return res.status(400).json({ error: `Invalid ${TENANT.idFieldLabel}` });
  }
  const uname = email.toLowerCase().split('@')[0];
  const existing = await query('SELECT 1 FROM users WHERE username = $1 OR email = $2 OR phone = $3 OR member_id = $4', [uname, email.toLowerCase(), phone || null, uscId]);
  if (existing.rowCount) {
    return res.status(400).json({ error: `Username, email, phone, or ${TENANT.idFieldLabel} already exists` });
  }
  const id = generateId('rider');
  const hash = bcrypt.hashSync(password, 10);
  await query(
    `INSERT INTO users (id, username, password_hash, name, email, member_id, phone, role, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'rider', FALSE)`,
    [id, uname, hash, name, email.toLowerCase(), uscId, phone || null]
  );
  const userRes = await query('SELECT * FROM users WHERE id = $1', [id]);
  const user = userRes.rows[0];
  setSessionFromUser(req, user);
  res.json({ id: user.id, username: user.username, name: user.name, email: user.email, role: user.role });
});

// ----- Admin endpoints -----
app.get('/api/admin/users', requireOffice, async (req, res) => {
  const result = await query(
    `SELECT id, username, name, email, member_id, phone, role, active FROM users ORDER BY role, name`
  );
  res.json(result.rows);
});

app.get('/api/admin/users/search', requireOffice, async (req, res) => {
  const member_id = req.query.member_id || req.query.usc_id;
  if (!member_id || !isValidMemberId(member_id)) return res.status(400).json({ error: `Invalid ${TENANT.idFieldLabel}` });
  const result = await query(
    `SELECT id, username, name, email, member_id, phone, role, active FROM users WHERE member_id = $1`,
    [member_id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'No user found' });
  res.json(result.rows[0]);
});

app.delete('/api/admin/users/:id', requireOffice, async (req, res) => {
  if (DEMO_MODE) return res.status(403).json({ error: 'User deletion is disabled in demo mode' });
  const targetId = req.params.id;
  if (targetId === req.session.userId) return res.status(400).json({ error: 'Cannot delete your own office account' });

  const userRes = await query(`SELECT id, role FROM users WHERE id = $1`, [targetId]);
  const user = userRes.rows[0];
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Clear references
  await query(`UPDATE ride_events SET actor_user_id = NULL WHERE actor_user_id = $1`, [targetId]);
  await query(`UPDATE rides SET rider_id = NULL WHERE rider_id = $1`, [targetId]);

  if (user.role === 'driver') {
    await query(
      `UPDATE rides
       SET assigned_driver_id = NULL
       WHERE assigned_driver_id = $1`,
      [targetId]
    );
    await query(`DELETE FROM shifts WHERE employee_id = $1`, [targetId]);
  }

  await query(`DELETE FROM users WHERE id = $1`, [targetId]);
  res.json({ success: true, deletedId: targetId });
});

app.post('/api/admin/users', requireOffice, async (req, res) => {
  const { name, email, phone, uscId, role, password, username: reqUsername } = req.body;
  if (!name || !email || !uscId || !role || !password) {
    return res.status(400).json({ error: `Name, email, ${TENANT.idFieldLabel}, role, and password are required` });
  }
  if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (!isValidMemberId(uscId)) return res.status(400).json({ error: `Invalid ${TENANT.idFieldLabel}` });
  if (!isValidPhone(phone)) return res.status(400).json({ error: 'Invalid phone format' });
  if (!['rider', 'driver', 'office'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const username = reqUsername ? reqUsername.trim().toLowerCase() : email.toLowerCase().split('@')[0];
  if (!/^[a-z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Username may only contain letters, numbers, and underscores' });
  }
  const existing = await query('SELECT 1 FROM users WHERE username = $1 OR email = $2 OR member_id = $3 OR phone = $4', [username, email.toLowerCase(), uscId, phone || null]);
  if (existing.rowCount) {
    return res.status(400).json({ error: `Username, email, phone, or ${TENANT.idFieldLabel} already exists` });
  }

  const id = generateId(role);
  const hash = bcrypt.hashSync(password, 10);
  await query(
    `INSERT INTO users (id, username, password_hash, name, email, member_id, phone, role, active, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, TRUE)`,
    [id, username, hash, name, email.toLowerCase(), uscId, phone || null, role]
  );

  // Fire-and-forget welcome email
  let emailSent = false;
  try {
    emailSent = emailConfigured();
    if (emailSent) sendWelcomeEmail(email.toLowerCase(), name, username, password, role, TENANT.orgName, { primary: TENANT.primaryColor, secondary: TENANT.secondaryColor }).catch(() => {});
  } catch {}

  const result = await query(
    `SELECT id, username, name, email, member_id, phone, role, active FROM users WHERE id = $1`,
    [id]
  );
  res.json({ ...result.rows[0], emailSent });
});

app.put('/api/admin/users/:id', requireOffice, async (req, res) => {
  const targetId = req.params.id;
  if (targetId === req.session.userId) return res.status(400).json({ error: 'Cannot edit your own office account here' });
  const { name, phone, email, uscId, role } = req.body;
  if (name && name.length > 120) return res.status(400).json({ error: 'Name too long' });
  if (!isValidPhone(phone)) return res.status(400).json({ error: 'Invalid phone format' });
  if (email && !isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (uscId && !isValidMemberId(uscId)) return res.status(400).json({ error: `Invalid ${TENANT.idFieldLabel}` });
  if (role && !['rider', 'driver', 'office'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  // Uniqueness checks for email and member_id
  if (email) {
    const dup = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [email.toLowerCase(), targetId]);
    if (dup.rowCount) return res.status(400).json({ error: 'Email already in use by another user' });
  }
  if (uscId) {
    const dup = await query('SELECT id FROM users WHERE member_id = $1 AND id != $2', [uscId, targetId]);
    if (dup.rowCount) return res.status(400).json({ error: `${TENANT.idFieldLabel} already in use by another user` });
  }

  const result = await query(
    `UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone),
     email = COALESCE($3, email), member_id = COALESCE($4, member_id), role = COALESCE($5, role),
     updated_at = NOW()
     WHERE id = $6
     RETURNING id, username, name, email, member_id, phone, role, active`,
    [name || null, phone || null, email ? email.toLowerCase() : null, uscId || null, role || null, targetId]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'User not found' });
  res.json(result.rows[0]);
});

app.get('/api/admin/users/:id/profile', requireOffice, async (req, res) => {
  const key = req.params.id;
  const userRes = await query(
    `SELECT id, username, name, email, member_id, phone, role, active FROM users WHERE id = $1 OR email = $1 OR username = $1`,
    [key]
  );
  if (!userRes.rowCount) return res.status(404).json({ error: 'User not found' });
  const user = userRes.rows[0];

  let upcoming = [];
  let past = [];
  if (user.role === 'rider') {
    const ridesRes = await query(
      `SELECT id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
              requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, recurring_id, rider_id, vehicle_id
       FROM rides
       WHERE rider_id = $1 OR rider_email = $2
       ORDER BY requested_time DESC`,
      [user.id, user.email]
    );
    const mapped = ridesRes.rows.map(mapRide);
    upcoming = mapped.filter((r) => ['pending','approved','scheduled','driver_on_the_way','driver_arrived_grace'].includes(r.status));
    past = mapped.filter((r) => ['completed','no_show','denied','cancelled'].includes(r.status));
  } else if (user.role === 'driver') {
    const ridesRes = await query(
      `SELECT id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
              requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, recurring_id, rider_id, vehicle_id
       FROM rides
       WHERE assigned_driver_id = $1
       ORDER BY requested_time DESC`,
      [user.id]
    );
    const mapped = ridesRes.rows.map(mapRide);
    upcoming = mapped.filter((r) => ['pending','approved','scheduled','driver_on_the_way','driver_arrived_grace'].includes(r.status));
    past = mapped.filter((r) => ['completed','no_show','denied','cancelled'].includes(r.status));
  }

  let missCount = 0;
  if (user.role === 'rider' && user.email) {
    missCount = await getRiderMissCount(user.email);
  }

  res.json({ user, upcoming, past, missCount });
});

// Admin reset rider miss count
app.post('/api/admin/users/:id/reset-miss-count', requireOffice, async (req, res) => {
  const userRes = await query('SELECT id, name, email, role FROM users WHERE id = $1', [req.params.id]);
  if (!userRes.rowCount) return res.status(404).json({ error: 'User not found' });
  const user = userRes.rows[0];
  if (user.role !== 'rider') return res.status(400).json({ error: 'Only rider accounts have a miss count' });
  if (!user.email) return res.status(400).json({ error: 'Rider has no email on file' });
  await setRiderMissCount(user.email, 0);
  res.json({ success: true, missCount: 0 });
});

// Admin reset password for another user
app.post('/api/admin/users/:id/reset-password', requireOffice, async (req, res) => {
  if (DEMO_MODE) return res.status(403).json({ error: 'Password resets are disabled in demo mode' });
  const targetId = req.params.id;
  if (targetId === req.session.userId) {
    return res.status(400).json({ error: 'Use the change password feature for your own account' });
  }
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const userRes = await query('SELECT id, name, email FROM users WHERE id = $1', [targetId]);
  const user = userRes.rows[0];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const hash = bcrypt.hashSync(newPassword, 10);
  await query(
    `UPDATE users SET password_hash = $1, must_change_password = TRUE, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [hash, targetId]
  );

  // Attempt email notification
  let emailSent = false;
  try {
    emailSent = emailConfigured();
    if (emailSent && user.email) sendPasswordResetEmail(user.email, user.name, newPassword, TENANT.orgName, { primary: TENANT.primaryColor, secondary: TENANT.secondaryColor }).catch(() => {});
  } catch {}

  res.json({ success: true, emailSent });
});

// Email status check
app.get('/api/admin/email-status', requireOffice, (req, res) => {
  let configured = false;
  try {
    configured = emailConfigured();
  } catch {}
  res.json({ configured });
});

// ----- Pages -----
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/', requireAuth, (req, res) => {
  if (req.session.role === 'office') {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else if (req.session.role === 'driver') {
    res.redirect('/driver');
  } else {
    res.redirect('/rider');
  }
});

app.get('/office', requireOffice, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/driver', requireStaff, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'driver.html'));
});

app.get('/rider', requireRider, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'rider.html'));
});

// Demo mode routes (before static middleware)
if (DEMO_MODE) {
  app.get('/login', (req, res) => res.redirect('/demo.html'));
  app.get('/login.html', (req, res) => res.redirect('/demo.html'));
  app.get('/', (req, res, next) => {
    if (!req.session.userId) return res.redirect('/demo.html');
    next();
  });
}

app.get('/demo-config.js', (req, res) => {
  res.type('application/javascript');
  if (!DEMO_MODE) return res.send('');
  res.send(`
    (function() {
      if (window.location.pathname.indexOf('demo') !== -1) return;

      var s = document.createElement('style');
      s.textContent = 'body { padding-top: 32px !important; } .driver-header { top: 32px !important; } .rider-header { top: 32px !important; } .ro-sidebar { top: 32px !important; } .ro-header { top: 32px !important; }';
      document.head.appendChild(s);

      window.addEventListener('DOMContentLoaded', function() {
        var path = window.location.pathname;
        var role = 'Office Manager';
        if (path.indexOf('/driver') !== -1) role = 'Driver';
        else if (path.indexOf('/rider') !== -1) role = 'Rider';

        var b = document.createElement('div');
        b.id = 'demo-banner';
        b.style.cssText = 'position:fixed;top:0;left:0;right:0;height:32px;z-index:99999;background:#1E2B3A;color:#94A3B8;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-size:12px;font-family:system-ui,sans-serif;';
        b.innerHTML = '<span>\\u25C8 DEMO MODE \\u00B7 Viewing as: <span style="color:#E2E8F0;font-weight:600;">' + role + '</span></span>'
          + '<span><a href="/demo.html" style="color:#94A3B8;text-decoration:none;margin-right:16px;">Switch Role \\u2197</a>'
          + '<a href="https://ride-ops.com" style="color:#64748B;text-decoration:none;">ride-ops.com</a></span>';
        document.body.prepend(b);

        window.logout = function() {
          fetch('/api/auth/logout', { method: 'POST' }).then(function() {
            window.location.href = '/demo.html';
          });
        };
      });
    })();
  `);
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// ----- Employee endpoints -----
app.get('/api/employees', requireStaff, async (req, res) => {
  const employees = await getEmployees();
  res.json(employees.map(({ password_hash, ...rest }) => rest));
});

app.post('/api/employees/clock-in', requireStaff, async (req, res) => {
  const { employeeId } = req.body;
  const result = await query(
    `UPDATE users SET active = TRUE, updated_at = NOW() WHERE id = $1 AND role = 'driver' RETURNING id, username, name, email, role, active`,
    [employeeId]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Employee not found' });

  let clockEvent = null;
  try {
    const now = new Date();
    const local = new Date(now.toLocaleString('en-US', { timeZone: TENANT.timezone }));
    const eventDate = formatLocalDate(now);
    const nowMinutes = local.getHours() * 60 + local.getMinutes();

    const shift = await findTodayShift(employeeId);
    let tardinessMinutes = 0;
    let scheduledStart = null;
    let shiftId = null;

    if (shift) {
      shiftId = shift.id;
      scheduledStart = shift.start_time;
      const [h, m] = shift.start_time.split(':').map(Number);
      const tardyThreshold = await getSetting('tardy_threshold_minutes', 1);
      const rawLateness = nowMinutes - (h * 60 + m);
      tardinessMinutes = rawLateness > Number(tardyThreshold) ? rawLateness : 0;
    }

    const clockId = generateId('clock');
    const ceResult = await query(
      `INSERT INTO clock_events (id, employee_id, shift_id, event_date, scheduled_start, clock_in_at, tardiness_minutes)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6) RETURNING *`,
      [clockId, employeeId, shiftId, eventDate, scheduledStart, tardinessMinutes]
    );
    clockEvent = ceResult.rows[0];
  } catch (err) {
    console.error('Clock event recording failed (clock-in still succeeded):', err.message);
  }

  res.json({ ...result.rows[0], clockEvent });

  // Fire-and-forget: notify if tardy
  if (clockEvent && clockEvent.tardiness_minutes > 0) {
    const notifyTardy = (await getSetting('notify_office_tardy', 'true')) !== 'false';
    if (notifyTardy) dispatchNotification('driver_tardy', {
      driverName: result.rows[0].name,
      tardyMinutes: clockEvent.tardiness_minutes,
      scheduledStart: clockEvent.scheduled_start || 'N/A',
      clockInTime: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TENANT.timezone }),
      thresholdCheck: clockEvent.tardiness_minutes
    }, query).catch(() => {});
  }
});

app.post('/api/employees/clock-out', requireStaff, async (req, res) => {
  const { employeeId } = req.body;
  const result = await query(
    `UPDATE users SET active = FALSE, updated_at = NOW() WHERE id = $1 AND role = 'driver' RETURNING id, username, name, email, role, active`,
    [employeeId]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Employee not found' });

  let clockEvent = null;
  try {
    const ceResult = await query(
      `UPDATE clock_events SET clock_out_at = NOW()
       WHERE id = (SELECT id FROM clock_events WHERE employee_id = $1 AND clock_out_at IS NULL
                   ORDER BY clock_in_at DESC LIMIT 1)
       RETURNING *`,
      [employeeId]
    );
    clockEvent = ceResult.rows[0] || null;
  } catch (err) {
    console.error('Clock event recording failed (clock-out still succeeded):', err.message);
  }

  res.json({ ...result.rows[0], clockEvent });
});

app.get('/api/employees/today-status', requireStaff, async (req, res) => {
  try {
    const now = new Date();
    const local = new Date(now.toLocaleString('en-US', { timeZone: TENANT.timezone }));
    const todayDate = formatLocalDate(now);
    const todayDow = (local.getDay() + 6) % 7;
    const monday = new Date(local);
    monday.setDate(local.getDate() - todayDow);
    const weekStart = formatLocalDate(monday);

    const [driversRes, clockRes, shiftsRes] = await Promise.all([
      query(`SELECT id, username, name, email, phone, role, active FROM users WHERE role = 'driver' ORDER BY name`),
      query(`SELECT * FROM clock_events WHERE event_date = $1 ORDER BY clock_in_at`, [todayDate]),
      query(
        `SELECT id, employee_id, start_time, end_time, notes, week_start FROM shifts
         WHERE day_of_week = $1 AND (week_start IS NULL OR week_start = $2)
         ORDER BY start_time`, [todayDow, weekStart]
      )
    ]);

    const clockByDriver = {};
    for (const ce of clockRes.rows) {
      if (!clockByDriver[ce.employee_id]) clockByDriver[ce.employee_id] = [];
      clockByDriver[ce.employee_id].push(ce);
    }

    const shiftsByDriver = {};
    for (const s of shiftsRes.rows) {
      if (!shiftsByDriver[s.employee_id]) shiftsByDriver[s.employee_id] = [];
      shiftsByDriver[s.employee_id].push(s);
    }

    const drivers = driversRes.rows.map(d => ({
      ...d,
      todayClockEvents: clockByDriver[d.id] || [],
      todayShifts: shiftsByDriver[d.id] || []
    }));

    res.json(drivers);
  } catch (err) {
    console.error('today-status error:', err);
    res.status(500).json({ error: 'Failed to fetch today status' });
  }
});

app.get('/api/employees/:id/tardiness', requireOffice, async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    const driverRes = await query(
      `SELECT id, username, name, email FROM users WHERE id = $1 AND role = 'driver'`, [id]
    );
    if (!driverRes.rowCount) return res.status(404).json({ error: 'Driver not found' });

    let eventsQuery = `SELECT * FROM clock_events WHERE employee_id = $1`;
    const params = [id];
    if (from) { params.push(from); eventsQuery += ` AND event_date >= $${params.length}`; }
    if (to) { params.push(to); eventsQuery += ` AND event_date <= $${params.length}`; }
    eventsQuery += ` ORDER BY clock_in_at DESC`;

    const eventsRes = await query(eventsQuery, params);
    const events = eventsRes.rows;

    const totalClockIns = events.length;
    const tardyEvents = events.filter(e => e.tardiness_minutes > 0);
    const tardyCount = tardyEvents.length;
    const onTimeCount = totalClockIns - tardyCount;
    const tardyRate = totalClockIns > 0 ? Math.round((tardyCount / totalClockIns) * 100) : 0;
    const avgTardinessMinutes = tardyCount > 0
      ? Math.round(tardyEvents.reduce((sum, e) => sum + e.tardiness_minutes, 0) / tardyCount)
      : 0;
    const maxTardinessMinutes = tardyCount > 0
      ? Math.max(...tardyEvents.map(e => e.tardiness_minutes))
      : 0;

    res.json({
      driver: driverRes.rows[0],
      summary: { totalClockIns, tardyCount, onTimeCount, tardyRate, avgTardinessMinutes, maxTardinessMinutes },
      events
    });
  } catch (err) {
    console.error('tardiness error:', err);
    res.status(500).json({ error: 'Failed to fetch tardiness data' });
  }
});

// ----- Shift endpoints -----
app.get('/api/shifts', requireStaff, async (req, res) => {
  const { weekStart } = req.query;
  let result;
  if (weekStart) {
    result = await query(
      `SELECT id, employee_id AS "employeeId", day_of_week AS "dayOfWeek", start_time AS "startTime", end_time AS "endTime", notes, week_start AS "weekStart"
       FROM shifts WHERE week_start = $1 OR week_start IS NULL ORDER BY day_of_week, start_time`,
      [weekStart]
    );
  } else {
    result = await query(
      `SELECT id, employee_id AS "employeeId", day_of_week AS "dayOfWeek", start_time AS "startTime", end_time AS "endTime", notes, week_start AS "weekStart"
       FROM shifts ORDER BY day_of_week, start_time`
    );
  }
  res.json(result.rows);
});

app.post('/api/shifts', requireOffice, async (req, res) => {
  const { employeeId, dayOfWeek, startTime, endTime, notes, weekStart } = req.body;
  // Validate dayOfWeek against operating days
  const dow = Number(dayOfWeek);
  if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
    return res.status(400).json({ error: 'dayOfWeek must be 0-6 (Mon-Sun)' });
  }
  const opDaysStr = await getSetting('operating_days', '0,1,2,3,4');
  const opDays = String(opDaysStr).split(',').map(Number);
  if (!opDays.includes(dow)) {
    return res.status(400).json({ error: 'Shifts can only be created on operating days' });
  }
  const shift = {
    id: generateId('shift'),
    employeeId,
    dayOfWeek,
    startTime,
    endTime,
    notes: notes || '',
    weekStart: weekStart || null
  };
  await query(
    `INSERT INTO shifts (id, employee_id, day_of_week, start_time, end_time, notes, week_start)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [shift.id, employeeId, dayOfWeek, startTime, endTime, notes || '', weekStart || null]
  );
  res.json(shift);
});

app.delete('/api/shifts/:id', requireOffice, async (req, res) => {
  const { id } = req.params;
  const result = await query(`DELETE FROM shifts WHERE id = $1 RETURNING id`, [id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Shift not found' });
  res.json({ id });
});

app.put('/api/shifts/:id', requireOffice, async (req, res) => {
  const { id } = req.params;
  const { employeeId, dayOfWeek, startTime, endTime, notes, weekStart } = req.body;

  // Validate dayOfWeek if provided
  if (dayOfWeek !== undefined) {
    const dow = Number(dayOfWeek);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      return res.status(400).json({ error: 'dayOfWeek must be 0-6 (Mon-Sun)' });
    }
    const opDaysStr = await getSetting('operating_days', '0,1,2,3,4');
    const opDays = String(opDaysStr).split(',').map(Number);
    if (!opDays.includes(dow)) {
      return res.status(400).json({ error: 'Shifts can only be created on operating days' });
    }
  }

  // Validate time format if provided
  const timeRe = /^\d{2}:\d{2}$/;
  if (startTime !== undefined && !timeRe.test(startTime)) {
    return res.status(400).json({ error: 'startTime must be HH:MM format' });
  }
  if (endTime !== undefined && !timeRe.test(endTime)) {
    return res.status(400).json({ error: 'endTime must be HH:MM format' });
  }

  // Validate employeeId exists as a driver if provided
  if (employeeId !== undefined) {
    const emp = await query(`SELECT id FROM users WHERE id = $1 AND role = 'driver'`, [employeeId]);
    if (!emp.rowCount) {
      return res.status(400).json({ error: 'Employee not found or not a driver' });
    }
  }

  // Check shift exists
  const existing = await query(`SELECT id FROM shifts WHERE id = $1`, [id]);
  if (!existing.rowCount) {
    return res.status(404).json({ error: 'Shift not found' });
  }

  const result = await query(
    `UPDATE shifts
     SET employee_id  = COALESCE($2, employee_id),
         day_of_week  = COALESCE($3, day_of_week),
         start_time   = COALESCE($4, start_time),
         end_time     = COALESCE($5, end_time),
         notes        = COALESCE($6, notes),
         week_start   = COALESCE($7, week_start)
     WHERE id = $1
     RETURNING id, employee_id AS "employeeId", day_of_week AS "dayOfWeek",
               start_time AS "startTime", end_time AS "endTime", notes, week_start AS "weekStart"`,
    [id, employeeId !== undefined ? employeeId : null, dayOfWeek !== undefined ? dayOfWeek : null, startTime !== undefined ? startTime : null, endTime !== undefined ? endTime : null, notes !== undefined ? notes : null, weekStart !== undefined ? weekStart : null]
  );

  res.json(result.rows[0]);
});

// ----- Ride endpoints -----
app.get('/api/rides', requireStaff, async (req, res) => {
  const { status } = req.query;
  const baseSql = `
    SELECT r.id, r.rider_id, r.rider_name, r.rider_email, r.rider_phone, r.pickup_location, r.dropoff_location, r.notes,
           r.requested_time, r.status, r.assigned_driver_id, r.grace_start_time, r.consecutive_misses, r.recurring_id, r.cancelled_by, r.vehicle_id,
           d.name AS driver_name, d.phone AS driver_phone,
           ru.preferred_name AS rider_preferred_name, ru.avatar_url AS rider_avatar_url, ru.major AS rider_major, ru.graduation_year AS rider_graduation_year, ru.bio AS rider_bio,
           d.preferred_name AS driver_preferred_name, d.avatar_url AS driver_avatar_url, d.bio AS driver_bio
    FROM rides r
    LEFT JOIN users d ON r.assigned_driver_id = d.id
    LEFT JOIN users ru ON r.rider_id = ru.id
  `;
  const result = status
    ? await query(`${baseSql} WHERE r.status = $1 ORDER BY r.requested_time`, [status])
    : await query(`${baseSql} ORDER BY r.requested_time`);
  res.json(result.rows.map(mapRide));
});

app.post('/api/rides', requireAuth, async (req, res) => {
  const { riderName, riderEmail, riderPhone, pickupLocation, dropoffLocation, requestedTime, notes } = req.body;

  if (!pickupLocation || !dropoffLocation || !requestedTime) {
    return res.status(400).json({ error: 'Pickup, dropoff, and requested time are required' });
  }
  if (!(await isWithinServiceHours(requestedTime))) {
    return res.status(400).json({ error: await getServiceHoursMessage() });
  }

  const requesterRole = req.session.role;
  const email = requesterRole === 'rider' ? req.session.email : riderEmail;
  const name = requesterRole === 'rider' ? req.session.name : riderName;
  const phone = riderPhone;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  if (!name) {
    return res.status(400).json({ error: 'Rider name is required' });
  }

  const missCount = await getRiderMissCount(email);
  const rideId = generateId('ride');
  await query(
    `INSERT INTO rides (id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes, requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NULL, NULL, $10, NULL)`,
    [rideId, req.session.userId, name, email, phone, pickupLocation, dropoffLocation, notes || '', requestedTime, missCount]
  );
  await addRideEvent(rideId, req.session.userId, 'requested');
  const ride = await query(
    `SELECT id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
            requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id
     FROM rides WHERE id = $1`,
    [rideId]
  );
  res.json(mapRide(ride.rows[0]));

  // Fire-and-forget: new ride request notification
  dispatchNotification('new_ride_request', {
    riderName: name,
    pickup: pickupLocation,
    dropoff: dropoffLocation,
    requestedTime: new Date(requestedTime).toLocaleString('en-US', { timeZone: TENANT.timezone })
  }, query).catch(() => {});
});

app.post('/api/rides/:id/approve', requireOffice, async (req, res) => {
  const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if (ride.status !== 'pending') return res.status(400).json({ error: 'Only pending rides can be approved' });
  const missCountRes = await query('SELECT count FROM rider_miss_counts WHERE email = $1', [ride.rider_email]);
  const missCount = missCountRes.rows[0] != null ? missCountRes.rows[0].count : (ride.consecutive_misses || 0);
  const strikesEnabled = await getSetting('strikes_enabled', true);
  const maxStrikes = await getSetting('max_no_show_strikes', 5);
  if (strikesEnabled && maxStrikes > 0 && missCount >= maxStrikes) {
    return res.status(400).json({ error: `SERVICE TERMINATED: rider has ${maxStrikes} consecutive no-shows` });
  }
  if (!(await isWithinServiceHours(ride.requested_time))) {
    return res.status(400).json({ error: await getServiceHoursMessage() });
  }
  const result = await query(
    `UPDATE rides SET status = 'approved', updated_at = NOW() WHERE id = $1
     RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
               requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
    [ride.id]
  );
  await addRideEvent(ride.id, req.session.userId, 'approved');
  res.json(mapRide(result.rows[0]));

  if (ride.rider_id) {
    createRiderNotification('ride_approved', {
      riderId: ride.rider_id,
      pickup: ride.pickup_location,
      dropoff: ride.dropoff_location
    }, query).catch(() => {});
  }
});

app.post('/api/rides/:id/deny', requireOffice, async (req, res) => {
  const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if (ride.status !== 'pending') return res.status(400).json({ error: 'Only pending rides can be denied' });
  const result = await query(
    `UPDATE rides SET status = 'denied', updated_at = NOW() WHERE id = $1
     RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
               requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
    [ride.id]
  );
  await addRideEvent(ride.id, req.session.userId, 'denied');
  res.json(mapRide(result.rows[0]));

  if (ride.rider_id) {
    createRiderNotification('ride_denied', {
      riderId: ride.rider_id,
      pickup: ride.pickup_location,
      dropoff: ride.dropoff_location
    }, query).catch(() => {});
  }
});

app.get('/api/my-rides', requireRider, async (req, res) => {
  const result = await query(
    `SELECT r.id, r.rider_name, r.rider_email, r.rider_phone, r.pickup_location, r.dropoff_location, r.notes,
            r.requested_time, r.status, r.assigned_driver_id, r.grace_start_time, r.consecutive_misses, r.recurring_id, r.rider_id, r.vehicle_id,
            u.name AS driver_name, u.phone AS driver_phone,
            u.preferred_name AS driver_preferred_name, u.avatar_url AS driver_avatar_url, u.bio AS driver_bio
     FROM rides r
     LEFT JOIN users u ON r.assigned_driver_id = u.id
     WHERE r.rider_email = $1 ORDER BY r.requested_time DESC`,
    [req.session.email]
  );
  res.json(result.rows.map(mapRide));
});

app.post('/api/rides/:id/cancel', requireAuth, async (req, res) => {
  const isOffice = req.session.role === 'office';

  let rideRes;
  if (isOffice) {
    rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  } else if (req.session.role === 'rider') {
    rideRes = await query(
      `SELECT * FROM rides WHERE id = $1 AND (rider_id = $2 OR rider_email = $3)`,
      [req.params.id, req.session.userId, req.session.email]
    );
  } else {
    return res.status(403).json({ error: 'Only riders or office can cancel rides' });
  }

  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });

  if (isOffice) {
    const terminalStatuses = ['completed', 'no_show', 'cancelled', 'denied'];
    if (terminalStatuses.includes(ride.status)) {
      return res.status(400).json({ error: 'Cannot cancel a ride that is already completed, no-show, cancelled, or denied' });
    }
  } else {
    const canCancelPending = ride.status === 'pending';
    const canCancelApproved = ride.status === 'approved' && !ride.assigned_driver_id;
    if (!canCancelPending && !canCancelApproved) {
      return res.status(400).json({ error: 'Only pending rides (or unassigned approved rides) can be cancelled' });
    }
  }

  const result = await query(
    `UPDATE rides
     SET status = 'cancelled', assigned_driver_id = NULL, grace_start_time = NULL, cancelled_by = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
               requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, recurring_id, cancelled_by, vehicle_id`,
    [ride.id, isOffice ? 'office' : 'rider']
  );
  await addRideEvent(ride.id, req.session.userId, isOffice ? 'cancelled_by_office' : 'cancelled');
  res.json(mapRide(result.rows[0]));

  if (isOffice && ride.rider_id) {
    createRiderNotification('ride_cancelled', {
      riderId: ride.rider_id,
      pickup: ride.pickup_location,
      dropoff: ride.dropoff_location
    }, query).catch(() => {});
  }
});

// ----- Office admin override endpoints -----
app.post('/api/rides/:id/unassign', requireOffice, async (req, res) => {
  const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });

  const allowedStatuses = ['scheduled', 'driver_on_the_way', 'driver_arrived_grace'];
  if (!allowedStatuses.includes(ride.status)) {
    return res.status(400).json({ error: 'Can only unassign rides that are scheduled, on the way, or in grace period' });
  }

  const result = await query(
    `UPDATE rides
     SET assigned_driver_id = NULL, vehicle_id = NULL, status = 'approved', grace_start_time = NULL, updated_at = NOW()
     WHERE id = $1
     RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
               requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, recurring_id, vehicle_id`,
    [ride.id]
  );
  await addRideEvent(ride.id, req.session.userId, 'unassigned');
  res.json(mapRide(result.rows[0]));

  if (ride.rider_id) {
    createRiderNotification('ride_unassigned', {
      riderId: ride.rider_id,
      pickup: ride.pickup_location,
      dropoff: ride.dropoff_location
    }, query).catch(() => {});
  }
});

app.post('/api/rides/:id/reassign', requireOffice, async (req, res) => {
  const { driverId } = req.body;
  if (!driverId) return res.status(400).json({ error: 'driverId is required' });

  const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });

  const allowedStatuses = ['scheduled', 'driver_on_the_way', 'driver_arrived_grace'];
  if (!allowedStatuses.includes(ride.status)) {
    return res.status(400).json({ error: 'Can only reassign rides that are scheduled, on the way, or in grace period' });
  }

  const driverRes = await query(`SELECT id, active FROM users WHERE id = $1 AND role = 'driver'`, [driverId]);
  const driver = driverRes.rows[0];
  if (!driver) return res.status(400).json({ error: 'Driver not found' });
  if (!driver.active) return res.status(400).json({ error: 'Driver must be clocked in to be assigned rides' });

  const result = await query(
    `UPDATE rides
     SET assigned_driver_id = $1, status = 'scheduled', grace_start_time = NULL, updated_at = NOW()
     WHERE id = $2
     RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
               requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, recurring_id, vehicle_id`,
    [driverId, ride.id]
  );
  await addRideEvent(ride.id, req.session.userId, 'reassigned');
  res.json(mapRide(result.rows[0]));
});

app.put('/api/rides/:id', requireOffice, async (req, res) => {
  const { pickupLocation, dropoffLocation, requestedTime, notes, changeNotes, initials } = req.body;
  if (!changeNotes || !changeNotes.trim()) return res.status(400).json({ error: 'Change notes are required' });
  if (!initials || !initials.trim()) return res.status(400).json({ error: 'Initials are required' });

  const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  const terminalStatuses = ['completed', 'no_show', 'cancelled', 'denied'];
  if (terminalStatuses.includes(ride.status)) {
    return res.status(400).json({ error: 'Cannot edit a ride that is completed, no-show, cancelled, or denied' });
  }
  if (requestedTime && !(await isWithinServiceHours(requestedTime))) {
    return res.status(400).json({ error: await getServiceHoursMessage() });
  }

  const updates = [];
  const values = [];
  let idx = 1;
  if (pickupLocation !== undefined) { updates.push(`pickup_location = $${idx++}`); values.push(pickupLocation); }
  if (dropoffLocation !== undefined) { updates.push(`dropoff_location = $${idx++}`); values.push(dropoffLocation); }
  if (requestedTime !== undefined) { updates.push(`requested_time = $${idx++}`); values.push(requestedTime); }
  if (notes !== undefined) { updates.push(`notes = $${idx++}`); values.push(notes); }
  updates.push(`updated_at = NOW()`);

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id);
  const result = await query(
    `UPDATE rides SET ${updates.join(', ')} WHERE id = $${idx}
     RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
               requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, recurring_id, cancelled_by, vehicle_id`,
    values
  );
  await addRideEvent(ride.id, req.session.userId, 'edited', changeNotes.trim(), initials.trim());
  res.json(mapRide(result.rows[0]));
});

app.get('/api/locations', requireAuth, (req, res) => {
  const campus = req.query.campus;
  if (DEMO_MODE && campus && allCampusLocations[campus]) {
    return res.json(allCampusLocations[campus]);
  }
  res.json(campusLocations);
});

// ----- Recurring rides -----
app.post('/api/recurring-rides', requireRider, async (req, res) => {
  const { pickupLocation, dropoffLocation, timeOfDay, startDate, endDate, daysOfWeek, notes, riderPhone } = req.body;
  if (!pickupLocation || !dropoffLocation || !timeOfDay || !startDate || !endDate) {
    return res.status(400).json({ error: 'Pickup, dropoff, start/end date, and time are required' });
  }
  const days = await normalizeDays(daysOfWeek);
  if (!days.length) return res.status(400).json({ error: 'Choose at least one operating day' });
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start) || isNaN(end) || start > end) return res.status(400).json({ error: 'Invalid date range' });
  const [hourStr, minuteStr] = String(timeOfDay).split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr || 0);
  const minutesTotal = hour * 60 + minute;
  const svcStart = await getSetting('service_hours_start', '08:00');
  const svcEnd = await getSetting('service_hours_end', '19:00');
  const [sH, sM] = String(svcStart).split(':').map(Number);
  const [eH, eM] = String(svcEnd).split(':').map(Number);
  if (minutesTotal < (sH * 60 + (sM || 0)) || minutesTotal > (eH * 60 + (eM || 0))) {
    return res.status(400).json({ error: `Time must be between ${svcStart} and ${svcEnd}` });
  }

  const recurId = generateId('recur');
  await query(
    `INSERT INTO recurring_rides (id, rider_id, pickup_location, dropoff_location, time_of_day, days_of_week, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
    [recurId, req.session.userId, pickupLocation, dropoffLocation, `${hourStr.padStart(2, '0')}:${String(minute).padStart(2, '0')}`, days, start, end]
  );

  const dates = generateRecurringDates(start, end, days);
  let created = 0;
  for (const date of dates) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const requestedTime = `${y}-${m}-${d}T${hourStr.padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    if (!(await isWithinServiceHours(requestedTime))) continue;
    const rideId = generateId('ride');
    const missCount = await getRiderMissCount(req.session.email);
    await query(
      `INSERT INTO rides (id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes, requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, recurring_id, vehicle_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NULL, NULL, $10, $11, NULL)`,
      [rideId, req.session.userId, req.session.name, req.session.email, riderPhone || null, pickupLocation, dropoffLocation, notes || '', requestedTime, missCount, recurId]
    );
    await addRideEvent(rideId, req.session.userId, 'requested');
    created++;
  }

  res.json({ recurringId: recurId, createdRides: created });
});

app.get('/api/recurring-rides/my', requireRider, async (req, res) => {
  const result = await query(
    `SELECT id, pickup_location, dropoff_location, time_of_day, days_of_week, start_date, end_date, status
     FROM recurring_rides WHERE rider_id = $1 ORDER BY created_at DESC`,
    [req.session.userId]
  );
  const rows = result.rows;
  const withCounts = [];
  for (const row of rows) {
    const countRes = await query(
      `SELECT COUNT(*) FROM rides WHERE recurring_id = $1 AND requested_time >= NOW()`,
      [row.id]
    );
    withCounts.push({ ...row, upcomingCount: Number(countRes.rows[0].count) });
  }
  res.json(withCounts);
});

app.patch('/api/recurring-rides/:id', requireRider, async (req, res) => {
  const { status } = req.body;
  if (!['active', 'paused', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const recurRes = await query(`SELECT * FROM recurring_rides WHERE id = $1 AND rider_id = $2`, [req.params.id, req.session.userId]);
  if (!recurRes.rowCount) return res.status(404).json({ error: 'Recurring ride not found' });

  await query(
    `UPDATE recurring_rides SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, req.params.id]
  );
  if (status === 'cancelled' || status === 'paused') {
    await query(
      `UPDATE rides SET status = 'cancelled', updated_at = NOW()
       WHERE recurring_id = $1 AND requested_time >= NOW()
         AND status IN ('pending','approved','scheduled','driver_on_the_way','driver_arrived_grace')`,
      [req.params.id]
    );
  }
  res.json({ success: true });
});

app.post('/api/rides/:id/claim', requireAuth, async (req, res) => {
  const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if (ride.status !== 'approved') return res.status(400).json({ error: 'Only approved rides can be claimed' });
  if (ride.assigned_driver_id) return res.status(400).json({ error: 'Ride already assigned' });
  if (req.session.role !== 'driver' && req.session.role !== 'office') {
    return res.status(403).json({ error: 'Only drivers or office can claim rides' });
  }

  const driverId = req.session.role === 'driver' ? req.session.userId : req.body.driverId;
  const vehicleId = req.body.vehicleId || null;
  const driverRes = await query(`SELECT id, active FROM users WHERE id = $1 AND role = 'driver'`, [driverId]);
  const driver = driverRes.rows[0];
  if (!driver) return res.status(400).json({ error: 'Driver not found' });
  if (!driver.active) return res.status(400).json({ error: 'Driver must be clocked in to claim rides' });

  const updated = await query(
    `UPDATE rides
     SET assigned_driver_id = $1, vehicle_id = $2, status = 'scheduled', updated_at = NOW()
     WHERE id = $3 AND assigned_driver_id IS NULL AND status = 'approved'
     RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
               requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
    [driverId, vehicleId, ride.id]
  );
  if (!updated.rowCount) return res.status(400).json({ error: 'Ride already assigned' });
  await addRideEvent(ride.id, req.session.userId, 'claimed');
  res.json(mapRide(updated.rows[0]));

  if (ride.rider_id) {
    const driverNameRes = await query('SELECT name FROM users WHERE id = $1', [driverId]);
    const driverName = driverNameRes.rows[0]?.name || 'Your driver';
    createRiderNotification('ride_scheduled', {
      riderId: ride.rider_id,
      driverName,
      pickup: ride.pickup_location,
      dropoff: ride.dropoff_location
    }, query).catch(() => {});
  }
});

// ----- Driver action endpoints -----
app.post('/api/rides/:id/on-the-way', requireAuth, async (req, res) => {
  const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if (ride.status !== 'scheduled') return res.status(400).json({ error: 'Ride must be in scheduled status to start' });
  if (!(await allowDriverAction(req, res, ride))) return;
  const { vehicleId } = req.body || {};
  let finalVehicleId = ride.vehicle_id;
  if (vehicleId) {
    const vehRes = await query('SELECT * FROM vehicles WHERE id = $1', [vehicleId]);
    if (!vehRes.rowCount) return res.status(400).json({ error: 'Vehicle not found' });
    if (vehRes.rows[0].status !== 'available') return res.status(400).json({ error: 'Vehicle is not available' });
    finalVehicleId = vehicleId;
  }
  if (!finalVehicleId) {
    return res.status(400).json({ error: 'A vehicle must be selected before starting this ride. Please select a cart.' });
  }
  const result = await query(
    `UPDATE rides SET status = 'driver_on_the_way', vehicle_id = $2, updated_at = NOW() WHERE id = $1
     RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
               requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
    [ride.id, finalVehicleId]
  );
  await addRideEvent(ride.id, req.session.userId, 'driver_on_the_way');
  res.json(mapRide(result.rows[0]));

  if (ride.rider_id) {
    const driverNameRes = await query('SELECT name FROM users WHERE id = $1', [ride.assigned_driver_id]);
    const driverName = driverNameRes.rows[0]?.name || 'Your driver';
    createRiderNotification('ride_driver_on_the_way', {
      riderId: ride.rider_id,
      driverName,
      pickup: ride.pickup_location,
      dropoff: ride.dropoff_location
    }, query).catch(() => {});
  }
});

app.post('/api/rides/:id/here', requireAuth, async (req, res) => {
  const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if (ride.status !== 'driver_on_the_way') return res.status(400).json({ error: 'Ride must be in on-the-way status to mark arrived' });
  if (!(await allowDriverAction(req, res, ride))) return;
  const result = await query(
    `UPDATE rides SET status = 'driver_arrived_grace', grace_start_time = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
               requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
    [ride.id]
  );
  await addRideEvent(ride.id, req.session.userId, 'driver_arrived_grace');
  res.json(mapRide(result.rows[0]));

  if (ride.rider_id) {
    const driverNameRes = await query('SELECT name FROM users WHERE id = $1', [ride.assigned_driver_id]);
    const driverName = driverNameRes.rows[0]?.name || 'Your driver';
    createRiderNotification('ride_driver_arrived', {
      riderId: ride.rider_id,
      driverName,
      pickup: ride.pickup_location,
      dropoff: ride.dropoff_location
    }, query).catch(() => {});
  }
});

app.post('/api/rides/:id/complete', requireAuth, async (req, res) => {
  const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if (ride.status !== 'driver_arrived_grace') return res.status(400).json({ error: 'Ride must be in grace period to complete' });
  if (!(await allowDriverAction(req, res, ride))) return;
  const { vehicleId } = req.body || {};
  if (vehicleId && !ride.vehicle_id) {
    await query('UPDATE rides SET vehicle_id = $1 WHERE id = $2', [vehicleId, ride.id]);
    ride.vehicle_id = vehicleId;
  }
  if (!ride.vehicle_id) {
    return res.status(400).json({ error: 'A vehicle must be recorded before completing this ride.' });
  }
  const result = await query(
    `UPDATE rides SET status = 'completed', consecutive_misses = 0, updated_at = NOW()
     WHERE id = $1
     RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
               requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
    [ride.id]
  );
  await setRiderMissCount(ride.rider_email, 0);
  await addRideEvent(ride.id, req.session.userId, 'completed');
  res.json(mapRide(result.rows[0]));

  if (ride.rider_id) {
    createRiderNotification('ride_completed_rider', {
      riderId: ride.rider_id,
      pickup: ride.pickup_location,
      dropoff: ride.dropoff_location
    }, query).catch(() => {});
  }
});

app.post('/api/rides/:id/no-show', requireAuth, async (req, res) => {
  const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if (ride.status !== 'driver_arrived_grace') return res.status(400).json({ error: 'Ride must be in grace period to mark no-show' });
  if (!(await allowDriverAction(req, res, ride))) return;
  // Enforce grace period server-side
  if (ride.grace_start_time) {
    const graceMins = await getSetting('grace_period_minutes', 5);
    const graceMs = Number(graceMins) * 60 * 1000;
    const elapsed = Date.now() - new Date(ride.grace_start_time).getTime();
    if (elapsed < graceMs) {
      const remaining = Math.ceil((graceMs - elapsed) / 1000);
      return res.status(400).json({ error: `Grace period not elapsed. ${remaining} seconds remaining.` });
    }
  }
  const newCount = await incrementRiderMissCount(ride.rider_email);
  const result = await query(
    `UPDATE rides SET status = 'no_show', consecutive_misses = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
               requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
    [ride.id, newCount]
  );
  await addRideEvent(ride.id, req.session.userId, 'no_show');
  res.json(mapRide(result.rows[0]));

  // Fire-and-forget: no-show notifications
  (async () => {
    try {
      const driverRow = ride.assigned_driver_id ? await query('SELECT name FROM users WHERE id = $1', [ride.assigned_driver_id]) : null;
      const driverName = driverRow?.rows[0]?.name || 'Unassigned';

      dispatchNotification('rider_no_show', {
        riderName: ride.rider_name,
        pickup: ride.pickup_location,
        dropoff: ride.dropoff_location,
        requestedTime: new Date(ride.requested_time).toLocaleString('en-US', { timeZone: TENANT.timezone }),
        driverName,
        consecutiveMisses: newCount
      }, query);

      const maxStrikes = Number(await getSetting('max_no_show_strikes', 5));
      const strikesEnabled = (await getSetting('strikes_enabled', true)) !== 'false';

      if (strikesEnabled && newCount >= maxStrikes) {
        dispatchNotification('rider_terminated', {
          riderName: ride.rider_name,
          consecutiveMisses: newCount,
          maxStrikes
        }, query);
      } else if (strikesEnabled && newCount >= maxStrikes - 1) {
        dispatchNotification('rider_approaching_termination', {
          riderName: ride.rider_name,
          consecutiveMisses: newCount,
          maxStrikes,
          missesRemaining: maxStrikes - newCount
        }, query);
      }

      // Rider-facing notifications
      const riderData = {
        riderName: ride.rider_name,
        riderEmail: ride.rider_email,
        pickup: ride.pickup_location,
        dropoff: ride.dropoff_location,
        requestedTime: new Date(ride.requested_time).toLocaleString('en-US', { timeZone: TENANT.timezone }),
        consecutiveMisses: newCount,
        maxStrikes: maxStrikes,
        missesRemaining: maxStrikes - newCount
      };

      const notifyNoShow = (await getSetting('notify_rider_no_show', 'true')) !== 'false';
      if (notifyNoShow) {
        sendRiderEmail('rider_no_show_notice', riderData);
      }

      const notifyStrikeWarn = (await getSetting('notify_rider_strike_warning', 'true')) !== 'false';
      if (strikesEnabled && newCount >= maxStrikes) {
        // Always send termination notice
        sendRiderEmail('rider_terminated_notice', riderData);
      } else if (strikesEnabled && notifyStrikeWarn && newCount >= maxStrikes - 2) {
        sendRiderEmail('rider_strike_warning', riderData);
      }

      // Rider in-app notification
      if (ride.rider_id) {
        createRiderNotification('ride_no_show_rider', {
          riderId: ride.rider_id,
          pickup: ride.pickup_location,
          dropoff: ride.dropoff_location,
          consecutiveMisses: newCount
        }, query);
      }
    } catch (err) {
      console.error('[Notifications] no-show dispatch error:', err.message);
    }
  })();
});

// ----- Set vehicle on ride -----
app.post('/api/rides/:id/set-vehicle', requireStaff, async (req, res) => {
  const { vehicleId } = req.body;
  if (!vehicleId) return res.status(400).json({ error: 'vehicleId is required' });
  const rideRes = await query('SELECT * FROM rides WHERE id = $1', [req.params.id]);
  if (!rideRes.rowCount) return res.status(404).json({ error: 'Ride not found' });
  const ride = rideRes.rows[0];
  if (['completed','no_show','cancelled','denied'].includes(ride.status))
    return res.status(400).json({ error: 'Cannot set vehicle on a terminal ride' });
  const vehRes = await query('SELECT * FROM vehicles WHERE id = $1', [vehicleId]);
  if (!vehRes.rowCount) return res.status(404).json({ error: 'Vehicle not found' });
  if (vehRes.rows[0].status !== 'available') return res.status(400).json({ error: 'Vehicle is not available' });
  const result = await query(
    `UPDATE rides SET vehicle_id = $1, updated_at = NOW() WHERE id = $2
     RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
               requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
    [vehicleId, ride.id]
  );
  res.json(mapRide(result.rows[0]));
});

// ----- Vehicle endpoints -----
app.get('/api/vehicles', requireStaff, async (req, res) => {
  const includeRetired = req.query.includeRetired === 'true';
  const sql = includeRetired
    ? `SELECT * FROM vehicles ORDER BY name`
    : `SELECT * FROM vehicles WHERE status != 'retired' ORDER BY name`;
  const result = await query(sql);
  res.json(result.rows);
});

app.post('/api/vehicles', requireOffice, async (req, res) => {
  const { name, type, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Vehicle name is required' });
  const id = generateId('veh');
  await query(
    `INSERT INTO vehicles (id, name, type, notes) VALUES ($1, $2, $3, $4)`,
    [id, name, type || 'standard', notes || '']
  );
  const result = await query(`SELECT * FROM vehicles WHERE id = $1`, [id]);
  res.json(result.rows[0]);
});

app.put('/api/vehicles/:id', requireOffice, async (req, res) => {
  const { name, type, status, notes, totalMiles } = req.body;
  const result = await query(
    `UPDATE vehicles SET
       name = COALESCE($1, name),
       type = COALESCE($2, type),
       status = COALESCE($3, status),
       notes = COALESCE($4, notes),
       total_miles = COALESCE($5, total_miles)
     WHERE id = $6
     RETURNING *`,
    [name || null, type || null, status || null, notes || null, totalMiles != null ? totalMiles : null, req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Vehicle not found' });
  res.json(result.rows[0]);
});

app.delete('/api/vehicles/:id', requireOffice, async (req, res) => {
  await query(`UPDATE rides SET vehicle_id = NULL WHERE vehicle_id = $1`, [req.params.id]);
  const result = await query(`DELETE FROM vehicles WHERE id = $1 RETURNING id`, [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Vehicle not found' });
  res.json({ success: true });
});

app.post('/api/vehicles/:id/retire', requireOffice, async (req, res) => {
  const check = await query(`SELECT status FROM vehicles WHERE id = $1`, [req.params.id]);
  if (!check.rowCount) return res.status(404).json({ error: 'Vehicle not found' });
  if (check.rows[0].status === 'retired') return res.status(400).json({ error: 'Vehicle is already retired' });
  const result = await query(`UPDATE vehicles SET status = 'retired' WHERE id = $1 RETURNING *`, [req.params.id]);
  res.json(result.rows[0]);
});

app.post('/api/vehicles/:id/maintenance', requireOffice, async (req, res) => {
  const { notes, mileage } = req.body;
  const result = await query(
    `UPDATE vehicles SET
       last_maintenance_date = CURRENT_DATE,
       notes = COALESCE($1, notes),
       total_miles = COALESCE($2, total_miles)
     WHERE id = $3
     RETURNING *`,
    [notes || null, mileage != null ? mileage : null, req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Vehicle not found' });
  const logId = generateId('mlog');
  await query(
    `INSERT INTO maintenance_logs (id, vehicle_id, service_date, notes, mileage_at_service, performed_by)
     VALUES ($1, $2, CURRENT_DATE, $3, $4, $5)`,
    [logId, req.params.id, notes || null, mileage != null ? mileage : null, req.session.userId]
  );
  res.json(result.rows[0]);
});

app.get('/api/vehicles/:id/maintenance', requireStaff, async (req, res) => {
  const result = await query(
    `SELECT ml.*, u.name AS performed_by_name
     FROM maintenance_logs ml
     LEFT JOIN users u ON u.id = ml.performed_by
     WHERE ml.vehicle_id = $1
     ORDER BY ml.service_date DESC, ml.created_at DESC`,
    [req.params.id]
  );
  res.json(result.rows);
});

// ----- Analytics endpoints -----
function buildDateFilter(qp) {
  let clause = '';
  const params = [];
  if (qp.from) { params.push(qp.from); clause += ` AND requested_time >= $${params.length}`; }
  if (qp.to) { params.push(qp.to + 'T23:59:59.999Z'); clause += ` AND requested_time <= $${params.length}`; }
  return { clause, params };
}

app.get('/api/analytics/summary', requireOffice, async (req, res) => {
  const { clause, params } = buildDateFilter(req.query);
  const result = await query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'completed') AS completed,
       COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
       COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows,
       COUNT(*) FILTER (WHERE status = 'denied') AS denied,
       COUNT(*) FILTER (WHERE status IN ('pending','approved','scheduled','driver_on_the_way','driver_arrived_grace')) AS active,
       COUNT(DISTINCT rider_email) AS unique_riders,
       COUNT(DISTINCT rider_email) FILTER (WHERE status = 'completed') AS people_helped,
       COUNT(DISTINCT assigned_driver_id) FILTER (WHERE assigned_driver_id IS NOT NULL) AS unique_drivers
     FROM rides WHERE 1=1 ${clause}`, params
  );
  const r = result.rows[0];
  const total = parseInt(r.total) || 0;
  const completed = parseInt(r.completed) || 0;
  res.json({
    totalRides: total,
    completedRides: completed,
    cancelledRides: parseInt(r.cancelled) || 0,
    noShows: parseInt(r.no_shows) || 0,
    deniedRides: parseInt(r.denied) || 0,
    activeRides: parseInt(r.active) || 0,
    uniqueRiders: parseInt(r.unique_riders) || 0,
    peopleHelped: parseInt(r.people_helped) || 0,
    uniqueDrivers: parseInt(r.unique_drivers) || 0,
    completionRate: total > 0 ? parseFloat((completed / total * 100).toFixed(1)) : 0,
    cancellationRate: total > 0 ? parseFloat((parseInt(r.cancelled) / total * 100).toFixed(1)) : 0,
    noShowRate: total > 0 ? parseFloat((parseInt(r.no_shows) / total * 100).toFixed(1)) : 0
  });
});

app.get('/api/analytics/hotspots', requireOffice, async (req, res) => {
  const { clause, params } = buildDateFilter(req.query);
  const statusFilter = `AND status NOT IN ('denied','cancelled')`;
  const [pickupRes, dropoffRes, routeRes, matrixRes] = await Promise.all([
    query(`SELECT pickup_location AS location, COUNT(*) AS count FROM rides WHERE 1=1 ${clause} ${statusFilter} GROUP BY pickup_location ORDER BY count DESC LIMIT 10`, params),
    query(`SELECT dropoff_location AS location, COUNT(*) AS count FROM rides WHERE 1=1 ${clause} ${statusFilter} GROUP BY dropoff_location ORDER BY count DESC LIMIT 10`, params),
    query(`SELECT pickup_location || ' → ' || dropoff_location AS route, COUNT(*) AS count FROM rides WHERE 1=1 ${clause} ${statusFilter} GROUP BY pickup_location, dropoff_location ORDER BY count DESC LIMIT 10`, params),
    query(`SELECT pickup_location, dropoff_location, COUNT(*) AS count FROM rides WHERE 1=1 ${clause} ${statusFilter} GROUP BY pickup_location, dropoff_location ORDER BY count DESC LIMIT 50`, params)
  ]);
  res.json({
    topPickups: pickupRes.rows,
    topDropoffs: dropoffRes.rows,
    topRoutes: routeRes.rows,
    matrix: matrixRes.rows
  });
});

app.get('/api/analytics/frequency', requireOffice, async (req, res) => {
  const { clause, params } = buildDateFilter(req.query);
  const rClause = clause.replace(/requested_time/g, 'r.requested_time');
  const [dailyRes, dowRes, hourRes, topRidersRes, topDriversRes, statusRes] = await Promise.all([
    query(`SELECT DATE(requested_time) AS date, COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'completed') AS completed,
             COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
             COUNT(*) FILTER (WHERE status = 'no_show') AS no_show
           FROM rides WHERE 1=1 ${clause} GROUP BY DATE(requested_time) ORDER BY date`, params),
    query(`SELECT EXTRACT(DOW FROM requested_time)::int AS dow, COUNT(*) AS count
           FROM rides WHERE 1=1 ${clause} GROUP BY dow ORDER BY dow`, params),
    query(`SELECT EXTRACT(HOUR FROM requested_time)::int AS hour, COUNT(*) AS count
           FROM rides WHERE 1=1 ${clause} GROUP BY hour ORDER BY hour`, params),
    query(`SELECT rider_email, rider_name, COUNT(*) AS count,
             COUNT(*) FILTER (WHERE status = 'completed') AS completed,
             COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows
           FROM rides WHERE 1=1 ${clause} GROUP BY rider_email, rider_name ORDER BY count DESC LIMIT 10`, params),
    query(`SELECT u.name, r.assigned_driver_id, COUNT(*) AS count,
             COUNT(*) FILTER (WHERE r.status = 'completed') AS completed
           FROM rides r JOIN users u ON r.assigned_driver_id = u.id
           WHERE r.assigned_driver_id IS NOT NULL ${rClause}
           GROUP BY u.name, r.assigned_driver_id ORDER BY count DESC LIMIT 10`, params),
    query(`SELECT status, COUNT(*) AS count FROM rides WHERE 1=1 ${clause} GROUP BY status ORDER BY count DESC`, params)
  ]);
  res.json({
    daily: dailyRes.rows,
    byDayOfWeek: dowRes.rows,
    byHour: hourRes.rows,
    topRiders: topRidersRes.rows,
    topDrivers: topDriversRes.rows,
    byStatus: statusRes.rows
  });
});

app.get('/api/analytics/vehicles', requireOffice, async (req, res) => {
  const { clause, params } = buildDateFilter(req.query);
  const rClause = clause.replace(/requested_time/g, 'r.requested_time');
  const [vehiclesRes, usageRes] = await Promise.all([
    query(`SELECT * FROM vehicles ORDER BY name`),
    query(`SELECT v.id, COUNT(r.id) AS ride_count, MAX(r.requested_time) AS last_used
           FROM vehicles v LEFT JOIN rides r ON r.vehicle_id = v.id AND r.status = 'completed' ${rClause}
           GROUP BY v.id`, params)
  ]);
  const vehicles = vehiclesRes.rows.map(v => {
    const usage = usageRes.rows.find(u => u.id === v.id);
    const daysSince = v.last_maintenance_date
      ? Math.floor((Date.now() - new Date(v.last_maintenance_date).getTime()) / 86400000)
      : null;
    return {
      ...v,
      rideCount: parseInt(usage?.ride_count || 0),
      lastUsed: usage?.last_used || null,
      daysSinceMaintenance: daysSince,
      maintenanceOverdue: daysSince !== null && daysSince > 30
    };
  });
  res.json(vehicles);
});

app.get('/api/analytics/milestones', requireOffice, async (req, res) => {
  const thresholds = [50, 100, 250, 500, 1000];
  const [driverRes, riderRes] = await Promise.all([
    query(`SELECT u.id, u.name, COUNT(r.id) AS ride_count
           FROM users u LEFT JOIN rides r ON r.assigned_driver_id = u.id AND r.status = 'completed'
           WHERE u.role = 'driver' GROUP BY u.id, u.name ORDER BY ride_count DESC`),
    query(`SELECT rider_email, rider_name, COUNT(*) AS ride_count
           FROM rides WHERE status = 'completed'
           GROUP BY rider_email, rider_name ORDER BY ride_count DESC`)
  ]);
  function compute(rows) {
    return rows.map(row => {
      const count = parseInt(row.ride_count);
      const achieved = thresholds.filter(m => count >= m);
      const next = thresholds.find(m => count < m) || null;
      return {
        name: row.name || row.rider_name,
        id: row.id || row.rider_email,
        rideCount: count,
        achievedMilestones: achieved,
        nextMilestone: next,
        progressToNext: next ? parseFloat((count / next * 100).toFixed(1)) : 100
      };
    });
  }
  res.json({ drivers: compute(driverRes.rows), riders: compute(riderRes.rows) });
});

app.get('/api/analytics/semester-report', requireOffice, async (req, res) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  let semesterLabel, currentStart, currentEnd, prevLabel, prevStart, prevEnd;
  if (month <= 4) {
    semesterLabel = `Spring ${year}`;
    currentStart = `${year}-01-10`; currentEnd = `${year}-05-15`;
    prevLabel = `Fall ${year - 1}`;
    prevStart = `${year - 1}-08-15`; prevEnd = `${year - 1}-12-15`;
  } else if (month >= 7) {
    semesterLabel = `Fall ${year}`;
    currentStart = `${year}-08-15`; currentEnd = `${year}-12-15`;
    prevLabel = `Spring ${year}`;
    prevStart = `${year}-01-10`; prevEnd = `${year}-05-15`;
  } else {
    semesterLabel = `Summer ${year}`;
    currentStart = `${year}-05-16`; currentEnd = `${year}-08-14`;
    prevLabel = `Spring ${year}`;
    prevStart = `${year}-01-10`; prevEnd = `${year}-05-15`;
  }

  async function semesterStats(start, end) {
    const r = await query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'completed') AS completed,
              COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows,
              COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
              COUNT(DISTINCT rider_email) AS unique_riders,
              COUNT(DISTINCT rider_email) FILTER (WHERE status = 'completed') AS people_helped,
              COUNT(DISTINCT assigned_driver_id) FILTER (WHERE assigned_driver_id IS NOT NULL) AS unique_drivers
       FROM rides WHERE requested_time >= $1 AND requested_time <= $2`,
      [start, end + 'T23:59:59.999Z']
    );
    const row = r.rows[0];
    const total = parseInt(row.total);
    return {
      totalRides: total,
      completedRides: parseInt(row.completed) || 0,
      noShows: parseInt(row.no_shows) || 0,
      cancelledRides: parseInt(row.cancelled) || 0,
      uniqueRiders: parseInt(row.unique_riders) || 0,
      peopleHelped: parseInt(row.people_helped) || 0,
      uniqueDrivers: parseInt(row.unique_drivers) || 0,
      completionRate: total > 0 ? parseFloat((parseInt(row.completed) / total * 100).toFixed(1)) : 0
    };
  }

  const [monthlyRes, topLocRes, driverBoardRes] = await Promise.all([
    query(`SELECT TO_CHAR(requested_time, 'YYYY-MM') AS month, COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'completed') AS completed,
             COUNT(DISTINCT rider_email) AS riders
           FROM rides WHERE requested_time >= $1 AND requested_time <= $2
           GROUP BY month ORDER BY month`, [currentStart, currentEnd + 'T23:59:59.999Z']),
    query(`SELECT pickup_location AS location, COUNT(*) AS count
           FROM rides WHERE requested_time >= $1 AND requested_time <= $2 AND status NOT IN ('denied','cancelled')
           GROUP BY pickup_location ORDER BY count DESC LIMIT 5`, [currentStart, currentEnd + 'T23:59:59.999Z']),
    query(`SELECT u.name, COUNT(r.id) AS completed
           FROM rides r JOIN users u ON r.assigned_driver_id = u.id
           WHERE r.status = 'completed' AND r.requested_time >= $1 AND r.requested_time <= $2
           GROUP BY u.name ORDER BY completed DESC`, [currentStart, currentEnd + 'T23:59:59.999Z'])
  ]);

  const [current, previous] = await Promise.all([
    semesterStats(currentStart, currentEnd),
    semesterStats(prevStart, prevEnd)
  ]);

  res.json({
    semesterLabel,
    previousLabel: prevLabel,
    dateRange: { from: currentStart, to: currentEnd },
    current,
    previous,
    monthlyBreakdown: monthlyRes.rows,
    topLocations: topLocRes.rows,
    driverLeaderboard: driverBoardRes.rows
  });
});

app.get('/api/analytics/tardiness', requireOffice, async (req, res) => {
  try {
    const { from, to } = req.query;

    let dateFilter = '';
    const params = [];
    if (from) { params.push(from); dateFilter += ` AND event_date >= $${params.length}`; }
    if (to) { params.push(to); dateFilter += ` AND event_date <= $${params.length}`; }

    const [summaryRes, byDriverRes, byDowRes, trendRes, distRes, missedRes] = await Promise.all([
      query(
        `SELECT COUNT(*) AS total_clock_ins,
                COUNT(*) FILTER (WHERE tardiness_minutes > 0) AS tardy_count,
                COALESCE(ROUND(AVG(tardiness_minutes) FILTER (WHERE tardiness_minutes > 0)), 0) AS avg_tardiness,
                COALESCE(MAX(tardiness_minutes), 0) AS max_tardiness
         FROM clock_events WHERE 1=1${dateFilter}`, params
      ),
      query(
        `SELECT ce.employee_id, u.name,
                COUNT(*) AS total_clock_ins,
                COUNT(*) FILTER (WHERE ce.tardiness_minutes > 0) AS tardy_count,
                COALESCE(ROUND(AVG(ce.tardiness_minutes) FILTER (WHERE ce.tardiness_minutes > 0)), 0) AS avg_tardiness,
                COALESCE(MAX(ce.tardiness_minutes), 0) AS max_tardiness
         FROM clock_events ce JOIN users u ON ce.employee_id = u.id
         WHERE 1=1${dateFilter.replace(/event_date/g, 'ce.event_date')}
         GROUP BY ce.employee_id, u.name ORDER BY tardy_count DESC`,
        params
      ),
      query(
        `SELECT EXTRACT(DOW FROM event_date)::int AS dow,
                COUNT(*) AS total_clock_ins,
                COUNT(*) FILTER (WHERE tardiness_minutes > 0) AS tardy_count,
                COALESCE(ROUND(AVG(tardiness_minutes) FILTER (WHERE tardiness_minutes > 0)), 0) AS avg_tardiness
         FROM clock_events WHERE 1=1${dateFilter}
         GROUP BY dow ORDER BY dow`, params
      ),
      query(
        `SELECT event_date::text AS date,
                COUNT(*) AS total_clock_ins,
                COUNT(*) FILTER (WHERE tardiness_minutes > 0) AS tardy_count,
                COALESCE(ROUND(AVG(tardiness_minutes) FILTER (WHERE tardiness_minutes > 0)), 0) AS avg_tardiness
         FROM clock_events WHERE 1=1${dateFilter}
         GROUP BY event_date ORDER BY event_date`, params
      ),
      query(
        `SELECT
                COUNT(*) FILTER (WHERE tardiness_minutes = 0 OR tardiness_minutes IS NULL) AS on_time,
                COUNT(*) FILTER (WHERE tardiness_minutes BETWEEN 1 AND 5) AS late_1_5,
                COUNT(*) FILTER (WHERE tardiness_minutes BETWEEN 6 AND 15) AS late_6_15,
                COUNT(*) FILTER (WHERE tardiness_minutes BETWEEN 16 AND 30) AS late_16_30,
                COUNT(*) FILTER (WHERE tardiness_minutes > 30) AS late_31_plus
         FROM clock_events WHERE 1=1${dateFilter}`, params
      ),
      // Missed shifts: scheduled shift days in the date range with no clock_event
      query(
        `WITH date_range AS (
           SELECT generate_series(
             COALESCE($1::date, CURRENT_DATE - INTERVAL '90 days'),
             COALESCE($2::date, CURRENT_DATE),
             '1 day'::interval
           )::date AS d
         ),
         scheduled AS (
           SELECT s.employee_id, dr.d AS shift_date
           FROM shifts s
           JOIN date_range dr ON (EXTRACT(ISODOW FROM dr.d)::int - 1) = s.day_of_week
         ),
         clocked AS (
           SELECT employee_id, event_date FROM clock_events
         )
         SELECT s.employee_id, u.name,
                COUNT(*) AS missed_shifts
         FROM scheduled s
         JOIN users u ON s.employee_id = u.id
         LEFT JOIN clocked c ON c.employee_id = s.employee_id AND c.event_date = s.shift_date
         WHERE c.employee_id IS NULL
         GROUP BY s.employee_id, u.name`,
        [from || null, to || null]
      )
    ]);

    const s = summaryRes.rows[0];
    const totalClockIns = parseInt(s.total_clock_ins);
    const tardyCount = parseInt(s.tardy_count);
    const missedByDriver = {};
    (missedRes.rows || []).forEach(r => { missedByDriver[r.employee_id] = parseInt(r.missed_shifts) || 0; });
    const totalMissedShifts = Object.values(missedByDriver).reduce((a, b) => a + b, 0);

    res.json({
      summary: {
        totalClockIns,
        tardyCount,
        onTimeCount: totalClockIns - tardyCount,
        tardyRate: totalClockIns > 0 ? Math.round((tardyCount / totalClockIns) * 100) : 0,
        avgTardinessMinutes: parseInt(s.avg_tardiness),
        maxTardinessMinutes: parseInt(s.max_tardiness),
        totalMissedShifts
      },
      byDriver: byDriverRes.rows.map(r => ({
        employeeId: r.employee_id,
        name: r.name,
        totalClockIns: parseInt(r.total_clock_ins),
        tardyCount: parseInt(r.tardy_count),
        avgTardinessMinutes: parseInt(r.avg_tardiness),
        maxTardinessMinutes: parseInt(r.max_tardiness),
        missedShifts: missedByDriver[r.employee_id] || 0
      })),
      byDayOfWeek: byDowRes.rows.map(r => ({
        dayOfWeek: parseInt(r.dow),
        totalClockIns: parseInt(r.total_clock_ins),
        tardyCount: parseInt(r.tardy_count),
        avgTardinessMinutes: parseInt(r.avg_tardiness)
      })),
      dailyTrend: trendRes.rows.map(r => ({
        date: r.date,
        totalClockIns: parseInt(r.total_clock_ins),
        tardyCount: parseInt(r.tardy_count),
        avgTardinessMinutes: parseInt(r.avg_tardiness)
      })),
      distribution: (() => {
        const d = distRes.rows[0] || {};
        return [
          { bucket: 'On Time', count: parseInt(d.on_time) || 0 },
          { bucket: '1–5 min', count: parseInt(d.late_1_5) || 0 },
          { bucket: '6–15 min', count: parseInt(d.late_6_15) || 0 },
          { bucket: '16–30 min', count: parseInt(d.late_16_30) || 0 },
          { bucket: '31+ min', count: parseInt(d.late_31_plus) || 0 }
        ];
      })()
    });
  } catch (err) {
    console.error('analytics tardiness error:', err);
    res.status(500).json({ error: 'Failed to fetch tardiness analytics' });
  }
});

// ----- Dev endpoint -----
// ----- Notification Preferences -----
app.get('/api/notification-preferences', requireOffice, async (req, res) => {
  try {
    // Lazy-seed if no preferences exist for this user
    const check = await query('SELECT COUNT(*) FROM notification_preferences WHERE user_id = $1', [req.session.userId]);
    if (parseInt(check.rows[0].count) === 0) {
      await seedNotificationPreferences(req.session.userId);
    }

    const result = await query(
      'SELECT * FROM notification_preferences WHERE user_id = $1 ORDER BY event_type, channel',
      [req.session.userId]
    );

    // Group by event_type for easier frontend rendering
    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.event_type]) {
        const def = NOTIFICATION_EVENT_TYPES.find(e => e.key === row.event_type);
        grouped[row.event_type] = {
          key: row.event_type,
          label: def ? def.label : row.event_type,
          description: def ? def.description : '',
          category: def ? def.category : 'other',
          thresholdUnit: def ? def.thresholdUnit : null,
          channels: {}
        };
      }
      grouped[row.event_type].channels[row.channel] = {
        enabled: row.enabled,
        thresholdValue: row.threshold_value
      };
    }

    res.json({ eventTypes: NOTIFICATION_EVENT_TYPES, preferences: grouped });
  } catch (err) {
    console.error('GET notification-preferences error:', err);
    res.status(500).json({ error: 'Failed to load notification preferences' });
  }
});

app.put('/api/notification-preferences', requireOffice, async (req, res) => {
  try {
    const { preferences } = req.body;
    if (!Array.isArray(preferences)) return res.status(400).json({ error: 'preferences must be an array' });

    let updated = 0;
    for (const p of preferences) {
      const r = await query(`
        UPDATE notification_preferences
        SET enabled = $1, threshold_value = $2, updated_at = NOW()
        WHERE user_id = $3 AND event_type = $4 AND channel = $5
      `, [p.enabled, p.thresholdValue ?? null, req.session.userId, p.eventType, p.channel]);
      updated += r.rowCount;
    }

    res.json({ updated });
  } catch (err) {
    console.error('PUT notification-preferences error:', err);
    res.status(500).json({ error: 'Failed to save notification preferences' });
  }
});

// ── In-App Notifications ──

app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const unreadOnly = req.query.unread_only === 'true';

    const countRes = await query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = FALSE',
      [req.session.userId]
    );
    const unreadCount = parseInt(countRes.rows[0].count);

    const whereClause = unreadOnly ? 'AND read = FALSE' : '';
    const result = await query(
      `SELECT id, event_type, title, body, metadata, read, created_at
       FROM notifications
       WHERE user_id = $1 ${whereClause}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.session.userId, limit, offset]
    );

    res.json({ notifications: result.rows, unreadCount });
  } catch (err) {
    console.error('GET /api/notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.put('/api/notifications/read-all', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE',
      [req.session.userId]
    );
    res.json({ updated: result.rowCount });
  } catch (err) {
    console.error('PUT /api/notifications/read-all error:', err);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

app.put('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Notification not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/notifications/:id/read error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

app.delete('/api/notifications/:id', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Notification not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/notifications/:id error:', err);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

app.post('/api/dev/seed-rides', requireOffice, async (req, res) => {
  if (!isDevRequest(req)) {
    return res.status(403).json({ error: 'Dev seeding is only available in local development mode' });
  }
  const todayStr = formatLocalDate(new Date());
  const sampleRides = [
    { riderName: 'Alice Student', riderEmail: 'hello+alice@ride-ops.com', riderPhone: '213-555-0101', pickupLocation: 'Leavey Library', dropoffLocation: 'Doheny Library', hour: 9 },
    { riderName: 'Bob Faculty', riderEmail: 'hello+bob@ride-ops.com', riderPhone: '213-555-0102', pickupLocation: 'SGM', dropoffLocation: 'VKC', hour: 10 },
    { riderName: 'Carol Staff', riderEmail: 'hello+carol@ride-ops.com', riderPhone: '213-555-0103', pickupLocation: 'Lyon Center', dropoffLocation: 'RTH', hour: 11 },
    { riderName: 'Dan Grad', riderEmail: 'hello+dan@ride-ops.com', riderPhone: '213-555-0104', pickupLocation: 'USC Village', dropoffLocation: 'JFF', hour: 14 },
  ];
  for (const s of sampleRides) {
    const requestedTime = `${todayStr}T${String(s.hour).padStart(2, '0')}:00`;
    const missCount = await getRiderMissCount(s.riderEmail);
    const rideId = generateId('ride');
    await query(
      `INSERT INTO rides (id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes, requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', NULL, NULL, $9, NULL)`,
      [rideId, s.riderName, s.riderEmail, s.riderPhone, s.pickupLocation, s.dropoffLocation, '', requestedTime, missCount]
    );
    await addRideEvent(rideId, req.session.userId, 'approved');
  }
  res.json({ message: `Seeded ${sampleRides.length} sample rides for today`, count: sampleRides.length });
});

// ----- Startup -----
initDb()
  .then(async () => {
    if (DEMO_MODE) {
      const { seedDemoData } = require('./demo-seed');
      await seedDemoData(pool).then(() => console.log('Demo data seeded')).catch(console.error);
      setInterval(() => {
        seedDemoData(pool).then(() => console.log('Demo data re-seeded')).catch(console.error);
      }, 60 * 60 * 1000);
    }
    app.listen(PORT, () => {
      console.log('Server running from:', __dirname);
      console.log(`RideOps server running on port ${PORT}${DEMO_MODE ? ' (DEMO MODE)' : ''}`);
      if (process.env.NODE_ENV !== 'production') {
        console.log('Login: alex/jordan/taylor/morgan/office, riders: casey/riley, password: demo123');
      }
    });

    // Check for stale pending rides every 5 minutes
    setInterval(async () => {
      try {
        const stalePref = await query(`
          SELECT DISTINCT threshold_value FROM notification_preferences
          WHERE event_type = 'ride_pending_stale' AND enabled = true AND threshold_value IS NOT NULL
        `);
        if (!stalePref.rowCount) return;

        const minThreshold = Math.min(...stalePref.rows.map(r => r.threshold_value));
        const cutoff = new Date(Date.now() - minThreshold * 60000);

        const staleRides = await query(`
          SELECT r.*, u.name as rider_display_name
          FROM rides r
          LEFT JOIN users u ON u.id = r.rider_id
          WHERE r.status = 'pending' AND r.created_at <= $1
        `, [cutoff.toISOString()]);

        for (const ride of staleRides.rows) {
          const minutesPending = Math.round((Date.now() - new Date(ride.created_at).getTime()) / 60000);
          dispatchNotification('ride_pending_stale', {
            riderName: ride.rider_display_name || ride.rider_name || 'Unknown',
            pickup: ride.pickup_location,
            dropoff: ride.dropoff_location,
            requestedTime: new Date(ride.requested_time).toLocaleString('en-US', { timeZone: TENANT.timezone }),
            minutesPending,
            thresholdCheck: minutesPending
          }, query).catch(() => {});
        }
      } catch (err) {
        console.error('[Notifications] Stale check error:', err.message);
      }
    }, 5 * 60 * 1000);
  })
  .catch((err) => {
    console.error('Failed to initialize database', err);
    process.exit(1);
  });
