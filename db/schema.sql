-- Run against Postgres to create tables for DART Ops

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  usc_id VARCHAR(10),
  phone TEXT,
  role TEXT NOT NULL,
  active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure the column exists even if table pre-existed
ALTER TABLE users ADD COLUMN IF NOT EXISTS usc_id VARCHAR(10);

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
  recurring_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rides ADD COLUMN IF NOT EXISTS recurring_id TEXT;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS consecutive_misses INTEGER DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

CREATE TABLE IF NOT EXISTS ride_events (
  id TEXT PRIMARY KEY,
  ride_id TEXT REFERENCES rides(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id),
  type TEXT NOT NULL,
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
