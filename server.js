require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const campusLocations = require('./public/usc_building_options');
const { isConfigured: emailConfigured, sendWelcomeEmail, sendPasswordResetEmail } = require('./email');

const TENANT = {
  orgName: 'USC DART',
  orgShortName: 'DART',
  orgTagline: 'Disabled Access to Road Transportation',
  orgInitials: 'DT',
  primaryColor: '#990000',
  secondaryColor: '#FFCC00'
};

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/dart_ops';
const SIGNUP_ENABLED = process.env.DISABLE_RIDER_SIGNUP !== 'true';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'require' || process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'dart-ops-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

const defaultPasswordHash = bcrypt.hashSync('dart123', 10);

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
  `;
  await query(schemaSql);
  await runMigrations();
  await seedDefaultUsers();
  await seedDefaultVehicles();
}

async function runMigrations() {
  const statements = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS usc_id VARCHAR(10);`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;`,
    `ALTER TABLE rides ADD COLUMN IF NOT EXISTS recurring_id TEXT;`,
    `ALTER TABLE rides ADD COLUMN IF NOT EXISTS consecutive_misses INTEGER DEFAULT 0;`,
    `ALTER TABLE rides ADD COLUMN IF NOT EXISTS notes TEXT;`,
    `ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancelled_by TEXT;`,
    `ALTER TABLE rides ADD COLUMN IF NOT EXISTS vehicle_id TEXT REFERENCES vehicles(id);`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;`,
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
    );`
  ];
  for (const stmt of statements) {
    await query(stmt);
  }
}

async function seedDefaultUsers() {
  const defaults = [
    { id: 'emp1', username: 'mazen', name: 'Mazen', email: 'hello+mazen@ride-ops.com', usc_id: '1000000001', phone: '213-555-0101', role: 'driver', active: false },
    { id: 'emp2', username: 'jason', name: 'Jason', email: 'hello+jason@ride-ops.com', usc_id: '1000000002', phone: '213-555-0102', role: 'driver', active: false },
    { id: 'emp3', username: 'jocelin', name: 'Jocelin', email: 'hello+jocelin@ride-ops.com', usc_id: '1000000003', phone: '213-555-0103', role: 'driver', active: false },
    { id: 'emp4', username: 'olivia', name: 'Olivia', email: 'hello+olivia@ride-ops.com', usc_id: '1000000004', phone: '213-555-0104', role: 'driver', active: false },
    { id: 'office', username: 'office', name: 'Office', email: 'hello+office@ride-ops.com', usc_id: '1000009999', phone: '213-555-0199', role: 'office', active: true },
    { id: 'rider1', username: 'sarah', name: 'Sarah Student', email: 'hello+sarah@ride-ops.com', usc_id: '1000000011', phone: '213-555-0111', role: 'rider', active: false },
    { id: 'rider2', username: 'tom', name: 'Tom Faculty', email: 'hello+tom@ride-ops.com', usc_id: '1000000012', phone: '213-555-0112', role: 'rider', active: false }
  ];

  for (const user of defaults) {
    await query(
      `INSERT INTO users (id, username, password_hash, name, email, usc_id, phone, role, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         username = EXCLUDED.username,
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         usc_id = EXCLUDED.usc_id,
         phone = EXCLUDED.phone,
         role = EXCLUDED.role,
         active = EXCLUDED.active`,
      [user.id, user.username, defaultPasswordHash, user.name, user.email, user.usc_id || null, user.phone || null, user.role, user.active]
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

// ----- Helpers -----
function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUSCID(value) {
  return typeof value === 'string' && /^[0-9]{10}$/.test(value);
}

function isValidPhone(value) {
  if (!value) return true;
  return typeof value === 'string' && /^[0-9+()\-\s]{7,20}$/.test(value);
}

function isWithinServiceHours(requestedTime) {
  const date = new Date(requestedTime);
  if (isNaN(date.getTime())) return false;
  const day = date.getDay();
  if (day < 1 || day > 5) return false;
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  return totalMinutes >= 8 * 60 && totalMinutes <= 19 * 60;
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

async function addRideEvent(rideId, actorUserId, type) {
  await query(
    `INSERT INTO ride_events (id, ride_id, actor_user_id, type) VALUES ($1, $2, $3, $4)`,
    [generateId('event'), rideId, actorUserId || null, type]
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
    vehicleId: row.vehicle_id || null
  };
}

function normalizeDays(days) {
  if (!Array.isArray(days)) return [];
  return Array.from(new Set(days.map((d) => Number(d)).filter((n) => n >= 1 && n <= 5))).sort();
}

function generateRecurringDates(startDate, endDate, days) {
  const result = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    const day = current.getDay(); // 0-6
    const weekday = day === 0 ? 7 : day; // Sunday=7, Monday=1
    if (days.includes(weekday)) {
      result.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }
  return result;
}

// ----- Auth middleware -----
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireOffice(req, res, next) {
  if (!req.session.userId || req.session.role !== 'office') {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ error: 'Office access required' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireStaff(req, res, next) {
  if (!req.session.userId || (req.session.role !== 'office' && req.session.role !== 'driver')) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ error: 'Staff access required' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireRider(req, res, next) {
  if (!req.session.userId || req.session.role !== 'rider') {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
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
  req.session.uscId = user.usc_id;
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
    usc_id: req.session.uscId,
    role: req.session.role
  });
});

app.get('/api/auth/signup-allowed', (req, res) => {
  res.json({ allowed: SIGNUP_ENABLED });
});

app.get('/api/client-config', (req, res) => {
  res.json({ isDev: isDevRequest(req) });
});

app.get('/api/tenant-config', (req, res) => res.json(TENANT));

// Self-service profile
app.get('/api/me', requireAuth, async (req, res) => {
  const result = await query(
    `SELECT id, username, name, email, usc_id, phone, role FROM users WHERE id = $1`,
    [req.session.userId]
  );
  const user = result.rows[0];
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.put('/api/me', requireAuth, async (req, res) => {
  const { name, phone } = req.body;
  if (name && name.length > 120) return res.status(400).json({ error: 'Name too long' });
  if (!isValidPhone(phone)) return res.status(400).json({ error: 'Invalid phone format' });
  const result = await query(
    `UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone), updated_at = NOW()
     WHERE id = $3
     RETURNING id, username, name, email, usc_id, phone, role`,
    [name || null, phone || null, req.session.userId]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'User not found' });
  const user = result.rows[0];
  // refresh session display name
  req.session.name = user.name;
  res.json(user);
});

// Change own password
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
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
    return res.status(400).json({ error: 'Name, email, password, and USC ID are required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (!isValidUSCID(uscId)) {
    return res.status(400).json({ error: 'USC ID must be 10 digits' });
  }
  const uname = email.toLowerCase().split('@')[0];
  const existing = await query('SELECT 1 FROM users WHERE username = $1 OR email = $2 OR phone = $3 OR usc_id = $4', [uname, email.toLowerCase(), phone || null, uscId]);
  if (existing.rowCount) {
    return res.status(400).json({ error: 'Username, email, phone, or USC ID already exists' });
  }
  const id = generateId('rider');
  const hash = bcrypt.hashSync(password, 10);
  await query(
    `INSERT INTO users (id, username, password_hash, name, email, usc_id, phone, role, active)
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
    `SELECT id, username, name, email, usc_id, phone, role, active FROM users ORDER BY role, name`
  );
  res.json(result.rows);
});

app.get('/api/admin/users/search', requireOffice, async (req, res) => {
  const { usc_id } = req.query;
  if (!usc_id || !isValidUSCID(usc_id)) return res.status(400).json({ error: 'usc_id must be 10 digits' });
  const result = await query(
    `SELECT id, username, name, email, usc_id, phone, role, active FROM users WHERE usc_id = $1`,
    [usc_id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'No user found' });
  res.json(result.rows[0]);
});

app.delete('/api/admin/users/:id', requireOffice, async (req, res) => {
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
  const { name, email, phone, uscId, role, password } = req.body;
  if (!name || !email || !uscId || !role || !password) {
    return res.status(400).json({ error: 'Name, email, USC ID, role, and password are required' });
  }
  if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (!isValidUSCID(uscId)) return res.status(400).json({ error: 'USC ID must be 10 digits' });
  if (!isValidPhone(phone)) return res.status(400).json({ error: 'Invalid phone format' });
  if (!['rider', 'driver', 'office'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const username = email.toLowerCase().split('@')[0];
  const existing = await query('SELECT 1 FROM users WHERE username = $1 OR email = $2 OR usc_id = $3 OR phone = $4', [username, email.toLowerCase(), uscId, phone || null]);
  if (existing.rowCount) {
    return res.status(400).json({ error: 'Username, email, phone, or USC ID already exists' });
  }

  const id = generateId(role);
  const hash = bcrypt.hashSync(password, 10);
  await query(
    `INSERT INTO users (id, username, password_hash, name, email, usc_id, phone, role, active, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, TRUE)`,
    [id, username, hash, name, email.toLowerCase(), uscId, phone || null, role]
  );

  // Fire-and-forget welcome email
  let emailSent = false;
  try {
    emailSent = emailConfigured();
    if (emailSent) sendWelcomeEmail(email.toLowerCase(), name, username, password, role, TENANT.orgName).catch(() => {});
  } catch {}

  const result = await query(
    `SELECT id, username, name, email, usc_id, phone, role, active FROM users WHERE id = $1`,
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
  if (uscId && !isValidUSCID(uscId)) return res.status(400).json({ error: 'USC ID must be 10 digits' });
  if (role && !['rider', 'driver', 'office'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  // Uniqueness checks for email and usc_id
  if (email) {
    const dup = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [email.toLowerCase(), targetId]);
    if (dup.rowCount) return res.status(400).json({ error: 'Email already in use by another user' });
  }
  if (uscId) {
    const dup = await query('SELECT id FROM users WHERE usc_id = $1 AND id != $2', [uscId, targetId]);
    if (dup.rowCount) return res.status(400).json({ error: 'USC ID already in use by another user' });
  }

  const result = await query(
    `UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone),
     email = COALESCE($3, email), usc_id = COALESCE($4, usc_id), role = COALESCE($5, role),
     updated_at = NOW()
     WHERE id = $6
     RETURNING id, username, name, email, usc_id, phone, role, active`,
    [name || null, phone || null, email ? email.toLowerCase() : null, uscId || null, role || null, targetId]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'User not found' });
  res.json(result.rows[0]);
});

app.get('/api/admin/users/:id/profile', requireOffice, async (req, res) => {
  const key = req.params.id;
  const userRes = await query(
    `SELECT id, username, name, email, usc_id, phone, role, active FROM users WHERE id = $1 OR email = $1 OR username = $1`,
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

  res.json({ user, upcoming, past });
});

// Admin reset password for another user
app.post('/api/admin/users/:id/reset-password', requireOffice, async (req, res) => {
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
    if (emailSent && user.email) sendPasswordResetEmail(user.email, user.name, newPassword, TENANT.orgName).catch(() => {});
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
  res.json(result.rows[0]);
});

app.post('/api/employees/clock-out', requireStaff, async (req, res) => {
  const { employeeId } = req.body;
  const result = await query(
    `UPDATE users SET active = FALSE, updated_at = NOW() WHERE id = $1 AND role = 'driver' RETURNING id, username, name, email, role, active`,
    [employeeId]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Employee not found' });
  res.json(result.rows[0]);
});

// ----- Shift endpoints -----
app.get('/api/shifts', requireStaff, async (req, res) => {
  const result = await query(
    `SELECT id, employee_id AS "employeeId", day_of_week AS "dayOfWeek", start_time AS "startTime", end_time AS "endTime"
     FROM shifts ORDER BY day_of_week, start_time`
  );
  res.json(result.rows);
});

app.post('/api/shifts', requireOffice, async (req, res) => {
  const { employeeId, dayOfWeek, startTime, endTime } = req.body;
  const shift = {
    id: generateId('shift'),
    employeeId,
    dayOfWeek,
    startTime,
    endTime
  };
  await query(
    `INSERT INTO shifts (id, employee_id, day_of_week, start_time, end_time)
     VALUES ($1, $2, $3, $4, $5)`,
    [shift.id, employeeId, dayOfWeek, startTime, endTime]
  );
  res.json(shift);
});

app.delete('/api/shifts/:id', requireOffice, async (req, res) => {
  const { id } = req.params;
  const result = await query(`DELETE FROM shifts WHERE id = $1 RETURNING id`, [id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Shift not found' });
  res.json({ id });
});

// ----- Ride endpoints -----
app.get('/api/rides', requireStaff, async (req, res) => {
  const { status } = req.query;
  const baseSql = `
    SELECT id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
           requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, recurring_id, cancelled_by, vehicle_id
    FROM rides
  `;
  const result = status
    ? await query(`${baseSql} WHERE status = $1 ORDER BY requested_time`, [status])
    : await query(`${baseSql} ORDER BY requested_time`);
  res.json(result.rows.map(mapRide));
});

app.post('/api/rides', requireAuth, async (req, res) => {
  const { riderName, riderEmail, riderPhone, pickupLocation, dropoffLocation, requestedTime, notes } = req.body;

  if (!pickupLocation || !dropoffLocation || !requestedTime) {
    return res.status(400).json({ error: 'Pickup, dropoff, and requested time are required' });
  }
  if (!isWithinServiceHours(requestedTime)) {
    return res.status(400).json({ error: 'Requested time outside service hours (8:00-19:00 Mon-Fri)' });
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
});

app.post('/api/rides/:id/approve', requireOffice, async (req, res) => {
  const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  const missCount = await getRiderMissCount(ride.rider_email);
  if ((missCount || ride.consecutive_misses || 0) >= 5) {
    return res.status(400).json({ error: 'SERVICE TERMINATED: rider has 5 consecutive no-shows' });
  }
  if (!isWithinServiceHours(ride.requested_time)) {
    return res.status(400).json({ error: 'Requested time outside service hours (8:00-19:00 Mon-Fri)' });
  }
  const result = await query(
    `UPDATE rides SET status = 'approved', updated_at = NOW() WHERE id = $1
     RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
               requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
    [ride.id]
  );
  await addRideEvent(ride.id, req.session.userId, 'approved');
  res.json(mapRide(result.rows[0]));
});

app.post('/api/rides/:id/deny', requireOffice, async (req, res) => {
  const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  const result = await query(
    `UPDATE rides SET status = 'denied', updated_at = NOW() WHERE id = $1
     RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
               requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
    [ride.id]
  );
  await addRideEvent(ride.id, req.session.userId, 'denied');
  res.json(mapRide(result.rows[0]));
});

app.get('/api/my-rides', requireRider, async (req, res) => {
  const result = await query(
    `SELECT id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
            requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, recurring_id, rider_id, vehicle_id
     FROM rides WHERE rider_email = $1 ORDER BY requested_time DESC`,
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
    const terminalStatuses = ['completed', 'no_show', 'cancelled'];
    if (terminalStatuses.includes(ride.status)) {
      return res.status(400).json({ error: 'Cannot cancel a ride that is already completed, no-show, or cancelled' });
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

app.get('/api/locations', requireAuth, (req, res) => {
  res.json(campusLocations);
});

// ----- Recurring rides -----
app.post('/api/recurring-rides', requireRider, async (req, res) => {
  const { pickupLocation, dropoffLocation, timeOfDay, startDate, endDate, daysOfWeek, notes, riderPhone } = req.body;
  if (!pickupLocation || !dropoffLocation || !timeOfDay || !startDate || !endDate) {
    return res.status(400).json({ error: 'Pickup, dropoff, start/end date, and time are required' });
  }
  const days = normalizeDays(daysOfWeek);
  if (!days.length) return res.status(400).json({ error: 'Choose at least one weekday (Mon-Fri)' });
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start) || isNaN(end) || start > end) return res.status(400).json({ error: 'Invalid date range' });
  const [hourStr, minuteStr] = String(timeOfDay).split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr || 0);
  const minutesTotal = hour * 60 + minute;
  if (minutesTotal < 8 * 60 || minutesTotal > 19 * 60) {
    return res.status(400).json({ error: 'Time must be between 08:00 and 19:00' });
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
    if (!isWithinServiceHours(requestedTime)) continue;
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
});

// ----- Driver action endpoints -----
app.post('/api/rides/:id/on-the-way', requireAuth, async (req, res) => {
  const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
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
});

app.post('/api/rides/:id/here', requireAuth, async (req, res) => {
  const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
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
});

app.post('/api/rides/:id/complete', requireAuth, async (req, res) => {
  const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
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
});

app.post('/api/rides/:id/no-show', requireAuth, async (req, res) => {
  const rideRes = await query(`SELECT * FROM rides WHERE id = $1`, [req.params.id]);
  const ride = rideRes.rows[0];
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  if (!(await allowDriverAction(req, res, ride))) return;
  const newCount = (await getRiderMissCount(ride.rider_email)) + 1;
  const result = await query(
    `UPDATE rides SET status = 'no_show', consecutive_misses = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes,
               requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, vehicle_id`,
    [ride.id, newCount]
  );
  await setRiderMissCount(ride.rider_email, newCount);
  await addRideEvent(ride.id, req.session.userId, 'no_show');
  res.json(mapRide(result.rows[0]));
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
  const { notes } = req.body;
  const result = await query(
    `UPDATE vehicles SET
       last_maintenance_date = CURRENT_DATE,
       notes = COALESCE($1, notes)
     WHERE id = $2
     RETURNING *`,
    [notes || null, req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Vehicle not found' });
  res.json(result.rows[0]);
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
  const [pickupRes, dropoffRes, routeRes] = await Promise.all([
    query(`SELECT pickup_location AS location, COUNT(*) AS count FROM rides WHERE 1=1 ${clause} ${statusFilter} GROUP BY pickup_location ORDER BY count DESC LIMIT 10`, params),
    query(`SELECT dropoff_location AS location, COUNT(*) AS count FROM rides WHERE 1=1 ${clause} ${statusFilter} GROUP BY dropoff_location ORDER BY count DESC LIMIT 10`, params),
    query(`SELECT pickup_location || ' → ' || dropoff_location AS route, COUNT(*) AS count FROM rides WHERE 1=1 ${clause} ${statusFilter} GROUP BY pickup_location, dropoff_location ORDER BY count DESC LIMIT 10`, params)
  ]);
  res.json({
    topPickups: pickupRes.rows,
    topDropoffs: dropoffRes.rows,
    topRoutes: routeRes.rows
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

// ----- Dev endpoint -----
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
  .then(() => {
    app.listen(PORT, () => {
      console.log('Server running from:', __dirname);
      console.log(`RideOps server running on port ${PORT}`);
      if (process.env.NODE_ENV !== 'production') {
        console.log('Login: jamie/avery/casey/chris/office, riders: sarah/tom, password: dart123');
      }
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database', err);
    process.exit(1);
  });
