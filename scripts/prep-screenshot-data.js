/**
 * prep-screenshot-data.js
 *
 * Standalone script that prepares the RideOps database for marketing-ready screenshots.
 * Connects directly to PostgreSQL, cleans test artifacts, and ensures realistic data
 * for today's date across rides, shifts, clock events, vehicles, and maintenance logs.
 *
 * Usage: node scripts/prep-screenshot-data.js
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://localhost/rideops',
});

let _idCounter = 0;
function genId(prefix) {
  _idCounter++;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${rand}${Date.now().toString(36).slice(-4)}${_idCounter}`;
}

// ── Location names ──
const LOCATIONS = [
  'Main Library', 'Science Library', 'Student Union', 'Student Center',
  'Engineering Hall', 'Science Building', 'Humanities Building', 'Business School',
  'Law School', 'Medical Center', 'Health Center', 'Recreation Center',
  'Gymnasium', 'Performing Arts Center', 'Fine Arts Building', 'Administration Building',
  'Admissions Office', 'Dining Hall (North)', 'Dining Hall (South)', 'Residence Hall A',
  'Residence Hall B', 'Residence Hall C', 'Parking Structure A', 'Parking Structure B',
  'Campus Bookstore', 'Campus Quad', 'Stadium', 'Aquatic Center',
  'Transportation Hub', 'Visitor Center', 'Campus Security', 'Maintenance Facility'
];

// ── Driver/Rider data ──
const DRIVERS = ['emp1', 'emp2', 'emp3', 'emp4'];

// Office user ID (actual ID in DB)
const OFFICE_USER_ID = 'office';

// Riders that exist in the users table (can be used as actor_user_id in ride_events)
const KNOWN_RIDERS = [
  { rider_id: 'rider1', rider_name: 'Casey Rivera', rider_email: 'hello+casey@ride-ops.com', rider_phone: '(213) 555-0101' },
  { rider_id: 'rider2', rider_name: 'Riley Chen', rider_email: 'hello+riley@ride-ops.com', rider_phone: '(213) 555-0102' },
];

// ── Event chain definitions ──
const EVENT_CHAINS = {
  pending:              ['requested'],
  approved:             ['requested', 'approved'],
  denied:               ['requested', 'denied'],
  cancelled:            ['requested', 'cancelled'],
  scheduled:            ['requested', 'approved', 'claimed'],
  driver_on_the_way:    ['requested', 'approved', 'claimed', 'on_the_way'],
  driver_arrived_grace: ['requested', 'approved', 'claimed', 'on_the_way', 'arrived'],
  completed:            ['requested', 'approved', 'claimed', 'on_the_way', 'arrived', 'completed'],
  no_show:              ['requested', 'approved', 'claimed', 'on_the_way', 'arrived', 'no_show'],
};

// Which actor for each event type
function getActorForEvent(eventType, riderId, driverId) {
  switch (eventType) {
    case 'requested':
    case 'cancelled':
      return riderId || null;
    case 'approved':
    case 'denied':
      return OFFICE_USER_ID;
    case 'claimed':
    case 'on_the_way':
    case 'arrived':
    case 'completed':
    case 'no_show':
      return driverId || null;
    default:
      return null;
  }
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickTwoLocations() {
  const pickup = pickRandom(LOCATIONS);
  let dropoff = pickRandom(LOCATIONS);
  while (dropoff === pickup) {
    dropoff = pickRandom(LOCATIONS);
  }
  return { pickup, dropoff };
}

// Always use known riders so actor_user_id FK is valid
let _riderIdx = 0;
function pickRider() {
  const r = KNOWN_RIDERS[_riderIdx % KNOWN_RIDERS.length];
  _riderIdx++;
  return { ...r };
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ── Main ──
async function main() {
  const q = (text, params) => pool.query(text, params);

  const today = new Date();
  const todayStr = toDateStr(today);
  console.log(`\nPreparing screenshot data for ${todayStr}...\n`);

  // ── Step 0a: Soft-delete E2E test artifacts ──
  console.log('Step 0a: Cleaning E2E test artifacts...');
  try {
    const testUsers = await q(
      `SELECT id FROM users WHERE (username LIKE 'e2e_%' OR username LIKE 'test_%' OR username LIKE 'playwright_%') AND deleted_at IS NULL`
    );
    if (testUsers.rows.length > 0) {
      const testIds = testUsers.rows.map(r => r.id);
      await q(`UPDATE users SET deleted_at = NOW() WHERE id = ANY($1::text[])`, [testIds]);
      // Delete ride events for rides belonging to test users, then the rides
      await q(`DELETE FROM ride_events WHERE ride_id IN (SELECT id FROM rides WHERE rider_id = ANY($1::text[]))`, [testIds]);
      await q(`DELETE FROM rides WHERE rider_id = ANY($1::text[])`, [testIds]);
      // Delete rides assigned to test drivers
      await q(`DELETE FROM ride_events WHERE ride_id IN (SELECT id FROM rides WHERE assigned_driver_id = ANY($1::text[]))`, [testIds]);
      await q(`DELETE FROM rides WHERE assigned_driver_id = ANY($1::text[])`, [testIds]);
      // Delete clock events
      await q(`DELETE FROM clock_events WHERE employee_id = ANY($1::text[])`, [testIds]);
      console.log(`  Soft-deleted ${testIds.length} test user(s) and their associated data.`);
    } else {
      console.log('  No test users found.');
    }
  } catch (err) {
    console.warn('  Warning during test cleanup:', err.message);
  }

  // ── Step 0b: Ensure realistic ride data for TODAY ──
  console.log('\nStep 0b: Ensuring ride data for today...');

  // Count existing rides by status for today
  const existingCounts = {};
  const countRes = await q(
    `SELECT status, COUNT(*)::int as cnt FROM rides WHERE DATE(requested_time) = $1 GROUP BY status`,
    [todayStr]
  );
  for (const row of countRes.rows) {
    existingCounts[row.status] = row.cnt;
  }
  console.log('  Existing ride counts:', existingCounts);

  // Target distribution
  const targets = {
    completed: 8,
    scheduled: 3,
    pending: 2,
    approved: 2,
    driver_on_the_way: 1,
    driver_arrived_grace: 1,
    cancelled: 2,
    denied: 2,
    no_show: 3,
  };

  // Determine how many to insert per status
  const toInsert = {};
  for (const [status, target] of Object.entries(targets)) {
    const existing = existingCounts[status] || 0;
    toInsert[status] = Math.max(0, target - existing);
  }

  console.log('  Rides to insert:', toInsert);

  // Insert a ride with its full event chain in a transaction
  async function insertRide(status, opts = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const rideId = genId('ride');
      const { pickup, dropoff } = pickTwoLocations();
      const rider = opts.rider || pickRider();
      const driverId = opts.driverId || null;
      const vehicleId = opts.vehicleId || null;

      // Build requested_time for today at a specific hour
      const rideHour = opts.hour !== undefined ? opts.hour : 12;
      const rideMinute = Math.floor(Math.random() * 50) + 5; // 5-55
      const requestedTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), rideHour, rideMinute, 0);
      const requestedTimeISO = requestedTime.toISOString();

      const graceStartTime = status === 'driver_arrived_grace'
        ? new Date(Date.now() - 2 * 60 * 1000).toISOString() // 2 minutes ago
        : null;

      await client.query(
        `INSERT INTO rides (id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes, requested_time, status, assigned_driver_id, grace_start_time, vehicle_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $9, $9)`,
        [
          rideId, rider.rider_id, rider.rider_name, rider.rider_email, rider.rider_phone,
          pickup, dropoff, opts.notes || null, requestedTimeISO, status,
          driverId, graceStartTime, vehicleId
        ]
      );

      // Insert ride events
      const events = EVENT_CHAINS[status] || ['requested'];
      let eventTime = new Date(requestedTime);
      for (const eventType of events) {
        const eventId = genId('rev');
        const actorId = getActorForEvent(eventType, rider.rider_id, driverId);
        await client.query(
          `INSERT INTO ride_events (id, ride_id, actor_user_id, type, at) VALUES ($1, $2, $3, $4, $5)`,
          [eventId, rideId, actorId, eventType, eventTime.toISOString()]
        );
        // Space events 5-10 minutes apart
        eventTime = new Date(eventTime.getTime() + (5 + Math.floor(Math.random() * 6)) * 60 * 1000);
      }

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      console.warn(`  Warning inserting ${status} ride:`, err.message);
      return false;
    } finally {
      client.release();
    }
  }

  // Insert completed rides (spread across morning hours, different drivers)
  for (let i = 0; i < toInsert.completed; i++) {
    const driver = DRIVERS[i % DRIVERS.length];
    const vehicle = ['veh_cart1', 'veh_cart2', 'veh_cart3', 'veh_accessible'][i % 4];
    await insertRide('completed', { driverId: driver, vehicleId: vehicle, hour: 8 + i });
  }

  // Insert scheduled rides (afternoon, different drivers)
  for (let i = 0; i < toInsert.scheduled; i++) {
    const driver = DRIVERS[(i + 1) % DRIVERS.length];
    await insertRide('scheduled', { driverId: driver, hour: 14 + i });
  }

  // Insert pending rides
  for (let i = 0; i < toInsert.pending; i++) {
    await insertRide('pending', { hour: 15 + i });
  }

  // Insert approved rides
  for (let i = 0; i < toInsert.approved; i++) {
    await insertRide('approved', { hour: 16 + i });
  }

  // Insert driver_on_the_way -- assigned to emp1 (Alex), rider is Casey
  if (toInsert.driver_on_the_way > 0) {
    await insertRide('driver_on_the_way', {
      driverId: 'emp1',
      vehicleId: 'veh_cart1',
      rider: KNOWN_RIDERS[0], // Casey Rivera
      hour: 12,
      notes: 'Wheelchair accessible route preferred',
    });
  }

  // Insert driver_arrived_grace -- assigned to emp1 (Alex), rider is Riley
  if (toInsert.driver_arrived_grace > 0) {
    await insertRide('driver_arrived_grace', {
      driverId: 'emp1',
      vehicleId: 'veh_cart1',
      rider: KNOWN_RIDERS[1], // Riley Chen
      hour: 13,
    });
  }

  // Insert cancelled rides
  for (let i = 0; i < toInsert.cancelled; i++) {
    await insertRide('cancelled', { hour: 10 + i });
  }

  // Insert denied rides
  for (let i = 0; i < toInsert.denied; i++) {
    await insertRide('denied', { hour: 11 + i });
  }

  // Insert no_show rides (spread across drivers)
  for (let i = 0; i < toInsert.no_show; i++) {
    const driver = DRIVERS[(i + 2) % DRIVERS.length];
    await insertRide('no_show', { driverId: driver, vehicleId: 'veh_cart2', hour: 9 + i });
  }

  // Ensure emp1 (Alex) and emp2 (Jordan) are clocked in (active)
  await q(`UPDATE users SET active = TRUE WHERE id IN ('emp1', 'emp2') AND deleted_at IS NULL`);

  // ── Step 0c: Ensure shifts for current week ──
  console.log('\nStep 0c: Ensuring shifts for current week...');
  const weekStart = '2026-03-02'; // Monday of this week

  const shiftCount = await q(
    `SELECT COUNT(*)::int as cnt FROM shifts WHERE week_start = $1`,
    [weekStart]
  );

  if (shiftCount.rows[0].cnt < 10) {
    console.log(`  Only ${shiftCount.rows[0].cnt} shifts for this week. Inserting schedule...`);

    // Clear any partial shifts for this week to avoid dupes
    await q(`DELETE FROM shifts WHERE week_start = $1`, [weekStart]);

    const shiftDefs = [
      // Alex: Mon-Fri 08:00-12:00 (days 0-4)
      ...([0,1,2,3,4].map(d => ({ emp: 'emp1', day: d, start: '08:00', end: '12:00' }))),
      // Jordan: Mon-Fri 12:00-17:00
      ...([0,1,2,3,4].map(d => ({ emp: 'emp2', day: d, start: '12:00', end: '17:00' }))),
      // Taylor: Mon/Wed/Fri 09:00-14:00
      ...([0,2,4].map(d => ({ emp: 'emp3', day: d, start: '09:00', end: '14:00' }))),
      // Morgan: Tue/Thu 10:00-16:00
      ...([1,3].map(d => ({ emp: 'emp4', day: d, start: '10:00', end: '16:00' }))),
    ];

    for (const s of shiftDefs) {
      try {
        await q(
          `INSERT INTO shifts (id, employee_id, day_of_week, start_time, end_time, week_start) VALUES ($1, $2, $3, $4, $5, $6)`,
          [genId('shft'), s.emp, s.day, s.start, s.end, weekStart]
        );
      } catch (err) {
        console.warn(`  Warning inserting shift:`, err.message);
      }
    }
    console.log(`  Inserted ${shiftDefs.length} shifts.`);
  } else {
    console.log(`  ${shiftCount.rows[0].cnt} shifts already exist for this week.`);
  }

  // ── Step 0d: Seed clock_events for current week ──
  console.log('\nStep 0d: Ensuring clock events for this week...');

  const clockEventCount = await q(
    `SELECT COUNT(*)::int as cnt FROM clock_events WHERE event_date >= $1 AND event_date <= $2`,
    ['2026-03-02', '2026-03-06']
  );

  if (clockEventCount.rows[0].cnt < 8) {
    console.log(`  Only ${clockEventCount.rows[0].cnt} clock events. Inserting realistic ones...`);

    // Delete existing to avoid duplicate (employee_id, event_date) issues
    await q(`DELETE FROM clock_events WHERE event_date >= '2026-03-02' AND event_date <= '2026-03-06'`);

    // Define which driver works which days this week
    // day_of_week: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri
    const driverShifts = {
      emp1: { days: [0,1,2,3,4], start: '08:00', end: '12:00' },
      emp2: { days: [0,1,2,3,4], start: '12:00', end: '17:00' },
      emp3: { days: [0,2,4],     start: '09:00', end: '14:00' },
      emp4: { days: [1,3],       start: '10:00', end: '16:00' },
    };

    // Days of the week: Mon Mar 2 through Fri Mar 6
    const weekDays = [
      { dayOfWeek: 0, date: '2026-03-02' },
      { dayOfWeek: 1, date: '2026-03-03' },
      { dayOfWeek: 2, date: '2026-03-04' },
      { dayOfWeek: 3, date: '2026-03-05' },
      { dayOfWeek: 4, date: '2026-03-06' },
    ];

    // Pre-determined outcomes: ~80-90% on-time, 1-2 missed, 2 tardy
    const outcomes = {
      emp1: ['ontime', 'tardy', 'ontime', 'ontime', 'ontime'],     // Mon-Fri: 4 on-time, 1 tardy
      emp2: ['ontime', 'ontime', 'missed', 'ontime', 'ontime'],    // Mon-Fri: 4 on-time, 1 missed (Wed)
      emp3: ['ontime', null, 'tardy', null, 'ontime'],              // Mon/Wed/Fri: 2 on-time, 1 tardy
      emp4: [null, 'ontime', null, 'ontime', null],                 // Tue/Thu: 2 on-time
    };

    let insertedClockEvents = 0;

    for (const [empId, schedule] of Object.entries(driverShifts)) {
      for (const wd of weekDays) {
        if (!schedule.days.includes(wd.dayOfWeek)) continue;

        const outcome = outcomes[empId][wd.dayOfWeek];
        if (!outcome || outcome === 'missed') continue; // Skip missed shifts

        // Find the shift for this employee+day to link shift_id
        const shiftRes = await q(
          `SELECT id FROM shifts WHERE employee_id = $1 AND day_of_week = $2 AND week_start = $3 LIMIT 1`,
          [empId, wd.dayOfWeek, weekStart]
        );
        const shiftId = shiftRes.rows.length > 0 ? shiftRes.rows[0].id : null;

        const [startH, startM] = schedule.start.split(':').map(Number);
        const [endH, endM] = schedule.end.split(':').map(Number);

        let clockInMinutesLate = 0;
        let tardiness = 0;

        if (outcome === 'tardy') {
          clockInMinutesLate = 5 + Math.floor(Math.random() * 16); // 5-20 min late
          tardiness = clockInMinutesLate;
        }

        // Compute clock-in time carefully (handle minute overflow)
        const totalInMinutes = startH * 60 + startM + clockInMinutesLate;
        const inH = Math.floor(totalInMinutes / 60);
        const inM = totalInMinutes % 60;
        const clockInTime = `${wd.date}T${String(inH).padStart(2, '0')}:${String(inM).padStart(2, '0')}:00`;

        // For today (Friday), don't add clock_out_at for currently active drivers (emp1, emp2)
        const isToday = wd.date === '2026-03-06';
        const isActiveToday = isToday && (empId === 'emp1' || empId === 'emp2');

        let clockOutTime = null;
        if (!isActiveToday) {
          const extraMinutes = 5 + Math.floor(Math.random() * 26); // stay 5-30 min extra
          const totalEndMinutes = endH * 60 + endM + extraMinutes;
          const outH = Math.floor(totalEndMinutes / 60);
          const outM = totalEndMinutes % 60;
          clockOutTime = `${wd.date}T${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}:00`;
        }

        try {
          await q(
            `INSERT INTO clock_events (id, employee_id, shift_id, event_date, scheduled_start, clock_in_at, clock_out_at, tardiness_minutes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              genId('clk'), empId, shiftId, wd.date, schedule.start,
              clockInTime, clockOutTime, tardiness
            ]
          );
          insertedClockEvents++;
        } catch (err) {
          console.warn(`  Warning inserting clock event for ${empId} on ${wd.date}:`, err.message);
        }
      }
    }
    console.log(`  Inserted ${insertedClockEvents} clock events.`);
  } else {
    console.log(`  ${clockEventCount.rows[0].cnt} clock events already exist.`);
  }

  // ── Step 0e: Ensure vehicles with maintenance logs ──
  console.log('\nStep 0e: Ensuring vehicles and maintenance logs...');

  // Check vehicles exist
  const vehicleCheck = await q(`SELECT id, total_miles FROM vehicles WHERE id IN ('veh_cart1', 'veh_cart2', 'veh_cart3', 'veh_accessible')`);
  const existingVehicleIds = vehicleCheck.rows.map(r => r.id);

  const vehicleDefs = [
    { id: 'veh_cart1', name: 'Cart 1', type: 'standard', miles: 1240 },
    { id: 'veh_cart2', name: 'Cart 2', type: 'standard', miles: 890 },
    { id: 'veh_cart3', name: 'Cart 3', type: 'standard', miles: 2100 },
    { id: 'veh_accessible', name: 'Accessible Cart', type: 'accessible', miles: 450 },
  ];

  for (const v of vehicleDefs) {
    if (!existingVehicleIds.includes(v.id)) {
      try {
        await q(
          `INSERT INTO vehicles (id, name, type, status, total_miles) VALUES ($1, $2, $3, 'available', $4)`,
          [v.id, v.name, v.type, v.miles]
        );
        console.log(`  Inserted missing vehicle: ${v.id}`);
      } catch (err) {
        console.warn(`  Warning inserting vehicle ${v.id}:`, err.message);
      }
    }
  }

  // Update total_miles where they are 0
  for (const v of vehicleDefs) {
    try {
      await q(`UPDATE vehicles SET total_miles = $1 WHERE id = $2 AND total_miles = 0`, [v.miles, v.id]);
    } catch (err) {
      // Ignore
    }
  }

  // Set veh_cart3 to in_use
  await q(`UPDATE vehicles SET status = 'in_use' WHERE id = 'veh_cart3'`);

  // Maintenance logs
  const maintenanceCount = await q(`SELECT COUNT(*)::int as cnt FROM maintenance_logs`);
  if (maintenanceCount.rows[0].cnt < 3) {
    console.log(`  Only ${maintenanceCount.rows[0].cnt} maintenance logs. Adding logs...`);
    const logs = [
      { vehicleId: 'veh_cart1', date: '2026-02-15', notes: 'Tire rotation and brake inspection', mileage: 1240 },
      { vehicleId: 'veh_cart2', date: '2026-02-20', notes: 'Battery check and clean contacts', mileage: 890 },
      { vehicleId: 'veh_cart3', date: '2026-01-10', notes: 'Full service - oil, tires, brakes', mileage: 2100 },
    ];
    for (const log of logs) {
      try {
        await q(
          `INSERT INTO maintenance_logs (id, vehicle_id, service_date, notes, mileage_at_service) VALUES ($1, $2, $3, $4, $5)`,
          [genId('mlog'), log.vehicleId, log.date, log.notes, log.mileage]
        );
      } catch (err) {
        console.warn(`  Warning inserting maintenance log:`, err.message);
      }
    }
    console.log('  Inserted 3 maintenance logs.');
  } else {
    console.log(`  ${maintenanceCount.rows[0].cnt} maintenance logs already exist.`);
  }

  // Update last_maintenance_date on vehicles
  await q(`UPDATE vehicles SET last_maintenance_date = '2026-02-15' WHERE id = 'veh_cart1' AND last_maintenance_date IS NULL`);
  await q(`UPDATE vehicles SET last_maintenance_date = '2026-02-20' WHERE id = 'veh_cart2' AND last_maintenance_date IS NULL`);
  await q(`UPDATE vehicles SET last_maintenance_date = '2026-01-10' WHERE id = 'veh_cart3' AND last_maintenance_date IS NULL`);

  // ── Print Summary ──
  console.log('\n=== Data Prep Summary ===');

  const rideSummary = await q(
    `SELECT status, COUNT(*)::int as cnt FROM rides WHERE DATE(requested_time) = $1 GROUP BY status ORDER BY status`,
    [todayStr]
  );
  console.log('Rides today by status:');
  const allStatuses = ['pending', 'approved', 'scheduled', 'driver_on_the_way', 'driver_arrived_grace', 'completed', 'no_show', 'denied', 'cancelled'];
  const rideCounts = {};
  for (const row of rideSummary.rows) {
    rideCounts[row.status] = row.cnt;
  }
  for (const s of allStatuses) {
    console.log(`  ${s}: ${rideCounts[s] || 0}`);
  }

  const shiftSummary = await q(
    `SELECT COUNT(*)::int as cnt, COUNT(DISTINCT employee_id)::int as drivers FROM shifts WHERE week_start = $1`,
    [weekStart]
  );
  console.log(`\nShifts this week: ${shiftSummary.rows[0].cnt} across ${shiftSummary.rows[0].drivers} drivers`);

  const clockSummary = await q(
    `SELECT COUNT(*)::int as total,
            COUNT(*) FILTER (WHERE tardiness_minutes = 0)::int as ontime,
            COUNT(*) FILTER (WHERE tardiness_minutes > 0)::int as tardy
     FROM clock_events WHERE event_date >= '2026-03-02' AND event_date <= '2026-03-06'`
  );
  const cs = clockSummary.rows[0];
  console.log(`Clock events this week: ${cs.total} (on-time: ${cs.ontime}, tardy: ${cs.tardy})`);

  const vehicleSummary = await q(
    `SELECT COUNT(*)::int as total,
            COUNT(*) FILTER (WHERE status = 'available')::int as available,
            COUNT(*) FILTER (WHERE status = 'in_use')::int as in_use
     FROM vehicles WHERE status != 'retired'`
  );
  const vs = vehicleSummary.rows[0];
  console.log(`Vehicles: ${vs.total} (available: ${vs.available}, in_use: ${vs.in_use})`);

  const mlogCount = await q(`SELECT COUNT(*)::int as cnt FROM maintenance_logs`);
  console.log(`Maintenance logs: ${mlogCount.rows[0].cnt}`);

  console.log('========================\n');
}

main()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
