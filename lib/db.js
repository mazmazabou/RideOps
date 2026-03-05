// lib/db.js — Database pool, query helper, schema init, migrations, seeds
'use strict';

function createDb(pool, deps) {
  const { generateId, DEMO_MODE, NOTIFICATION_EVENT_TYPES } = deps;
  // defaultPasswordHash is late-bound — access via deps getter
  const getDefaultPasswordHash = () => deps.defaultPasswordHash;

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
        rider_id TEXT PRIMARY KEY REFERENCES users(id),
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
    await seedDefaultTerms();
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
      );`,

      // ----- Indexes (idempotent — safe to run on every startup) -----
      `CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);`,
      `CREATE INDEX IF NOT EXISTS idx_rides_requested_time ON rides(requested_time);`,
      `CREATE INDEX IF NOT EXISTS idx_rides_rider_id ON rides(rider_id);`,
      `CREATE INDEX IF NOT EXISTS idx_rides_assigned_driver ON rides(assigned_driver_id);`,
      `CREATE INDEX IF NOT EXISTS idx_rides_rider_email ON rides(rider_email);`,
      `CREATE INDEX IF NOT EXISTS idx_rides_vehicle_id ON rides(vehicle_id);`,
      `CREATE INDEX IF NOT EXISTS idx_rides_status_time ON rides(status, requested_time);`,
      `CREATE INDEX IF NOT EXISTS idx_ride_events_ride_id ON ride_events(ride_id);`,
      `CREATE INDEX IF NOT EXISTS idx_shifts_employee_id ON shifts(employee_id);`,
      `CREATE INDEX IF NOT EXISTS idx_clock_events_employee_date ON clock_events(employee_id, event_date);`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);`,

      // ----- Academic Terms -----
      `CREATE TABLE IF NOT EXISTS academic_terms (
        id TEXT PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT academic_terms_date_order CHECK (end_date > start_date)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_academic_terms_sort ON academic_terms(sort_order, start_date DESC);`,

      // ----- Soft-delete users -----
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;`,

      // Replace hard UNIQUE constraints with partial unique indexes (active users only)
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key') THEN
          ALTER TABLE users DROP CONSTRAINT users_username_key;
        END IF;
      END $$;`,
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key') THEN
          ALTER TABLE users DROP CONSTRAINT users_email_key;
        END IF;
      END $$;`,
      `CREATE UNIQUE INDEX IF NOT EXISTS users_username_active_unique ON users(username) WHERE deleted_at IS NULL;`,
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_active_unique ON users(email) WHERE deleted_at IS NULL;`,
      `CREATE INDEX IF NOT EXISTS idx_users_active ON users(deleted_at) WHERE deleted_at IS NULL;`,

      // ----- Rides pagination index -----
      `CREATE INDEX IF NOT EXISTS idx_rides_time_id_desc ON rides(requested_time DESC, id DESC);`,

      // ----- Constraints -----
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_name_unique'
        ) THEN
          ALTER TABLE vehicles ADD CONSTRAINT vehicles_name_unique UNIQUE (name);
        END IF;
      END $$;`,

      // ----- rider_miss_counts: migrate PK from email to rider_id -----
      `ALTER TABLE rider_miss_counts ADD COLUMN IF NOT EXISTS rider_id TEXT;`,
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rider_miss_counts' AND column_name = 'email') THEN
          UPDATE rider_miss_counts rmc SET rider_id = u.id FROM users u WHERE u.email = rmc.email AND u.role = 'rider' AND rmc.rider_id IS NULL;
          DELETE FROM rider_miss_counts WHERE rider_id IS NULL;
          ALTER TABLE rider_miss_counts DROP CONSTRAINT IF EXISTS rider_miss_counts_pkey;
          ALTER TABLE rider_miss_counts ADD PRIMARY KEY (rider_id);
          ALTER TABLE rider_miss_counts DROP COLUMN email;
        END IF;
      END $$;`
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
           password_hash = EXCLUDED.password_hash,
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           member_id = EXCLUDED.member_id,
           phone = EXCLUDED.phone,
           role = EXCLUDED.role,
           active = EXCLUDED.active,
           preferred_name = COALESCE(EXCLUDED.preferred_name, users.preferred_name),
           major = COALESCE(EXCLUDED.major, users.major),
           graduation_year = COALESCE(EXCLUDED.graduation_year, users.graduation_year)`,
        [user.id, user.username, getDefaultPasswordHash(), user.name, user.email, user.member_id || null, user.phone || null, user.role, user.active, user.preferred_name || null, user.major || null, user.graduation_year || null]
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
      { key: 'auto_deny_outside_hours', value: DEMO_MODE ? 'false' : 'true', type: 'boolean', label: 'Auto-Deny Outside Hours', description: 'Automatically reject ride requests outside service hours', category: 'operations' },
      { key: 'notify_office_tardy', value: 'true', type: 'boolean', label: 'Notify Office of Tardiness', description: 'Alert office when a driver clocks in late', category: 'notifications' },
      { key: 'notify_rider_no_show', value: 'true', type: 'boolean', label: 'Notify Rider of No-Show', description: 'Send notification to rider when marked no-show', category: 'notifications' },
      { key: 'notify_rider_strike_warning', value: 'true', type: 'boolean', label: 'Notify Rider of Strike Warning', description: 'Warn rider when approaching strike limit', category: 'notifications' },
      { key: 'ride_retention_value', value: '0', type: 'number', label: 'Ride Data Retention — Value', description: 'Number of time units to retain closed rides. 0 = keep forever.', category: 'data' },
      { key: 'ride_retention_unit', value: 'months', type: 'select', label: 'Ride Data Retention — Unit', description: 'Time unit for ride retention period.', category: 'data' },
      { key: 'academic_period_label', value: 'Semester', type: 'select', label: 'Academic Period Label', description: 'Label for the full-term date range preset in analytics (Semester, Quarter, or Trimester).', category: 'operations' }
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

  async function seedDefaultTerms() {
    const existing = await query('SELECT COUNT(*) FROM academic_terms');
    if (parseInt(existing.rows[0].count) > 0) return;

    // Read the academic_period_label to determine term structure
    const labelResult = await query(
      "SELECT setting_value FROM tenant_settings WHERE setting_key = 'academic_period_label'"
    );
    const periodLabel = labelResult.rows[0]?.setting_value || 'Semester';
    const year = new Date().getFullYear();

    let terms;
    if (periodLabel === 'Quarter') {
      terms = [
        { name: `Winter ${year}`, start: `${year}-01-06`, end: `${year}-03-21`, sort: 0 },
        { name: `Spring ${year}`, start: `${year}-03-24`, end: `${year}-06-13`, sort: 1 },
        { name: `Summer ${year}`, start: `${year}-06-16`, end: `${year}-09-12`, sort: 2 },
        { name: `Fall ${year}`, start: `${year}-09-22`, end: `${year}-12-12`, sort: 3 }
      ];
    } else if (periodLabel === 'Trimester') {
      terms = [
        { name: `Spring ${year}`, start: `${year}-01-13`, end: `${year}-04-30`, sort: 0 },
        { name: `Summer ${year}`, start: `${year}-05-05`, end: `${year}-08-15`, sort: 1 },
        { name: `Fall ${year}`, start: `${year}-08-25`, end: `${year}-12-12`, sort: 2 }
      ];
    } else {
      // Default: Semester
      terms = [
        { name: `Spring ${year}`, start: `${year}-01-13`, end: `${year}-05-09`, sort: 0 },
        { name: `Summer ${year}`, start: `${year}-05-19`, end: `${year}-08-08`, sort: 1 },
        { name: `Fall ${year}`, start: `${year}-08-18`, end: `${year}-12-12`, sort: 2 }
      ];
    }

    for (const t of terms) {
      await query(
        `INSERT INTO academic_terms (id, name, start_date, end_date, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [generateId('term'), t.name, t.start, t.end, t.sort]
      );
    }
  }

  async function seedNotificationPreferences(userId) {
    const emailOnByDefault = ['driver_tardy', 'rider_no_show', 'rider_approaching_termination', 'rider_terminated', 'daily_summary', 'driver_missed_ride'];
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

  return { query, initDb, seedNotificationPreferences };
}

module.exports = createDb;
