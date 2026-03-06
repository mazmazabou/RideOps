// server.js — Thin orchestrator
// Wires lib/ modules, builds ctx, registers route modules, runs startup.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const path = require('path');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// ----- Lib modules -----
const {
  DEFAULT_TENANT, loadTenantConfig, VALID_ORG_SLUGS, NOTIFICATION_EVENT_TYPES,
  SETTING_DEFAULTS, SETTING_TYPES, MIN_PASSWORD_LENGTH
} = require('./lib/config');
const createDb = require('./lib/db');
const createHelpers = require('./lib/helpers');
const { wrapAsync, createAuthMiddleware, createRateLimiters } = require('./lib/auth-middleware');

// ----- External modules -----
const ExcelJS = require('exceljs');

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
const { dispatchNotification, sendRiderEmail, createRiderNotification, sendUserNotification, setTenantConfig: setNotifTenantConfig } = require('./notification-service');

// ----- Tenant configuration -----
const TENANT = loadTenantConfig();
setNotifTenantConfig(TENANT);

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

const campusConfigs = require('./tenants/campus-configs');

// ----- Express app + database -----
const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/rideops';
const SIGNUP_ENABLED = process.env.DISABLE_RIDER_SIGNUP !== 'true';
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isProduction || process.env.PGSSLMODE === 'require' || process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined
});

pool.on('connect', async (client) => {
  if (TENANT.timezone) {
    const tzCheck = await client.query(
      "SELECT 1 FROM pg_timezone_names WHERE name = $1",
      [TENANT.timezone]
    );
    if (tzCheck.rows.length > 0) {
      await client.query(`SET timezone = '${TENANT.timezone}'`);
    } else {
      console.warn(`[WARN] Invalid timezone "${TENANT.timezone}" — using database default`);
    }
  }
});

// Session secret validation
if (isProduction && !process.env.SESSION_SECRET) {
  console.error('[FATAL] SESSION_SECRET environment variable is required in production.');
  console.error('Set a strong, random secret: export SESSION_SECRET=$(openssl rand -hex 32)');
  process.exit(1);
}
if (!isProduction && !process.env.SESSION_SECRET) {
  console.warn('[WARN] SESSION_SECRET not set — using development-only fallback. Do NOT deploy like this.');
}
const sessionSecret = process.env.SESSION_SECRET || 'rideops-dev-only-secret-do-not-use-in-prod';

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ----- Build modules -----
let defaultPasswordHash;

const helpers = createHelpers(pool, function query(text, params) {
  return pool.query(text, params);
}, TENANT, SETTING_DEFAULTS, SETTING_TYPES);

const db = createDb(pool, {
  generateId: helpers.generateId,
  get defaultPasswordHash() { return defaultPasswordHash; },
  DEMO_MODE,
  NOTIFICATION_EVENT_TYPES
});

const { query, initDb, seedNotificationPreferences } = db;

const authMw = createAuthMiddleware(query);
const { loginLimiter, signupLimiter } = createRateLimiters(isProduction);

// ----- Build shared context -----
const ctx = {
  // DB
  pool, query,
  // Helpers
  ...helpers,
  // Middleware
  wrapAsync,
  ...authMw,
  loginLimiter, signupLimiter,
  // DB functions
  seedNotificationPreferences,
  // Constants
  TENANT, DEMO_MODE, isProduction, MIN_PASSWORD_LENGTH, SIGNUP_ENABLED,
  NOTIFICATION_EVENT_TYPES, VALID_ORG_SLUGS, SETTING_DEFAULTS, SETTING_TYPES,
  campusConfigs, campusLocations, allCampusLocations,
  // External modules
  bcrypt, ExcelJS,
  emailConfigured, sendWelcomeEmail, sendPasswordResetEmail,
  dispatchNotification, sendRiderEmail, createRiderNotification, sendUserNotification
};

// ----- Health check (unauthenticated) -----
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', uptime: process.uptime() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'disconnected', error: err.message });
  }
});

// ----- Register route modules (order matters!) -----
require('./routes/auth')(app, ctx);               // Auth (login, signup, tenant-config, client-config)
require('./routes/content')(app, ctx);            // Program rules
require('./routes/settings')(app, ctx);           // Settings
require('./routes/profile')(app, ctx);            // Self-service profile
require('./routes/admin-users')(app, ctx);        // Admin users (before :id params)
require('./routes/pages')(app, ctx);              // Org-scoped + page routes + static files
require('./routes/employees')(app, ctx);          // Employees
require('./routes/shifts')(app, ctx);             // Shifts
require('./routes/rides')(app, ctx);              // Rides (bulk-delete before :id)
require('./routes/recurring-rides')(app, ctx);    // Recurring rides
require('./routes/driver-actions')(app, ctx);     // Driver actions (:id/claim, etc.)
require('./routes/vehicles')(app, ctx);           // Vehicles
require('./routes/analytics')(app, ctx);          // Analytics (all 19 endpoints)
require('./routes/academic-terms')(app, ctx);     // Academic terms
require('./routes/notifications')(app, ctx);      // Notifications + prefs + purge + dev

// Global error handler — must be last middleware
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----- Startup -----
let server;

(async function startup() {
  // Compute default password hash asynchronously before anything else
  defaultPasswordHash = await bcrypt.hash('demo123', 10);

  await initDb();

  // Recover rides stuck in driver-active states after server restart
  const stuckResult = await query(
    `UPDATE rides
     SET status = 'scheduled', grace_start_time = NULL, updated_at = NOW()
     WHERE status IN ('driver_on_the_way', 'driver_arrived_grace')
     RETURNING id`
  );
  if (stuckResult.rows.length > 0) {
    console.log(`[STARTUP] Recovered ${stuckResult.rows.length} stuck ride(s) → reverted to 'scheduled'`);
    for (const ride of stuckResult.rows) {
      await helpers.addRideEvent(ride.id, null, 'system_recovery', 'Ride reverted to scheduled after server restart');
    }
  }

  // Reset all driver active states on restart
  const resetResult = await query("UPDATE users SET active = FALSE WHERE role = 'driver' AND active = TRUE RETURNING id");
  if (resetResult.rows.length > 0) {
    console.log(`[STARTUP] Reset ${resetResult.rows.length} driver clock-in state(s)`);
  }

  if (DEMO_MODE) {
    const { rows } = await query('SELECT COUNT(*) as count FROM rides');
    if (parseInt(rows[0].count) < 10) {
      const { seedDemoData } = require('./demo-seed');
      await seedDemoData(pool).then(() => console.log('Demo data seeded')).catch(console.error);
    } else {
      console.log(`[STARTUP] Demo data already present (${rows[0].count} rides), skipping seed`);
    }
  }

  server = app.listen(PORT, () => {
    console.log('Server running from:', __dirname);
    console.log(`RideOps server running on port ${PORT}${DEMO_MODE ? ' (DEMO MODE)' : ''}`);
    if (!isProduction) {
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
        const existing = await query(
          `SELECT 1 FROM notifications WHERE event_type = 'ride_pending_stale' AND metadata->>'rideId' = $1 LIMIT 1`,
          [ride.id]
        );
        if (existing.rowCount > 0) continue;

        const minutesPending = Math.round((Date.now() - new Date(ride.created_at).getTime()) / 60000);
        dispatchNotification('ride_pending_stale', {
          rideId: ride.id,
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

    // Check for driver-missed-ride (scheduled rides past their requested time)
    try {
      const missedPref = await query(`
        SELECT DISTINCT threshold_value FROM notification_preferences
        WHERE event_type = 'driver_missed_ride' AND enabled = true AND threshold_value IS NOT NULL
      `);
      if (missedPref.rowCount) {
        const minMissedThreshold = Math.min(...missedPref.rows.map(r => r.threshold_value));
        const missedCutoff = new Date(Date.now() - minMissedThreshold * 60000);

        const missedRides = await query(`
          SELECT r.*, u.name as driver_name, ru.name as rider_display_name
          FROM rides r
          JOIN users u ON u.id = r.assigned_driver_id
          LEFT JOIN users ru ON ru.id = r.rider_id
          WHERE r.status = 'scheduled'
            AND r.assigned_driver_id IS NOT NULL
            AND r.requested_time <= $1
        `, [missedCutoff.toISOString()]);

        for (const ride of missedRides.rows) {
          // Deduplicate: skip if we already notified about this ride
          const existing = await query(
            `SELECT 1 FROM notifications WHERE event_type = 'driver_missed_ride' AND metadata->>'rideId' = $1 LIMIT 1`,
            [ride.id]
          );
          if (existing.rowCount > 0) continue;

          const minutesOverdue = Math.round((Date.now() - new Date(ride.requested_time).getTime()) / 60000);
          dispatchNotification('driver_missed_ride', {
            rideId: ride.id,
            riderName: ride.rider_display_name || ride.rider_name || 'Unknown',
            driverName: ride.driver_name || 'Unknown',
            pickup: ride.pickup_location,
            dropoff: ride.dropoff_location,
            requestedTime: new Date(ride.requested_time).toLocaleString('en-US', { timeZone: TENANT.timezone }),
            minutesOverdue,
            thresholdCheck: minutesOverdue
          }, query).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[Notifications] Missed ride check error:', err.message);
    }
  }, 5 * 60 * 1000);

  // Check for upcoming rides and missed shifts every 60 seconds
  setInterval(async () => {
    // -- Upcoming ride reminders (15 min before) --
    try {
      const now = new Date();
      const fifteenMinFromNow = new Date(Date.now() + 15 * 60000);

      const upcomingRides = await query(`
        SELECT r.id, r.assigned_driver_id, r.rider_name, r.pickup_location, r.dropoff_location, r.requested_time,
               d.name AS driver_name
        FROM rides r
        JOIN users d ON d.id = r.assigned_driver_id
        WHERE r.status = 'scheduled'
          AND r.assigned_driver_id IS NOT NULL
          AND r.requested_time BETWEEN $1 AND $2
          AND r.ride_upcoming_notified_at IS NULL
      `, [now.toISOString(), fifteenMinFromNow.toISOString()]);

      for (const ride of upcomingRides.rows) {
        await query('UPDATE rides SET ride_upcoming_notified_at = NOW() WHERE id = $1', [ride.id]);
        sendUserNotification(ride.assigned_driver_id, 'driver_upcoming_ride', {
          driverName: ride.driver_name,
          riderName: ride.rider_name,
          pickup: ride.pickup_location,
          dropoff: ride.dropoff_location,
          time: new Date(ride.requested_time).toLocaleString('en-US', { timeZone: TENANT.timezone, hour: 'numeric', minute: '2-digit' })
        }, query).catch(() => {});
      }
    } catch (err) {
      console.error('[Notifications] Upcoming ride check error:', err.message);
    }

    // -- Missed shift check --
    try {
      const now = new Date();
      const local = new Date(now.toLocaleString('en-US', { timeZone: TENANT.timezone }));
      const todayDow = (local.getDay() + 6) % 7;
      const nowHH = String(local.getHours()).padStart(2, '0');
      const nowMM = String(local.getMinutes()).padStart(2, '0');
      const nowTime = `${nowHH}:${nowMM}`;
      const todayDate = helpers.formatLocalDate(now);
      const monday = new Date(local);
      monday.setDate(local.getDate() - todayDow);
      const weekStart = helpers.formatLocalDate(monday);

      // Shifts that ended within last 30 min where driver never clocked in today
      const thirtyMinAgo = local.getHours() * 60 + local.getMinutes() - 30;
      const cutoffHH = String(Math.floor(Math.max(0, thirtyMinAgo) / 60)).padStart(2, '0');
      const cutoffMM = String(Math.max(0, thirtyMinAgo) % 60).padStart(2, '0');
      const cutoffTime = `${cutoffHH}:${cutoffMM}`;

      const missedShifts = await query(`
        SELECT s.id AS shift_id, s.employee_id, s.start_time, s.end_time, u.name AS driver_name
        FROM shifts s
        JOIN users u ON u.id = s.employee_id AND u.deleted_at IS NULL
        WHERE s.day_of_week = $1
          AND (s.week_start IS NULL OR s.week_start = $2)
          AND s.end_time <= $3
          AND s.end_time > $4
          AND NOT EXISTS (
            SELECT 1 FROM clock_events ce
            WHERE ce.employee_id = s.employee_id AND ce.event_date = $5
          )
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.user_id = s.employee_id AND n.event_type = 'driver_missed_shift'
              AND n.created_at::date = CURRENT_DATE
          )
      `, [todayDow, weekStart, nowTime, cutoffTime, todayDate]);

      for (const shift of missedShifts.rows) {
        sendUserNotification(shift.employee_id, 'driver_missed_shift', {
          driverName: shift.driver_name,
          shiftStart: shift.start_time,
          shiftEnd: shift.end_time,
          date: todayDate
        }, query).catch(() => {});
      }
    } catch (err) {
      console.error('[Notifications] Missed shift check error:', err.message);
    }
  }, 60 * 1000);
})().catch((err) => {
  console.error('Failed to initialize database', err);
  process.exit(1);
});

// ----- Graceful shutdown -----
function gracefulShutdown(signal) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
      pool.end(() => {
        console.log('Database pool closed');
        process.exit(0);
      });
    });
  } else {
    pool.end(() => process.exit(0));
  }
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 15000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
