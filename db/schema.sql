-- RideOps Database Schema Reference
-- This file reflects the schema as created by initDb() + runMigrations() in server.js
-- It is NOT executed directly — the server manages schema creation and migrations
-- Last updated: 2026-03-02

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  member_id VARCHAR(50),
  phone TEXT,
  role TEXT NOT NULL,                     -- 'office', 'driver', or 'rider'
  active BOOLEAN DEFAULT FALSE,           -- TRUE when driver is clocked in
  avatar_url TEXT,
  preferred_name VARCHAR(50),
  major VARCHAR(100),
  graduation_year INTEGER,
  bio VARCHAR(120),
  must_change_password BOOLEAN DEFAULT FALSE,
  password_changed_at TIMESTAMPTZ,
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
  day_of_week SMALLINT NOT NULL,          -- 0=Mon, 1=Tue, ..., 4=Fri, 5=Sat, 6=Sun
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes TEXT,
  week_start DATE,                        -- NULL = recurring template, DATE = specific week only
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
  status TEXT NOT NULL,                   -- pending, approved, scheduled, driver_on_the_way, driver_arrived_grace, completed, no_show, denied, cancelled
  assigned_driver_id TEXT REFERENCES users(id),
  grace_start_time TIMESTAMPTZ,
  consecutive_misses INTEGER DEFAULT 0,
  recurring_id TEXT,
  cancelled_by TEXT,                      -- 'office' or 'rider'
  vehicle_id TEXT REFERENCES vehicles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ride_events (
  id TEXT PRIMARY KEY,
  ride_id TEXT REFERENCES rides(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id),
  type TEXT NOT NULL,
  notes TEXT,
  initials TEXT,
  at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_rides (
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
);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'standard',           -- 'standard' or 'accessible'
  status TEXT DEFAULT 'available',        -- 'available', 'in_use', or 'retired'
  total_miles NUMERIC DEFAULT 0,
  last_maintenance_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT vehicles_name_unique UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS maintenance_logs (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  service_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  mileage_at_service NUMERIC,
  performed_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clock_events (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES users(id),
  shift_id TEXT REFERENCES shifts(id),
  event_date DATE NOT NULL,
  scheduled_start TIME,
  clock_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out_at TIMESTAMPTZ,
  tardiness_minutes INTEGER DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(80) NOT NULL,
  channel VARCHAR(20) NOT NULL,           -- 'email' or 'in_app'
  enabled BOOLEAN DEFAULT true,
  threshold_value INTEGER,
  threshold_unit VARCHAR(30),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_type, channel)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS program_content (
  id TEXT PRIMARY KEY,
  rules_html TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS academic_terms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_date > start_date)
);

-- Note: The 'session' table is auto-created by connect-pg-simple and managed by express-session.
-- It is NOT defined here.

-- ============================================================
-- INDEXES
-- ============================================================

-- Rides
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);
CREATE INDEX IF NOT EXISTS idx_rides_requested_time ON rides(requested_time);
CREATE INDEX IF NOT EXISTS idx_rides_rider_id ON rides(rider_id);
CREATE INDEX IF NOT EXISTS idx_rides_assigned_driver ON rides(assigned_driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_rider_email ON rides(rider_email);
CREATE INDEX IF NOT EXISTS idx_rides_vehicle_id ON rides(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_rides_status_time ON rides(status, requested_time);

-- Ride events
CREATE INDEX IF NOT EXISTS idx_ride_events_ride_id ON ride_events(ride_id);

-- Shifts
CREATE INDEX IF NOT EXISTS idx_shifts_employee_id ON shifts(employee_id);

-- Clock events
CREATE INDEX IF NOT EXISTS idx_clock_events_employee ON clock_events(employee_id);
CREATE INDEX IF NOT EXISTS idx_clock_events_date ON clock_events(event_date);
CREATE INDEX IF NOT EXISTS idx_clock_events_employee_date ON clock_events(employee_id, event_date);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_academic_terms_sort ON academic_terms(sort_order, start_date DESC);
