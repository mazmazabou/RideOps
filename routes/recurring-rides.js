'use strict';

module.exports = function(app, ctx) {
  const {
    query,
    wrapAsync,
    requireRider,
    generateId,
    normalizeDays,
    generateRecurringDates,
    addRideEvent,
    getSetting,
    isWithinServiceHours,
    getRiderMissCount,
    resolveTimezone,
    zonedTimeToUtc,
    windowSegment,
    getServiceWindows
  } = ctx;

  // ----- Recurring rides -----
  app.post('/api/recurring-rides', requireRider, wrapAsync(async (req, res) => {
    const { pickupLocation, dropoffLocation, timeOfDay, startDate, endDate, daysOfWeek, notes, riderPhone } = req.body;
    const partySize = Math.min(Math.max(parseInt(req.body.partySize) || 1, 1), 10);
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
    if ((await getSetting('service_closed', false)) === true) {
      const closedMsg = await getSetting('service_closed_message', '');
      return res.status(400).json({ error: closedMsg || 'Service is temporarily closed. Please check back later.' });
    }
    const minutesTotal = hour * 60 + minute;
    // With per-day hours, the time must fit at least one selected day's window;
    // days it doesn't fit are skipped during occurrence generation.
    const windows = await getServiceWindows();
    const segmentFor = (day) => {
      const w = windows.hoursFor(day);
      return windowSegment(minutesTotal, w.start, w.end);
    };
    if (!days.some(segmentFor)) {
      const w = windows.hoursFor(days[0]);
      return res.status(400).json({ error: `Time must be within service hours (e.g. ${w.start}-${w.end})` });
    }

    const recurId = generateId('recur');
    await query(
      `INSERT INTO recurring_rides (id, rider_id, pickup_location, dropoff_location, time_of_day, days_of_week, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
      [recurId, req.session.userId, pickupLocation, dropoffLocation, `${hourStr.padStart(2, '0')}:${String(minute).padStart(2, '0')}`, days, String(startDate).slice(0, 10), String(endDate).slice(0, 10)]
    );

    // Anchor each occurrence's wall-clock time to the campus timezone so the
    // stored instant is correct regardless of the server's own clock.
    const tz = resolveTimezone(req.session.campus);
    const dates = generateRecurringDates(startDate, endDate, days);
    const autoDenyRecurring = await getSetting('auto_deny_outside_hours', true);
    // In an overnight window, a time in the early-morning segment (e.g. 01:00
    // with 22:00-03:00 hours) means "the night of" the selected service day —
    // the actual instant lands on the NEXT calendar day. Windows are per-day.
    let created = 0;
    for (const cal of dates) {
      const calOurDay = ((new Date(Date.UTC(cal.y, cal.m - 1, cal.d)).getUTCDay()) + 6) % 7;
      const segment = segmentFor(calOurDay);
      if (!segment) continue; // this day's window doesn't include the chosen time
      const dayShift = segment === 'previous-day' ? 1 : 0;
      const calDate = new Date(Date.UTC(cal.y, cal.m - 1, cal.d) + dayShift * 86400000);
      const requestedTime = zonedTimeToUtc(
        calDate.getUTCFullYear(), calDate.getUTCMonth() + 1, calDate.getUTCDate(),
        hour, minute, tz
      ).toISOString();
      if (autoDenyRecurring && !(await isWithinServiceHours(requestedTime, tz))) continue;
      const rideId = generateId('ride');
      const missCount = await getRiderMissCount(req.session.userId);
      await query(
        `INSERT INTO rides (id, rider_id, rider_name, rider_email, rider_phone, pickup_location, dropoff_location, notes, requested_time, status, assigned_driver_id, grace_start_time, consecutive_misses, recurring_id, vehicle_id, party_size)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NULL, NULL, $10, $11, NULL, $12)`,
        [rideId, req.session.userId, req.session.name, req.session.email, riderPhone || null, pickupLocation, dropoffLocation, notes || '', requestedTime, missCount, recurId, partySize]
      );
      await addRideEvent(rideId, req.session.userId, 'requested');
      created++;
    }

    res.json({ recurringId: recurId, createdRides: created });
  }));

  app.get('/api/recurring-rides/my', requireRider, wrapAsync(async (req, res) => {
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
  }));

  app.patch('/api/recurring-rides/:id', requireRider, wrapAsync(async (req, res) => {
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
  }));
};
