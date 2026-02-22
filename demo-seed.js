// Demo data seeding script for DEMO_MODE
// Exports seedDemoData(pool) — truncates transactional tables and seeds realistic sample data.
// Users table is NOT touched — default users are seeded by server.js initDb().
// Location names match default-locations.js (generic campus locations).
// Generates ~650+ historical rides spanning Aug 2025 → yesterday, plus ~15 active rides for today.

async function seedDemoData(pool) {
  const q = (text, params) => pool.query(text, params);

  // Seeded PRNG for reproducible demo data (simple mulberry32)
  let _seed = 42;
  function seededRandom() {
    _seed = (_seed + 0x6D2B79F5) | 0;
    let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  let _idCounter = 0;
  function generateId(prefix) {
    _idCounter++;
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${rand}${_idCounter}`;
  }

  // ── Truncate transactional tables ──
  await q('DELETE FROM ride_events');
  await q('DELETE FROM rides');
  await q('DELETE FROM shifts');
  await q('DELETE FROM recurring_rides');
  await q('DELETE FROM rider_miss_counts');

  // Reset all drivers to clocked-out, then clock in alex and jordan
  await q("UPDATE users SET active = FALSE WHERE role = 'driver'");
  await q("UPDATE users SET active = TRUE WHERE id IN ('emp1', 'emp2')");

  // ── Shifts (weekly schedule) ──
  const shifts = [
    // Alex: Mon-Fri 8:00-12:00
    ...([0,1,2,3,4].map(d => ({ id: generateId('shift'), employeeId: 'emp1', day: d, start: '08:00', end: '12:00' }))),
    // Jordan: Mon-Fri 12:00-17:00
    ...([0,1,2,3,4].map(d => ({ id: generateId('shift'), employeeId: 'emp2', day: d, start: '12:00', end: '17:00' }))),
    // Taylor: Mon/Wed/Fri 9:00-14:00
    ...([0,2,4].map(d => ({ id: generateId('shift'), employeeId: 'emp3', day: d, start: '09:00', end: '14:00' }))),
    // Morgan: Tue/Thu 10:00-16:00
    ...([1,3].map(d => ({ id: generateId('shift'), employeeId: 'emp4', day: d, start: '10:00', end: '16:00' })))
  ];

  for (const s of shifts) {
    await q(
      'INSERT INTO shifts (id, employee_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4, $5)',
      [s.id, s.employeeId, s.day, s.start, s.end]
    );
  }

  // ── Rider pool ──
  // 2 registered riders (have user accounts) + 8 historical-only riders (rider_id = NULL)
  const registeredRiders = [
    { id: 'rider1', name: 'Casey Rivera', email: 'hello+casey@ride-ops.com', phone: '213-555-0111' },
    { id: 'rider2', name: 'Riley Chen', email: 'hello+riley@ride-ops.com', phone: '213-555-0112' },
  ];
  const historicalRiders = [
    { id: null, name: 'Dana Patel', email: 'dana.patel@campus.edu', phone: '213-555-0201' },
    { id: null, name: 'Jamie Nguyen', email: 'jamie.nguyen@campus.edu', phone: '213-555-0202' },
    { id: null, name: 'Quinn Brooks', email: 'quinn.brooks@campus.edu', phone: '213-555-0203' },
    { id: null, name: 'Avery Torres', email: 'avery.torres@campus.edu', phone: '213-555-0204' },
    { id: null, name: 'Skyler Adams', email: 'skyler.adams@campus.edu', phone: '213-555-0205' },
    { id: null, name: 'Reese Kim', email: 'reese.kim@campus.edu', phone: '213-555-0206' },
    { id: null, name: 'Parker Walsh', email: 'parker.walsh@campus.edu', phone: '213-555-0207' },
    { id: null, name: 'Drew Martinez', email: 'drew.martinez@campus.edu', phone: '213-555-0208' },
  ];

  // Weighted rider selection: registered riders appear more often
  const riderWeights = [
    ...registeredRiders.map((r, i) => ({ rider: r, weight: i === 0 ? 20 : 15 })), // Casey 20%, Riley 15%
    ...historicalRiders.map(r => ({ rider: r, weight: 8 })), // ~8% each × 8 = 64%
  ];
  const totalRiderWeight = riderWeights.reduce((sum, rw) => sum + rw.weight, 0);

  function pickWeightedRider() {
    let r = seededRandom() * totalRiderWeight;
    for (const rw of riderWeights) {
      r -= rw.weight;
      if (r <= 0) return rw.rider;
    }
    return riderWeights[0].rider;
  }

  // ── All 32 campus locations ──
  const locations = [
    'Main Library', 'Science Library', 'Student Union', 'Student Center',
    'Engineering Hall', 'Science Building', 'Humanities Building', 'Business School',
    'Law School', 'Medical Center', 'Health Center', 'Recreation Center',
    'Gymnasium', 'Performing Arts Center', 'Fine Arts Building', 'Administration Building',
    'Admissions Office', 'Dining Hall (North)', 'Dining Hall (South)', 'Residence Hall A',
    'Residence Hall B', 'Residence Hall C', 'Parking Structure A', 'Parking Structure B',
    'Campus Bookstore', 'Campus Quad', 'Stadium', 'Aquatic Center',
    'Transportation Hub', 'Visitor Center', 'Campus Security', 'Maintenance Facility',
  ];

  // Weighted location frequencies (popular spots appear more)
  const locationWeights = {
    'Main Library': 12, 'Student Union': 11, 'Student Center': 8, 'Engineering Hall': 7,
    'Recreation Center': 7, 'Dining Hall (North)': 6, 'Business School': 6, 'Health Center': 5,
    'Residence Hall A': 5, 'Residence Hall B': 4, 'Science Building': 4, 'Administration Building': 4,
    'Transportation Hub': 4, 'Dining Hall (South)': 3, 'Parking Structure A': 3, 'Campus Bookstore': 3,
  };
  const defaultLocationWeight = 2;
  const weightedLocations = locations.map(l => ({ label: l, weight: locationWeights[l] || defaultLocationWeight }));
  const totalLocationWeight = weightedLocations.reduce((sum, wl) => sum + wl.weight, 0);

  function pickWeightedLocation() {
    let r = seededRandom() * totalLocationWeight;
    for (const wl of weightedLocations) {
      r -= wl.weight;
      if (r <= 0) return wl.label;
    }
    return weightedLocations[0].label;
  }

  // ── 10 hot routes for realistic "Top Routes" data ──
  const hotRoutes = [
    ['Residence Hall A', 'Main Library'],
    ['Student Union', 'Dining Hall (North)'],
    ['Main Library', 'Student Union'],
    ['Engineering Hall', 'Student Center'],
    ['Residence Hall B', 'Recreation Center'],
    ['Parking Structure A', 'Administration Building'],
    ['Health Center', 'Student Union'],
    ['Business School', 'Main Library'],
    ['Dining Hall (South)', 'Residence Hall C'],
    ['Science Building', 'Engineering Hall'],
  ];

  function pickRoute() {
    // 40% chance of a hot route, 60% random weighted pair
    if (seededRandom() < 0.40) {
      const route = hotRoutes[Math.floor(seededRandom() * hotRoutes.length)];
      return [route[0], route[1]];
    }
    const a = pickWeightedLocation();
    let b = pickWeightedLocation();
    let attempts = 0;
    while (b === a && attempts < 10) { b = pickWeightedLocation(); attempts++; }
    if (b === a) b = locations[(locations.indexOf(a) + 1) % locations.length];
    return [a, b];
  }

  // ── Driver assignment weights ──
  // Alex ~35%, Jordan ~28%, Taylor ~22%, Morgan ~15%
  const driverPool = [
    { id: 'emp1', weight: 35 },
    { id: 'emp2', weight: 28 },
    { id: 'emp3', weight: 22 },
    { id: 'emp4', weight: 15 },
  ];
  const totalDriverWeight = driverPool.reduce((sum, d) => sum + d.weight, 0);

  function pickDriver() {
    let r = seededRandom() * totalDriverWeight;
    for (const d of driverPool) {
      r -= d.weight;
      if (r <= 0) return d.id;
    }
    return driverPool[0].id;
  }

  // ── Bell-curve hour distribution (8 AM – 7 PM, peaks 10 AM – 2 PM) ──
  function pickHour() {
    // Approximate bell curve: center at 12, std dev ~2.5, clamp to [8, 18]
    const u1 = seededRandom();
    const u2 = seededRandom();
    const z = Math.sqrt(-2.0 * Math.log(u1 || 0.001)) * Math.cos(2.0 * Math.PI * u2);
    const hour = Math.round(12 + z * 2.5);
    return Math.max(8, Math.min(18, hour));
  }

  function pickMinute() {
    return Math.floor(seededRandom() * 60);
  }

  // ── Date helpers ──
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  function isWeekday(d) {
    const day = d.getDay();
    return day >= 1 && day <= 5;
  }

  function todayAt(hours, minutes) {
    const d = new Date(today);
    d.setHours(hours, minutes, 0, 0);
    return d.toISOString();
  }

  // ── Collect all rides and events for batch insert ──
  const rides = [];
  const events = [];

  const statusFlow = {
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

  function addRide(status, rider, pickup, dropoff, requestedTime, driverId, graceStart) {
    const id = generateId('ride');
    rides.push({
      id, status,
      riderId: rider.id, riderName: rider.name, riderEmail: rider.email, riderPhone: rider.phone,
      pickup, dropoff, requestedTime, driverId, graceStart,
    });

    // Generate events for this ride
    const flow = statusFlow[status] || ['requested'];
    let eventTime = new Date(requestedTime);
    for (const type of flow) {
      const actor = (type === 'requested' || type === 'cancelled') ? (rider.id || null)
        : (['approved', 'denied'].includes(type)) ? 'office'
        : (driverId || 'office');
      events.push({
        id: generateId('evt'), rideId: id, actor, type, at: eventTime.toISOString(),
      });
      eventTime = new Date(eventTime.getTime() + 3 * 60 * 1000);
    }
    return id;
  }

  // ═══════════════════════════════════════════════════════════
  // PART A: Historical rides (Aug 15, 2025 → yesterday)
  // ═══════════════════════════════════════════════════════════
  const startDate = new Date(2025, 7, 15); // Aug 15, 2025
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Iterate every day from startDate to yesterday
  const cursor = new Date(startDate);
  while (cursor <= yesterday) {
    if (!isWeekday(cursor)) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }

    // More rides in recent months (ramp up over time)
    const daysSinceStart = Math.floor((cursor - startDate) / (1000 * 60 * 60 * 24));
    const totalDays = Math.floor((yesterday - startDate) / (1000 * 60 * 60 * 24));
    const progress = totalDays > 0 ? daysSinceStart / totalDays : 0.5;
    // 3 rides/day at start, ramping to 8 rides/day recently
    const baseRides = Math.round(3 + progress * 5);
    // Small daily variance ±1
    const variance = Math.floor(seededRandom() * 3) - 1;
    const ridesThisDay = Math.max(2, Math.min(9, baseRides + variance));

    for (let i = 0; i < ridesThisDay; i++) {
      const rider = pickWeightedRider();
      const [pickup, dropoff] = pickRoute();
      const hour = pickHour();
      const minute = pickMinute();
      const requestedTime = new Date(cursor);
      requestedTime.setHours(hour, minute, 0, 0);

      // Status distribution: 85% completed, 5% no-show, 5% cancelled, 5% denied
      const roll = seededRandom();
      let status, driverId;
      if (roll < 0.85) {
        status = 'completed';
        driverId = pickDriver();
      } else if (roll < 0.90) {
        status = 'no_show';
        driverId = pickDriver();
      } else if (roll < 0.95) {
        status = 'cancelled';
        driverId = null;
      } else {
        status = 'denied';
        driverId = null;
      }

      addRide(status, rider, pickup, dropoff, requestedTime.toISOString(), driverId, null);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  // ═══════════════════════════════════════════════════════════
  // PART B: Today's active rides (for dispatch screenshots)
  // ═══════════════════════════════════════════════════════════
  const casey = registeredRiders[0];
  const riley = registeredRiders[1];

  // 3 pending
  addRide('pending', casey, 'Main Library', 'Student Union', todayAt(14, 0), null, null);
  addRide('pending', riley, 'Engineering Hall', 'Recreation Center', todayAt(14, 30), null, null);
  addRide('pending', casey, 'Business School', 'Health Center', todayAt(15, 0), null, null);

  // 2 approved
  addRide('approved', riley, 'Residence Hall A', 'Dining Hall (North)', todayAt(13, 0), null, null);
  addRide('approved', casey, 'Student Center', 'Main Library', todayAt(13, 30), null, null);

  // 2 scheduled
  addRide('scheduled', casey, 'Parking Structure A', 'Administration Building', todayAt(11, 0), 'emp1', null);
  addRide('scheduled', riley, 'Campus Bookstore', 'Student Union', todayAt(11, 30), 'emp2', null);

  // 1 driver_on_the_way
  addRide('driver_on_the_way', casey, 'Science Building', 'Engineering Hall', todayAt(10, 30), 'emp1', null);

  // 1 driver_arrived_grace
  addRide('driver_arrived_grace', riley, 'Dining Hall (South)', 'Residence Hall B', todayAt(10, 0), 'emp2', now.toISOString());

  // 3 completed (earlier today)
  addRide('completed', casey, 'Residence Hall A', 'Main Library', todayAt(8, 30), 'emp1', null);
  addRide('completed', riley, 'Student Union', 'Dining Hall (North)', todayAt(9, 0), 'emp2', null);
  addRide('completed', casey, 'Health Center', 'Student Center', todayAt(9, 30), 'emp1', null);

  // 1 no_show
  addRide('no_show', riley, 'Campus Quad', 'Gymnasium', todayAt(8, 0), 'emp2', null);

  // 1 denied
  addRide('denied', casey, 'Transportation Hub', 'Visitor Center', todayAt(12, 0), null, null);

  // ═══════════════════════════════════════════════════════════
  // BATCH INSERT: Rides
  // ═══════════════════════════════════════════════════════════
  const BATCH_SIZE = 75;
  for (let i = 0; i < rides.length; i += BATCH_SIZE) {
    const batch = rides.slice(i, i + BATCH_SIZE);
    const values = [];
    const params = [];
    batch.forEach((r, idx) => {
      const offset = idx * 11;
      values.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10}, $${offset+11})`);
      params.push(r.id, r.riderId, r.riderName, r.riderEmail, r.riderPhone, r.pickup, r.dropoff, r.requestedTime, r.status, r.driverId, r.graceStart);
    });
    await q(
      `INSERT INTO rides (id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, requested_time, status, assigned_driver_id, grace_start_time)
       VALUES ${values.join(', ')}`,
      params
    );
  }

  // ═══════════════════════════════════════════════════════════
  // BATCH INSERT: Ride Events
  // ═══════════════════════════════════════════════════════════
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    const values = [];
    const params = [];
    batch.forEach((e, idx) => {
      const offset = idx * 5;
      values.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5})`);
      params.push(e.id, e.rideId, e.actor, e.type, e.at);
    });
    await q(
      `INSERT INTO ride_events (id, ride_id, actor_user_id, type, at)
       VALUES ${values.join(', ')}`,
      params
    );
  }

  // ── Recurring rides (for casey) ──
  const nextMonday = new Date(today);
  nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
  const endDate = new Date(nextMonday);
  endDate.setDate(endDate.getDate() + 60);

  await q(
    `INSERT INTO recurring_rides (id, rider_id, pickup_location, dropoff_location, time_of_day, days_of_week, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [generateId('rec'), 'rider1', 'Main Library', 'Business School', '09:00', [1,3,5], nextMonday.toISOString().slice(0,10), endDate.toISOString().slice(0,10), 'active']
  );

  await q(
    `INSERT INTO recurring_rides (id, rider_id, pickup_location, dropoff_location, time_of_day, days_of_week, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [generateId('rec'), 'rider1', 'Student Union', 'Recreation Center', '14:00', [2,4], nextMonday.toISOString().slice(0,10), endDate.toISOString().slice(0,10), 'active']
  );

  // Set Riley's miss count to 1 for demo visibility
  await q(
    'INSERT INTO rider_miss_counts (email, count) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET count = $2',
    ['hello+riley@ride-ops.com', 1]
  );

  console.log(`  Demo seed: ${rides.length} rides, ${events.length} events inserted`);
}

module.exports = { seedDemoData };
