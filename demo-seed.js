// Demo data seeding script for DEMO_MODE
// Exports seedDemoData(pool) — truncates transactional tables and seeds realistic sample data.
// Users table is NOT touched — default users are seeded by server.js initDb().
// Location names match default-locations.js (generic campus locations).

async function seedDemoData(pool) {
  const q = (text, params) => pool.query(text, params);

  function generateId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  // Truncate transactional tables (order matters for FK constraints)
  await q('DELETE FROM ride_events');
  await q('DELETE FROM rides');
  await q('DELETE FROM shifts');
  await q('DELETE FROM recurring_rides');
  await q('DELETE FROM rider_miss_counts');

  // Reset all drivers to clocked-out
  await q("UPDATE users SET active = FALSE WHERE role = 'driver'");
  // Clock in mazen and jason for a lively demo
  await q("UPDATE users SET active = TRUE WHERE id IN ('emp1', 'emp2')");

  // ----- Shifts (weekly schedule) -----
  const shifts = [
    // Mazen: Mon-Fri 8:00-12:00
    ...([1,2,3,4,5].map(d => ({ id: generateId('shift'), employeeId: 'emp1', day: d, start: '08:00', end: '12:00' }))),
    // Jason: Mon-Fri 12:00-17:00
    ...([1,2,3,4,5].map(d => ({ id: generateId('shift'), employeeId: 'emp2', day: d, start: '12:00', end: '17:00' }))),
    // Jocelin: Mon/Wed/Fri 9:00-14:00
    ...([1,3,5].map(d => ({ id: generateId('shift'), employeeId: 'emp3', day: d, start: '09:00', end: '14:00' }))),
    // Olivia: Tue/Thu 10:00-16:00
    ...([2,4].map(d => ({ id: generateId('shift'), employeeId: 'emp4', day: d, start: '10:00', end: '16:00' })))
  ];

  for (const s of shifts) {
    await q(
      'INSERT INTO shifts (id, employee_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4, $5)',
      [s.id, s.employeeId, s.day, s.start, s.end]
    );
  }

  // ----- Rides -----
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  function todayAt(hours, minutes) {
    const d = new Date(today);
    d.setHours(hours, minutes, 0, 0);
    return d.toISOString();
  }

  const locations = [
    'Main Library', 'Student Union', 'Engineering Hall', 'Science Building',
    'Recreation Center', 'Business School', 'Administration Building', 'Health Center',
    'Performing Arts Center', 'Dining Hall (North)', 'Gymnasium',
    'Campus Bookstore', 'Parking Structure A', 'Transportation Hub'
  ];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pickPair() {
    const a = pick(locations);
    let b = pick(locations);
    while (b === a) b = pick(locations);
    return [a, b];
  }

  const rides = [];

  function addRide(status, riderId, riderName, riderEmail, riderPhone, pickup, dropoff, requestedTime, driverId, graceStart) {
    const id = generateId('ride');
    rides.push({ id, status, riderId, riderName, riderEmail, riderPhone, pickup, dropoff, requestedTime, driverId, graceStart });
    return id;
  }

  // 3 pending rides
  const [p1a, p1b] = pickPair();
  addRide('pending', 'rider1', 'Sarah Student', 'hello+sarah@ride-ops.com', '213-555-0111', p1a, p1b, todayAt(14, 0), null, null);
  const [p2a, p2b] = pickPair();
  addRide('pending', 'rider2', 'Tom Faculty', 'hello+tom@ride-ops.com', '213-555-0112', p2a, p2b, todayAt(14, 30), null, null);
  const [p3a, p3b] = pickPair();
  addRide('pending', 'rider1', 'Sarah Student', 'hello+sarah@ride-ops.com', '213-555-0111', p3a, p3b, todayAt(15, 0), null, null);

  // 2 approved (waiting for driver claim)
  const [a1a, a1b] = pickPair();
  addRide('approved', 'rider2', 'Tom Faculty', 'hello+tom@ride-ops.com', '213-555-0112', a1a, a1b, todayAt(13, 0), null, null);
  const [a2a, a2b] = pickPair();
  addRide('approved', 'rider1', 'Sarah Student', 'hello+sarah@ride-ops.com', '213-555-0111', a2a, a2b, todayAt(13, 30), null, null);

  // 2 scheduled (assigned to drivers)
  const [s1a, s1b] = pickPair();
  addRide('scheduled', 'rider1', 'Sarah Student', 'hello+sarah@ride-ops.com', '213-555-0111', s1a, s1b, todayAt(11, 0), 'emp1', null);
  const [s2a, s2b] = pickPair();
  addRide('scheduled', 'rider2', 'Tom Faculty', 'hello+tom@ride-ops.com', '213-555-0112', s2a, s2b, todayAt(11, 30), 'emp2', null);

  // 1 driver_on_the_way
  const [otw1, otw2] = pickPair();
  addRide('driver_on_the_way', 'rider1', 'Sarah Student', 'hello+sarah@ride-ops.com', '213-555-0111', otw1, otw2, todayAt(10, 30), 'emp1', null);

  // 1 driver_arrived_grace
  const [g1a, g1b] = pickPair();
  addRide('driver_arrived_grace', 'rider2', 'Tom Faculty', 'hello+tom@ride-ops.com', '213-555-0112', g1a, g1b, todayAt(10, 0), 'emp2', now.toISOString());

  // 3 completed (earlier today)
  const [c1a, c1b] = pickPair();
  addRide('completed', 'rider1', 'Sarah Student', 'hello+sarah@ride-ops.com', '213-555-0111', c1a, c1b, todayAt(8, 30), 'emp1', null);
  const [c2a, c2b] = pickPair();
  addRide('completed', 'rider2', 'Tom Faculty', 'hello+tom@ride-ops.com', '213-555-0112', c2a, c2b, todayAt(9, 0), 'emp2', null);
  const [c3a, c3b] = pickPair();
  addRide('completed', 'rider1', 'Sarah Student', 'hello+sarah@ride-ops.com', '213-555-0111', c3a, c3b, todayAt(9, 30), 'emp1', null);

  // 1 no_show
  const [n1a, n1b] = pickPair();
  addRide('no_show', 'rider2', 'Tom Faculty', 'hello+tom@ride-ops.com', '213-555-0112', n1a, n1b, todayAt(8, 0), 'emp2', null);

  // 1 denied
  const [d1a, d1b] = pickPair();
  addRide('denied', 'rider1', 'Sarah Student', 'hello+sarah@ride-ops.com', '213-555-0111', d1a, d1b, todayAt(12, 0), null, null);

  // Historical completed rides (past weekdays) for analytics charts
  for (let daysAgo = 1; daysAgo <= 7; daysAgo++) {
    const past = new Date(today);
    past.setDate(past.getDate() - daysAgo);
    const dayOfWeek = past.getDay(); // 0=Sun, 6=Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) continue; // skip weekends
    const [ha, hb] = pickPair();
    const t = new Date(past);
    t.setHours(9 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 60), 0, 0);
    addRide('completed', 'rider1', 'Sarah Student', 'hello+sarah@ride-ops.com', '213-555-0111', ha, hb, t.toISOString(), 'emp1', null);
    const [ha2, hb2] = pickPair();
    const t2 = new Date(past);
    t2.setHours(10 + Math.floor(Math.random() * 5), Math.floor(Math.random() * 60), 0, 0);
    addRide('completed', 'rider2', 'Tom Faculty', 'hello+tom@ride-ops.com', '213-555-0112', ha2, hb2, t2.toISOString(), 'emp2', null);
  }

  // Insert rides
  for (const r of rides) {
    await q(
      `INSERT INTO rides (id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, requested_time, status, assigned_driver_id, grace_start_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [r.id, r.riderId, r.riderName, r.riderEmail, r.riderPhone, r.pickup, r.dropoff, r.requestedTime, r.status, r.driverId, r.graceStart]
    );
  }

  // ----- Ride Events (audit trail) -----
  const statusFlow = {
    pending:               ['requested'],
    approved:              ['requested', 'approved'],
    denied:                ['requested', 'denied'],
    scheduled:             ['requested', 'approved', 'claimed'],
    driver_on_the_way:     ['requested', 'approved', 'claimed', 'on_the_way'],
    driver_arrived_grace:  ['requested', 'approved', 'claimed', 'on_the_way', 'arrived'],
    completed:             ['requested', 'approved', 'claimed', 'on_the_way', 'arrived', 'completed'],
    no_show:               ['requested', 'approved', 'claimed', 'on_the_way', 'arrived', 'no_show']
  };

  for (const r of rides) {
    const events = statusFlow[r.status] || ['requested'];
    let eventTime = new Date(r.requestedTime);
    for (const type of events) {
      const actor = (type === 'requested') ? r.riderId
        : (['approved', 'denied'].includes(type)) ? 'office'
        : (r.driverId || 'office');
      await q(
        'INSERT INTO ride_events (id, ride_id, actor_user_id, type, at) VALUES ($1, $2, $3, $4, $5)',
        [generateId('evt'), r.id, actor, type, eventTime.toISOString()]
      );
      eventTime = new Date(eventTime.getTime() + 3 * 60 * 1000); // +3 min between events
    }
  }

  // ----- Recurring rides (for sarah) -----
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

  // Set Tom's miss count to 1 for demo visibility
  await q(
    'INSERT INTO rider_miss_counts (email, count) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET count = $2',
    ['hello+tom@ride-ops.com', 1]
  );
}

module.exports = { seedDemoData };
